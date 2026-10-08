const { withAndroidManifest } = require('@expo/config-plugins');

const PACKAGE_QUERIES = [
  'com.mi.android.globalFileexplorer',
  'com.android.fileexplorer',
  'com.google.android.apps.nbu.files',
  'com.sec.android.app.myfiles',
  'com.android.documentsui',
  'com.google.android.documentsui',
];

/**
 * Android 11+ package visibility for local file-manager diagnostics and picking.
 */
function withLocalFilePickerQueries(config) {
  return withAndroidManifest(config, (configProps) => {
    const manifest = configProps.modResults.manifest;
    const queries = manifest.queries?.[0] ?? { $: {}, package: [], intent: [] };
    if (!manifest.queries) {
      manifest.queries = [queries];
    }

    const existingPackages = new Set(
      (queries.package ?? []).map((entry) => entry.$?.['android:name']).filter(Boolean),
    );

    for (const packageName of PACKAGE_QUERIES) {
      if (existingPackages.has(packageName)) continue;
      queries.package = queries.package ?? [];
      queries.package.push({ $: { 'android:name': packageName } });
      existingPackages.add(packageName);
    }

    const intentQueries = [
      {
        action: [{ $: { 'android:name': 'android.intent.action.OPEN_DOCUMENT' } }],
        category: [{ $: { 'android:name': 'android.intent.category.OPENABLE' } }],
        data: [{ $: { 'android:mimeType': '*/*' } }],
      },
      {
        action: [{ $: { 'android:name': 'android.intent.action.GET_CONTENT' } }],
        category: [{ $: { 'android:name': 'android.intent.category.OPENABLE' } }],
        data: [{ $: { 'android:mimeType': '*/*' } }],
      },
      {
        action: [{ $: { 'android:name': 'android.intent.action.OPEN_DOCUMENT_TREE' } }],
      },
    ];

    queries.intent = queries.intent ?? [];
    for (const intent of intentQueries) {
      const actionName = intent.action?.[0]?.$?.['android:name'];
      const already = queries.intent.some((entry) =>
        entry.action?.some((action) => action.$?.['android:name'] === actionName),
      );
      if (!already) {
        queries.intent.push(intent);
      }
    }

    manifest.queries[0] = queries;
    return configProps;
  });
}

module.exports = withLocalFilePickerQueries;
