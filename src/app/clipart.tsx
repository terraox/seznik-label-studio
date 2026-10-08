import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
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
  allClipartCount,
  builtinClipartCount,
  getClipartForCategory,
  type ClipartCategoryId,
} from '@/constants/clipart-library';
import { editorBridge } from '@/constants/editor-bridge';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { sanitizeUserSvg } from '@/lib/clipart/parse-svg';
import type { ClipartItem } from '@/lib/clipart/types';
import { generateId } from '@/lib/label-document';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import { useUserClipartStore } from '@/stores/user-clipart-store';

type GalleryCategory = ClipartCategoryId | 'mine';

export default function ClipartScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromEdit = params.from === 'edit';
  const userItems = useUserClipartStore((s) => s.items);
  const addUser = useUserClipartStore((s) => s.add);
  const removeUser = useUserClipartStore((s) => s.remove);

  const [category, setCategory] = useState<GalleryCategory>('retail');
  const [query, setQuery] = useState('');
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  const handleSelect = (item: ClipartItem) => {
    editorBridge.clipartResult = { id: item.id };
    if (fromEdit) {
      router.back();
      return;
    }
    router.push('/edit');
  };

  const handleUpload = async () => {
    try {
      const picked = await pickDocumentWithSource({ preset: 'svg' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('Clipart', 'Please choose an .svg file.');
        return;
      }
      const raw = await FileSystem.readAsStringAsync(picked.uri);
      const svg = sanitizeUserSvg(raw);
      if (!svg) {
        Alert.alert('Clipart', 'That file is not a usable SVG.');
        return;
      }
      const label = picked.name.replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').trim() || 'My SVG';
      const added = addUser({ id: generateId('svg'), label, svg });
      if (!added) {
        Alert.alert('Clipart', 'Your SVG library is full. Delete one to add another.');
        return;
      }
      setCategory('mine');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not import that SVG.';
      Alert.alert('Clipart', msg);
    }
  };

  const handleLongPress = (item: ClipartItem) => {
    if (item.source !== 'user') return;
    Alert.alert('Remove SVG', `Delete “${item.label}” from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeUser(item.id) },
    ]);
  };

  const layoutWidth = Math.min(width, MaxContentWidth);
  const tileWidth = Math.floor((layoutWidth - Spacing.three * 2 - 16) / 4);

  const icons = useMemo(() => {
    const list =
      category === 'mine' ? userItems : getClipartForCategory(category);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => item.label.toLowerCase().includes(q) || item.id.includes(q));
  }, [category, query, userItems]);

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Clipart" />

      <View style={[styles.topBar, { width: layoutWidth }]}>
        <Text style={styles.cartoonTab}>
          Indian stickers · {builtinClipartCount()} built-in · {allClipartCount() - builtinClipartCount()} mine
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search kirana, diya, GST…"
          placeholderTextColor="#94A3B8"
          style={styles.search}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {CLIPART_CATEGORIES.map((item) => {
            const active = category === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setCategory(item.id)}
                style={[styles.pill, active && styles.pillActive]}>
                <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCategory('mine')}
            style={[styles.pill, category === 'mine' && styles.pillActive]}>
            <Text style={[styles.pillText, category === 'mine' && styles.pillTextActive]}>My SVGs</Text>
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView
        style={[styles.contentScroll, { width: layoutWidth }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.three, paddingHorizontal: Spacing.one }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>
            {category === 'mine'
              ? 'Saved on this phone'
              : CLIPART_CATEGORIES.find((c) => c.id === category)?.label}
            {` · ${icons.length}`}
          </Text>
          <Pressable onPress={handleUpload} style={styles.uploadBtn}>
            <Text style={styles.uploadText}>Import SVG</Text>
          </Pressable>
        </View>

        {category === 'mine' && icons.length === 0 ? (
          <Text style={styles.empty}>
            Upload your own .svg stickers. They stay on this phone and print with the label.
          </Text>
        ) : null}

        <View style={styles.grid}>
          {icons.map((icon) => (
            <Pressable
              key={icon.id}
              style={({ pressed }) => [{ width: tileWidth }, pressed && { opacity: 0.6 }]}
              onPress={() => handleSelect(icon)}
              onLongPress={() => handleLongPress(icon)}>
              <ClipartTile item={icon} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {documentSourceSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E6EC',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  cartoonTab: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.accent,
    marginBottom: Spacing.two,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: Palette.accent,
    alignSelf: 'flex-start',
    marginLeft: Spacing.one,
  },
  search: {
    marginHorizontal: Spacing.one,
    marginBottom: Spacing.two,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  pillRow: {
    gap: 8,
    paddingHorizontal: Spacing.one,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#EEF1F5',
  },
  pillActive: {
    backgroundColor: Palette.accent,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556473',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  contentScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingHorizontal: 4,
    marginBottom: Spacing.one,
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#8A97A4',
  },
  uploadBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  uploadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 24,
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
