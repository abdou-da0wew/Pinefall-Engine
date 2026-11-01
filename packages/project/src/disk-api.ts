export interface RepackSettings {
  mode: "manual" | "interval" | "per-action";
  intervalSeconds: number;
  shortcut: string;
}
export interface FolderRecent {
  id: string;
  root: string;
  opened: number;
  settings: RepackSettings;
  archive?: string;
}
export interface RepackStatus {
  settings: RepackSettings;
  archive?: string;
  busy: boolean;
  dirty: boolean;
  lastSuccess?: number;
  error?: string;
}
export type ExternalEditorKind = "system" | "vscode" | "vscodium" | "visual-studio" | "text-editor";
export interface ExternalEditorPreference {
  kind: ExternalEditorKind;
  executable?: string;
}
export interface DiskFileEntry {
  path: string;
  bytes: number;
  modified: number;
}
export interface DiskProjectGrant {
  id: string;
  root: string;
  entries: DiskFileEntry[];
}
export interface DiskProjectChange {
  id: string;
  paths: string[];
  rescan: boolean;
}
/** Only the native folder picker grants a session. Paths are relative to that grant. */
export interface DiskProjectAPI {
  registerSource(
    id: string,
    path: string,
    name: string,
  ): Promise<{ kind: "script" | "shader" | "material"; path: string; id: string }>;
  recents(): Promise<FolderRecent[]>;
  reopen(id: string): Promise<DiskProjectGrant>;
  openFolderArchive(): Promise<DiskProjectGrant | null>;
  repackStatus(id: string): Promise<RepackStatus>;
  configureRepack(id: string, settings: RepackSettings): Promise<RepackStatus>;
  repack(id: string, saveAs?: boolean): Promise<RepackStatus>;
  cancelArchive(): Promise<void>;
  installIdeKit(id: string): Promise<string>;
  choose(): Promise<DiskProjectGrant | null>;
  inventory(id: string): Promise<DiskFileEntry[]>;
  read(
    id: string,
    path: string,
    offset: number,
    length: number,
  ): Promise<{ bytes: Uint8Array; total: number; modified: number }>;
  hash(id: string, path: string): Promise<string | null>;
  write(id: string, path: string, bytes: Uint8Array, expected: string | null): Promise<string>;
  beginUpload(id: string, path: string, total: number, expected: string | null): Promise<string>;
  appendUpload(id: string, ticket: string, offset: number, bytes: Uint8Array): Promise<number>;
  finishUpload(id: string, ticket: string, hash?: string): Promise<string>;
  cancelUpload(id: string, ticket: string): Promise<void>;
  close(id: string): Promise<void>;
  editor(): Promise<ExternalEditorPreference>;
  configureEditor(kind: ExternalEditorKind): Promise<ExternalEditorPreference>;
  openExternal(id: string, path: string, line?: number, column?: number): Promise<void>;
  reveal(id: string): Promise<void>;
  onChanged(callback: (event: DiskProjectChange) => void): () => void;
}
