const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Play Store permission hygiene, applied to the app manifest (library manifests merge underneath).
 *
 * Always:
 * - READ/WRITE_EXTERNAL_STORAGE and ACCESS_COARSE_LOCATION are removed. Files come from the system
 *   picker / "Open with" as content:// URIs, which need no storage permission, and fine location is
 *   enough for the Android 11-and-older Bluetooth scan.
 * - ACCESS_FINE_LOCATION and the legacy BLUETOOTH / BLUETOOTH_ADMIN are limited to Android 11 (API 30).
 * - BLUETOOTH_SCAN is marked neverForLocation, so Android 12+ needs no location permission to find printers.
 *
 * Only for release variants (APP_VARIANT=production|preview, set in eas.json):
 * - SYSTEM_ALERT_WINDOW (pulled in by expo-dev-client) is removed.
 * - Cleartext HTTP is turned off. Debug and local builds keep it so a LAN dev API over http works.
 *
 * This reads the environment only while writing the manifest, never the Expo config, so the OTA
 * fingerprint (runtime version) is the same for every variant.
 */
const REMOVE_ALWAYS = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.ACCESS_COARSE_LOCATION',
];
const REMOVE_RELEASE = ['android.permission.SYSTEM_ALERT_WINDOW'];
const MAX_SDK_30 = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
];

function withPlayPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const release = ['production', 'preview'].includes(process.env.APP_VARIANT ?? '');
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    const removed = new Set([...REMOVE_ALWAYS, ...(release ? REMOVE_RELEASE : [])]);
    const byName = new Map();
    // Drop every existing declaration of the permissions we manage, then write them back once.
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter((p) => {
      const name = p.$?.['android:name'];
      if (removed.has(name) || MAX_SDK_30.includes(name) || name === 'android.permission.BLUETOOTH_SCAN') {
        byName.set(name, p);
        return false;
      }
      return true;
    });
    manifest['uses-permission-sdk-23'] = (manifest['uses-permission-sdk-23'] ?? []).filter(
      (p) => !removed.has(p.$?.['android:name']) && !MAX_SDK_30.includes(p.$?.['android:name']),
    );

    const add = (name, attrs) =>
      manifest['uses-permission'].push({ $: { 'android:name': name, ...attrs } });

    for (const name of removed) add(name, { 'tools:node': 'remove' });
    // react-native-ble-plx adds uncapped location as uses-permission-sdk-23; the capped entry above replaces it.
    for (const name of ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']) {
      manifest['uses-permission-sdk-23'].push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    for (const name of MAX_SDK_30) {
      // Only keep the ones the app declared (app.json), and cap them at Android 11.
      if (byName.has(name)) add(name, { 'android:maxSdkVersion': '30' });
    }
    if (byName.has('android.permission.BLUETOOTH_SCAN')) {
      add('android.permission.BLUETOOTH_SCAN', {
        'android:usesPermissionFlags': 'neverForLocation',
        'tools:targetApi': 's',
      });
    }

    // Camera, microphone, location and portrait are implied by permissions and activities, so Play
    // would hide the app from phones without them. None of them is needed to design or print.
    const features = manifest['uses-feature'] ?? [];
    for (const name of [
      'android.hardware.camera',
      'android.hardware.camera.autofocus',
      'android.hardware.microphone',
      'android.hardware.location',
      'android.hardware.location.gps',
      'android.hardware.screen.portrait',
    ]) {
      const existing = features.find((f) => f.$?.['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
        existing.$['tools:replace'] = 'android:required';
      } else {
        features.push({ $: { 'android:name': name, 'android:required': 'false', 'tools:replace': 'android:required' } });
      }
    }
    manifest['uses-feature'] = features;

    const app = manifest.application?.[0];
    if (app) {
      app.$['android:usesCleartextTraffic'] = release ? 'false' : 'true';
    }
    return cfg;
  });
}

module.exports = withPlayPermissions;
