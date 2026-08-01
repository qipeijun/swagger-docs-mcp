import {
  ApiDocumentType,
  Completeness,
  HTTP_METHODS,
  NavigationNextAction,
  type ApiCategory,
  type ApiDocsInspectionData,
  type ApiDocument,
  type ApiOperationDocumentation,
  type ApiOperationSummary,
  type HttpMethod,
  type InspectionEnvelope,
  type InspectionSourceMetadata,
  type LoadedApiDocument,
  type Paginated,
  type SourceMetadata,
  type ToolEnvelope
} from "../domain/types.js";
import { AppError, ErrorCode, ErrorStage } from "../errors.js";
import { parseUrlHashHints } from "../navigation/url-navigation.js";
import type { ApiSpecParser } from "../parser/types.js";
import { DocumentDiscoveryService } from "../source/discovery.js";
import type { DiscoveredDocument, DocumentResolution } from "../source/types.js";
import { Swagger2Parser } from "../swagger2/parser.js";

export type DetailLevel = "summary" | "full";

const BEIJING_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export interface CategoryQuery {
  docsUrl: string;
  group?: string;
  category: string;
  detailLevel: DetailLevel;
  page: number;
  pageSize: number;
}

export interface PathQuery {
  docsUrl: string;
  group?: string;
  path: string;
  method?: string;
}

export interface SearchQuery {
  docsUrl: string;
  group?: string;
  keyword: string;
  page: number;
  pageSize: number;
}

export class ApiDocsService {
  private readonly parsers: ApiSpecParser[];

  constructor(
    private readonly discoveryService = new DocumentDiscoveryService(),
    parsers: ApiSpecParser[] = [new Swagger2Parser()]
  ) {
    this.parsers = parsers;
  }

  /** 实时加载并解析文档。此方法不保存地址，也不缓存文档内容。 */
  async load(docsUrl: string, group?: string): Promise<LoadedApiDocument> {
    const resolution = await this.discoveryService.resolve(docsUrl, group);
    const discovered = this.requireDocument(resolution, group);
    return this.parseDiscoveredDocument(discovered);
  }

