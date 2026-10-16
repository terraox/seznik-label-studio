import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { migratePrintHistoryOnce } from '@/lib/print-history/migrate';
import { resolveHistoryLabelDocumentAsync } from '@/lib/print-history/resolve-preview';
import { cloneDocument, generateId, type LabelDocument } from '@/lib/label-document';
import { useLabelStore } from '@/stores/label-store';
import {
  printHistoryDayKey,
  usePrintHistoryStore,
  type PrintHistoryEntry,
} from '@/stores/print-history-store';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

const TILE_GAP = Spacing.two;
const CARD_PREVIEW_HEIGHT = 148;

function formatPrintTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function HistoryDayTile({
  entry,
  width,
  getDocument,
  upsertDocument,
  onReprint,
  onDelete,
}: {
  entry: PrintHistoryEntry;
  width: number;
  getDocument: (id: string) => LabelDocument | undefined;
  upsertDocument: (doc: LabelDocument) => void;
  onReprint: (entry: PrintHistoryEntry) => void;
  onDelete: (entry: PrintHistoryEntry) => void;
}) {
  useThemeRefresh();
  const [sizeLabel, setSizeLabel] = useState('—');
  const previewWidth = width - Spacing.two * 2;

  useEffect(() => {
    let cancelled = false;
    void resolveHistoryLabelDocumentAsync(entry, getDocument).then((doc) => {
      if (cancelled || !doc) return;
      setSizeLabel(`${Math.round(doc.widthMm)}X${Math.round(doc.heightMm)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.snapshotFileId, entry.documentId, getDocument]);

  const handleEdit = () => {
    if (entry.documentId && getDocument(entry.documentId)) {
      router.push({ pathname: '/edit', params: { labelId: entry.documentId } });
      return;
    }
    void resolveHistoryLabelDocumentAsync(entry, getDocument).then((snap) => {
      if (!snap) {
        Alert.alert('Unavailable', 'This entry cannot be opened in the editor.');
        return;
      }
      const copy = cloneDocument(snap);
      copy.id = generateId('label');
      copy.name = entry.labelName;
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      upsertDocument(copy);
      router.push({ pathname: '/edit', params: { labelId: copy.id } });
    });
  };

  return (
    <View style={[styles.tileCard, { width }]}>
      <View style={styles.tileCardHeader}>
        <Text style={styles.sizeLabel}>{sizeLabel}</Text>
        <Text style={styles.timeLabel}>{formatPrintTime(entry.printedAt)}</Text>
      </View>
      <PrintHistoryEntryPreview
        entry={entry}
        getDocument={getDocument}
        width={previewWidth}
        maxHeight={CARD_PREVIEW_HEIGHT}
        compact
      />
      <View style={styles.iconActions}>
        <Pressable
          onPress={() => onReprint(entry)}
          style={({ pressed }) => [styles.iconActionBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Reprint">
          <AppIcon name="printer" tintColor={C.accent} size={22} />
        </Pressable>
        <Pressable
          onPress={handleEdit}
          style={({ pressed }) => [styles.iconActionBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Edit label">
          <AppIcon name="square.and.pencil" tintColor={C.accent} size={22} />
        </Pressable>
        <Pressable
          onPress={() => onDelete(entry)}
          style={({ pressed }) => [styles.iconActionBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Delete from history">
          <AppIcon name="trash" tintColor={C.accent} size={22} />
        </Pressable>
      </View>
    </View>
  );
}

export default function PrintingHistoryScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const entries = usePrintHistoryStore((s) => s.entries);
  const removeEntry = usePrintHistoryStore((s) => s.removeEntry);
  const removeEntriesForDay = usePrintHistoryStore((s) => s.removeEntriesForDay);
  const getDocument = useLabelStore((s) => s.getDocument);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const [ready, setReady] = useState(usePrintHistoryStore.persist.hasHydrated());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const contentWidth = Math.min(width, MaxContentWidth);
  const tileColumnWidth = Math.floor((contentWidth - Spacing.three * 2 - TILE_GAP) / 2);

  const dayKeys = useMemo(() => {
    const keys = new Set(entries.map((e) => printHistoryDayKey(e.printedAt)));
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [entries]);

  useEffect(() => {
    if (dayKeys.length === 0) {
      setSelectedDay(null);
      return;
    }
    if (!selectedDay || !dayKeys.includes(selectedDay)) {
      setSelectedDay(dayKeys[0]);
    }
  }, [dayKeys, selectedDay]);

  const dayEntries = useMemo(() => {
    if (!selectedDay) return [];
    return entries
      .filter((e) => printHistoryDayKey(e.printedAt) === selectedDay)
      .sort((a, b) => b.printedAt - a.printedAt);
  }, [entries, selectedDay]);

  const dayIndex = selectedDay ? dayKeys.indexOf(selectedDay) : -1;
  const canGoOlder = dayIndex >= 0 && dayIndex < dayKeys.length - 1;
  const canGoNewer = dayIndex > 0;

  useEffect(() => {
    const finish = () => setReady(true);
    const unsub = usePrintHistoryStore.persist.onFinishHydration(finish);
    void migratePrintHistoryOnce().finally(finish);
    if (!usePrintHistoryStore.persist.hasHydrated()) {
      void usePrintHistoryStore.persist.rehydrate();
    }
    return unsub;
  }, []);

  const handleDeleteOne = useCallback((entry: PrintHistoryEntry) => {
    Alert.alert('Delete entry', `Remove “${entry.labelName}” from history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeEntry(entry.id),
      },
    ]);
  }, [removeEntry]);

  const handleReprint = useCallback(
    (entry: PrintHistoryEntry) => {
      if (entry.documentId && getDocument(entry.documentId)) {
        router.push({ pathname: '/print', params: { labelId: entry.documentId } });
        return;
      }
      void resolveHistoryLabelDocumentAsync(entry, getDocument).then((snap) => {
        if (snap) {
          Alert.alert(
            'Label removed',
            'This design was deleted from your library. The preview is kept in history, but reprinting needs the label restored to your library.',
          );
          return;
        }
        Alert.alert(
          'Unavailable',
          'The original label for this entry no longer exists, so it cannot be reprinted.',
        );
      });
    },
    [getDocument],
  );

  const handleClearDay = () => {
    if (!selectedDay || dayEntries.length === 0) return;
    Alert.alert(
      'Delete all-day printing history',
      `Remove all ${dayEntries.length} entries from ${selectedDay}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeEntriesForDay(selectedDay),
        },
      ],
    );
  };

  const summaryLine =
    dayEntries.length === 1
      ? '1 label was printed this day'
      : `${dayEntries.length} labels were printed this day`;

  const renderTile = ({ item }: { item: PrintHistoryEntry }) => (
    <HistoryDayTile
      entry={item}
      width={tileColumnWidth}
      getDocument={getDocument}
      upsertDocument={upsertDocument}
      onReprint={handleReprint}
      onDelete={handleDeleteOne}
    />
  );

  return (
    <View style={styles.root}>
      <View style={[styles.dateHeader, { paddingTop: insets.top + Spacing.one }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          android_ripple={androidRipple}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor={C.onAccent} size={22} />
        </Pressable>
        <View style={styles.dateNav}>
          <Pressable
            disabled={!canGoOlder}
            onPress={() => canGoOlder && setSelectedDay(dayKeys[dayIndex + 1])}
            hitSlop={10}
            style={({ pressed }) => [styles.dateArrow, pressed && canGoOlder && styles.pressed]}>
            <AppIcon
              name="chevron.left"
              tintColor={canGoOlder ? C.onAccent : 'rgba(255,255,255,0.35)'} // theme-fixed: dimmed white on header
              size={18}
            />
          </Pressable>
          <Text style={styles.dateTitle}>{selectedDay ?? '—'}</Text>
          <Pressable
            disabled={!canGoNewer}
            onPress={() => canGoNewer && setSelectedDay(dayKeys[dayIndex - 1])}
            hitSlop={10}
            style={({ pressed }) => [styles.dateArrow, pressed && canGoNewer && styles.pressed]}>
            <AppIcon
              name="chevron.right"
              tintColor={canGoNewer ? C.onAccent : 'rgba(255,255,255,0.35)'} // theme-fixed: dimmed white on header
              size={18}
            />
          </Pressable>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {!ready ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <AppIcon name="clock.arrow.circlepath" tintColor={C.textDisabled} size={44} />
          <Text style={styles.emptyTitle}>No printing history</Text>
          <Text style={styles.emptySub}>
            Each successful print is saved on this device with a label preview. Turn on recording in
            Printing Settings if entries are missing after you print.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.summary}>{summaryLine}</Text>
          <FlatList
            style={styles.list}
            data={dayEntries}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.tileRow}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 88 },
            ]}
            ListEmptyComponent={
              <View style={styles.emptyDay}>
                <Text style={styles.emptySub}>No prints recorded for this day.</Text>
              </View>
            }
            renderItem={renderTile}
          />
          {dayEntries.length > 0 ? (
            <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
              <Pressable
                onPress={handleClearDay}
                style={({ pressed }) => [styles.clearDayBtn, pressed && styles.pressed]}>
                <Text style={styles.clearDayText}>Delete all-day printing history</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
  },
  dateHeader: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: c.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dateArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTitle: {
    color: c.onAccent,
    fontSize: 17,
    fontWeight: '600',
    minWidth: 108,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  summary: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    fontSize: 13,
    color: c.textMuted,
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
    paddingTop: Spacing.one,
  },
  tileRow: {
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  tileCard: {
    backgroundColor: c.surface,
    borderRadius: 10,
    padding: Spacing.two,
    ...cardElevation(c, scheme),
  },
  tileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  sizeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 0.3,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: c.textMuted,
  },
  iconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: Spacing.two,
    paddingTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  iconActionBtn: {
    minWidth: 44,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    backgroundColor: c.bg,
  },
  clearDayBtn: {
    backgroundColor: c.accentFill,
    borderRadius: 24,
    minHeight: 48,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: MaxContentWidth - Spacing.three * 2,
  },
  clearDayText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 90,
    paddingHorizontal: Spacing.four,
    gap: 10,
  },
  emptyDay: {
    paddingTop: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text,
  },
  emptySub: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.65,
  },
}));
