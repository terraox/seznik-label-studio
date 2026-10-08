import { useFonts } from 'expo-font';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import { editorBridge } from '@/constants/editor-bridge';
import { FONT_LIBRARY, FONT_RAILS, type FontLibraryItem } from '@/constants/font-library';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { APP_FONT_MAP } from '@/lib/app-fonts';
import { isCatalogFontInstalled } from '@/lib/fonts/availability';
import { downloadCatalogFont, importFontFile, removeInstalledFont } from '@/lib/fonts/install';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import type { FontRail, InstalledFontRecord } from '@/lib/fonts/types';
import { useInstalledFontStore } from '@/stores/installed-font-store';

type FontRow = {
  id: string;
  name: string;
  family?: string;
  source: 'bundled' | 'catalog' | 'downloaded' | 'imported';
  removable: boolean;
  downloadable: boolean;
  ready: boolean;
  catalogItem?: FontLibraryItem;
};

function rowsForRail(rail: FontRail, installed: InstalledFontRecord[]): FontRow[] {
  if (rail === 'local') {
    return installed
      .filter((font) => font.source === 'imported')
      .map((font) => ({
        id: font.id,
        name: font.name,
        family: font.familyKey,
        source: font.source,
        removable: true,
        downloadable: false,
        ready: true,
      }));
  }

  const catalog = FONT_LIBRARY.filter((font) => font.category === rail);
  const catalogIds = new Set(catalog.map((font) => font.id));
  const rows: FontRow[] = catalog.map((item) => {
    const saved = installed.find((font) => font.id === item.id);
    const ready = isCatalogFontInstalled(item, installed);
    return {
      id: item.id,
      name: item.name,
      family: saved?.familyKey ?? (item.source === 'bundled' ? item.family : undefined),
      source: saved?.source ?? item.source,
      removable: saved != null,
      downloadable: !ready && item.source === 'catalog',
      ready,
      catalogItem: item,
    };
  });
  for (const extra of installed) {
    if (extra.source === 'imported' || extra.category !== rail || catalogIds.has(extra.id)) continue;
    rows.push({
      id: extra.id,
      name: extra.name,
      family: extra.familyKey,
      source: extra.source,
      removable: true,
      downloadable: false,
      ready: true,
    });
  }
  return rows;
}