  /**
   * 检查文档地址并解析 Knife4j 导航线索。只返回下一步和候选项，
   * 不保存选择，也不替代现有分类、路径和搜索 Tool。
   */
  async inspect(docsUrl: string, page: number, pageSize: number): Promise<InspectionEnvelope> {
    const hashHints = parseUrlHashHints(docsUrl);
    const warnings: string[] = [];
    if (!hashHints.recognized) {
      warnings.push("URL hash 不是受支持的 Knife4j 导航格式，未使用其中的导航线索");
    }

    const hintedGroup = hashHints.recognized ? hashHints.group : undefined;
    const resolution = await this.discoveryService.resolve(docsUrl, hintedGroup);
    const groups = resolution.groups.map(({ name }) => ({ name }));
    if (!resolution.document) {
      const invalidHint = Boolean(hintedGroup);
      if (invalidHint) warnings.push(`hash 分组 ${hintedGroup} 未通过实时文档验证`);
      return this.inspectionEnvelope(
        this.inspectionSource(resolution),
        {
          documentType: resolution.documentType,
          hashHints,
          groups,
          selection: hintedGroup
            ? { group: { value: { name: hintedGroup }, verified: false } }
            : {},
          nextAction: NavigationNextAction.SELECT_GROUP,
          candidates: { groups }
        },
        warnings
      );
    }

    const loaded = this.parseDiscoveredDocument(resolution.document);
    const effectiveHints = resolution.documentType === ApiDocumentType.KNIFE4J_UI && hashHints.recognized
      ? hashHints
      : { recognized: hashHints.recognized };
    if (resolution.documentType === ApiDocumentType.SWAGGER_JSON
      && (hashHints.group || hashHints.category || hashHints.operationId)) {
      warnings.push("原始 Swagger JSON 地址不使用 Knife4j hash，已忽略其中的导航线索");
    }

    const selection: ApiDocsInspectionData["selection"] = resolution.selectedGroup
      ? { group: { value: { name: resolution.selectedGroup }, verified: true } }
      : {};
    const categories = this.categories(loaded.document);
    const categoryPage = this.paginate(categories, page, pageSize);
    if (!effectiveHints.category) {
      return this.inspectionEnvelope(
        loaded.source,
        {
          documentType: resolution.documentType,
          hashHints,
          groups,
          selection,
          nextAction: NavigationNextAction.SELECT_CATEGORY,
          candidates: { categories: categoryPage }
        },
        warnings
      );
    }

    const category = effectiveHints.category;
    const categoryExists = categories.some((candidate) => candidate.name === category);
    selection.category = { value: { name: category }, verified: categoryExists };
    if (!categoryExists) {
      warnings.push(`hash 分类 ${category} 未通过实时文档验证`);
      return this.inspectionEnvelope(
        loaded.source,
        {
          documentType: resolution.documentType,
          hashHints,
          groups,
          selection,
          nextAction: NavigationNextAction.SELECT_CATEGORY,
          candidates: { categories: categoryPage }
        },
        warnings
      );
    }

    const categoryOperations = loaded.document.operations.filter((operation) => {
      const operationCategories = operation.categories.length ? operation.categories : ["未分类"];
      return operationCategories.includes(category);
    });
    const apiPage = this.paginate(categoryOperations, page, pageSize);
    if (!effectiveHints.operationId) {
      return this.inspectionEnvelope(
        loaded.source,
        {
          documentType: resolution.documentType,
          hashHints,
          groups,
          selection,
          nextAction: NavigationNextAction.SELECT_API,
          candidates: { apis: apiPage }
        },
        warnings
      );
    }

    const operationId = effectiveHints.operationId;
    const matchedOperations = categoryOperations.filter((operation) => operation.operationId === operationId);
    if (matchedOperations.length !== 1) {
      selection.api = { value: { operationId }, verified: false };
      warnings.push(matchedOperations.length === 0
        ? `hash operationId ${operationId} 未通过实时文档验证`
        : `hash operationId ${operationId} 在分类内不唯一，不能自动选择`);
      return this.inspectionEnvelope(
        loaded.source,
        {
          documentType: resolution.documentType,
          hashHints,
          groups,
          selection,
          nextAction: NavigationNextAction.SELECT_API,
          candidates: { apis: apiPage }
        },
        warnings
      );
    }

    const matched = matchedOperations[0] as ApiOperationSummary;
    selection.api = {
      value: { operationId, path: matched.path, method: matched.method },
      verified: true
    };
    return this.inspectionEnvelope(
      loaded.source,
      {
        documentType: resolution.documentType,
        hashHints,
        groups,
        selection,
        nextAction: NavigationNextAction.GET_API_DETAIL,
        candidates: {}
      },
      warnings
    );
  }

  private parseDiscoveredDocument(discovered: DiscoveredDocument): LoadedApiDocument {
    const parser = this.parsers.find((candidate) => candidate.canParse(discovered.rawDocument));
    if (!parser) {
      const raw = typeof discovered.rawDocument === "object" && discovered.rawDocument !== null
        ? discovered.rawDocument as Record<string, unknown>
        : {};
      const version = typeof raw.openapi === "string"
        ? raw.openapi
        : typeof raw.swagger === "string"
          ? raw.swagger
          : "unknown";
      throw new AppError(
        ErrorCode.UNSUPPORTED_SPEC_VERSION,
        ErrorStage.PARSE_SPEC,
        version === "unknown" ? "无法识别文档规范版本" : `当前暂不支持 ${version} 规范的文档`,
        { requestedUrl: discovered.requestedUrl, details: { version } }
      );
    }

    const document = parser.parse(discovered.rawDocument);
    const source: SourceMetadata = {
      requestedUrl: discovered.requestedUrl,
      documentEntryUrl: discovered.documentEntryUrl,
      resolvedSpecUrl: discovered.resolvedSpecUrl,
      fetchedAt: discovered.fetchedAt,
      fetchMode: "live",
      cacheUsed: false,
      title: document.title,
      documentVersion: document.version,
      specVersion: document.specVersion,
      ...(discovered.group ? { group: discovered.group } : {}),
      documentFingerprint: discovered.fingerprint
    };
    return {
      document,
      source,
      sourceNotice: this.createSourceNotice(source)
    };
  }

