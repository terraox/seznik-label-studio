import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { LabelSizeEditor } from '@/components/label-size-editor';
import {
  SettingsCard,
  SettingsDivider,
  SettingsNote,
  SettingsScreenShell,
  SettingsSegmentRow,
  SettingsStepperRow,
  SettingsToggleRow,
  SettingsValueRow,
} from '@/components/settings-ui';
import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import { editorBridge, isBorderRemoval } from '@/constants/editor-bridge';
import { DRAWING_COLORS } from '@/components/editor/types';
import { borderBoxForCenterGap } from '@/lib/border-geometry';
import { generateId, parseOrientation, readPaperType, type LabelDocument, type LabelOrientation, type PaperType } from '@/lib/label-document';
import { paperTypesFor, paperTypeSelectionNote, paperTypeTestBadge, shownPaperType } from '@/lib/printer/paper-type';
import { clampLabelMm } from '@/lib/label-geometry';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import {
  backgroundSummary,
  borderSummary,
  formatDarknessValue,
  formatSpeedValue,
  patchLabelDocument,
  resolveLabelSettings,
} from '@/lib/label-settings';
import { stockSizePromptCopy, type StockSizeHandling } from '@/lib/stock-size';
import { isRatTail143Document } from '@/constants/rat-tail-143';
import { useDataStore } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { usePrinterStore } from '@/stores/printer-store';
import { QualityControl } from '@/components/quality-control';
import { clampToCap, qualityCapsFor, resolveQualityBridge } from '@/lib/printer/bridge-quality-caps';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { themedStyles, useThemeRefresh } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;
const MIRROR_MODES = ['Close', 'Reverse', 'Syntropy'] as const;

