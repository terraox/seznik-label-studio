import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';

import {
  SettingsCard,
  SettingsScreenShell,
  SettingsStatusRow,
} from '@/components/settings-ui';
import { readAppPermissionStatus, type AppPermissionKind } from '@/lib/app-permission-status';

// Android 12+ finds printers through Nearby devices, so it never asks for location there.
const SHOW_LOCATION = Platform.OS !== 'android' || (Platform.Version as number) < 31;

const ALL_ROWS: { kind: AppPermissionKind; label: string }[] = [
  { kind: 'bluetooth', label: 'Bluetooth' },
  { kind: 'location', label: 'Location' },
  { kind: 'nearby', label: 'Nearby Device' },
  { kind: 'camera', label: 'Camera' },
];
const PERMISSION_ROWS = ALL_ROWS.filter((row) => SHOW_LOCATION || row.kind !== 'location');

export default function AppPermissionsScreen() {
  const [status, setStatus] = useState<Record<AppPermissionKind, boolean>>({
    bluetooth: false,
    location: false,
    nearby: false,
    camera: false,
  });

  const refreshStatuses = useCallback(() => {
    void readAppPermissionStatus().then(setStatus);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStatuses();
    }, [refreshStatuses]),
  );

  const openAppSettings = () => {
    void Linking.openSettings();
  };

  return (
    <SettingsScreenShell title="App Permissions">
      {PERMISSION_ROWS.map(({ kind, label }) => (
        <SettingsCard key={kind}>
          <SettingsStatusRow
            label={label}
            enabled={status[kind]}
            onPress={openAppSettings}
          />
        </SettingsCard>
      ))}
    </SettingsScreenShell>
  );
}