  private requireDocument(resolution: DocumentResolution, requestedGroup?: string): DiscoveredDocument {
    if (resolution.document) return resolution.document;
    const groups = resolution.groups.map((candidate) => candidate.name);
    if (requestedGroup) {
      throw new AppError(ErrorCode.GROUP_NOT_FOUND, ErrorStage.DISCOVER_SPEC, `未找到文档分组：${requestedGroup}`, {
        requestedUrl: resolution.requestedUrl,
        details: { groups }
      });
    }
    throw new AppError(ErrorCode.GROUP_REQUIRED, ErrorStage.DISCOVER_SPEC, "该文档包含多个分组，请明确传入 group", {
      requestedUrl: resolution.requestedUrl,
      details: { groups }
    });
  }

  async listCategories(
    docsUrl: string,
    group: string | undefined,
    page: number,
    pageSize: number
  ): Promise<ToolEnvelope<Paginated<ApiCategory>>> {
    const loaded = await this.load(docsUrl, group);
    const categories = this.categories(loaded.document);
    return this.envelope(loaded, this.paginate(categories, page, pageSize), []);
  }

  async getCategory(
    query: CategoryQuery
  ): Promise<ToolEnvelope<Paginated<ApiOperationSummary | ApiOperationDocumentation>>> {
    const loaded = await this.load(query.docsUrl, query.group);
    const categories = this.categoryNames(loaded.document);
    if (!categories.includes(query.category)) {
      throw new AppError(ErrorCode.CATEGORY_NOT_FOUND, ErrorStage.QUERY_DOCUMENT, `未找到接口分类：${query.category}`, {
        requestedUrl: query.docsUrl,
        details: { candidates: this.findCandidates(categories, query.category) }
      });
    }

    const matching = loaded.document.operations.filter((operation) => {
      const operationCategories = operation.categories.length ? operation.categories : ["未分类"];
      return operationCategories.includes(query.category);
    });
    const page = this.paginate(matching, query.page, query.pageSize);
    if (query.detailLevel === "summary") {
      return this.envelope(loaded, page, []);
    }

    const fullItems = page.items.map((operation) => loaded.document.getOperation(operation.path, operation.method));
    const warnings = fullItems.flatMap((operation) => this.operationWarnings(operation));
    return this.envelope(loaded, { ...page, items: fullItems }, warnings);
  }

