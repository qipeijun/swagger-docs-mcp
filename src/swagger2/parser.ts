import {
  Completeness,
  HTTP_METHODS,
  type ApiDocument,
  type ApiOperationDocumentation,
  type ApiOperationSummary,
  type ApiParameter,
  type ApiResponseDocumentation,
  type FlatSchemaField,
  type HttpMethod,
  type SchemaAnalysis,
  type SchemaNode,
  type UnresolvedDynamicField
} from "../domain/types.js";
import { AppError, ErrorCode, ErrorStage } from "../errors.js";
import type { ApiSpecParser } from "../parser/types.js";

type JsonObject = Record<string, unknown>;

interface StoredOperation {
  path: string;
  method: HttpMethod;
  pathItem: JsonObject;
  operation: JsonObject;
  summary: ApiOperationSummary;
}

interface AnalysisContext {
  stack: string[];
  references: Set<string>;
  warnings: string[];
}

const MAX_SCHEMA_DEPTH = 32;
const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS);

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asUnknownArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function missingDescription(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "未提供说明";
}

function schemaNameFromRef(ref: string): string | undefined {
  const prefix = "#/definitions/";
  if (!ref.startsWith(prefix)) {
    return undefined;
  }
  return ref
    .slice(prefix.length)
    .replaceAll("~1", "/")
    .replaceAll("~0", "~");
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}.${name}` : name;
}

function arrayPath(path: string): string {
  return `${path}[]`;
}

function compareStatusCode(left: string, right: string): number {
  if (left === "default") return 1;
  if (right === "default") return -1;
  return left.localeCompare(right, undefined, { numeric: true });
}

class Swagger2SchemaAnalyzer {
  constructor(private readonly definitions: JsonObject) {}

  /**
   * 将任意 Swagger 2.0 schema 解析为字段树和可检索路径。解析边界会进入 warnings，
   * 不会用推测字段替代动态 Map、外部引用或循环引用。
   */
  analyze(schemaValue: unknown, rootName = "response"): SchemaAnalysis {
    const schema = asObject(schemaValue);
    if (!schema) {
      return {
        schemaTree: null,
        flatFields: [],
        schemaReferences: [],
        unresolvedDynamicFields: [],
        warnings: [],
        completeness: Completeness.COMPLETE
      };
    }

    const context: AnalysisContext = {
      stack: [],
      references: new Set<string>(),
      warnings: []
    };
    const schemaTree = this.buildNode(schema, rootName, "", true, context, 0);
    const flatFields: FlatSchemaField[] = [];
    const unresolvedDynamicFields: UnresolvedDynamicField[] = [];
    this.flatten(schemaTree, flatFields, unresolvedDynamicFields);

    const partial = context.warnings.length > 0
      || unresolvedDynamicFields.length > 0
      || flatFields.some((field) => field.recursionBoundary);

    return {
      schemaTree,
      flatFields,
      schemaReferences: [...context.references].sort(),
      unresolvedDynamicFields,
      warnings: [...new Set(context.warnings)],
      completeness: partial ? Completeness.PARTIAL : Completeness.COMPLETE
    };
  }

  private buildNode(
    schema: JsonObject,
    name: string,
    path: string,
    required: boolean,
    context: AnalysisContext,
    depth: number
  ): SchemaNode {
    if (depth > MAX_SCHEMA_DEPTH) {
      context.warnings.push(`字段 ${path || name} 达到最大展开深度 ${MAX_SCHEMA_DEPTH}`);
      return {
        path,
        name,
        type: "unknown",
        description: missingDescription(schema.description),
        required,
        recursionBoundary: true,
        boundaryReason: "max_depth",
        children: []
      };
    }

    const ref = asString(schema.$ref);
    if (ref) {
      return this.buildRefNode(ref, schema, name, path, required, context, depth);
    }

    const allOf = asUnknownArray(schema.allOf);
    if (allOf?.length) {
      const merged = this.mergeAllOf(schema, allOf, context, new Set<string>());
      return this.buildNode(merged, name, path, required, context, depth + 1);
    }

    const type = this.inferType(schema);
    const base = this.createBaseNode(schema, name, path, required, type);

    if (type === "array") {
      const items = asObject(schema.items);
      const itemPath = arrayPath(path);
      if (!items) {
        context.warnings.push(`数组字段 ${itemPath || name} 未声明 items`);
        return {
          ...base,
          path: itemPath,
          itemType: "unknown",
          children: []
        };
      }

      const itemNode = this.buildNode(items, `${name}[]`, itemPath, required, context, depth + 1);
      return {
        ...base,
        path: itemPath,
        itemType: itemNode.type,
        ...(itemNode.schemaName ? { schemaName: itemNode.schemaName } : {}),
        ...(itemNode.ref ? { ref: itemNode.ref } : {}),
        ...(itemNode.recursionBoundary ? {
          recursionBoundary: true,
          boundaryReason: itemNode.boundaryReason
        } : {}),
        // 数组本身已经使用 [] 路径表示元素类型，原始类型元素不再重复生成同路径子节点。
        children: itemNode.type === "object" || itemNode.type === "array"
          ? itemNode.children
          : []
      };
    }

    if (type === "object") {
      const properties = asObject(schema.properties) ?? {};
      const requiredNames = new Set(asStringArray(schema.required));
      const children = Object.entries(properties)
        .map(([propertyName, propertySchema]) => {
          const typedSchema = asObject(propertySchema) ?? {};
          return this.buildNode(
            typedSchema,
            propertyName,
            joinPath(path, propertyName),
            requiredNames.has(propertyName),
            context,
            depth + 1
          );
        });

      const additionalProperties = schema.additionalProperties;
      if (additionalProperties === true || asObject(additionalProperties)) {
        const dynamicPath = `${path || name}{*}`;
        const valueSchema = asObject(additionalProperties) ?? {};
        const dynamicNode = this.buildNode(valueSchema, "{*}", dynamicPath, false, context, depth + 1);
        children.push({
          ...dynamicNode,
          path: dynamicPath,
          name: "{*}",
          dynamicKey: true,
          description: missingDescription(valueSchema.description ?? schema.description)
        });
      }

      return { ...base, children };
    }

    return { ...base, children: [] };
  }

  private buildRefNode(
    ref: string,
    localSchema: JsonObject,
    name: string,
    path: string,
    required: boolean,
    context: AnalysisContext,
    depth: number
  ): SchemaNode {
    const schemaName = schemaNameFromRef(ref);
    if (!schemaName) {
      context.warnings.push(`字段 ${path || name} 使用了不支持的外部引用：${ref}`);
      return {
        path,
        name,
        type: "reference",
        description: missingDescription(localSchema.description),
        required,
        ref,
        recursionBoundary: true,
        boundaryReason: "external_ref",
        children: []
      };
    }

    context.references.add(schemaName);
    if (context.stack.includes(schemaName)) {
      context.warnings.push(`字段 ${path || name} 检测到循环引用：${schemaName}`);
      return {
        path,
        name,
        type: "reference",
        description: missingDescription(localSchema.description),
        required,
        schemaName,
        ref,
        recursionBoundary: true,
        boundaryReason: "circular_ref",
        children: []
      };
    }

    const target = asObject(this.definitions[schemaName]);
    if (!target) {
      context.warnings.push(`字段 ${path || name} 引用的 schema 不存在：${schemaName}`);
      return {
        path,
        name,
        type: "reference",
        description: missingDescription(localSchema.description),
        required,
        schemaName,
        ref,
        recursionBoundary: true,
        boundaryReason: "missing_ref",
        children: []
      };
    }

    context.stack.push(schemaName);
    try {
      const resolved = this.buildNode(
        { ...target, ...(localSchema.description ? { description: localSchema.description } : {}) },
        name,
        path,
        required,
        context,
        depth + 1
      );
      return { ...resolved, schemaName, ref };
    } finally {
      context.stack.pop();
    }
  }

  private mergeAllOf(
    schema: JsonObject,
    allOf: unknown[],
    context: AnalysisContext,
    visiting: Set<string>
  ): JsonObject {
    const { allOf: _consumedAllOf, ...schemaWithoutAllOf } = schema;
    const mergedProperties: JsonObject = { ...(asObject(schema.properties) ?? {}) };
    const mergedRequired = new Set(asStringArray(schema.required));
    let additionalProperties = schema.additionalProperties;

    for (const partValue of allOf) {
      let part = asObject(partValue);
      if (!part) continue;

      const ref = asString(part.$ref);
      if (ref) {
        const schemaName = schemaNameFromRef(ref);
        if (!schemaName) {
          context.warnings.push(`allOf 使用了不支持的外部引用：${ref}`);
          continue;
        }
        context.references.add(schemaName);
        if (visiting.has(schemaName)) {
          context.warnings.push(`allOf 检测到循环引用：${schemaName}`);
          continue;
        }
        const target = asObject(this.definitions[schemaName]);
        if (!target) {
          context.warnings.push(`allOf 引用的 schema 不存在：${schemaName}`);
          continue;
        }
        const nextVisiting = new Set(visiting);
        nextVisiting.add(schemaName);
        const nestedAllOf = asUnknownArray(target.allOf);
        part = nestedAllOf ? this.mergeAllOf(target, nestedAllOf, context, nextVisiting) : target;
      }

      const directNestedAllOf = asUnknownArray(part.allOf);
      if (directNestedAllOf) {
        part = this.mergeAllOf(part, directNestedAllOf, context, new Set(visiting));
      }

      for (const requiredName of asStringArray(part.required)) {
        mergedRequired.add(requiredName);
      }
      for (const [propertyName, propertySchema] of Object.entries(asObject(part.properties) ?? {})) {
        if (propertyName in mergedProperties && JSON.stringify(mergedProperties[propertyName]) !== JSON.stringify(propertySchema)) {
          context.warnings.push(`allOf 属性 ${propertyName} 存在冲突，采用后声明的 schema`);
        }
        mergedProperties[propertyName] = propertySchema;
      }
      if (part.additionalProperties !== undefined) {
        additionalProperties = part.additionalProperties;
      }
    }

    return {
      ...schemaWithoutAllOf,
      type: "object",
      properties: mergedProperties,
      required: [...mergedRequired],
      ...(additionalProperties !== undefined ? { additionalProperties } : {})
    };
  }

  private inferType(schema: JsonObject): string {
    const explicitType = asString(schema.type);
    if (explicitType) return explicitType;
    if (schema.properties || schema.additionalProperties) return "object";
    if (schema.items) return "array";
    return "unknown";
  }

  private createBaseNode(
    schema: JsonObject,
    name: string,
    path: string,
    required: boolean,
    type: string
  ): SchemaNode {
    const format = asString(schema.format);
    const enumValues = asUnknownArray(schema.enum);
    return {
      path,
      name,
      type,
      ...(format ? { format } : {}),
      description: missingDescription(schema.description),
      required,
      ...(enumValues ? { enumValues } : {}),
      ...(schema.default !== undefined ? { defaultValue: schema.default } : {}),
      children: []
    };
  }

  private flatten(
    node: SchemaNode,
    flatFields: FlatSchemaField[],
    unresolvedDynamicFields: UnresolvedDynamicField[]
  ): void {
    if (node.path) {
      flatFields.push({
        path: node.path,
        name: node.name,
        type: node.type,
        ...(node.itemType ? { itemType: node.itemType } : {}),
        ...(node.format ? { format: node.format } : {}),
        description: node.description,
        required: node.required,
        ...(node.schemaName ? { schemaName: node.schemaName } : {}),
        ...(node.enumValues ? { enumValues: node.enumValues } : {}),
        ...(node.defaultValue !== undefined ? { defaultValue: node.defaultValue } : {}),
        ...(node.dynamicKey ? { dynamicKey: true } : {}),
        ...(node.recursionBoundary ? { recursionBoundary: true } : {})
      });
    }

    if (node.dynamicKey) {
      unresolvedDynamicFields.push({
        path: node.path,
        reason: "Swagger 仅声明动态键，无法确定具体字段名",
        valueType: node.type
      });
    }
    for (const child of node.children) {
      this.flatten(child, flatFields, unresolvedDynamicFields);
    }
  }
}

class Swagger2Document implements ApiDocument {
  readonly title: string;
  readonly version: string;
  readonly specVersion = "2.0";
  readonly operations: ApiOperationSummary[];
  private readonly storedOperations: StoredOperation[];
  private readonly analyzer: Swagger2SchemaAnalyzer;

  constructor(private readonly root: JsonObject) {
    const info = asObject(root.info) ?? {};
    this.title = asString(info.title, "未命名 Swagger 文档");
    this.version = asString(info.version, "未提供版本");
    this.analyzer = new Swagger2SchemaAnalyzer(asObject(root.definitions) ?? {});
    this.storedOperations = this.collectOperations();
    this.operations = this.storedOperations.map((item) => item.summary);
  }

  getOperation(path: string, method: HttpMethod): ApiOperationDocumentation {
    const stored = this.storedOperations.find((item) => item.path === path && item.method === method);
    if (!stored) {
      throw new AppError(ErrorCode.METHOD_NOT_FOUND, ErrorStage.QUERY_DOCUMENT, `路径 ${path} 不存在 ${method} 方法`);
    }

    const parameters = this.collectParameters(stored.pathItem, stored.operation);
    const responsesObject = asObject(stored.operation.responses) ?? {};
    const responses = Object.entries(responsesObject)
      .sort(([left], [right]) => compareStatusCode(left, right))
      .map(([statusCode, responseValue]) => this.createResponse(statusCode, responseValue));

    return {
      ...stored.summary,
      consumes: asStringArray(stored.operation.consumes).length
        ? asStringArray(stored.operation.consumes)
        : asStringArray(this.root.consumes),
      produces: asStringArray(stored.operation.produces).length
        ? asStringArray(stored.operation.produces)
        : asStringArray(this.root.produces),
      parameters,
      responses
    };
  }

  private collectOperations(): StoredOperation[] {
    const paths = asObject(this.root.paths) ?? {};
    const operations: StoredOperation[] = [];
    for (const [path, pathValue] of Object.entries(paths)) {
      const pathItem = asObject(pathValue);
      if (!pathItem) continue;
      for (const [methodValue, operationValue] of Object.entries(pathItem)) {
        const method = methodValue.toUpperCase();
        if (!HTTP_METHOD_SET.has(method)) continue;
        const operation = asObject(operationValue);
        if (!operation) continue;
        const typedMethod = method as HttpMethod;
        const operationId = asString(operation.operationId);
        const summary: ApiOperationSummary = {
          path,
          method: typedMethod,
          summary: asString(operation.summary, "未提供摘要"),
          description: missingDescription(operation.description),
          ...(operationId ? { operationId } : {}),
          categories: asStringArray(operation.tags)
        };
        operations.push({ path, method: typedMethod, pathItem, operation, summary });
      }
    }
    return operations.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method));
  }

  private collectParameters(pathItem: JsonObject, operation: JsonObject): ApiParameter[] {
    const combined = [
      ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
      ...(Array.isArray(operation.parameters) ? operation.parameters : [])
    ];
    const deduplicated = new Map<string, JsonObject>();
    for (const value of combined) {
      const resolved = this.resolveParameter(value);
      if (!resolved) continue;
      const key = `${asString(resolved.in)}:${asString(resolved.name)}`;
      deduplicated.set(key, resolved);
    }

    return [...deduplicated.values()].map((parameter) => {
      const location = asString(parameter.in) as ApiParameter["location"];
      const schema = asObject(parameter.schema);
      const type = location === "body"
        ? this.describeSchemaType(schema)
        : asString(parameter.type, "unknown");
      const format = asString(parameter.format);
      const enumValues = asUnknownArray(parameter.enum);
      const schemaAnalysis = schema ? this.analyzer.analyze(schema, asString(parameter.name, "body")) : undefined;
      return {
        name: asString(parameter.name, "未命名参数"),
        location,
        required: parameter.required === true,
        type,
        ...(format ? { format } : {}),
        description: missingDescription(parameter.description),
        ...(parameter.default !== undefined ? { defaultValue: parameter.default } : {}),
        ...(enumValues ? { enumValues } : {}),
        ...(asString(parameter.collectionFormat) ? { collectionFormat: asString(parameter.collectionFormat) } : {}),
        ...(schemaAnalysis ? { schema: schemaAnalysis } : {})
      };
    });
  }

  private resolveParameter(value: unknown): JsonObject | undefined {
    const parameter = asObject(value);
    if (!parameter) return undefined;
    const ref = asString(parameter.$ref);
    if (!ref) return parameter;
    const prefix = "#/parameters/";
    if (!ref.startsWith(prefix)) return parameter;
    const name = ref.slice(prefix.length).replaceAll("~1", "/").replaceAll("~0", "~");
    return asObject(asObject(this.root.parameters)?.[name]) ?? parameter;
  }

  private createResponse(statusCode: string, responseValue: unknown): ApiResponseDocumentation {
    const response = this.resolveResponse(responseValue);
    const schema = asObject(response.schema);
    const analysis = this.analyzer.analyze(schema, "response");
    const schemaName = schema ? this.describeSchemaName(schema) : undefined;
    return {
      statusCode,
      description: missingDescription(response.description),
      ...(schemaName ? { schemaName } : {}),
      ...analysis
    };
  }

  private resolveResponse(value: unknown): JsonObject {
    const response = asObject(value) ?? {};
    const ref = asString(response.$ref);
    const prefix = "#/responses/";
    if (!ref?.startsWith(prefix)) return response;
    const name = ref.slice(prefix.length).replaceAll("~1", "/").replaceAll("~0", "~");
    return asObject(asObject(this.root.responses)?.[name]) ?? response;
  }

  private describeSchemaName(schema: JsonObject): string | undefined {
    const ref = asString(schema.$ref);
    if (ref) return schemaNameFromRef(ref) ?? ref;
    const items = asObject(schema.items);
    const itemRef = items ? asString(items.$ref) : "";
    return itemRef ? schemaNameFromRef(itemRef) ?? itemRef : undefined;
  }

  private describeSchemaType(schema: JsonObject | undefined): string {
    if (!schema) return "unknown";
    const ref = asString(schema.$ref);
    if (ref) return schemaNameFromRef(ref) ?? "reference";
    return asString(schema.type, schema.properties ? "object" : "unknown");
  }
}

export class Swagger2Parser implements ApiSpecParser {
  readonly specVersion = "2.0";

  canParse(rawDocument: unknown): boolean {
    return asString(asObject(rawDocument)?.swagger) === "2.0";
  }

  parse(rawDocument: unknown): ApiDocument {
    const root = asObject(rawDocument);
    if (!root || asString(root.swagger) !== "2.0") {
      const openApiVersion = asString(root?.openapi);
      throw new AppError(
        ErrorCode.UNSUPPORTED_SPEC_VERSION,
        ErrorStage.PARSE_SPEC,
        openApiVersion
          ? `v1 暂不支持 OpenAPI ${openApiVersion}`
          : "文档不是有效的 Swagger 2.0 规范"
      );
    }
    if (!asObject(root.paths)) {
      throw new AppError(ErrorCode.INVALID_DOCUMENT, ErrorStage.PARSE_SPEC, "Swagger 文档缺少 paths 对象");
    }
    return new Swagger2Document(root);
  }
}
