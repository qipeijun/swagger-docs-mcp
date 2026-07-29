import { readFileSync } from "node:fs";

interface PackageMetadata {
  version?: unknown;
}

export function readPackageVersion(): string {
  try {
    const packageUrl = new URL("../package.json", import.meta.url);
    const metadata = JSON.parse(readFileSync(packageUrl, "utf8")) as PackageMetadata;
    return typeof metadata.version === "string" ? metadata.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