  async getByPath(query: PathQuery): Promise<ToolEnvelope<{
    operation: ApiOperationDocumentation;
    response: ApiOperationDocumentation["responses"][number] | null;
  }>> {
    const loaded = await this.load(query.docsUrl, query.group);
    const pathOperations = loaded.document.operations.filter((operation) => operation.path === query.path);
    if (pathOperations.length === 0) {
      const allPaths = [...new Set(loaded.document.operations.map((operation) => operation.path))];
      throw new AppError(ErrorCode.PATH_NOT_FOUND, ErrorStage.QUERY_DOCUMENT, `未找到接口路径：${query.path}`, {
        requestedUrl: query.docsUrl,
        details: { candidates: this.findCandidates(allPaths, query.path) }
      });
    }

    let selected: ApiOperationSummary;
    if (query.method) {
      const normalizedMethod = query.method.toUpperCase();
      if (!HTTP_METHODS.includes(normalizedMethod as HttpMethod)) {
        throw new AppError(ErrorCode.METHOD_NOT_FOUND, ErrorStage.QUERY_DOCUMENT, `不支持 HTTP Method：${query.method}`, {
          requestedUrl: query.docsUrl,
          details: { methods: pathOperations.map((operation) => operation.method) }
        });
      }
      const matched = pathOperations.find((operation) => operation.method === normalizedMethod);
      if (!matched) {
        throw new AppError(ErrorCode.METHOD_NOT_FOUND, ErrorStage.QUERY_DOCUMENT, `路径 ${query.path} 不存在 ${normalizedMethod} 方法`, {
          requestedUrl: query.docsUrl,
          details: { methods: pathOperations.map((operation) => operation.method) }
        });
      }
      selected = matched;
    } else if (pathOperations.length > 1) {
      throw new AppError(ErrorCode.METHOD_REQUIRED, ErrorStage.QUERY_DOCUMENT, "同一路径存在多个 HTTP Method，请明确传入 method", {
        requestedUrl: query.docsUrl,
        details: { methods: pathOperations.map((operation) => operation.method) }
      });
    } else {
      selected = pathOperations[0] as ApiOperationSummary;
    }

    const operation = loaded.document.getOperation(selected.path, selected.method);
    const response = this.primaryResponse(operation);
    const warnings = this.operationWarnings(operation);
    return this.envelope(loaded, { operation, response }, warnings);
  }

  async search(query: SearchQuery): Promise<ToolEnvelope<Paginated<ApiOperationSummary & { matchedFields: string[] }>>> {
    const keyword = query.keyword.trim().toLocaleLowerCase();
    if (!keyword) {
      throw new AppError(ErrorCode.INVALID_CLI_ARGUMENT, ErrorStage.QUERY_DOCUMENT, "搜索关键词不能为空", {
        requestedUrl: query.docsUrl
      });
    }
    const loaded = await this.load(query.docsUrl, query.group);
    const matches = loaded.document.operations.flatMap((operation) => {
      const fields: Array<[string, string]> = [
        ["path", operation.path],
        ["summary", operation.summary],
        ["description", operation.description],
        ["operationId", operation.operationId ?? ""],
        ["category", operation.categories.join(" ")]
      ];
      const matchedFields = fields
        .filter(([, value]) => value.toLocaleLowerCase().includes(keyword))
        .map(([name]) => name);
      return matchedFields.length ? [{ ...operation, matchedFields }] : [];
    });
    return this.envelope(loaded, this.paginate(matches, query.page, query.pageSize), []);
  }

  private categoryNames(document: ApiDocument): string[] {
    return [...new Set(document.operations.flatMap((operation) => operation.categories.length
      ? operation.categories
      : ["未分类"]))].sort();
  }

  private categories(document: ApiDocument): ApiCategory[] {
    const counts = new Map<string, number>();
    for (const operation of document.operations) {
      const categories = operation.categories.length ? operation.categories : ["未分类"];
      for (const category of categories) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, operationCount]) => ({ name, operationCount }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private primaryResponse(operation: ApiOperationDocumentation): ApiOperationDocumentation["responses"][number] | null {
    return operation.responses.find((response) => response.statusCode === "200")
      ?? operation.responses.find((response) => response.statusCode.startsWith("2"))
      ?? operation.responses.find((response) => response.statusCode === "default")
      ?? operation.responses[0]
      ?? null;
  }

  private paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
    const total = items.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    return {
      items: items.slice(offset, offset + pageSize),
      pagination: { page, pageSize, total, totalPages }
    };
  }

  private envelope<T>(loaded: LoadedApiDocument, data: T, warnings: string[]): ToolEnvelope<T> {
    const uniqueWarnings = [...new Set(warnings)];
    return {
      source: loaded.source,
      sourceNotice: loaded.sourceNotice,
      data,
      warnings: uniqueWarnings,
      completeness: uniqueWarnings.length ? Completeness.PARTIAL : Completeness.COMPLETE
    };
  }

