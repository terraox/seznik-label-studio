import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipartTile } from '@/components/clipart-tile';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import {
  CLIPART_CATEGORIES,
  getClipartForCategory,
  type ClipartCategoryId,
} from '@/constants/clipart-library';
import { editorBridge } from '@/constants/editor-bridge';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { hydrateUserClipartSvgs, importUserClipartFile, removeUserClipart } from '@/lib/clipart/user-storage';
import type { ClipartItem } from '@/lib/clipart/types';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { useUserClipartStore } from '@/stores/user-clipart-store';

type GalleryCategory = ClipartCategoryId | 'local';

const RAILS: { id: GalleryCategory; label: string }[] = [
  ...CLIPART_CATEGORIES.map((item) => ({ id: item.id as GalleryCategory, label: item.label })),
  { id: 'local', label: 'Local clipart' },
];

export default function ClipartScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEdit = params.from === 'edit';
  const userItems = useUserClipartStore((s) => s.items);
  const revision = useUserClipartStore((s) => s.revision);
  const [category, setCategory] = useState<GalleryCategory>('retail');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  useEffect(() => {
    void hydrateUserClipartSvgs();
  }, []);

  const handleSelect = (item: ClipartItem) => {
    editorBridge.clipartResult = { id: item.id };
    if (fromEdit) {
      router.back();
      return;
    }
    router.push('/edit');
  };

  const handleUpload = async () => {
    if (importing) return;
    try {
      const picked = await pickDocumentWithSource({ preset: 'clipart' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') {
          Alert.alert('Clipart', 'Please choose an SVG or an image (PNG, JPG, or WebP).');
        }
        return;
      }
      setImporting(true);
      await importUserClipartFile(picked.uri, picked.name || 'clipart.svg');
      setCategory('local');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not import that file.';
      Alert.alert('Clipart', msg);
    } finally {
      setImporting(false);
    }
  };

  const handleLongPress = (item: ClipartItem) => {
    if (item.source !== 'user') return;
    Alert.alert('Remove clipart', `Delete “${item.label}” from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeUserClipart(item.id).catch((err) => {
            const msg = err instanceof Error ? err.message : 'Could not delete that clipart.';
            Alert.alert('Clipart', msg);
          });
        },
      },
    ]);
  };

  const railWidth = 108;
  const tileWidth = Math.floor((width - railWidth - Spacing.two * 2 - 16) / 3);

  const icons = useMemo(() => {
    const list = getClipartForCategory(category);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => item.label.toLowerCase().includes(q) || item.id.includes(q));
  }, [category, query, userItems, revision]);

  const sectionTitle =
    category === 'local'
      ? 'Local clipart'
      : CLIPART_CATEGORIES.find((item) => item.id === category)?.label ?? 'Clipart';

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Clipart" />
      <View style={styles.body}>
        <ScrollView style={styles.rail} contentContainerStyle={{ paddingBottom: insets.bottom + 12 }} showsVerticalScrollIndicator={false}>
          {RAILS.map((item) => {
            const active = category === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setCategory(item.id)}
                style={[styles.railItem, active && styles.railItemActive]}>
                <Text style={[styles.railLabel, active && styles.railLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search clipart"
            placeholderTextColor="#94A3B8"
            style={styles.search}
          />
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {sectionTitle} · {icons.length}
            </Text>
            <Pressable onPress={() => void handleUpload()} disabled={importing} style={styles.uploadBtn}>
              <Text style={styles.uploadText}>{importing ? 'Importing…' : 'Import clipart'}</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.three }}
            showsVerticalScrollIndicator={false}>
            {category === 'local' && icons.length === 0 ? (
              <Text style={styles.empty}>
                Import SVG or image files. They are saved in the sezprint folder on this device and removed when you delete them here.
              </Text>
            ) : null}
            <View style={styles.grid}>
              {icons.map((icon) => (
                <Pressable
                  key={icon.id}
                  style={({ pressed }) => [{ width: Math.max(72, tileWidth) }, pressed && { opacity: 0.6 }]}
                  onPress={() => handleSelect(icon)}
                  onLongPress={() => handleLongPress(icon)}>
                  <ClipartTile item={icon} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
      {documentSourceSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  body: { flex: 1, flexDirection: 'row' },
  rail: {
    width: 108,
    backgroundColor: '#F4F6F8',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E3E7ED',
  },
  railItem: {
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  railItemActive: { backgroundColor: '#FFFFFF' },
  railLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: '#9AA3AD',
    fontWeight: '500',
  },
  railLabelActive: { color: Palette.accent },
  listWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  search: {
    marginHorizontal: Spacing.two,
    marginTop: Spacing.two,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.one,
    gap: 8,
  },
  sectionTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: '#8A97A4' },
  uploadBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  uploadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  contentScroll: { flex: 1 },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 },
});