export default function FontLibraryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEdit = params.from === 'edit';
  const installed = useInstalledFontStore((state) => state.items);
  const [fontsLoaded] = useFonts(APP_FONT_MAP);
  const [rail, setRail] = useState<FontRail>('common');
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  const rows = useMemo(() => rowsForRail(rail, installed), [rail, installed]);

  const applyFont = (row: FontRow) => {
    if (editing || row.downloadable || !row.ready || busyId) return;
    if (!fromEdit) return;
    editorBridge.fontResult = row.name;
    router.back();
  };

  const download = async (row: FontRow, applyAfterDownload = false) => {
    if (!row.catalogItem || busyId) return;
    setBusyId(row.id);
    try {
      await downloadCatalogFont(row.catalogItem);
      if (applyAfterDownload && fromEdit) {
        editorBridge.fontResult = row.name;
        router.back();
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not download that font.';
      Alert.alert('Font', message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (row: FontRow) => {
    Alert.alert('Remove font', `Delete “${row.name}” from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeInstalledFont(row.id).catch((err) => {
            const message = err instanceof Error ? err.message : 'Could not delete that font.';
            Alert.alert('Font', message);
          });
        },
      },
    ]);
  };

  const importFont = async () => {
    if (busyId) return;
    try {
      const picked = await pickDocumentWithSource({ preset: 'font' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') {
          Alert.alert('Font', 'Please choose a .ttf or .otf file.');
        }
        return;
      }
      setBusyId('import');
      await importFontFile(picked.uri, picked.name || 'Imported Font.ttf');
      setRail('local');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not import that font.';
      Alert.alert('Font', message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root}>
      <SettingsStackHeader
        title="Font"
        rightLabel={editing ? 'Done' : 'Edit'}
        onRightPress={() => setEditing((value) => !value)}
      />
      {!fontsLoaded ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Palette.accent} />
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.rail}>
            {FONT_RAILS.map((item) => {
              const active = item.id === rail;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setRail(item.id)}
                  style={[styles.railItem, active && styles.railItemActive]}>
                  <Text style={[styles.railLabel, active && styles.railLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.listWrap}>
            <Text style={styles.browseHint}>
              {fromEdit
                ? 'Catalog fonts must be downloaded before use. Tap Download, then the font is applied to your label.'
                : 'Download catalog fonts before using them on a label. Bundled fonts are ready immediately.'}
            </Text>
            <FlatList
              style={styles.list}
              data={rows}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingHorizontal: Spacing.two,
                paddingTop: Spacing.two,
                paddingBottom: insets.bottom + 88,
                gap: Spacing.two,
                flexGrow: 1,
              }}
              ListEmptyComponent={
                rail === 'local' ? (
                  <Text style={styles.emptyLocal}>
                    No local fonts yet. Tap Import font below to add one from this device or Google Drive.
                  </Text>
                ) : null
              }
              renderItem={({ item }) => {
                const busy = busyId === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      if (item.downloadable) {
                        void download(item, fromEdit);
                        return;
                      }
                      applyFont(item);
                    }}
                    style={({ pressed }) => [
                      styles.card,
                      item.downloadable && styles.cardNeedsDownload,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.fontMeta}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.fontName,
                          item.downloadable && styles.fontNameMuted,
                          item.family ? { fontFamily: item.family } : null,
                        ]}>
                        {item.name}
                      </Text>
                      {item.downloadable ? (
                        <Text style={styles.downloadHint}>Download to use on labels</Text>
                      ) : null}
                    </View>
                    {editing && item.removable ? (
                      <Pressable
                        onPress={() => confirmRemove(item)}
                        hitSlop={8}
                        style={styles.deleteBtn}>
                        <AppIcon name="trash" tintColor={Palette.danger} size={18} />
                      </Pressable>
                    ) : item.downloadable ? (
                      <Pressable
                        onPress={() => void download(item, fromEdit)}
                        disabled={busyId != null}
                        style={styles.downloadBtn}>
                        {busy ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <AppIcon name="arrow.down" tintColor="#FFFFFF" size={16} />
                            <Text style={styles.downloadBtnText}>Download</Text>
                          </>
                        )}
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              }}
            />
            <View pointerEvents="box-none" style={[styles.importDock, { bottom: insets.bottom + Spacing.three }]}>
              <Pressable
                onPress={() => void importFont()}
                disabled={busyId != null}
                style={({ pressed }) => [
                  styles.importBtn,
                  pressed && styles.pressed,
                  busyId === 'import' && styles.importBusy,
                ]}>
                {busyId === 'import' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.importLabel}>Import font</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {documentSourceSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row' },
  rail: {
    width: 108,
    backgroundColor: '#F4F6F8',
    paddingTop: Spacing.two,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E3E7ED',
  },
  railItem: {
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  railItemActive: {
    backgroundColor: '#FFFFFF',
  },
  railLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: '#9AA3AD',
    fontWeight: '500',
  },
  railLabelActive: {
    color: Palette.accent,
  },
  listWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  list: { flex: 1 },
  browseHint: {
    color: Palette.muted,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  emptyLocal: {
    color: Palette.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
  },
  card: {
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: '#F3F5F8',
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardNeedsDownload: {
    backgroundColor: '#EEF2F6',
    borderWidth: 1,
    borderColor: '#D7DEE8',
    borderStyle: 'dashed',
  },
  fontMeta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  fontName: {
    fontSize: 22,
    color: '#1E293B',
  },
  fontNameMuted: {
    color: '#64748B',
  },
  downloadHint: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  downloadBtn: {
    minWidth: 96,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: Palette.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  importBtn: {
    paddingHorizontal: 36,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBusy: { opacity: 0.85 },
  importLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: { opacity: 0.75 },
});
