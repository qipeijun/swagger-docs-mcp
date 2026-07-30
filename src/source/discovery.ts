import { createHash } from "node:crypto";
import { ApiDocumentType, NavigationNextAction } from "../domain/types.js";
import { AppError, ErrorCode, ErrorStage } from "../errors.js";
import { createSafeHttpClient, SafeHttpClient } from "./http-client.js";
import type {
  DiscoveredDocument,
  DocumentDiscoveryAdapter,
  DocumentGroupCandidate,
  DocumentResolution,
  FetchResult
} from "./types.js";

interface SwaggerResourceEntry {
  name?: unknown;
  url?: unknown;
  location?: unknown;
}

function decodeBody(result: FetchResult): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(result.body);
}

function parseJson(text: string, requestedUrl: string, stage: ErrorStage): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new AppError(ErrorCode.INVALID_DOCUMENT, stage, "文档响应不是有效 JSON", {
      requestedUrl,
      cause: error
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createDiscoveredDocument(
  requestedUrl: string,
  documentEntryUrl: string,
  result: FetchResult,
  rawText: string,
  rawDocument: unknown,
  group?: string
): DiscoveredDocument {
  return {
    requestedUrl,
    documentEntryUrl,
    resolvedSpecUrl: result.finalUrl,
    fetchedAt: result.fetchedAt,
    ...(group ? { group } : {}),
    rawText,
    rawDocument,
    fingerprint: createHash("sha256").update(rawText).digest("hex")
  };
}

export class RawJsonDiscoveryAdapter implements DocumentDiscoveryAdapter {
  readonly name = "raw-json";

  canHandle(entry: FetchResult): boolean {
    const text = decodeBody(entry).trimStart();
    return entry.contentType.includes("json") || text.startsWith("{");
  }

  async resolve(entry: FetchResult, _group?: string): Promise<DocumentResolution> {
    const rawText = decodeBody(entry);
    const rawDocument = parseJson(rawText, entry.requestedUrl, ErrorStage.PARSE_SPEC);
    const document = createDiscoveredDocument(
      entry.requestedUrl,
      entry.finalUrl,
      entry,
      rawText,
      rawDocument
    );
    return {
      requestedUrl: entry.requestedUrl,
      documentEntryUrl: entry.finalUrl,
      fetchedAt: entry.fetchedAt,
      documentType: ApiDocumentType.SWAGGER_JSON,
      groups: [],
      document
    };
  }
}

export class SpringfoxDiscoveryAdapter implements DocumentDiscoveryAdapter {
  readonly name = "springfox-swagger-resources";

  constructor(private readonly httpClient: SafeHttpClient) {}

  canHandle(entry: FetchResult): boolean {
    const contentType = entry.contentType.toLowerCase();
    const text = decodeBody(entry).trimStart().toLowerCase();
    return contentType.includes("html") || text.startsWith("<!doctype html") || text.startsWith("<html");
  }

  async resolve(entry: FetchResult, group?: string): Promise<DocumentResolution> {
    const groupsResult = await this.fetchGroups(entry);
    const selected = group
      ? groupsResult.groups.find((candidate) => candidate.name === group)
      : groupsResult.groups.length === 1
        ? groupsResult.groups[0]
        : undefined;
    const base: DocumentResolution = {
      requestedUrl: entry.requestedUrl,
      documentEntryUrl: entry.finalUrl,
      fetchedAt: groupsResult.fetchedAt,
      documentType: ApiDocumentType.KNIFE4J_UI,
      groups: groupsResult.groups,
      ...(selected ? { selectedGroup: selected.name } : {})
    };
    if (!selected) return base;

    const specResult = await this.httpClient.get(selected.specUrl, ErrorStage.FETCH_SPEC);
    const rawText = decodeBody(specResult);
    const rawDocument = parseJson(rawText, entry.requestedUrl, ErrorStage.PARSE_SPEC);
    return {
      ...base,
      fetchedAt: specResult.fetchedAt,
      document: createDiscoveredDocument(
        entry.requestedUrl,
        entry.finalUrl,
        specResult,
        rawText,
        rawDocument,
        selected.name
      )
    };
  }

  private async fetchGroups(entry: FetchResult): Promise<{
    groups: DocumentGroupCandidate[];
    fetchedAt: string;
  }> {
    const discoveryUrl = new URL("swagger-resources", entry.finalUrl);
    let resourceResult: FetchResult;
    try {
      resourceResult = await this.httpClient.get(discoveryUrl.href, ErrorStage.DISCOVER_SPEC);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.HTTP_ERROR) {
        if (error.details?.status === 401 || error.details?.status === 403) throw error;
        throw new AppError(
          ErrorCode.DISCOVERY_FAILED,
          ErrorStage.DISCOVER_SPEC,
          "无法从展示页发现 Swagger 分组，请提供 Swagger JSON 直链地址",
          {
            requestedUrl: entry.requestedUrl,
            details: {
              discoveryUrl: discoveryUrl.href,
              nextAction: NavigationNextAction.PROVIDE_SWAGGER_JSON_URL,
              ...(error.details?.status ? { status: error.details.status } : {})
            },
            cause: error
          }
        );
      }
      throw error;
    }
    const resources = parseJson(decodeBody(resourceResult), entry.requestedUrl, ErrorStage.DISCOVER_SPEC);
    if (!Array.isArray(resources)) {
      throw new AppError(ErrorCode.DISCOVERY_FAILED, ErrorStage.DISCOVER_SPEC, "swagger-resources 未返回分组数组", {
        requestedUrl: entry.requestedUrl,
        details: { nextAction: NavigationNextAction.PROVIDE_SWAGGER_JSON_URL }
      });
    }

    const entryOrigin = new URL(entry.finalUrl).origin;
    const groups = resources
      .map((item): DocumentGroupCandidate | null => {
        if (!isObject(item)) return null;
        const typed = item as SwaggerResourceEntry;
        const name = typeof typed.name === "string" ? typed.name : "";
        const location = typeof typed.location === "string"
          ? typed.location
          : typeof typed.url === "string"
            ? typed.url
            : "";
        if (!name || !location) return null;
        let specUrl: URL;
        try {
          specUrl = new URL(location, entry.finalUrl);
        } catch (error) {
          throw new AppError(ErrorCode.INVALID_DOCUMENT, ErrorStage.DISCOVER_SPEC, `分组 ${name} 的 Swagger 地址无效`, {
            requestedUrl: entry.requestedUrl,
            details: { group: name, location },
            cause: error
          });
        }
        if (specUrl.origin !== entryOrigin) {
          throw new AppError(
            ErrorCode.CROSS_ORIGIN_REDIRECT,
            ErrorStage.DISCOVER_SPEC,
            "发现的 Swagger 地址跨主机，已拒绝访问",
            { requestedUrl: entry.requestedUrl, details: { targetUrl: specUrl.href, group: name } }
          );
        }
        return { name, specUrl: specUrl.href };
      })
      .filter((item): item is DocumentGroupCandidate => item !== null);
    if (groups.length === 0) {
      throw new AppError(ErrorCode.DISCOVERY_FAILED, ErrorStage.DISCOVER_SPEC, "未发现可用 Swagger 文档分组", {
        requestedUrl: entry.requestedUrl,
        details: { nextAction: NavigationNextAction.PROVIDE_SWAGGER_JSON_URL }
      });
    }
    const duplicateNames = [...new Set(groups
      .map((candidate) => candidate.name)
      .filter((name, index, names) => names.indexOf(name) !== index))];
    if (duplicateNames.length) {
      throw new AppError(ErrorCode.GROUP_AMBIGUOUS, ErrorStage.DISCOVER_SPEC, "Swagger 分组名称不唯一，不能安全选择", {
        requestedUrl: entry.requestedUrl,
        details: { groups: duplicateNames }
      });
    }
    return { groups, fetchedAt: resourceResult.fetchedAt };
  }
}

export class DocumentDiscoveryService {
  private readonly adapters: DocumentDiscoveryAdapter[];

  constructor(private readonly httpClient = createSafeHttpClient()) {
    this.adapters = [
      new RawJsonDiscoveryAdapter(),
      new SpringfoxDiscoveryAdapter(httpClient)
    ];
  }

  /**
   * 实时解析文档入口。返回结果可能已经包含规范文档，也可能只包含待选择分组；
   * 调用方无需了解 HTML、swagger-resources 和原始 JSON 的不同发现步骤。
   */
  async resolve(docsUrl: string, group?: string): Promise<DocumentResolution> {
    const entry = await this.httpClient.get(docsUrl, ErrorStage.FETCH_ENTRY);
    const adapter = this.adapters.find((candidate) => candidate.canHandle(entry));
    if (!adapter) {
      throw new AppError(ErrorCode.DISCOVERY_FAILED, ErrorStage.DISCOVER_SPEC, "无法识别该文档入口类型", {
        requestedUrl: docsUrl,
        details: { contentType: entry.contentType }
      });
    }
    return adapter.resolve(entry, group);
  }
}
