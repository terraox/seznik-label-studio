import { Camera } from 'expo-camera';
import { PermissionsAndroid, Platform } from 'react-native';

export type AppPermissionKind = 'bluetooth' | 'location' | 'nearby' | 'camera';

export type AppPermissionStatus = Record<AppPermissionKind, boolean>;

async function androidCheck(permission: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]) {
  return PermissionsAndroid.check(permission).catch(() => false);
}

/** Best-effort runtime permission flags for the App Permissions screen. */
export async function readAppPermissionStatus(): Promise<AppPermissionStatus> {
  const camera = await Camera.getCameraPermissionsAsync().catch(() => ({ granted: false }));

  if (Platform.OS !== 'android') {
    return {
      bluetooth: true,
      nearby: true,
      location: false,
      camera: camera.granted,
    };
  }

  const api = Platform.Version as number;

  if (api < 31) {
    const location = await androidCheck(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const cameraGranted = await androidCheck(PermissionsAndroid.PERMISSIONS.CAMERA);
    return {
      bluetooth: location,
      nearby: location,
      location,
      camera: cameraGranted || camera.granted,
    };
  }

  const connect = await androidCheck(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  const scan = await androidCheck(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
  const location = await androidCheck(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  const cameraGranted = await androidCheck(PermissionsAndroid.PERMISSIONS.CAMERA);

  return {
    bluetooth: connect,
    nearby: scan,
    location,
    camera: cameraGranted || camera.granted,
  };
}
