import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { Palette, Type } from '@/constants/ui';
import type { LabelDocument } from '@/lib/label-document';
import { mergeSavedTemplates, useLabelStore } from '@/stores/label-store';

type TemplateChoiceSheetProps = {
  title: string;
  onCreate: () => void;
  /** When set, Select Existing shows these documents instead of saved user templates. */
  existingDocuments?: LabelDocument[];
  onSelectExisting?: (doc: LabelDocument) => void;
};

export function TemplateChoiceSheet({
  title,
  onCreate,
  existingDocuments,
  onSelectExisting,
}: TemplateChoiceSheetProps) {
  const insets = useSafeAreaInsets();
  const documents = useLabelStore((s) => s.documents);
  const cloudTemplates = useLabelStore((s) => s.cloudTemplates);
  const ensureLocalDocument = useLabelStore((s) => s.ensureLocalDocument);
  const [mode, setMode] = useState<'choose' | 'existing'>('choose');

  const saved = useMemo(
    () => mergeSavedTemplates(documents, cloudTemplates),
    [documents, cloudTemplates],
  );
  const templates = existingDocuments ?? saved;

  const openEditor = (doc: LabelDocument) => {
    onSelectExisting?.(doc);
    const local = ensureLocalDocument(doc.id) ?? doc;
    router.replace({ pathname: '/edit', params: { labelId: local.id } });
  };

  const openPrint = (doc: LabelDocument) => {
    onSelectExisting?.(doc);
    const local = ensureLocalDocument(doc.id) ?? doc;
    router.replace({ pathname: '/print', params: { labelId: local.id } });
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.sheet}>
          {mode === 'choose' ? (
            <>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.divider} />
              <View style={styles.options}>
                <Pressable
                  onPress={onCreate}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                  <View style={[styles.optionIcon, { backgroundColor: '#3B82F6' }]}>
                    <AppIcon name="plus.rectangle" tintColor="#FFFFFF" size={30} pointerEvents="none" />
                  </View>
                  <Text style={styles.optionLabel}>Create New</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('existing')}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                  <View style={[styles.optionIcon, { backgroundColor: '#17A6B8' }]}>
                    <AppIcon name="square.grid.2x2" tintColor="#FFFFFF" size={28} pointerEvents="none" />
                  </View>
                  <Text style={styles.optionLabel}>Existing Template</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.listHead}>
                <Pressable onPress={() => setMode('choose')} hitSlop={10}>
                  <Text style={styles.backLink}>‹ Back</Text>
                </Pressable>
                <Text style={styles.listTitle}>Saved templates</Text>
                <View style={styles.backSpacer} />
              </View>
              <View style={styles.divider} />
              {templates.length === 0 ? (
                <Text style={styles.empty}>No saved templates yet. Create a new one first.</Text>
              ) : (
                <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                  {templates.map((doc) => (
                    <View key={doc.id} style={styles.templateRow}>
                      <Pressable
                        onPress={() => openEditor(doc)}
                        style={({ pressed }) => [styles.templateMain, pressed && styles.pressed]}>
                        <View style={styles.thumb}>
                          <LabelPreview document={doc} width={72} maxHeight={48} />
                        </View>
                        <View style={styles.templateText}>
                          <Text numberOfLines={1} style={styles.templateName}>
                            {doc.name}
                          </Text>
                          <Text style={styles.templateDetail}>
                            {doc.widthMm.toFixed(0)} × {doc.heightMm.toFixed(0)} mm · {doc.paperType}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => openPrint(doc)}
                        style={({ pressed }) => [styles.printBtn, pressed && styles.pressed]}>
                        <AppIcon name="printer" tintColor={Palette.accent} size={20} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  bottom: {
    paddingHorizontal: 10,
    gap: 8,
  },
  sheet: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  title: {
    textAlign: 'center',
    color: '#8E97A1',
    ...Type.modalTitle,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E6EA',
    marginHorizontal: 16,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 22,
    paddingBottom: 24,
    paddingHorizontal: 12,
  },
  option: {
    width: '46%',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  optionIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    ...Type.caption,
    fontSize: 13,
    color: Palette.ink,
    textAlign: 'center',
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
    paddingVertical: 14,
  },
  backLink: { color: '#007AFF', fontSize: 15, fontWeight: '500', width: 64, paddingLeft: 16 },
  backSpacer: { width: 64 },
  list: { maxHeight: 360 },
  templateText: { flex: 1, minWidth: 0, gap: 2 },
  templateName: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  templateDetail: { fontSize: 12, color: Palette.muted },
  listTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#8E97A1',
    ...Type.modalTitle,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3E6EA',
  },
  templateMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    minWidth: 0,
  },
  printBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 76,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    color: Palette.muted,
    fontSize: 13,
    paddingVertical: 24,
  },
  cancelBtn: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...Type.modalAction,
    color: '#007AFF',
  },
  pressed: { opacity: 0.65 },
});
