/** Preference order for Android local file-manager packages. Keep in sync with LocalFilePickerModule.kt. */
export const PREFERRED_LOCAL_FILE_PACKAGES = [
  'com.mi.android.globalFileexplorer',
  'com.android.fileexplorer',
  'com.sec.android.app.myfiles',
  'com.google.android.apps.nbu.files',
] as const;

export function choosePreferredLocalPackage(
  installedPackages: readonly string[],
  handlersByPackage: Readonly<Record<string, boolean>>,
): string | null {
  for (const packageName of PREFERRED_LOCAL_FILE_PACKAGES) {
    if (!installedPackages.includes(packageName)) continue;
    if (!handlersByPackage[packageName]) continue;
    return packageName;
  }
  return null;
}
