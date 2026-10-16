import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { DRAWING_COLORS } from '@/components/editor/types';
import { editorBridge } from '@/constants/editor-bridge';
import { patchLabelDocument } from '@/lib/label-settings';
import { useLabelStore } from '@/stores/label-store';
import { themedStyles, useThemeRefresh } from '@/theme';

export default function DrawingColorScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ labelId?: string | string[]; selected?: string | string[] }>();
  const labelId = Array.isArray(params.labelId) ? params.labelId[0] : params.labelId;
  const selectedParam = Array.isArray(params.selected) ? params.selected[0] : params.selected;
  const selectedIndex = Math.max(0, Math.min(DRAWING_COLORS.length - 1, parseInt(selectedParam ?? '1', 10) || 1));

  const getDocument = useLabelStore((s) => s.getDocument);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);

  const pickColor = useCallback(
    (index: number) => {
      if (!labelId) return;
      const doc = getDocument(labelId) ?? editorBridge.labelSettingsDoc;
      if (!doc) return;
      const next = patchLabelDocument(doc, { settings: { defaultDrawingColorIndex: index } });
      upsertDocument(next);
      editorBridge.labelSettingsDoc = next;
      router.back();
    },
    [getDocument, labelId, upsertDocument],
  );

  useFocusEffect(
    useCallback(() => {
      if (!labelId) return;
      const doc = getDocument(labelId);
      if (doc) editorBridge.labelSettingsDoc = doc;
    }, [getDocument, labelId]),
  );

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="WePrint" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}>
        {DRAWING_COLORS.map((color, index) => {
          if (color === '#FFFFFF') return null; // white is not offered as a drawing colour // theme-fixed: ink value, not UI
          const active = index === selectedIndex;
          return (
            <Pressable
              key={`${color}-${index}`}
              onPress={() => pickColor(index)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                active && styles.swatchActive,
              ]}>
              {active ? <Text style={styles.swatchCheck}>✓</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.fillStrong,
  },
  swatch: {
    height: 72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchWhite: {
    borderWidth: 1,
    borderColor: c.border,
  },
  swatchActive: {
    borderWidth: 3,
    borderColor: c.accent,
  },
  swatchCheck: {
    fontSize: 28,
    fontWeight: '700',
    color: c.onAccent,
    textShadowColor: c.scrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
}));
