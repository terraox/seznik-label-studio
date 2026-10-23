import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { CATALOG_STOCK_LINER, LabelPreview } from '@/components/label-preview';
import { resolveHistoryLabelDocumentAsync } from '@/lib/print-history/resolve-preview';
import type { PrintHistoryEntry } from '@/lib/print-history/types';
import type { LabelDocument } from '@/lib/label-document';
import { Palette } from '@/constants/ui';

const SOURCE_ICON: Partial<Record<PrintHistoryEntry['source'], string>> = {
  pdf: 'doc.text',
  photo: 'photo',
  scan: 'barcode.viewfinder',
};

type PrintHistoryEntryPreviewProps = {
  entry: PrintHistoryEntry;
  getDocument: (id: string) => LabelDocument | undefined;
  width: number;
  maxHeight: number;
  compact?: boolean;
};

export function PrintHistoryEntryPreview({
  entry,
  getDocument,
  width,
  maxHeight,
  compact = false,
}: PrintHistoryEntryPreviewProps) {
  const [document, setDocument] = useState<LabelDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveHistoryLabelDocumentAsync(entry, getDocument).then((doc) => {
      if (!cancelled) setDocument(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.snapshotFileId, entry.documentId, entry.documentSnapshot, entry.previewImageUri, getDocument]);

  const imageUri = entry.previewImageUri;

  if (document) {
    return (
      <View style={[styles.labelSlot, { width, height: maxHeight, backgroundColor: CATALOG_STOCK_LINER }]}>
        <LabelPreview
          document={document}
          width={width - (compact ? 8 : 12)}
          maxHeight={maxHeight - (compact ? 8 : 12)}
          catalogStock
        />
      </View>
    );
  }

  if (imageUri) {
    return (
      <View style={[styles.imageSlot, { width, height: maxHeight }]}>
        <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
      </View>
    );
  }

  const icon = SOURCE_ICON[entry.source] ?? 'printer.fill';
  return (
    <View style={[styles.placeholder, { width, height: maxHeight }]}>
      <AppIcon name={icon} tintColor="#94A3B8" size={compact ? 28 : 36} />
      <Text allowFontScaling={false} style={styles.placeholderText} numberOfLines={2}>
        {entry.labelName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelSlot: {
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageSlot: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  placeholder: {
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  placeholderText: {
    fontSize: 11,
    color: Palette.muted,
    textAlign: 'center',
  },
});
