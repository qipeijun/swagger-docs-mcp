import type { InspectionEnvelope, LoadedApiDocument } from "../domain/types.js";
import { AppError, ErrorCode, ErrorStage } from "../errors.js";
import { parseUrlHashHints } from "../navigation/url-navigation.js";
import { ApiDocsService } from "../service/api-docs-service.js";
import { readPackageVersion } from "../version.js";

interface DoctorRuntimeReport {
  nodeSupported: true;
  dataSourcePersistenceEnabled: false;
  crossCallCacheEnabled: false;
}

type DoctorDocumentReport =
  | ({ mode: "inspection" } & InspectionEnvelope)
  | {
    mode: "document";
    source: LoadedApiDocument["source"];
    sourceNotice: string;
    operationCount: number;
  };

export interface DoctorReport {
  status: "ok";
  packageVersion: string;
  nodeVersion: string;
  runtime: DoctorRuntimeReport;
  document?: DoctorDocumentReport;
}

type DoctorService = Pick<ApiDocsService, "inspect" | "load">;

/** 生成可供终端或 CI 消费的诊断报告，不保存文档地址或查询结果。 */
export async function createDoctorReport(
  docsUrl?: string,
  group?: string,
  service: DoctorService = new ApiDocsService()
): Promise<DoctorReport> {
  const majorVersion = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(majorVersion) || majorVersion < 20) {
    throw new AppError(
      ErrorCode.UNSUPPORTED_NODE_VERSION,
      ErrorStage.RUNTIME_CHECK,
      `需要 Node.js 20 或更高版本，当前为 ${process.version}`
    );
  }

  const report: DoctorReport = {
    status: "ok",
    packageVersion: readPackageVersion(),
    nodeVersion: process.version,
    runtime: {
      nodeSupported: true,
      dataSourcePersistenceEnabled: false,
      crossCallCacheEnabled: false
    }
  };
  if (!docsUrl) return report;

  const hashHints = parseUrlHashHints(docsUrl);
  const hasNavigationHint = Boolean(
    hashHints.recognized && (hashHints.group || hashHints.category || hashHints.operationId)
  );
  if (hasNavigationHint) {
    if (group && hashHints.group && group !== hashHints.group) {
      throw new AppError(
        ErrorCode.INVALID_CLI_ARGUMENT,
        ErrorStage.CLI_ARGUMENT,
        `--group ${group} 与深链接分组 ${hashHints.group} 不一致`
      );
    }
    const inspection = await service.inspect(docsUrl, 1, 20);
    return {
      ...report,
      document: { mode: "inspection", ...inspection }
    };
  }

  const loaded = await service.load(docsUrl, group);
  return {
    ...report,
    document: {
      mode: "document",
      source: loaded.source,
      sourceNotice: loaded.sourceNotice,
      operationCount: loaded.document.operations.length
    }
  };
}

function verificationLabel(verified: boolean): string {
  return verified ? "已验证" : "未验证";
}

/** 将诊断报告格式化为人类可读文本或稳定 JSON。 */
export function formatDoctorReport(report: DoctorReport, json: boolean): string {
  if (json) return JSON.stringify(report, null, 2);

  const lines = [
    `swagger-docs-mcp: ${report.packageVersion}`,
    `Node.js: ${report.nodeVersion}`,
    "数据源保存：禁用",
    "跨调用缓存：禁用"
  ];
  if (!report.document) {
    lines.push("运行状态：正常。传入 docsUrl 可继续验证实时文档发现。");
    return lines.join("\n");
  }

  lines.push(report.document.sourceNotice);
  if (report.document.mode === "document") {
    lines.push(`接口数量：${report.document.operationCount}`);
    if (report.document.source.documentFingerprint) {
      lines.push(`文档指纹：${report.document.source.documentFingerprint}`);
    }
    return lines.join("\n");
  }

  const { data, warnings, completeness } = report.document;
  lines.push(`文档类型：${data.documentType}`);
  if (data.selection.group) {
    lines.push(
      `分组：${data.selection.group.value.name}（${verificationLabel(data.selection.group.verified)}）`
    );
  }
  if (data.selection.category) {
    lines.push(
      `分类：${data.selection.category.value.name}（${verificationLabel(data.selection.category.verified)}）`
    );
  }
  if (data.selection.api) {
    const { value, verified } = data.selection.api;
    const apiIdentity = value.path && value.method
      ? `${value.method} ${value.path}`
      : value.operationId;
    lines.push(`接口：${apiIdentity}（${verificationLabel(verified)}）`);
  }
  lines.push(`下一步：${data.nextAction}`);
  lines.push(`完整度：${completeness}`);
  for (const warning of warnings) lines.push(`警告：${warning}`);
  return lines.join("\n");
}
