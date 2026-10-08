import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import { PrintHistoryEntryPreview } from '@/components/print-history-entry-preview';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';
import { migratePrintHistoryOnce } from '@/lib/print-history/migrate';
import { useLabelStore } from '@/stores/label-store';
import { usePrintHistoryStore, type PrintHistoryEntry } from '@/stores/print-history-store';

type HistoryViewMode = 'tiles' | 'list';

const SOURCE_LABELS: Record<PrintHistoryEntry['source'], string> = {
  label: 'Label',
  photo: 'Photo',
  pdf: 'PDF',
  scan: 'Scan',
  excel: 'Data File',
  'img-to-label': 'Image to Label',
};

const TILE_GAP = Spacing.two;
const LIST_PREVIEW = 76;
const TILE_PREVIEW_HEIGHT = 132;

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function PrintingHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const entries = usePrintHistoryStore((s) => s.entries);
  const removeEntry = usePrintHistoryStore((s) => s.removeEntry);
  const clearAll = usePrintHistoryStore((s) => s.clearAll);
  const getDocument = useLabelStore((s) => s.getDocument);
  const [ready, setReady] = useState(usePrintHistoryStore.persist.hasHydrated());
  const [viewMode, setViewMode] = useState<HistoryViewMode>('tiles');

  const contentWidth = Math.min(width, MaxContentWidth);
  const tileColumnWidth = Math.floor((contentWidth - Spacing.three * 2 - TILE_GAP) / 2);
  const tilePreviewWidth = tileColumnWidth - Spacing.two * 2;

  useEffect(() => {
    const finish = () => setReady(true);
    const unsub = usePrintHistoryStore.persist.onFinishHydration(finish);
    void migratePrintHistoryOnce().finally(finish);
    if (!usePrintHistoryStore.persist.hasHydrated()) {
      void usePrintHistoryStore.persist.rehydrate();
    }
    return unsub;
  }, []);

  const handleClearAll = () => {
    if (entries.length === 0) return;
    Alert.alert('Clear history', 'Remove all printing history entries from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: clearAll },
    ]);
  };

  const handleDeleteOne = (entry: PrintHistoryEntry) => {
    Alert.alert('Delete entry', `Remove “${entry.labelName}” from history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeEntry(entry.id),
      },
    ]);
  };

  const handleReprint = (entry: PrintHistoryEntry) => {
    if (entry.documentId && getDocument(entry.documentId)) {
      router.push({ pathname: '/print', params: { labelId: entry.documentId } });
      return;
    }
    if (entry.documentSnapshot) {
      Alert.alert(
        'Unavailable',
        'This label was removed from your library. Open the original design again before reprinting.',
      );
      return;
    }
    Alert.alert(
      'Unavailable',
      'The original label for this entry no longer exists, so it cannot be reprinted.',
    );
  };

  const listHeader = useMemo(
    () =>
      entries.length > 0 ? (
        <View style={styles.toolbar}>
          <View style={styles.viewToggle}>
            <Pressable
              onPress={() => setViewMode('tiles')}
              style={[styles.viewBtn, viewMode === 'tiles' && styles.viewBtnActive]}
              accessibilityRole="button"
              accessibilityLabel="Tiles view">
              <AppIcon
                name={viewMode === 'tiles' ? 'square.grid.2x2.fill' : 'square.grid.2x2'}
                tintColor={viewMode === 'tiles' ? Palette.accent : Palette.muted}
                size={20}
              />
            </Pressable>
            <Pressable
              onPress={() => setViewMode('list')}
              style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
              accessibilityRole="button"
              accessibilityLabel="List view">
              <AppIcon
                name="list.number"
                tintColor={viewMode === 'list' ? Palette.accent : Palette.muted}
                size={20}
              />
            </Pressable>
          </View>
          <Pressable
            onPress={handleClearAll}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}>
            <AppIcon name="trash" tintColor="#DC2626" size={15} />
            <Text style={styles.clearText}>Clear all ({entries.length})</Text>
          </Pressable>
        </View>
      ) : null,
    [entries.length, viewMode],
  );

  const renderTile = ({ item }: { item: PrintHistoryEntry }) => (
    <View style={[styles.tileCard, { width: tileColumnWidth }]}>
      <PrintHistoryEntryPreview
        entry={item}
        getDocument={getDocument}
        width={tilePreviewWidth}
        maxHeight={TILE_PREVIEW_HEIGHT}
      />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.labelName}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={2}>
        {SOURCE_LABELS[item.source]} · {item.copies} {item.copies === 1 ? 'copy' : 'copies'}
      </Text>
      <Text style={styles.cardDate}>{formatDate(item.printedAt)}</Text>
      <View style={styles.tileActions}>
        <Pressable
          onPress={() => handleReprint(item)}
          style={({ pressed }) => [styles.reprintBtn, styles.reprintBtnFlex, pressed && styles.pressed]}>
          <AppIcon name="printer" tintColor="#FFFFFF" size={15} />
          <Text style={styles.reprintText}>Reprint</Text>
        </Pressable>
        <Pressable
          onPress={() => handleDeleteOne(item)}
          hitSlop={8}
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
          <AppIcon name="trash" tintColor="#DC2626" size={18} />
        </Pressable>
      </View>
    </View>
  );

  const renderListRow = ({ item }: { item: PrintHistoryEntry }) => (
    <View style={styles.listCard}>
      <PrintHistoryEntryPreview
        entry={item}
        getDocument={getDocument}
        width={LIST_PREVIEW}
        maxHeight={LIST_PREVIEW}
        compact
      />
      <View style={styles.listMain}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.labelName}
        </Text>
        <Text style={styles.cardMeta}>
          {SOURCE_LABELS[item.source]} · {item.copies} {item.copies === 1 ? 'copy' : 'copies'}
        </Text>
        <Text style={styles.cardDate}>{formatDate(item.printedAt)}</Text>
      </View>
      <View style={styles.listActions}>
        <Pressable
          onPress={() => handleReprint(item)}
          style={({ pressed }) => [styles.reprintBtn, pressed && styles.pressed]}>
          <AppIcon name="printer" tintColor="#FFFFFF" size={15} />
        </Pressable>
        <Pressable
          onPress={() => handleDeleteOne(item)}
          hitSlop={8}
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
          <AppIcon name="trash" tintColor="#DC2626" size={18} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Printing History" />

      {!ready ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Palette.accent} />
        </View>
      ) : (
        <FlatList
          key={viewMode}
          style={styles.list}
          data={entries}
          keyExtractor={(item) => item.id}
          numColumns={viewMode === 'tiles' ? 2 : 1}
          columnWrapperStyle={viewMode === 'tiles' ? styles.tileRow : undefined}
          contentContainerStyle={[
            styles.listContent,
            entries.length === 0 && styles.listContentEmpty,
            { paddingBottom: insets.bottom + Spacing.four },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <AppIcon name="clock.arrow.circlepath" tintColor="#B8C0C8" size={44} />
              <Text style={styles.emptyTitle}>No printing history</Text>
              <Text style={styles.emptySub}>
                Each successful print is saved on this device with a label preview. Turn on recording
                in Printing Settings if entries are missing after you print.
              </Text>
            </View>
          }
          ListHeaderComponent={listHeader}
          renderItem={viewMode === 'tiles' ? renderTile : renderListRow}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 4,
    gap: 4,
    ...cardShadow,
  },
  viewBtn: {
    width: 40,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtnActive: {
    backgroundColor: '#E8F0FE',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 4,
  },
  clearText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  tileRow: {
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  tileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Spacing.two,
    ...cardShadow,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: Spacing.two,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    ...cardShadow,
  },
  listMain: {
    flex: 1,
    minWidth: 0,
  },
  listActions: {
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.ink,
    marginTop: Spacing.one,
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 12,
    color: Palette.muted,
  },
  cardDate: {
    marginTop: 2,
    fontSize: 11,
    color: '#94A3B8',
  },
  tileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.one,
  },
  reprintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.accent,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  reprintBtnFlex: {
    flex: 1,
  },
  reprintText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteBtn: {
    minHeight: 36,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 90,
    paddingHorizontal: Spacing.four,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Palette.ink,
  },
  emptySub: {
    fontSize: 13,
    color: Palette.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.65,
  },
});
