import type { ApiDocumentType } from "../domain/types.js";

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  body: Uint8Array;
  fetchedAt: string;
}

export interface DiscoveredDocument {
  requestedUrl: string;
  documentEntryUrl: string;
  resolvedSpecUrl: string;
  fetchedAt: string;
  group?: string;
  rawText: string;
  rawDocument: unknown;
  fingerprint: string;
}

export interface DocumentGroupCandidate {
  name: string;
  specUrl: string;
}

export interface DocumentResolution {
  requestedUrl: string;
  documentEntryUrl: string;
  fetchedAt: string;
  documentType: ApiDocumentType;
  groups: DocumentGroupCandidate[];
  selectedGroup?: string;
  document?: DiscoveredDocument;
}

export interface DocumentDiscoveryAdapter {
  readonly name: string;
  canHandle(entry: FetchResult): boolean;
  resolve(entry: FetchResult, group?: string): Promise<DocumentResolution>;
}
