import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform, Text, View } from 'react-native';

import {
  SettingsActionCard,
  SettingsCacheRow,
  SettingsCard,
  SettingsScreenShell,
} from '@/components/settings-ui';
import { clearAllAppCache } from '@/lib/cache/clear-cache';
import {
  cacheCategoriesForDisplay,
  formatCacheBytes,
  measureCacheCategorySizes,
  type CacheCategorySizes,
} from '@/lib/cache/storage-sizes';
import { ANDROID_PUBLIC_SEZPRINT_ROOT, sezprintSubdirUri } from '@/lib/user-files/paths';
import { useLabelStore } from '@/stores/label-store';
import { C, useThemeRefresh } from '@/theme';

function jsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

const EMPTY_SIZES: CacheCategorySizes = {
  local: 0,
  industryTemplate: 0,
  cloud: 0,
  font: 0,
  logo: 0,
  dataFile: 0,
  printingHistory: 0,
};

export default function CacheSettingsScreen() {
  useThemeRefresh();
  const cloudTemplates = useLabelStore((s) => s.cloudTemplates);
  const [sizes, setSizes] = useState<CacheCategorySizes>(EMPTY_SIZES);
  const [refreshing, setRefreshing] = useState(false);
  const [publicExists, setPublicExists] = useState<boolean | null>(null);
  const privatePath = FileSystem.documentDirectory
    ? sezprintSubdirUri(FileSystem.documentDirectory, 'labels').replace(/^file:\/\//, '')
    : 'Unavailable';
  const publicPath = `${ANDROID_PUBLIC_SEZPRINT_ROOT}labels/`.replace(/^file:\/\//, '');

  const refreshSizes = useCallback(() => {
    setRefreshing(true);
    void measureCacheCategorySizes()
      .then((measured) => {
        setSizes({
          ...measured,
          cloud: measured.cloud + jsonBytes(cloudTemplates),
        });
      })
      .finally(() => setRefreshing(false));
  }, [cloudTemplates]);

  useFocusEffect(
    useCallback(() => {
      refreshSizes();
      if (Platform.OS === 'android') {
        FileSystem.getInfoAsync(`${ANDROID_PUBLIC_SEZPRINT_ROOT}labels/`)
          .then((i) => setPublicExists(i.exists))
          .catch(() => setPublicExists(false));
      }
    }, [refreshSizes]),
  );

  const rows = useMemo(() => cacheCategoriesForDisplay(sizes), [sizes]);
  const usedBytes = rows.reduce((sum, row) => sum + row.bytes, 0);

  const clearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This removes saved labels, imported fonts, clipart, data files, printing history, and temporary files from this device. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearAllAppCache();
              refreshSizes();
              Alert.alert('Cache Cleared', 'Cache data has been removed from this device.');
            })();
          },
        },
      ],
    );
  };

  return (
    <SettingsScreenShell title="Cache Settings">
      <SettingsCard>
        <View style={usedSpaceRow}>
          <Text style={[usedSpaceLabel, { color: C.textMuted }]}>Used Space</Text>
          <Text style={[usedSpaceValue, { color: C.danger }]}>{refreshing ? '…' : formatCacheBytes(usedBytes)}</Text>
        </View>
      </SettingsCard>

      <SettingsCard>
        {rows.map((row) => (
          <SettingsCacheRow key={row.id} label={row.label} value={formatCacheBytes(row.bytes)} />
        ))}
      </SettingsCard>

      <SettingsCard>
        <View style={pathBlock}>
          <Text style={[usedSpaceLabel, { color: C.text }]}>Saved labels folder</Text>
          <Text selectable style={[pathText, { color: C.textMuted }]}>{privatePath}</Text>
          <Text style={[pathText, { color: C.textMuted }]}>App-private: not visible in file managers.</Text>
          {Platform.OS === 'android' ? (
            <>
              <Text selectable style={[pathText, { color: C.textMuted, marginTop: 8 }]}>{publicPath}</Text>
              <Text style={[pathText, { color: C.textMuted }]}>
                {publicExists ? 'Public copy folder exists.' : 'Public copy folder not found (Android may block it).'}
              </Text>
            </>
          ) : null}
        </View>
      </SettingsCard>

      <SettingsActionCard label="Clear Cache" accent onPress={clearCache} />
    </SettingsScreenShell>
  );
}

const usedSpaceRow = {
  minHeight: 52,
  paddingHorizontal: 16,
  justifyContent: 'center' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
};

const usedSpaceLabel = {
  flex: 1,
  fontSize: 15,
  fontWeight: '500' as const,
};

const usedSpaceValue = {
  fontSize: 15,
  fontWeight: '700' as const,
};

const pathBlock = { padding: 16, gap: 4 };

const pathText = { fontSize: 12, lineHeight: 17 };
