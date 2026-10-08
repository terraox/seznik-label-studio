export type IntentHandlerInfo = {
  packageName: string;
  label: string;
  activityName: string;
};

export type IntentDiagnostics = {
  name: string;
  handlers: IntentHandlerInfo[];
  defaultPackage?: string;
  defaultLabel?: string;
  defaultActivity?: string;
};

export type KnownPackageDiagnostics = {
  packageName: string;
  installed: boolean;
  label?: string | null;
};

export type PreferredPackageDiagnostics = {
  packageName: string;
  installed: boolean;
  handlesGetContent: boolean;
};

export type FilePickerDiagnostics = {
  manufacturer: string;
  model: string;
  sdkInt: number;
  expoDocumentPickerPatched: boolean;
  intents: IntentDiagnostics[];
  knownPackages: KnownPackageDiagnostics[];
  preferredPackages: PreferredPackageDiagnostics[];
};

export type PickedLocalDocument = {
  uri: string;
  name: string;
  size: number;
  mimeType?: string | null;
  pickPath?: string | null;
};

export type PickLocalDocumentOptions = {
  mimeTypes: string[];
  multiple?: boolean;
  maxBytes?: number;
};
