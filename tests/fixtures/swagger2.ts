export const swagger2Fixture = {
  swagger: "2.0",
  info: {
    title: "测试教学平台",
    version: "1.0.0"
  },
  consumes: ["application/json"],
  produces: ["application/json"],
  paths: {
    "/api/v1/study-exam-stat/baseline-class-stat": {
      get: {
        tags: ["uniform-study-exam-stat-controller"],
        summary: "查询基线班级统计摘要",
        operationId: "getBaselineSummary",
        responses: {
          200: { description: "成功", schema: { $ref: "#/definitions/BaselineResponse" } }
        }
      },
      post: {
        tags: ["uniform-study-exam-stat-controller"],
        summary: "查询基线班级统计",
        description: "按考试查询学生基线统计",
        operationId: "getBaselineClassStat",
        parameters: [
          {
            name: "request",
            in: "body",
            required: true,
            description: "查询条件",
            schema: { $ref: "#/definitions/BaselineRequest" }
          }
        ],
        responses: {
          200: { description: "成功", schema: { $ref: "#/definitions/BaselineResponse" } },
          default: { description: "失败" }
        }
      }
    },
    "/api/v1/maps": {
      get: {
        tags: ["misc-controller"],
        summary: "动态字段",
        responses: {
          200: { description: "成功", schema: { $ref: "#/definitions/DynamicResponse" } }
        }
      }
    },
    "/api/v1/cycles": {
      get: {
        tags: ["misc-controller"],
        summary: "递归节点",
        responses: {
          200: { description: "成功", schema: { $ref: "#/definitions/TreeNode" } }
        }
      }
    },
    "/api/v1/inherited": {
      get: {
        tags: ["misc-controller"],
        summary: "组合模型",
        responses: {
          200: { description: "成功", schema: { $ref: "#/definitions/ExtendedModel" } }
        }
      }
    },
    "/api/v1/external": {
      get: {
        tags: ["misc-controller"],
        summary: "外部引用",
        responses: {
          200: { description: "成功", schema: { $ref: "https://example.com/model.json#/External" } }
        }
      }
    }
  },
  definitions: {
    BaselineRequest: {
      type: "object",
      required: ["examId"],
      properties: {
        examId: { type: "integer", format: "int64", description: "考试 ID" }
      }
    },
    BaselineResponse: {
      type: "object",
      properties: {
        code: { type: "integer", format: "int32", description: "状态码" },
        data: {
          type: "array",
          description: "班级统计列表",
          items: { $ref: "#/definitions/ClassStat" }
        }
      }
    },
    ClassStat: {
      type: "object",
      properties: {
        baselineDetailList: {
          type: "array",
          description: "基线详情",
          items: { $ref: "#/definitions/BaselineDetail" }
        }
      }
    },
    BaselineDetail: {
      type: "object",
      properties: {
        students: {
          type: "array",
          description: "学生列表",
          items: { $ref: "#/definitions/Student" }
        }
      }
    },
    Student: {
      type: "object",
      required: ["studentId"],
      properties: {
        studentId: { type: "integer", format: "int64", description: "学生 ID" },
        name: { type: "string" }
      }
    },
    DynamicResponse: {
      type: "object",
      properties: {
        data: {
          type: "object",
          description: "动态指标",
          additionalProperties: { type: "number", format: "double", description: "指标值" }
        }
      }
    },
    TreeNode: {
      type: "object",
      properties: {
        id: { type: "string", description: "节点 ID" },
        children: {
          type: "array",
          items: { $ref: "#/definitions/TreeNode" }
        }
      }
    },
    BaseModel: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "主键" }
      }
    },
    ExtendedModel: {
      allOf: [
        { $ref: "#/definitions/BaseModel" },
        {
          type: "object",
          properties: {
            label: { type: "string", description: "名称" }
          }
        }
      ]
    }
  }
} as const;

export const openApi3Fixture = {
  openapi: "3.0.3",
  info: { title: "OpenAPI 3", version: "1.0.0" },
  paths: {}
} as const;
