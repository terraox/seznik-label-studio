import { goBack } from '@/lib/go-back';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { Type } from '@/constants/ui';
import { commitImport, findSameLabel, readLabelFile } from '@/lib/label-share/native';
import type { ParsedLabel } from '@/lib/label-share/import';
import { previewDocument } from '@/lib/label-share/preview';
import { countsLine, groupMissing } from '@/lib/label-share/summary';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; parsed: ParsedLabel };

/** Opened from "Open label file". Shows what is inside; nothing is saved until "Add to my labels". */
export default function ImportLabelScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!params.uri) {
        if (alive) setState({ phase: 'error', message: 'No file was chosen.' });
        return;
      }
      try {
        const parsed = await readLabelFile(params.uri);
        if (alive) setState({ phase: 'ready', parsed });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "This file isn't a valid Sez Print label.";
        if (alive) setState({ phase: 'error', message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.uri]);

  const parsed = state.phase === 'ready' ? state.parsed : null;
  const preview = useMemo(() => {
    if (!parsed) return null;
    try {
      return previewDocument(parsed);
    } catch {
      return null;
    }
  }, [parsed]);
  const same = useMemo(() => (parsed ? findSameLabel(parsed) : null), [parsed]);
  const groups = useMemo(() => (parsed ? groupMissing(parsed.missing) : []), [parsed]);

  const handleAdd = async () => {
    if (!parsed || saving) return;
    setSaving(true);
    try {
      const { doc } = await commitImport(parsed);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
    } catch (error) {
      setSaving(false);
      Alert.alert('Could not add the label', error instanceof Error ? error.message : 'Something went wrong. Nothing was saved.');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => goBack()} style={styles.back}>
          <AppIcon name="chevron.left" tintColor={C.onHeader} size={22} />
        </Pressable>
        <Text style={styles.title}>Open label file</Text>
        <View style={styles.back} />
      </View>

      {state.phase === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Checking the file…</Text>
        </View>
      ) : state.phase === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Can&apos;t open this file</Text>
          <Text style={styles.muted}>{state.message}</Text>
          <Pressable onPress={() => goBack()} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 }]}>
            <View style={styles.previewCard}>
              {preview ? <LabelPreview document={preview} width={280} maxHeight={220} /> : <Text style={styles.muted}>No preview</Text>}
            </View>
            <Text style={styles.name}>{parsed!.document.name}</Text>
            <Text style={styles.line}>
              {parsed!.document.widthMm} × {parsed!.document.heightMm} mm
            </Text>
            <Text style={styles.line}>{countsLine(parsed!.counts)}</Text>
            {parsed!.manifest.createdWithAppVersion ? (
              <Text style={styles.small}>Made with Sez Print {parsed!.manifest.createdWithAppVersion}</Text>
            ) : null}

            {same ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>You already have this label (&ldquo;{same.name}&rdquo;). Keep both adds a separate copy.</Text>
              </View>
            ) : null}

            {parsed!.bulkColumns.length > 0 ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  This label needs a spreadsheet. Columns expected: {parsed!.bulkColumns.join(', ')}. The data itself is not in the file.
                </Text>
              </View>
            ) : null}

            {parsed!.paletteChanged ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>Ink colours were set up differently in the app that made this label. Check colours before printing.</Text>
              </View>
            ) : null}

            {groups.length > 0 ? (
              <View style={styles.missing}>
                <Text style={styles.sectionTitle}>Missing items</Text>
                {groups.map((group) => (
                  <View key={group.title} style={styles.group}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    {group.items.map((item) => (
                      <Text key={`${item.kind}:${item.name}`} style={styles.item}>
                        • {item.name}
                        {item.detail ? ` — ${item.detail}` : ''}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.small}>Nothing is missing.</Text>
            )}

            {parsed!.manifest.knownLimits.length > 0 ? (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Good to know</Text>
                {parsed!.manifest.knownLimits.map((limit) => (
                  <Text key={limit} style={styles.small}>
                    • {limit}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable
              disabled={saving}
              onPress={() => void handleAdd()}
              style={({ pressed }) => [styles.primaryBtn, (pressed || saving) && styles.pressed]}>
              <Text style={styles.primaryText}>{saving ? 'Adding…' : same ? 'Keep both' : 'Add to my labels'}</Text>
            </Pressable>
            <Pressable disabled={saving} onPress={() => goBack()} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: c.header,
  },
  back: { width: 32, alignItems: 'center' },
  title: { ...Type.modalTitle, color: c.onHeader },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  body: { padding: 16, gap: 8 },
  previewCard: {
    alignSelf: 'center',
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    marginBottom: 8,
  },
  name: { ...Type.modalTitle, color: c.text, textAlign: 'center' },
  line: { color: c.text, fontSize: 14, textAlign: 'center' },
  small: { color: c.textMuted, fontSize: 12.5, lineHeight: 17 },
  muted: { color: c.textMuted, fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  errorTitle: { ...Type.modalTitle, color: c.text },
  notice: { backgroundColor: c.surface, borderRadius: 10, padding: 12, marginTop: 4 },
  noticeText: { color: c.text, fontSize: 13.5, lineHeight: 19 },
  missing: { marginTop: 8, gap: 8 },
  sectionTitle: { ...Type.modalTitle, color: c.text, fontSize: 15 },
  group: { gap: 2, marginTop: 4 },
  groupTitle: { color: c.text, fontSize: 13.5, fontWeight: '600' },
  item: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  footer: { paddingHorizontal: 16, paddingTop: 10, gap: 8, backgroundColor: c.bg },
  primaryBtn: { backgroundColor: c.accentFill, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...Type.modalAction, color: c.onAccent },
  secondaryBtn: { borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  secondaryText: { ...Type.modalAction, color: c.link },
  pressed: { opacity: 0.65 },
}));

