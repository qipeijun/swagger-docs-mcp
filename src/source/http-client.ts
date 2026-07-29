import { AppError, ErrorCode, ErrorStage } from "../errors.js";
import type { FetchResult } from "./types.js";

export interface SafeHttpClientOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

export class SafeHttpClient {
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxRedirects: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SafeHttpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * 实时获取文档资源。重定向必须保持同源，响应体按流读取并限制大小。
   */
  async get(urlValue: string, stage: ErrorStage): Promise<FetchResult> {
    const requestedUrl = this.validateUrl(urlValue, stage);
    const originalOrigin = requestedUrl.origin;
    const requestTarget = new URL(requestedUrl);
    // URL fragment 只属于文档 UI 导航，不会也不应发送给上游服务器。
    requestTarget.hash = "";
    let currentUrl = requestTarget;

    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const response = await this.request(currentUrl, stage, requestedUrl.href);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new AppError(ErrorCode.HTTP_ERROR, stage, `重定向响应缺少 Location：${response.status}`, {
            requestedUrl: requestedUrl.href
          });
        }
        if (redirectCount === this.maxRedirects) {
          throw new AppError(ErrorCode.TOO_MANY_REDIRECTS, stage, `重定向次数超过 ${this.maxRedirects} 次`, {
            requestedUrl: requestedUrl.href
          });
        }

        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch (error) {
          await response.body?.cancel();
          throw new AppError(ErrorCode.HTTP_ERROR, stage, "重定向 Location 不是有效 URL", {
            requestedUrl: requestedUrl.href,
            cause: error
          });
        }
        if (nextUrl.username || nextUrl.password) {
          await response.body?.cancel();
          throw new AppError(ErrorCode.AUTHENTICATED_URL_UNSUPPORTED, stage, "重定向地址包含认证信息，已拒绝继续访问", {
            requestedUrl: requestedUrl.href,
            details: { targetUrl: this.sanitizeUrl(nextUrl) }
          });
        }
        if (nextUrl.origin !== originalOrigin) {
          await response.body?.cancel();
          throw new AppError(ErrorCode.CROSS_ORIGIN_REDIRECT, stage, "文档请求发生跨主机重定向，已拒绝继续访问", {
            requestedUrl: requestedUrl.href,
            details: { targetUrl: this.sanitizeUrl(nextUrl) }
          });
        }
        await response.body?.cancel();
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError(ErrorCode.HTTP_ERROR, stage, `文档请求失败：HTTP ${response.status}`, {
          requestedUrl: requestedUrl.href,
          details: { status: response.status, url: this.sanitizeUrl(currentUrl) }
        });
      }

      return {
        requestedUrl: requestedUrl.href,
        finalUrl: currentUrl.href,
        contentType: response.headers.get("content-type") ?? "",
        body: await this.readLimitedBody(response, stage, requestedUrl.href),
        fetchedAt: new Date().toISOString()
      };
    }

    throw new AppError(ErrorCode.TOO_MANY_REDIRECTS, stage, "文档重定向次数超出限制", {
      requestedUrl: requestedUrl.href
    });
  }

  private validateUrl(urlValue: string, stage: ErrorStage): URL {
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch (error) {
      throw new AppError(ErrorCode.INVALID_URL, stage, "docsUrl 不是有效 URL", {
        requestedUrl: urlValue,
        cause: error
      });
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new AppError(ErrorCode.INVALID_URL, stage, "docsUrl 仅支持 http 或 https", {
        requestedUrl: urlValue
      });
    }
    if (url.username || url.password) {
      throw new AppError(ErrorCode.AUTHENTICATED_URL_UNSUPPORTED, stage, "v1 不支持 URL 中携带认证信息", {
        requestedUrl: this.sanitizeUrl(url)
      });
    }
    return url;
  }

  private async request(url: URL, stage: ErrorStage, requestedUrl: string): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "application/json, text/html;q=0.9, */*;q=0.1",
          "user-agent": "swagger-docs-mcp/0.1.0"
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new AppError(
        timeout ? ErrorCode.REQUEST_TIMEOUT : ErrorCode.HTTP_ERROR,
        stage,
        timeout ? `文档请求超过 ${this.timeoutMs}ms` : "文档网络请求失败",
        { requestedUrl, cause: error }
      );
    }
  }

  private async readLimitedBody(response: Response, stage: ErrorStage, requestedUrl: string): Promise<Uint8Array> {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
      await response.body?.cancel();
      throw new AppError(ErrorCode.RESPONSE_TOO_LARGE, stage, `文档响应超过 ${this.maxResponseBytes} 字节限制`, {
        requestedUrl,
        details: { contentLength: declaredLength }
      });
    }

    if (!response.body) {
      return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > this.maxResponseBytes) {
        await reader.cancel();
        throw new AppError(ErrorCode.RESPONSE_TOO_LARGE, stage, `文档响应超过 ${this.maxResponseBytes} 字节限制`, {
          requestedUrl,
          details: { receivedBytes: totalBytes }
        });
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  }

  private sanitizeUrl(url: URL): string {
    const sanitized = new URL(url);
    sanitized.username = "";
    sanitized.password = "";
    return sanitized.href;
  }
}
