import type { UrlHashHints } from "../domain/types.js";
import { AppError, ErrorCode, ErrorStage } from "../errors.js";

/**
 * 解析 Knife4j 的 #/group/category/operationId 导航片段。
 * hash 仅作为待验证线索，不参与网络请求，也不直接当作真实接口结论。
 */
export function parseUrlHashHints(docsUrl: string): UrlHashHints {
  let url: URL;
  try {
    url = new URL(docsUrl);
  } catch (error) {
    throw new AppError(ErrorCode.INVALID_URL, ErrorStage.VALIDATE_URL, "docsUrl 不是有效 URL", {
      requestedUrl: docsUrl,
      cause: error
    });
  }

  if (!url.hash || url.hash === "#") {
    return { recognized: true };
  }
  if (!url.hash.startsWith("#/")) {
    return { recognized: false };
  }

  let segments: string[];
  try {
    segments = url.hash.slice(2).split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch (error) {
    throw new AppError(ErrorCode.INVALID_URL, ErrorStage.VALIDATE_URL, "文档 URL 的 hash 包含无效编码", {
      requestedUrl: docsUrl,
      cause: error
    });
  }
  if (segments.length === 0) return { recognized: true };
  if (segments.length > 3) return { recognized: false };

  const [group, category, operationId] = segments;
  return {
    recognized: true,
    ...(group ? { group } : {}),
    ...(category ? { category } : {}),
    ...(operationId ? { operationId } : {})
  };
}
