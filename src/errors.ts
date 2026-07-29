/** 错误发生阶段，用于区分地址校验、网络获取、文档发现、解析和查询问题。 */
export enum ErrorStage {
  VALIDATE_URL = "validate_url",
  FETCH_ENTRY = "fetch_entry",
  DISCOVER_SPEC = "discover_spec",
  FETCH_SPEC = "fetch_spec",
  PARSE_SPEC = "parse_spec",
  QUERY_DOCUMENT = "query_document",
  RUNTIME_CHECK = "runtime_check",
  CLIENT_SETUP = "client_setup"
}

/** 稳定错误码，MCP 客户端应基于 code 判断，不依赖易变化的提示文案。 */
export enum ErrorCode {
  INVALID_URL = "INVALID_URL",
  AUTHENTICATED_URL_UNSUPPORTED = "AUTHENTICATED_URL_UNSUPPORTED",
  REQUEST_TIMEOUT = "REQUEST_TIMEOUT",
  RESPONSE_TOO_LARGE = "RESPONSE_TOO_LARGE",
  HTTP_ERROR = "HTTP_ERROR",
  CROSS_ORIGIN_REDIRECT = "CROSS_ORIGIN_REDIRECT",
  TOO_MANY_REDIRECTS = "TOO_MANY_REDIRECTS",
  INVALID_DOCUMENT = "INVALID_DOCUMENT",
  DISCOVERY_FAILED = "DISCOVERY_FAILED",
  GROUP_REQUIRED = "GROUP_REQUIRED",
  GROUP_NOT_FOUND = "GROUP_NOT_FOUND",
  GROUP_AMBIGUOUS = "GROUP_AMBIGUOUS",
  UNSUPPORTED_SPEC_VERSION = "UNSUPPORTED_SPEC_VERSION",
  CATEGORY_NOT_FOUND = "CATEGORY_NOT_FOUND",
  PATH_NOT_FOUND = "PATH_NOT_FOUND",
  METHOD_REQUIRED = "METHOD_REQUIRED",
  METHOD_NOT_FOUND = "METHOD_NOT_FOUND",
  UNSUPPORTED_NODE_VERSION = "UNSUPPORTED_NODE_VERSION",
  INVALID_CLI_ARGUMENT = "INVALID_CLI_ARGUMENT",
  CLIENT_NOT_FOUND = "CLIENT_NOT_FOUND",
  CLIENT_CONFIG_CONFLICT = "CLIENT_CONFIG_CONFLICT",
  CLIENT_COMMAND_FAILED = "CLIENT_COMMAND_FAILED"
}

export interface AppErrorOptions {
  requestedUrl?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly stage: ErrorStage;
  readonly requestedUrl: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, stage: ErrorStage, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.stage = stage;
    this.requestedUrl = options.requestedUrl;
    this.details = options.details;
  }
}

export function toAppError(error: unknown, requestedUrl?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(
    ErrorCode.INVALID_DOCUMENT,
    ErrorStage.PARSE_SPEC,
    error instanceof Error ? error.message : "发生未知错误",
    { ...(requestedUrl ? { requestedUrl } : {}), cause: error }
  );
}