  private inspectionEnvelope(
    source: InspectionSourceMetadata,
    data: ApiDocsInspectionData,
    warnings: string[]
  ): InspectionEnvelope {
    const uniqueWarnings = [...new Set(warnings)];
    return {
      source,
      sourceNotice: this.createInspectionSourceNotice(source),
      data,
      warnings: uniqueWarnings,
      completeness: uniqueWarnings.length ? Completeness.PARTIAL : Completeness.COMPLETE
    };
  }

  private inspectionSource(resolution: DocumentResolution): InspectionSourceMetadata {
    return {
      requestedUrl: resolution.requestedUrl,
      documentEntryUrl: resolution.documentEntryUrl,
      fetchedAt: resolution.fetchedAt,
      fetchMode: "live",
      cacheUsed: false
    };
  }

  /** 汇总一次接口解析中的所有边界，让顶层 completeness 与请求体、响应体保持一致。 */
  private operationWarnings(operation: ApiOperationDocumentation): string[] {
    const warnings = [
      ...operation.warnings,
      ...operation.responses.flatMap((response) => response.warnings),
      ...operation.parameters.flatMap((parameter) => parameter.schema?.warnings ?? [])
    ];
    if (operation.responses.some((response) => response.completeness === Completeness.PARTIAL)) {
      warnings.push("响应 Schema 存在解析边界（动态字段 / 递归 / 缺失引用），见具体字段标记");
    }
    if (operation.parameters.some((parameter) => parameter.schema?.completeness === Completeness.PARTIAL)) {
      warnings.push("请求体 Schema 存在解析边界（动态字段 / 递归 / 缺失引用），见具体字段标记");
    }
    return warnings;
  }

  private findCandidates(values: string[], input: string): string[] {
    const normalized = input.toLocaleLowerCase();
    return values
      .filter((value) => value.toLocaleLowerCase().includes(normalized) || normalized.includes(value.toLocaleLowerCase()))
      .slice(0, 10);
  }

  /** 将 ISO 获取时间转换为便于中文用户阅读的北京时间。 */
  private formatFetchedAt(fetchedAt: string): string {
    const parts = Object.fromEntries(
      BEIJING_TIME_FORMATTER.formatToParts(new Date(fetchedAt))
        .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}（北京时间）`;
  }

  private sourceLink(label: string, url: string): string {
    return `[${label}](<${url}>)`;
  }

  private sourceIdentity(title?: string, group?: string): string {
    if (title && group) return `${title}（Knife4j 分组：${group}）；`;
    if (title) return `${title}；`;
    if (group) return `Knife4j 分组：${group}；`;
    return "";
  }

  /** 相同的文档入口和 Swagger JSON 地址只展示一次，避免来源说明重复。 */
  private sourceLinks(documentEntryUrl: string, resolvedSpecUrl?: string): string {
    if (!resolvedSpecUrl) {
      return `${this.sourceLink("文档入口", documentEntryUrl)}；尚未选择分组`;
    }
    if (documentEntryUrl === resolvedSpecUrl) {
      return this.sourceLink("Swagger JSON", resolvedSpecUrl);
    }
    return `${this.sourceLink("文档入口", documentEntryUrl)}；${this.sourceLink("Swagger JSON", resolvedSpecUrl)}`;
  }

  private createSourceNotice(source: SourceMetadata): string {
    const identity = this.sourceIdentity(source.title, source.group);
    return `Swagger 来源：${identity}${this.sourceLinks(source.documentEntryUrl, source.resolvedSpecUrl)}；获取时间：${this.formatFetchedAt(source.fetchedAt)}；实时获取，未使用缓存。`;
  }

  private createInspectionSourceNotice(source: InspectionSourceMetadata): string {
    const identity = this.sourceIdentity(source.title, source.group);
    return `Swagger 来源：${identity}${this.sourceLinks(source.documentEntryUrl, source.resolvedSpecUrl)}；获取时间：${this.formatFetchedAt(source.fetchedAt)}；实时获取，未使用缓存。`;
  }
}
