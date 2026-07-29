import { z } from "zod";
import {
  ApiDocumentType,
  Completeness,
  HTTP_METHODS,
  NavigationNextAction
} from "../domain/types.js";

const completenessSchema = z.enum(Completeness);
const httpMethodSchema = z.enum(HTTP_METHODS);
const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0)
});
const apiCategorySchema = z.object({
  name: z.string(),
  operationCount: z.number().int().min(0)
});
const apiOperationSummarySchema = z.object({
  path: z.string(),
  method: httpMethodSchema,
  summary: z.string(),
  description: z.string(),
  operationId: z.string().optional(),
  categories: z.array(z.string())
});
const flatSchemaFieldSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.string(),
  itemType: z.string().optional(),
  format: z.string().optional(),
  description: z.string(),
  required: z.boolean(),
  schemaName: z.string().optional(),
  enumValues: z.array(z.unknown()).optional(),
  defaultValue: z.unknown().optional(),
  dynamicKey: z.boolean().optional(),
  recursionBoundary: z.boolean().optional()
});
const unresolvedDynamicFieldSchema = z.object({
  path: z.string(),
  reason: z.string(),
  valueType: z.string()
});
const schemaNodeSchema: z.ZodType = z.lazy(() => z.object({
  path: z.string(),
  name: z.string(),
  type: z.string(),
  itemType: z.string().optional(),
  format: z.string().optional(),
  description: z.string(),
  required: z.boolean(),
  schemaName: z.string().optional(),
  ref: z.string().optional(),
  enumValues: z.array(z.unknown()).optional(),
  defaultValue: z.unknown().optional(),
  dynamicKey: z.boolean().optional(),
  recursionBoundary: z.boolean().optional(),
  boundaryReason: z.string().optional(),
  children: z.array(schemaNodeSchema)
}));
const schemaAnalysisSchema = z.object({
  schemaTree: schemaNodeSchema.nullable(),
  flatFields: z.array(flatSchemaFieldSchema),
  schemaReferences: z.array(z.string()),
  unresolvedDynamicFields: z.array(unresolvedDynamicFieldSchema),
  warnings: z.array(z.string()),
  completeness: completenessSchema
});
const apiParameterSchema = z.object({
  name: z.string(),
  location: z.enum(["path", "query", "header", "formData", "body"]),
  required: z.boolean(),
  type: z.string(),
  format: z.string().optional(),
  description: z.string(),
  defaultValue: z.unknown().optional(),
  enumValues: z.array(z.unknown()).optional(),
  collectionFormat: z.string().optional(),
  schema: schemaAnalysisSchema.optional()
});
const apiResponseSchema = z.object({
  statusCode: z.string(),
  description: z.string(),
  schemaName: z.string().optional(),
  schemaTree: schemaNodeSchema.nullable(),
  flatFields: z.array(flatSchemaFieldSchema),
  schemaReferences: z.array(z.string()),
  unresolvedDynamicFields: z.array(unresolvedDynamicFieldSchema),
  warnings: z.array(z.string()),
  completeness: completenessSchema
});
const apiOperationSchema = apiOperationSummarySchema.extend({
  consumes: z.array(z.string()),
  produces: z.array(z.string()),
  parameters: z.array(apiParameterSchema),
  responses: z.array(apiResponseSchema),
  warnings: z.array(z.string()),
  completeness: completenessSchema
});

function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({ items: z.array(itemSchema), pagination: paginationSchema });
}

export const inspectDataOutputSchema = z.object({
  documentType: z.enum(ApiDocumentType),
  hashHints: z.object({
    group: z.string().optional(),
    category: z.string().optional(),
    operationId: z.string().optional(),
    recognized: z.boolean()
  }),
  groups: z.array(z.object({ name: z.string() })),
  selection: z.object({
    group: z.object({ value: z.object({ name: z.string() }), verified: z.boolean() }).optional(),
    category: z.object({ value: z.object({ name: z.string() }), verified: z.boolean() }).optional(),
    api: z.object({
      value: z.object({
        operationId: z.string(),
        path: z.string().optional(),
        method: httpMethodSchema.optional()
      }),
      verified: z.boolean()
    }).optional()
  }),
  nextAction: z.enum(NavigationNextAction),
  candidates: z.object({
    groups: z.array(z.object({ name: z.string() })).optional(),
    categories: paginatedSchema(apiCategorySchema).optional(),
    apis: paginatedSchema(apiOperationSummarySchema).optional()
  })
});

export const categoriesDataOutputSchema = paginatedSchema(apiCategorySchema);
export const categoryDataOutputSchema = paginatedSchema(z.union([
  apiOperationSchema,
  apiOperationSummarySchema
]));
export const pathDataOutputSchema = z.object({
  operation: apiOperationSchema,
  response: apiResponseSchema.nullable()
});
export const searchDataOutputSchema = paginatedSchema(apiOperationSummarySchema.extend({
  matchedFields: z.array(z.string())
}));

const sourceOutputSchema = z.object({
  requestedUrl: z.string(),
  documentEntryUrl: z.string().optional(),
  resolvedSpecUrl: z.string().optional(),
  fetchedAt: z.iso.datetime().optional(),
  failedAt: z.iso.datetime().optional(),
  fetchMode: z.literal("live"),
  cacheUsed: z.literal(false),
  title: z.string().optional(),
  documentVersion: z.string().optional(),
  specVersion: z.string().optional(),
  group: z.string().optional(),
  documentFingerprint: z.string().optional()
});
const errorOutputSchema = z.object({
  code: z.string(),
  stage: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});
const emptyErrorDataSchema = z.object({}).strict();

/** 为具体 Tool data 契约添加统一来源、告警、完整性和错误包络。 */
export function createToolOutputSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    source: sourceOutputSchema,
    sourceNotice: z.string(),
    data: z.union([dataSchema, emptyErrorDataSchema]),
    error: errorOutputSchema.optional(),
    nextAction: z.string().optional(),
    warnings: z.array(z.string()),
    completeness: completenessSchema
  });
}
