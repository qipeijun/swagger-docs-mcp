import type { ApiDocument } from "../domain/types.js";

export interface ApiSpecParser {
  readonly specVersion: string;
  canParse(rawDocument: unknown): boolean;
  parse(rawDocument: unknown): ApiDocument;
}