export default function LabelSettingsScreen() {
  useThemeRefresh();
  const params = useLocalSearchParams<{ labelId?: string | string[] }>();
  const labelId = Array.isArray(params.labelId) ? params.labelId[0] : params.labelId;
  const getDocument = useLabelStore((s) => s.getDocument);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const setActiveExcelFile = useDataStore((s) => s.setActiveExcelFile);
  const printerStatus = usePrinterStore((s) => s.status);
  const printerTransport = usePrinterStore((s) => s.transport);
  const printerSdkId = usePrinterStore((s) => s.sdkId);
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();
  const qualityCaps = useMemo(
    () =>
      qualityCapsFor(
        resolveQualityBridge({
          activeTransport: getPrinterManager().transport,
          storeTransport: printerTransport,
          sdkId: printerSdkId,
        }),
      ),
    // `printerStatus` re-reads the manager's live transport after connect / disconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printerStatus, printerTransport, printerSdkId],
  );

  const [doc, setDoc] = useState<LabelDocument | null>(null);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [draftWidthMm, setDraftWidthMm] = useState(50);
  const [draftHeightMm, setDraftHeightMm] = useState(30);

  const loadDoc = useCallback(() => {
    if (!labelId) return null;
    const stored = getDocument(labelId);
    const bridged = editorBridge.labelSettingsDoc?.id === labelId ? editorBridge.labelSettingsDoc : null;
    return stored ?? bridged ?? null;
  }, [getDocument, labelId]);

  useEffect(() => {
    const initial = loadDoc();
    if (initial) setDoc(initial);
  }, [loadDoc]);

  useFocusEffect(
    useCallback(() => {
      const refreshed = loadDoc();
      if (refreshed) setDoc(refreshed);

      if (editorBridge.dataSourceFileId) {
        const fileId = editorBridge.dataSourceFileId;
        editorBridge.dataSourceFileId = null;
        setActiveExcelFile(fileId);
        if (doc) {
          const next = patchLabelDocument(doc, { settings: { dataSourceFileId: fileId } }, excelFiles);
          setDoc(next);
          upsertDocument(next);
          editorBridge.labelSettingsDoc = next;
        }
      }

      if (editorBridge.borderResult && doc) {
        const result = editorBridge.borderResult;
        editorBridge.borderResult = null;
        const settingsNow = resolveLabelSettings(doc);
        const nextElements = isBorderRemoval(result)
          ? doc.elements.filter((el) => el.type !== 'border')
          : (() => {
              const existing = doc.elements.find((el) => el.type === 'border');
              const box = borderBoxForCenterGap(
                doc.widthMm,
                doc.heightMm,
                result.edgeGapMm,
                result.lineWidth,
              );
              return existing
                ? doc.elements.map((el) =>
                    el.id === existing.id && el.type === 'border'
                      ? {
                          ...el,
                          borderStyle: result.style,
                          lineWidth: result.lineWidth,
                          edgeGapMm: result.edgeGapMm,
                          geometryVersion: 1 as const,
                          ...box,
                        }
                      : el,
                  )
                : [
                    ...doc.elements,
                    {
                      id: generateId(),
                      type: 'border' as const,
                      borderStyle: result.style,
                      lineWidth: result.lineWidth,
                      edgeGapMm: result.edgeGapMm,
                      ...box,
                      geometryVersion: 1 as const,
                      lockMovement: true,
                      rotation: 0 as const,
                      needPrinting: true,
                      drawingColorIndex: settingsNow.defaultDrawingColorIndex,
                    },
                  ];
            })();
        const next = patchLabelDocument(doc, { elements: nextElements }, excelFiles);
        setDoc(next);
        upsertDocument(next);
        editorBridge.labelSettingsDoc = next;
      }
    }, [doc, excelFiles, loadDoc, setActiveExcelFile, upsertDocument]),
  );

  const settings = useMemo(() => (doc ? resolveLabelSettings(doc) : null), [doc]);

  const commit = useCallback(
    (patch: Parameters<typeof patchLabelDocument>[1]) => {
      if (!doc) return;
      const next = patchLabelDocument(doc, patch, excelFiles);
      setDoc(next);
      upsertDocument(next);
      editorBridge.labelSettingsDoc = next;
    },
    [doc, excelFiles, upsertDocument],
  );

  const patchSettings = useCallback(
    (patch: Parameters<typeof patchLabelDocument>[1]['settings']) => {
      commit({ settings: patch });
    },
    [commit],
  );

  const dataSourceLabel = useMemo(() => {
    if (!settings?.dataSourceFileId) return 'Not set';
    const file = excelFiles.find((f) => f.id === settings.dataSourceFileId);
    return file?.name ?? 'Linked';
  }, [excelFiles, settings?.dataSourceFileId]);

  const drawingColorLabel = useMemo(() => {
    const idx = settings?.defaultDrawingColorIndex ?? 1;
    const color = DRAWING_COLORS[idx] ?? '#000000'; // theme-fixed: ink value, not UI
    return color === '#FFFFFF' ? 'White' : color; // theme-fixed: ink value, not UI
  }, [settings?.defaultDrawingColorIndex]);

  if (!doc || !settings) {
    return (
      <SettingsScreenShell title="Label Settings">
        <SettingsCard>
          <Text style={styles.emptyText}>Open a label in the editor first.</Text>
        </SettingsCard>
      </SettingsScreenShell>
    );
  }

  const orientation = `${doc.orientation}°` as (typeof ORIENTATIONS)[number];

  return (
    <SettingsScreenShell title="Label Settings">
      <SettingsCard>
        <SettingsValueRow
          label="Label Name"
          value={doc.name}
          onPress={() => {
            setNameDraft(doc.name);
            setNameModalVisible(true);
          }}
          showDivider
        />
        <SettingsValueRow
          label="Label Width"
          value={`${doc.widthMm.toFixed(2)} mm`}
          onPress={() => {
            if (isRatTail143Document(doc)) return;
            setDraftWidthMm(doc.widthMm);
            setDraftHeightMm(doc.heightMm);
            setSizeModalVisible(true);
          }}
          showDivider
        />
        <SettingsValueRow
          label="Label Height"
          value={`${doc.heightMm.toFixed(2)} mm`}
          onPress={() => {
            if (isRatTail143Document(doc)) return;
            setDraftWidthMm(doc.widthMm);
            setDraftHeightMm(doc.heightMm);
            setSizeModalVisible(true);
          }}
          showDivider
        />
        <SettingsValueRow
          label="Data Source"
          value={dataSourceLabel}
          onPress={() =>
            router.push({ pathname: '/data-file', params: { from: 'label-settings', labelId: doc.id } })
          }
          showDivider
        />
        <SettingsValueRow
          label="Background"
          value={backgroundSummary(doc)}
          onPress={async () => {
            const asset = await pickImageAsset();
            if (!asset) return;
            commit({ background: { type: 'image', uri: asset.uri } });
          }}
          showDivider
        />
        <SettingsNote>
          The preview background is used only to show the preview effect of the printed part of the label
          and will not be printed.
        </SettingsNote>
        <SettingsValueRow
          label="Border"
          value={borderSummary(doc)}
          onPress={() => {
            const border = doc.elements.find((el) => el.type === 'border');
            router.push({
              pathname: '/border-library',
              params: {
                from: 'label-settings',
                ...(doc.mediaShape ? { mediaShape: doc.mediaShape } : {}),
                ...(border?.type === 'border'
                  ? {
                      style: border.borderStyle,
                      lineWidth: String(border.lineWidth),
                      ...(border.edgeGapMm != null ? { edgeGap: String(border.edgeGapMm) } : {}),
                      hasBorder: '1',
                    }
                  : {}),
              },
            });
          }}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsSegmentRow
          label="Mirror Mode"
          options={MIRROR_MODES}
          selected={settings.mirrorMode}
          onSelect={(mirrorMode) => patchSettings({ mirrorMode })}
          showDivider
        />
        {settings.mirrorMode === 'Syntropy' && (
          <>
            <SettingsStepperRow
              label="Number of each row"
              value={String(settings.mirrorRowsCount)}
              minusDisabled={settings.mirrorRowsCount <= 2}
              onMinus={() =>
                patchSettings({ mirrorRowsCount: Math.max(2, settings.mirrorRowsCount - 1) })
              }
              onPlus={() =>
                patchSettings({ mirrorRowsCount: Math.min(4, settings.mirrorRowsCount + 1) })
              }
              showDivider
            />
            <SettingsStepperRow
              label="Mirror spacing"
              value={`${settings.mirrorSpacingMm.toFixed(2)} mm`}
              onMinus={() =>
                patchSettings({
                  mirrorSpacingMm: Math.max(-5, Math.round((settings.mirrorSpacingMm - 0.1) * 100) / 100),
                })
              }
              onPlus={() =>
                patchSettings({
                  mirrorSpacingMm: Math.min(20, Math.round((settings.mirrorSpacingMm + 0.1) * 100) / 100),
                })
              }
              showDivider
            />
            <SettingsStepperRow
              label="Row number"
              value={String(settings.mirrorRowNumber)}
              minusDisabled={settings.mirrorRowNumber <= 1}
              onPlus={() =>
                patchSettings({
                  mirrorRowNumber: Math.min(settings.mirrorRowsCount, settings.mirrorRowNumber + 1),
                })
              }
              onMinus={() =>
                patchSettings({ mirrorRowNumber: Math.max(1, settings.mirrorRowNumber - 1) })
              }
              showDivider
            />
          </>
        )}
        <SettingsToggleRow
          label="Flag Label"
          value={settings.flagLabel}
          onValueChange={(flagLabel) => patchSettings({ flagLabel })}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsSegmentRow
          label="Orientation"
          options={ORIENTATIONS}
          selected={orientation}
          onSelect={(value) =>
            commit({ orientation: parseOrientation(value) as LabelOrientation })
          }
          showDivider
        />
        <SettingsSegmentRow
          label="Paper Type"
          options={paperTypesFor(printerSdkId)}
          selected={shownPaperType(doc.paperType, printerSdkId)}
          badgeFor={(option) => paperTypeTestBadge(option)}
          onSelect={(paperType) => commit({ paperType: paperType as PaperType })}
          showDivider
        />
        {paperTypeSelectionNote(shownPaperType(doc.paperType, printerSdkId)) ? (
          <SettingsNote>{paperTypeSelectionNote(shownPaperType(doc.paperType, printerSdkId)) ?? ''}</SettingsNote>
        ) : null}
        <SettingsStepperRow
          label="Gap Length"
          value={`${(readPaperType(doc.paperType) === 'Receipt' ? 0 : settings.gapLengthMm).toFixed(1)} mm`}
          minusDisabled={readPaperType(doc.paperType) === 'Receipt' || settings.gapLengthMm <= 0}
          plusDisabled={readPaperType(doc.paperType) === 'Receipt' || settings.gapLengthMm >= 20}
          onMinus={() =>
            patchSettings({
              gapLengthMm: Math.max(0, Math.round((settings.gapLengthMm - 0.5) * 10) / 10),
            })
          }
          onPlus={() =>
            patchSettings({
              gapLengthMm: Math.min(20, Math.round((settings.gapLengthMm + 0.5) * 10) / 10),
            })
          }
        />
      </SettingsCard>

      <SettingsCard>
        {qualityCaps.density !== 'legacy' ? (
          <>
            <QualityControl
              cap={qualityCaps.density}
              value={clampToCap(settings.printDarkness, qualityCaps.density).value}
              onChange={(next) => patchSettings({ printDarkness: next })}
              Stepper={SettingsStepperRow}
              footerInset={16}
            />
            <SettingsDivider />
          </>
        ) : (
          <SettingsStepperRow
            label="Print Darkness"
            value={formatDarknessValue(settings.printDarkness)}
            minusDisabled={settings.printDarkness != null && settings.printDarkness <= 1}
            onMinus={() => {
              if (settings.printDarkness == null) patchSettings({ printDarkness: 14 });
              else if (settings.printDarkness > 1)
                patchSettings({ printDarkness: settings.printDarkness - 1 });
            }}
            onPlus={() => {
              if (settings.printDarkness == null) patchSettings({ printDarkness: 1 });
              else if (settings.printDarkness < 15)
                patchSettings({ printDarkness: settings.printDarkness + 1 });
              else patchSettings({ printDarkness: null });
            }}
            showDivider
          />
        )}
        {qualityCaps.speed !== 'legacy' ? (
          <QualityControl
            cap={qualityCaps.speed}
            value={clampToCap(settings.printSpeed, qualityCaps.speed).value}
            onChange={(next) => patchSettings({ printSpeed: next })}
            Stepper={SettingsStepperRow}
            footerInset={16}
          />
        ) : (
          <SettingsStepperRow
            label="Print Speed"
            value={formatSpeedValue(settings.printSpeed)}
            minusDisabled={settings.printSpeed != null && settings.printSpeed <= 1}
            onMinus={() => {
              if (settings.printSpeed == null) patchSettings({ printSpeed: 5 });
              else if (settings.printSpeed > 1) patchSettings({ printSpeed: settings.printSpeed - 1 });
            }}
            onPlus={() => {
              if (settings.printSpeed == null) patchSettings({ printSpeed: 1 });
              else if (settings.printSpeed < 5) patchSettings({ printSpeed: settings.printSpeed + 1 });
              else patchSettings({ printSpeed: null });
            }}
          />
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsStepperRow
          label="Horizontal Offset"
          value={`${settings.hOffsetMm.toFixed(1)} mm`}
          onMinus={() =>
            patchSettings({ hOffsetMm: Math.max(-10, Math.round((settings.hOffsetMm - 0.5) * 10) / 10) })
          }
          onPlus={() =>
            patchSettings({ hOffsetMm: Math.min(10, Math.round((settings.hOffsetMm + 0.5) * 10) / 10) })
          }
          showDivider
        />
        <SettingsStepperRow
          label="Vertical Offset"
          value={`${settings.vOffsetMm.toFixed(1)} mm`}
          onMinus={() =>
            patchSettings({ vOffsetMm: Math.max(-10, Math.round((settings.vOffsetMm - 0.5) * 10) / 10) })
          }
          onPlus={() =>
            patchSettings({ vOffsetMm: Math.min(10, Math.round((settings.vOffsetMm + 0.5) * 10) / 10) })
          }
          showDivider
        />
        <SettingsToggleRow
          label="Flip Horizontally"
          value={settings.flipHorizontally}
          onValueChange={(flipHorizontally) => patchSettings({ flipHorizontally })}
          showDivider
        />
        <SettingsToggleRow
          label="Anti-Color"
          value={settings.antiColor}
          onValueChange={(antiColor) => {
            patchSettings({ antiColor });
            commit({
              elements: doc.elements.map((el) =>
                'antiColor' in el ? ({ ...el, antiColor } as typeof el) : el,
              ),
            });
          }}
        />
        <SettingsNote>
          When the anti-color is opened, the barcode will not be recognized.
        </SettingsNote>
      </SettingsCard>

      <SettingsCard>
        <SettingsValueRow
          label="Drawing Color"
          value={drawingColorLabel}
          onPress={() =>
            router.push({
              pathname: '/drawing-color',
              params: { labelId: doc.id, selected: String(settings.defaultDrawingColorIndex) },
            })
          }
        />
      </SettingsCard>

      <IosAlertModal
        visible={nameModalVisible}
        title="Label Name"
        onClose={() => setNameModalVisible(false)}
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setNameModalVisible(false) },
          {
            text: 'Save',
            style: 'default',
            bold: true,
            onPress: () => {
              const trimmed = nameDraft.trim();
              if (trimmed) commit({ name: trimmed });
              setNameModalVisible(false);
            },
          },
        ]}>
        <IosAlertInput value={nameDraft} onChangeText={setNameDraft} placeholder="Label name" />
      </IosAlertModal>

      <Modal supportedOrientations={ALL_ORIENTATIONS} visible={sizeModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Label Size</Text>
            {sizeModalVisible ? (
              <LabelSizeEditor
                widthMm={draftWidthMm}
                heightMm={draftHeightMm}
                onChange={(widthMm, heightMm) => {
                  setDraftWidthMm(widthMm);
                  setDraftHeightMm(heightMm);
                }}
              />
            ) : null}
            <Pressable
              style={styles.modalDone}
              onPress={() => {
                const size = clampLabelMm(draftWidthMm, draftHeightMm);
                setSizeModalVisible(false);
                if (!doc) return;
                if (
                  Math.abs(doc.widthMm - size.widthMm) < 0.001 &&
                  Math.abs(doc.heightMm - size.heightMm) < 0.001
                ) {
                  return;
                }
                const copy = stockSizePromptCopy(Boolean(doc.bulk));
                const apply = (sizeHandling: StockSizeHandling) => {
                  commit({
                    widthMm: size.widthMm,
                    heightMm: size.heightMm,
                    sizeHandling,
                  });
                };
                Alert.alert(copy.title, copy.message, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Keep as-is', onPress: () => apply('keep') },
                  { text: 'Scale proportionally', onPress: () => apply('scale') },
                ]);
              }}>
              <Text style={styles.modalDoneText}>Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {imageSourceSheet}
    </SettingsScreenShell>
  );
}

const styles = themedStyles((c) => ({
  emptyText: {
    padding: 16,
    color: c.textSecondary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: c.text,
  },
  modalDone: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalDoneText: {
    color: c.accent,
    fontWeight: '600',
    fontSize: 16,
  },
}));
