export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS"
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** 文档解析完整性，PARTIAL 表示结果中存在明确标注的解析边界。 */
export enum Completeness {
  COMPLETE = "complete",
  PARTIAL = "partial"
}

/** 文档入口类型。UNKNOWN 只用于无法完成受支持发现流程的错误上下文。 */
export enum ApiDocumentType {
  SWAGGER_JSON = "swagger-json",
  KNIFE4J_UI = "knife4j-ui",
  UNKNOWN = "unknown"
}

/** 地址导航的下一步动作，由 Agent 根据候选项继续询问或调用现有查询 Tool。 */
export enum NavigationNextAction {
  SELECT_GROUP = "select_group",
  SELECT_CATEGORY = "select_category",
  SELECT_API = "select_api",
  GET_API_DETAIL = "get_api_detail",
  PROVIDE_SWAGGER_JSON_URL = "provide_swagger_json_url"
}

export interface SourceMetadata {
  requestedUrl: string;
  documentEntryUrl: string;
  resolvedSpecUrl: string;
  fetchedAt: string;
  fetchMode: "live";
  cacheUsed: false;
  title: string;
  documentVersion: string;
  specVersion: string;
  group?: string;
  documentFingerprint: string;
}

export interface InspectionSourceMetadata {
  requestedUrl: string;
  documentEntryUrl: string;
  resolvedSpecUrl?: string;
  fetchedAt: string;
  fetchMode: "live";
  cacheUsed: false;
  title?: string;
  documentVersion?: string;
  specVersion?: string;
  group?: string;
  documentFingerprint?: string;
}

export interface ToolEnvelope<T> {
  source: SourceMetadata;
  sourceNotice: string;
  data: T;
  warnings: string[];
  completeness: Completeness;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface UrlHashHints {
  group?: string;
  category?: string;
  operationId?: string;
  recognized: boolean;
}

export interface VerifiedSelection<T extends Record<string, unknown>> {
  value: T;
  verified: boolean;
}

export interface ApiDocsInspectionData {
  documentType: ApiDocumentType;
  hashHints: UrlHashHints;
  groups: Array<{ name: string }>;
  selection: {
    group?: VerifiedSelection<{ name: string }>;
    category?: VerifiedSelection<{ name: string }>;
    api?: VerifiedSelection<{
      operationId: string;
      path?: string;
      method?: HttpMethod;
    }>;
  };
  nextAction: NavigationNextAction;
  candidates: {
    groups?: Array<{ name: string }>;
    categories?: Paginated<ApiCategory>;
    apis?: Paginated<ApiOperationSummary>;
  };
}

export interface InspectionEnvelope {
  source: InspectionSourceMetadata;
  sourceNotice: string;
  data: ApiDocsInspectionData;
  warnings: string[];
  completeness: Completeness;
}

export interface ApiCategory {
  name: string;
  operationCount: number;
}

export interface ApiOperationSummary {
  path: string;
  method: HttpMethod;
  summary: string;
  description: string;
  operationId?: string;
  categories: string[];
}

export interface ApiParameter {
  name: string;
  location: "path" | "query" | "header" | "formData" | "body";
  required: boolean;
  type: string;
  format?: string;
  description: string;
  defaultValue?: unknown;
  enumValues?: unknown[];
  collectionFormat?: string;
  schema?: SchemaAnalysis;
}

export interface ApiResponseSummary {
  statusCode: string;
  description: string;
  schemaName?: string;
}

export interface ApiResponseDocumentation extends ApiResponseSummary {
  schemaTree: SchemaNode | null;
  flatFields: FlatSchemaField[];
  schemaReferences: string[];
  unresolvedDynamicFields: UnresolvedDynamicField[];
  warnings: string[];
  completeness: Completeness;
}

export interface ApiOperationDocumentation extends ApiOperationSummary {
  consumes: string[];
  produces: string[];
  parameters: ApiParameter[];
  responses: ApiResponseDocumentation[];
  warnings: string[];
  completeness: Completeness;
}

export interface SchemaNode {
  path: string;
  name: string;
  type: string;
  itemType?: string;
  format?: string;
  description: string;
  required: boolean;
  schemaName?: string;
  ref?: string;
  enumValues?: unknown[];
  defaultValue?: unknown;
  dynamicKey?: boolean;
  recursionBoundary?: boolean;
  boundaryReason?: string;
  children: SchemaNode[];
}

export interface FlatSchemaField {
  path: string;
  name: string;
  type: string;
  itemType?: string;
  format?: string;
  description: string;
  required: boolean;
  schemaName?: string;
  enumValues?: unknown[];
  defaultValue?: unknown;
  dynamicKey?: boolean;
  recursionBoundary?: boolean;
}

export interface UnresolvedDynamicField {
  path: string;
  reason: string;
  valueType: string;
}

export interface SchemaAnalysis {
  schemaTree: SchemaNode | null;
  flatFields: FlatSchemaField[];
  schemaReferences: string[];
  unresolvedDynamicFields: UnresolvedDynamicField[];
  warnings: string[];
  completeness: Completeness;
}

export interface ApiDocument {
  title: string;
  version: string;
  specVersion: string;
  operations: ApiOperationSummary[];
  getOperation(path: string, method: HttpMethod): ApiOperationDocumentation;
}

export interface LoadedApiDocument {
  document: ApiDocument;
  source: SourceMetadata;
  sourceNotice: string;
}
