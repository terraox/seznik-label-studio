import { goBack } from '@/lib/go-back';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { AppIcon } from '@/components/app-icon';
import { useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform, StyleSheet, Pressable, Switch, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabelPreview } from '@/components/label-preview';
import { Spacing } from '@/constants/theme';
import { Type } from '@/constants/ui';
import { countOwnClipart, countOwnFonts, exportLabelFile, SHARE_MIME } from '@/lib/label-share/native';
import { shareResultLine } from '@/lib/label-share/summary';
import { ShareFormatError } from '@/lib/label-share/zip';
import { useLabelStore } from '@/stores/label-store';
import { themedStyles, useThemeRefresh } from '@/theme';

const CAPTURE_WIDTH = 720;

function ShareOption({
  icon,
  label,
  color,
  onPress,
}: {
  icon: 'square.grid.2x2' | 'photo';
  label: string;
  color: string;
  onPress?: () => void;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <View style={[styles.optionIcon, { backgroundColor: color }]}>
        <AppIcon name={icon} tintColor="#FFFFFF" size={30} pointerEvents="none" /* theme-fixed: white icon on category tile */ />
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function ShareModal() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ labelId?: string }>();
  const documents = useLabelStore((s) => s.documents);
  const shotRef = useRef<ViewShot>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'main' | 'file'>('main');
  const [includeClipart, setIncludeClipart] = useState(true);
  const [includeFonts, setIncludeFonts] = useState(true);
  const [resultLine, setResultLine] = useState<string | null>(null);

  const doc = useMemo(() => {
    if (params.labelId) return documents.find((d) => d.id === params.labelId) ?? null;
    return documents.length > 0
      ? [...documents].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      : null;
  }, [params.labelId, documents]);

  const ensureSharingAvailable = async () => {
    if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
      Alert.alert('Unavailable', 'Sharing is not available on this platform.');
      return false;
    }
    return true;
  };

  const ownClipart = useMemo(() => (doc ? countOwnClipart(doc) : 0), [doc]);
  const ownFonts = useMemo(() => (doc ? countOwnFonts(doc) : 0), [doc]);

  const handleShareFile = async () => {
    if (!doc || busy) return;
    if (!(await ensureSharingAvailable())) return;
    setBusy(true);
    try {
      // The thumbnail is a display hint only; the file works without it.
      let previewBase64: string | null = null;
      try {
        const shot = await shotRef.current?.capture?.();
        if (shot) previewBase64 = await FileSystem.readAsStringAsync(shot, { encoding: FileSystem.EncodingType.Base64 });
      } catch {
        previewBase64 = null;
      }
      const result = await exportLabelFile(doc.id, { includeUserClipart: includeClipart, includeFonts, previewBase64 });
      await Sharing.shareAsync(result.uri, {
        mimeType: SHARE_MIME,
        UTI: 'public.zip-archive',
        dialogTitle: `Share "${result.name}"`,
      });
      setResultLine(shareResultLine(result.name, result.summary));
    } catch (error) {
      const message =
        error instanceof ShareFormatError || error instanceof Error ? error.message : 'Could not share.';
      Alert.alert('Share Failed', message);
    } finally {
      setBusy(false);
    }
  };

  const handleShareImage = async () => {
    if (!doc || busy) return;
    if (!(await ensureSharingAvailable())) return;
    setBusy(true);
    try {
      const capture = shotRef.current?.capture;
      if (!capture) throw new Error('Could not render the label image.');
      const uri = await capture();
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Share "${doc.name}"`,
      });
      goBack();
    } catch (error) {
      Alert.alert('Share Failed', error instanceof Error ? error.message : 'Could not share.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => goBack()} />

      {/* Off-screen render target for image capture */}
      {doc ? (
        <View style={styles.captureHost} pointerEvents="none">
          <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
            <LabelPreview document={doc} width={CAPTURE_WIDTH} />
          </ViewShot>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {doc
              ? `Share "${doc.name}"`
              : 'No label to share — save a label first'}
          </Text>
          <View style={styles.divider} />

          {doc && view === 'file' ? (
            <View style={styles.fileOptions}>
              {ownClipart > 0 ? (
                <View style={styles.optionRow}>
                  <View style={styles.optionRowText}>
                    <Text style={styles.optionRowTitle}>Include my own clipart ({ownClipart})</Text>
                    <Text style={styles.optionRowHint}>Clipart you added yourself. Built-in clipart is never copied.</Text>
                  </View>
                  <Switch value={includeClipart} onValueChange={setIncludeClipart} disabled={busy || resultLine !== null} />
                </View>
              ) : null}
              {ownFonts > 0 ? (
                <View style={styles.optionRow}>
                  <View style={styles.optionRowText}>
                    <Text style={styles.optionRowTitle}>Include my fonts ({ownFonts})</Text>
                    <Text style={styles.optionRowHint}>
                      So the text looks the same on the other phone. Only include fonts you have the right to share.
                    </Text>
                  </View>
                  <Switch value={includeFonts} onValueChange={setIncludeFonts} disabled={busy || resultLine !== null} />
                </View>
              ) : null}
              <Text style={styles.optionRowHint}>
                Not included: printer settings, offsets, darkness, speed, and spreadsheet data.
              </Text>
              {resultLine ? <Text style={styles.resultLine}>{resultLine}</Text> : null}
              <Pressable
                disabled={busy}
                onPress={() => (resultLine ? goBack() : void handleShareFile())}
                style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && styles.pressed]}>
                <Text style={styles.primaryBtnText}>{resultLine ? 'Done' : busy ? 'Preparing…' : 'Share label file'}</Text>
              </Pressable>
            </View>
          ) : doc ? (
            <View style={styles.options}>
              <ShareOption
                icon="square.grid.2x2"
                label="As .sezlabel"
                color="#3498DB" // theme-fixed: category tile colour
                onPress={() => setView('file')}
              />
              <ShareOption
                icon="photo"
                label="As image"
                color="#8BC34A" // theme-fixed: category tile colour
                onPress={() => void handleShareImage()}
              />
            </View>
          ) : (
            <Text style={styles.emptyHint}>
              Create and save a label in the editor, then come back here to share it.
            </Text>
          )}
        </View>

        <Pressable
          onPress={() => goBack()}
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrim,
  },
  captureHost: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: -999,
    opacity: 1,
    pointerEvents: 'none',
  },
  bottom: {
    paddingHorizontal: 10,
    gap: 8,
  },
  sheet: {
    backgroundColor: c.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  title: {
    textAlign: 'center',
    color: c.textMuted,
    ...Type.modalTitle,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    marginHorizontal: 16,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 22,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  option: {
    alignItems: 'center',
    width: 120,
    gap: 10,
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
    color: c.text,
    textAlign: 'center',
  },
  fileOptions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionRowText: {
    flex: 1,
    gap: 2,
  },
  optionRowTitle: {
    ...Type.caption,
    fontSize: 14,
    color: c.text,
  },
  optionRowHint: {
    color: c.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  resultLine: {
    color: c.text,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: c.accentFill,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    ...Type.modalAction,
    color: c.onAccent,
  },
  emptyHint: {
    textAlign: 'center',
    color: c.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  cancelBtn: {
    backgroundColor: c.surface,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...Type.modalAction,
    color: c.link,
  },
  pressed: {
    opacity: 0.65,
  },
}));
