import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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

const RAIL_WIDTH = 84;
const GRID_COLUMNS = 3;
const GRID_GAP = 6;

const RAILS: { id: GalleryCategory; label: string }[] = [
  { id: 'retail', label: 'Retail' },
  { id: 'food', label: 'Food' },
  { id: 'festivals', label: 'Festivals' },
  { id: 'farm', label: 'Farm' },
  { id: 'transport', label: 'Transport' },
  { id: 'home', label: 'Home' },
  { id: 'health', label: 'Health' },
  { id: 'office', label: 'Office' },
  { id: 'local', label: 'Local' },
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

  const mainWidth = width - RAIL_WIDTH;
  const gridPad = Spacing.two * 2;
  const tileWidth = Math.floor(
    (mainWidth - gridPad - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

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
        <View style={styles.topBar}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search clipart"
            placeholderTextColor="#94A3B8"
            style={styles.search}
          />
          <Pressable onPress={() => void handleUpload()} disabled={importing} style={styles.uploadBtn}>
            <Text style={styles.uploadText}>{importing ? '…' : 'Import'}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle} numberOfLines={1}>
          {sectionTitle} · {icons.length}
        </Text>

        <View style={styles.galleryRow}>
          <ScrollView
            style={styles.rail}
            contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
            showsVerticalScrollIndicator={false}>
            {RAILS.map((item) => {
              const active = category === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setCategory(item.id)}
                  style={[styles.railItem, active && styles.railItemActive]}>
                  <Text
                    style={[styles.railLabel, active && styles.railLabelActive]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <FlatList
            style={styles.gridList}
            data={icons}
            key={category}
            numColumns={GRID_COLUMNS}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: Spacing.two,
              paddingBottom: insets.bottom + Spacing.three,
              flexGrow: 1,
            }}
            columnWrapperStyle={styles.gridRow}
            ListEmptyComponent={
              category === 'local' ? (
                <Text style={styles.empty}>
                  Import SVG or image files. They are saved in the sezprint folder on this device and removed when you delete them here.
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.gridCell,
                  { width: tileWidth },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => handleSelect(item)}
                onLongPress={() => handleLongPress(item)}>
                <ClipartTile item={item} size={tileWidth} />
              </Pressable>
            )}
          />
        </View>
      </View>
      {documentSourceSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  body: { flex: 1, minHeight: 0 },
  galleryRow: { flex: 1, flexDirection: 'row', minHeight: 0 },
  rail: {
    width: RAIL_WIDTH,
    flexGrow: 0,
    backgroundColor: '#F4F6F8',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E3E7ED',
  },
  railItem: {
    paddingHorizontal: 6,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  railItemActive: { backgroundColor: '#FFFFFF' },
  railLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#9AA3AD',
    fontWeight: '600',
    textAlign: 'center',
  },
  railLabelActive: { color: Palette.accent },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  search: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  uploadBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  uploadText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A97A4',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: 6,
  },
  gridList: { flex: 1, minHeight: 0 },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  gridCell: { alignItems: 'stretch' },
  empty: {
    paddingHorizontal: 8,
    paddingVertical: 24,
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
});
