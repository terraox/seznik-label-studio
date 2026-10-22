import { goBack } from '@/lib/go-back';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CollapsibleBar,
  LabelPreview,
  NumberField,
  SegmentedControl,
  StepperRow,
} from '@/components/new-label/new-label-parts';
import { TextInput } from '@/components/ui/text-input';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { JEWELRY_DIECUT, JEWELRY_DIECUT_PREVIEW_SINGLE } from '@/constants/jewelry-diecut';
import { Spacing } from '@/constants/theme';

import { useTranslation } from '@/lib/i18n';
import {
  createLabelDocument,
  createUpsConfig,
  generateId,
  type LabelElement,
} from '@/lib/label-document';
import { clampLabelMm, containFitImageOnLabel } from '@/lib/label-geometry';
import {
  GAP_MAX_MM,
  GAP_MIN_MM,
  MAX_COLUMNS,
  NAME_MAX,
  NEW_LABEL_PRESETS,
  cellSize,
  clampColumns,
  fmtMm,
  initialFormState,
  parseGapMm,
  presetLabelFor,
  resolvedName,
  stepGap,
  switchShape,
  totalWidthMm,
  validateForm,
  widthWarning,
  type FormState,
  type Shape,
} from '@/lib/new-label-form';
import {
  generateSerialLabelsFromSample,
  type BarcodeSymbology,
} from '@/lib/printer/SerialLabelEngine';
import { createSerialLabelDocument, serialDocumentName } from '@/lib/serial-label-document';
import { WalkthroughOverlay } from '@/components/walkthrough/walkthrough-overlay';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { AppIcon } from '@/components/app-icon';
import { AcrossModePicker } from '@/components/across-mode-picker';
import { createTogetherDocument } from '@/lib/across';
import { NEW_LABEL_WALKTHROUGH } from '@/lib/walkthrough/new-label-steps';
import { setWalkthroughScroller } from '@/lib/walkthrough/registry';
import { useWalkthroughStore } from '@/stores/walkthrough-store';
import { useDataStore } from '@/stores/data-store';
import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import { fitTextDefaults } from '@/lib/element-sizing';
import { defaultSerialConfig } from '@/lib/serial/legacy';
import { storedValuePatch } from '@/lib/serial/stored';
import { DEFAULT_SERIAL_COUNT } from '@/lib/serial/types';
import { scaleDocumentToSize } from '@/lib/element-sizing';
import { resolveProfile } from '@/printer-core/profiles';
import { useLabelStore } from '@/stores/label-store';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export default function NewLabelSetupScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    isClone?: string;
    isTwoUps?: string;
    isJewellery3Up?: string;
    cloneFromId?: string;
    cloneName?: string;
    cloneWidth?: string;
    cloneHeight?: string;
    focusSize?: string;
    importImageUri?: string;
    importImageWidth?: string;
    importImageHeight?: string;
    defaultWidth?: string;
    defaultHeight?: string;
    isSingleCanvas?: string;
    isJewelleryTag?: string;
    serialSample?: string;
    serialEnd?: string;
    serialStep?: string;
    serialPad?: string;
    serialSymbology?: string;
    serialEditor?: string;
  }>();
  const isSerial = Boolean(params.serialSample);
  // New Home entry: size first, then the normal editor with a Serial text element.
  const isSerialEditor = params.serialEditor === '1';
  const isImportImage = Boolean(params.importImageUri);
  const isClone = params.isClone === 'true';
  const defaults = useSettingsStore((s) => s.defaults);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const addExcelFile = useDataStore((s) => s.addExcelFile);

  // Connected printer's head width, for the total-width warning. Null when none is connected.
  const printerStatus = usePrinterStore((s) => s.status);
  const printerSdk = usePrinterStore((s) => s.sdkId);
  const printerName = usePrinterStore((s) => s.deviceName);
  const printerMaxMm = useMemo(() => {
    if (printerStatus !== 'connected' || !printerSdk) return null;
    try {
      return resolveProfile(printerSdk, printerName)?.maxWidthMm ?? null;
    } catch {
      return null;
    }
  }, [printerName, printerSdk, printerStatus]);

  const [form, setForm] = useState<FormState>(() => initialFormState(params));
  const patch = useCallback((p: Partial<FormState>) => setForm((f) => ({ ...f, ...p })), []);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [triedCreate, setTriedCreate] = useState(false);

  const firstField = useRef<import('react-native').TextInput>(null);
  const secondField = useRef<import('react-native').TextInput>(null);
  const gapField = useRef<import('react-native').TextInput>(null);
  const nameField = useRef<import('react-native').TextInput>(null);

  // Custom Size asks for the size to be focused once the page has laid out.
  useEffect(() => {
    if (params.focusSize !== '1') return;
    const id = setTimeout(() => firstField.current?.focus(), 400);
    return () => clearTimeout(id);
  }, [params.focusSize]);

  // The tour covers the plain blank-label flow only (not clone, serial or image import).
  const showTour = !isImportImage && !isSerial && !isSerialEditor && !isClone;
  const startWalkthrough = useWalkthroughStore((s) => s.start);
  const stopWalkthrough = useWalkthroughStore((s) => s.stop);
  const setNewLabelTutorialSeen = useSettingsStore((s) => s.setNewLabelTutorialSeen);
  const scrollRef = useRef<import('react-native').ScrollView>(null);
  const scrollY = useRef(0);

  useEffect(() => {
    if (!showTour) return;
    setWalkthroughScroller((dy) =>
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: false }),
    );
    return () => setWalkthroughScroller(null);
  }, [showTour]);

  useEffect(() => {
    if (!showTour) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maybeStart = () => {
      if (useSettingsStore.getState().newLabelTutorialSeen) return;
      timer = setTimeout(() => startWalkthrough('newLabel'), 500);
    };
    if (useSettingsStore.persist.hasHydrated()) maybeStart();
    const unsub = useSettingsStore.persist.onFinishHydration(maybeStart);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [showTour, startWalkthrough]);

  useEffect(
    () => () => {
      const { active, tour } = useWalkthroughStore.getState();
      if (active && tour === 'newLabel') useWalkthroughStore.getState().stop();
    },
    [],
  );

  const { errors, canCreate } = validateForm(form);
  const cell = cellSize(form);
  const gapMm = parseGapMm(form.gap) ?? 0;
  const multi = form.columns > 1;
  const showLayout = !isImportImage && !isSerial && !isSerialEditor;
  const total = cell.w != null ? totalWidthMm(cell.w, form.columns, gapMm) : null;
  const warning = multi && total != null ? widthWarning(total, printerMaxMm) : null;
  const presetValue = presetLabelFor(form.shape, cell.w, cell.h);
  const err = (key: keyof typeof errors) => (triedCreate ? errors[key] ?? 'Enter a number' : errors[key]);

  const setColumns = (n: number) => {
    patch({ columns: Math.max(2, clampColumns(n)) });
  };

  const handleCreateLabel = () => {
    setTriedCreate(true);
    if (!canCreate) return;
    const name = resolvedName(form.name);
    const wMm = cell.w ?? 50;
    const hMm = cell.h ?? 30;
    const size = clampLabelMm(wMm, hMm);
    const circle = form.shape === 'circle';
    if (__DEV__) {
      console.log(
        `[new-label] create shape=${form.shape} columns=${form.columns} size=${size.widthMm}x${size.heightMm} gap=${gapMm} image=${isImportImage}`,
      );
    }

    if (isSerialEditor) {
      const serial = defaultSerialConfig();
      const fit = fitTextDefaults(size.widthMm, size.heightMm);
      const element = {
        ...DEFAULT_ELEMENT_STATE,
        id: generateId(),
        type: 'text',
        text: '1',
        contentType: 'Degrees',
        ...storedValuePatch(serial, 'text'),
        left: fit.left,
        top: fit.top,
        width: fit.width,
        fontSize: fit.fontSize,
        autoTextHeight: true,
        autoWrapping: defaults.autoWrap,
      } as unknown as LabelElement;
      const doc = createLabelDocument({
        name,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        elements: [element],
        background: { type: 'color', color: '#FFFFFF' }, // theme-fixed: label paper colour (document data)
      });
      doc.serialBatch = { v: 1, count: DEFAULT_SERIAL_COUNT };
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
      return;
    }

    if (isSerial) {
      try {
        const sample = params.serialSample ?? '';
        const m = sample.match(/(\d+)(\D*)$/);
        const symbology = (params.serialSymbology ?? 'CODE128') as BarcodeSymbology;
        const labels = generateSerialLabelsFromSample(
          sample,
          { fields: {}, textFieldKey: 'displayText', barcodeFieldKey: 'barcodeValue' },
          {
            startNumber: m ? parseInt(m[1], 10) : NaN,
            endNumber: Number(params.serialEnd),
            step: Number(params.serialStep) || 1,
            textPadding: params.serialPad ? Number(params.serialPad) : undefined,
            barcodeSymbology: symbology,
          },
        );
        const file = addExcelFile({
          name: serialDocumentName(labels),
          uri: `serial://label/${Date.now()}`,
          sheets: [
            {
              name: 'Serial',
              columns: ['Text', 'Barcode'],
              rows: labels.map((label) => [label.text, label.barcodeValue]),
            },
          ],
          activeSheetIndex: 0,
          hasHeaderRow: true,
          dataStartRow: 1,
        });
        const doc = createSerialLabelDocument({
          labels,
          excelFileId: file.id,
          widthMm: size.widthMm,
          heightMm: size.heightMm,
          barcodeSymbology: symbology,
          orientation: defaults.orientation,
          paperType: defaults.paperType,
        });
        if (!doc) {
          Alert.alert('Serial labels', 'The series could not be opened on the canvas.');
          return;
        }
        upsertDocument(doc);
        router.replace({ pathname: '/edit', params: { labelId: doc.id } });
      } catch (e: unknown) {
        Alert.alert('Serial labels', e instanceof Error ? e.message : 'Could not open the canvas.');
      }
      return;
    }

    if (params.importImageUri) {
      const imgId = generateId();
      const assetW = parseFloat(params.importImageWidth || '0') || 1;
      const assetH = parseFloat(params.importImageHeight || '0') || 1;
      const jewelryBody =
        params.isJewelleryTag === 'true' || size.widthMm <= 15
          ? { left: 0, top: 0, width: size.widthMm, height: Math.min(size.heightMm, JEWELRY_DIECUT.bodyHeightMm) }
          : undefined;
      const nested = containFitImageOnLabel(
        { widthMm: size.widthMm, heightMm: size.heightMm },
        { widthPx: assetW, heightPx: assetH },
        jewelryBody,
      );

      const imgElement: LabelElement = {
        id: imgId,
        type: 'image',
        uri: params.importImageUri,
        rotation: 0,
        left: nested.left,
        top: nested.top,
        width: nested.width,
        height: nested.height,
        lockMovement: false,
        needPrinting: true,
        antiColor: false,
        contentFit: 'contain',
        aspectRatioLocked: true,
        originalAspect: assetW / assetH,
      };

      // Nested image canvas on the selected label size.
      const doc = createLabelDocument({
        name: name,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        elements: [imgElement],
        background: { type: 'color', color: '#FFFFFF' }, // theme-fixed: label paper colour (document data)
      });
      if (params.isJewelleryTag === 'true' || size.widthMm <= 15) {
        doc.templateCategory = 'jewelry';
        doc.templatePreviewType = JEWELRY_DIECUT_PREVIEW_SINGLE;
      }
      upsertDocument(doc);
      router.replace({
        pathname: '/edit',
        params: {
          labelId: doc.id,
          selectedElementId: imgId,
          autoOpenPanel: 'true',
        },
      });
      return;
    }

    let seedElements: LabelElement[] = [];
    if (params.cloneFromId) {
      const source = useLabelStore.getState().getDocument(params.cloneFromId);
      if (source) {
        const cloned = JSON.parse(JSON.stringify(source.elements)) as LabelElement[];
        // Each ups panel is one label at `size` mm. A source cloned at a
        // different size needs proportional rescale, or geometry stays stale
        // and clips at the new bounds.
        seedElements =
          source.widthMm === size.widthMm && source.heightMm === size.heightMm
            ? cloned
            : scaleDocumentToSize(
                { ...source, elements: cloned, ups: undefined },
                size.widthMm,
                size.heightMm,
              ).elements;
      }
    }

    if (form.columns > 1 && form.acrossMode === 'together') {
      const doc = createTogetherDocument({
        name,
        cellWidthMm: size.widthMm,
        cellHeightMm: size.heightMm,
        columns: form.columns,
        gapMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        circle: Boolean(circle),
        seedElements,
      });
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
      return;
    }

    if (form.columns > 1) {
      const ups = createUpsConfig({
        columns: form.columns,
        columnSpacingMm: gapMm,
        batchEdit: form.batchEdit,
        seedElements,
      });
      const doc = createLabelDocument({
        name,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        ...(circle ? { mediaShape: 'circle' as const } : {}),
        elements: ups.panels[0] ?? [],
        background: { type: 'color', color: '#FFFFFF' }, // theme-fixed: label paper colour (document data)
      });
      doc.ups = ups;
      doc.templateCategory = 'Multi-UP';
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
      return;
    }

    router.replace({
      pathname: '/edit',
      params: {
        labelName: name,
        labelWidth: String(size.widthMm),
        labelHeight: String(size.heightMm),
        orientation: `${defaults.orientation}°`,
        paperType: defaults.paperType,
        ...(circle ? { mediaShape: 'circle' } : {}),
        ...(params.cloneFromId ? { cloneFromId: params.cloneFromId } : {}),
      },
    });
  };

  const sizeTitle = multi ? 'Size of each label' : 'Size';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => goBack()}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {isSerial || isSerialEditor
            ? 'Serial label size'
            : isImportImage
            ? 'Label Sizing Setup'
            : params.isTwoUps === 'true' && form.columns === 2 && !isClone
              ? '2ups label'
              : isClone
                ? 'Label Clone'
                : t('editor.newLabel')}
        </Text>
        {showTour ? (
          <Pressable
            onPress={() => startWalkthrough('newLabel')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Label setup walkthrough"
            style={({ pressed }) => [styles.helpBtn, pressed && styles.pressed]}>
            <AppIcon name="info.circle" tintColor={C.onAccent} size={22} />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <FormScrollView
        ref={scrollRef}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        bottomOffset={96}
        showsVerticalScrollIndicator={false}>
        <LabelPreview
          shape={form.shape}
          columns={form.columns}
          cellW={cell.w}
          cellH={cell.h}
          gap={gapMm}
          imageUri={isImportImage ? params.importImageUri : null}
        />

        {showLayout ? (
          <WalkthroughTarget id="newLabel.shape" style={styles.section}>
            <Text style={styles.sectionHeading}>Shape</Text>
            <SegmentedControl<Shape>
              value={form.shape}
              onChange={(s) => setForm((f) => switchShape(f, s))}
              options={[
                { id: 'rectangle', label: 'Rectangle' },
                { id: 'circle', label: 'Circle' },
              ]}
            />
          </WalkthroughTarget>
        ) : null}

        {showLayout ? (
          <WalkthroughTarget id="newLabel.across" style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Labels across ({multi ? `${form.columns} ups` : 'e.g. 2 ups, 3 ups'})
              </Text>
              <Switch
                value={multi}
                onValueChange={(on) => patch({ columns: on ? 2 : 1 })}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
              />
            </View>
            <Text style={styles.note}>
              Turn this on when your roll is wide enough to print two or more labels next to each other in one go, such as small tags or stickers. Off prints one label at a time.
            </Text>
            {multi ? (
              <StepperRow
                label="Number of columns"
                valueText={String(form.columns)}
                onMinus={() => setColumns(form.columns - 1)}
                onPlus={() => setColumns(form.columns + 1)}
                minusDisabled={form.columns <= 2}
                plusDisabled={form.columns >= MAX_COLUMNS}
                disabled={false}
                chips={[2, 3, 4].map((n) => ({
                  text: String(n),
                  active: form.columns === n,
                  onPress: () => setColumns(n),
                }))}
              />
            ) : null}
            {multi ? (
              <>
                <Text style={styles.sectionHeading}>How do you want to edit them?</Text>
                <AcrossModePicker value={form.acrossMode} onChange={(acrossMode) => patch({ acrossMode })} />
              </>
            ) : null}
          </WalkthroughTarget>
        ) : null}

        <WalkthroughTarget id="newLabel.size" style={styles.section}>
          <Text style={styles.sectionHeading}>{sizeTitle}</Text>
          {isSerial || isSerialEditor ? (
            <Text style={styles.note}>
              Width and height of one sticker, in mm. Measure your roll or pick a preset. Every
              numbered label uses this size. Next you can drag the text and barcode into place.
            </Text>
          ) : null}
          {form.shape === 'circle' ? (
            <NumberField
              ref={firstField}
              label="Diameter"
              value={form.diameter}
              onChangeText={(v) => patch({ diameter: v })}
              error={err('diameter')}
              returnKeyType="done"
            />
          ) : (
            <>
              <NumberField
                ref={firstField}
                label="Width"
                value={form.width}
                onChangeText={(v) => patch({ width: v })}
                error={err('width')}
                onSubmitEditing={() => secondField.current?.focus()}
              />
              <NumberField
                ref={secondField}
                label="Height"
                value={form.height}
                onChangeText={(v) => patch({ height: v })}
                error={err('height')}
                returnKeyType={multi ? 'next' : 'done'}
                onSubmitEditing={() => (multi ? gapField.current?.focus() : nameField.current?.focus())}
              />
            </>
          )}
        </WalkthroughTarget>

        {showLayout && multi ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Gap between columns</Text>
            <StepperRow
              label="Gap"
              valueText={`${fmtMm(gapMm)} mm`}
              onMinus={() => patch({ gap: stepGap(form.gap, -1) })}
              onPlus={() => patch({ gap: stepGap(form.gap, 1) })}
              minusDisabled={gapMm <= GAP_MIN_MM}
              plusDisabled={gapMm >= GAP_MAX_MM}
            />
            <NumberField
              ref={gapField}
              label="Gap (type 0 or more)"
              value={form.gap.startsWith('-') ? '' : form.gap}
              onChangeText={(v) => patch({ gap: v })}
              error={err('gap')}
              returnKeyType="done"
            />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total width</Text>
              <Text style={styles.totalValue}>
                {form.columns} × {fmtMm(cell.w ?? 0)} + {form.columns - 1} × {fmtMm(gapMm)} = {total != null ? fmtMm(total) : '-'} mm
              </Text>
            </View>
            {warning ? <Text style={styles.warn}>{warning}</Text> : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <CollapsibleBar title="Size presets" open={presetsOpen} onToggle={() => setPresetsOpen((o) => !o)}>
            <View style={styles.presetGrid}>
              {NEW_LABEL_PRESETS.map((p) => {
                const active = presetValue === p.label;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() =>
                      setForm((f) => ({
                        ...f,
                        shape: 'rectangle',
                        width: fmtMm(p.width),
                        height: fmtMm(p.height),
                        lastRect: { width: fmtMm(p.width), height: fmtMm(p.height) },
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [styles.presetChip, active && styles.presetChipActive, pressed && styles.pressed]}>
                    <Text style={[styles.presetChipText, active && styles.presetChipTextActive]} numberOfLines={1}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </CollapsibleBar>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>{t('editor.labelName')}</Text>
          {isSerial || isSerialEditor ? (
            <Text style={styles.note}>Only for finding this job later. It is not printed.</Text>
          ) : null}
          <TextInput
            ref={nameField}
            value={form.name}
            onChangeText={(v) => patch({ name: v.slice(0, NAME_MAX) })}
            placeholder="Default label"
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            accessibilityLabel="Label name"
            style={styles.nameInput}
          />
        </View>

        {showLayout && multi && form.acrossMode === 'separate' ? (
          <View style={[styles.switchRow]}>
            <Text style={styles.switchLabel}>{t('editor.batchEdit')}</Text>
            <Switch
              value={form.batchEdit}
              onValueChange={(v) => patch({ batchEdit: v })}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
            />
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push('/(tabs)/template')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.templatesLink, pressed && styles.pressed]}>
          <Text style={styles.templatesLinkText}>Browse our templates</Text>
          <Text style={styles.chevronRight}>›</Text>
        </Pressable>
        {isSerialEditor ? (
          <Pressable
            onPress={() => router.replace('/serial-label')}
            style={({ pressed }) => [styles.templatesLink, pressed && styles.pressed]}>
            <Text style={styles.templatesLinkText}>Use the classic serial generator</Text>
            <Text style={styles.chevronRight}>›</Text>
          </Pressable>
        ) : null}
      </FormScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.stickyHost}>
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
          <WalkthroughTarget id="newLabel.create">
          <Pressable
            onPress={handleCreateLabel}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCreate }}
            style={({ pressed }) => [styles.newButton, !canCreate && styles.newButtonOff, pressed && styles.pressed]}>
            <Text style={styles.newButtonText}>{isSerial || isSerialEditor ? 'Open on canvas' : isImportImage ? 'Open in Editor' : 'Create Label'}</Text>
          </Pressable>
          </WalkthroughTarget>
        </View>
      </KeyboardStickyView>
      {showTour ? (
        <WalkthroughOverlay
          tour="newLabel"
          steps={NEW_LABEL_WALKTHROUGH}
          onFinish={() => {
            setNewLabelTutorialSeen(true);
            stopWalkthrough();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: c.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backChevron: { color: c.onAccent, fontSize: 32, fontWeight: '300', lineHeight: 36 },
  headerTitle: { flex: 1, textAlign: 'center', color: c.onAccent, fontSize: 17, fontWeight: '500' },
  headerSpacer: { width: 36 },
  helpBtn: { width: 36, alignItems: 'flex-end' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, gap: 14 },
  section: { gap: 8 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  note: { fontSize: 12, color: c.textSecondary, marginLeft: 2 },
  warn: { fontSize: 13, fontWeight: '600', color: c.danger, marginLeft: 2 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: c.text },
  totalValue: { fontSize: 13, color: c.textSecondary, flexShrink: 1, textAlign: 'right' },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    width: '31.5%',
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetChipActive: { backgroundColor: c.accentSoft, borderColor: c.accent },
  presetChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, lineHeight: 16, textAlign: 'center' },
  presetChipTextActive: { color: c.accent },
  nameInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    fontSize: 16,
    color: c.text,
  },
  switchRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { fontSize: 15, fontWeight: '500', color: c.text },
  templatesLink: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  templatesLinkText: { fontSize: 15, fontWeight: '500', color: c.accent },
  chevronRight: { color: c.textMuted, fontSize: 22, fontWeight: '300' },
  stickyHost: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: c.bg },
  newButton: { backgroundColor: c.accentFill, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  newButtonOff: { opacity: 0.4 },
  newButtonText: { color: c.onAccent, fontSize: 17, fontWeight: '500' },
  pressed: { opacity: 0.75 },
}));
