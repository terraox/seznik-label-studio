import { FormScrollView } from '@/components/ui/form-scroll-view';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useStepBack } from '@/lib/use-step-back';
import { goBack } from '@/lib/go-back';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeType,
} from 'expo-camera';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WalkthroughOverlay } from '@/components/walkthrough/walkthrough-overlay';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { OCR_WALKTHROUGHS } from '@/lib/walkthrough/ocr-steps';
import { useSettingsStore } from '@/stores/settings-store';
import { useWalkthroughStore } from '@/stores/walkthrough-store';

import { editorBridge, type OcrResultType } from '@/constants/editor-bridge';
import { isScanEmptyError, payloadFromBarcodeResult } from '@/lib/scan-codes';

import {
  OCR_ERROR_MESSAGES,
  OcrResultPanel,
  isOcrError,
  ocrErrorMessage,
  useOcrSession,
} from '@/lib/ocr';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { ocrPreviewSize } from '@/lib/layout/screen-sizes';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'code128',
  'code39',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
];

const QR_TYPES: BarcodeType[] = ['qr', 'aztec', 'datamatrix', 'pdf417'];

type OcrStep = 'capture' | 'identify';

const TYPE_OPTIONS: { value: OcrResultType; label: string }[] = [
  { value: 'Text', label: 'Text' },
  { value: 'Barcode', label: 'Barcode' },
  { value: 'QRCode', label: 'QR code' },
];

const HEADING: Record<OcrResultType, string> = {
  Text: 'Scan text',
  Barcode: 'Scan barcode',
  QRCode: 'Scan QR code',
};

const READ_LABEL: Record<OcrResultType, string> = {
  Text: 'Read text',
  Barcode: 'Read barcode',
  QRCode: 'Read QR code',
};

const RESULT_PLACEHOLDER: Record<OcrResultType, string> = {
  Text: 'The text from your photo will show here. You can edit it.',
  Barcode: 'The barcode number will show here.',
  QRCode: 'The QR code content will show here.',
};

function TypeSegments({
  value,
  onChange,
}: {
  value: OcrResultType;
  onChange: (next: OcrResultType) => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.segments}>
      {TYPE_OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentActive]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function OcrScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  // Also capped by height so the form and the Add button keep room on short screens.
  const previewSize = Math.min(ocrPreviewSize(win.width), Math.round(win.height * 0.26));
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const returnToEdit = fromParam === 'edit';
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();
  const ocr = useOcrSession();

  const cameraRef = useRef<CameraView>(null);
  const previewInputRef = useRef<TextInput>(null);
  const identifyGenerationRef = useRef(0);

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<OcrStep>('capture');
  const [torch, setTorch] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recognitionType, setRecognitionType] = useState<OcrResultType>('Text');
  const [previewText, setPreviewText] = useState('');
  const [identifying, setIdentifying] = useState(false);

  const cancelIdentify = useCallback(() => {
    identifyGenerationRef.current += 1;
    setIdentifying(false);
    ocr.reset();
  }, [ocr.reset]);

  const handleBack = useCallback(() => {
    if (step === 'identify') {
      cancelIdentify();
      setStep('capture');
      setPreviewText('');
      return;
    }
    goBack();
  }, [cancelIdentify, step]);

  useStepBack(step === 'identify', handleBack);

  const startWalkthrough = useWalkthroughStore((s) => s.start);
  const stopWalkthrough = useWalkthroughStore((s) => s.stop);
  const markOcrTourSeen = useSettingsStore((s) => s.markOcrTourSeen);
  const tourScreen = step === 'capture' ? 'capture' : 'result';
  const cameraAllowed = Boolean(permission?.granted);

  // Each screen has its own tour: it opens the first time that screen is shown.
  useEffect(() => {
    const running = useWalkthroughStore.getState();
    if (running.active && running.tour === 'ocr') running.stop();
    if (tourScreen === 'capture' && !cameraAllowed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maybeStart = () => {
      if (useSettingsStore.getState().ocrTourSeen.includes(tourScreen)) return;
      timer = setTimeout(() => startWalkthrough('ocr'), 600);
    };
    if (useSettingsStore.persist.hasHydrated()) maybeStart();
    const unsub = useSettingsStore.persist.onFinishHydration(maybeStart);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [tourScreen, cameraAllowed, startWalkthrough]);

  useEffect(
    () => () => {
      const { active, tour } = useWalkthroughStore.getState();
      if (active && tour === 'ocr') useWalkthroughStore.getState().stop();
    },
    [],
  );

  const tourOverlay = (
    <WalkthroughOverlay
      tour="ocr"
      steps={OCR_WALKTHROUGHS[tourScreen]}
      onFinish={() => {
        markOcrTourSeen(tourScreen);
        stopWalkthrough();
      }}
    />
  );

  const helpButton = (
    <Pressable
      onPress={() => startWalkthrough('ocr')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Help for this screen"
      style={[styles.headerSide, styles.headerSideRight]}>
      <AppIcon name="info.circle" tintColor={C.onAccent} size={22} />
    </Pressable>
  );

  const openIdentifyStep = (uri: string) => {
    cancelIdentify();
    setImageUri(uri);
    setPreviewText('');
    setRecognitionType('Text');
    setStep('identify');
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;

    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (photo?.uri) {
        openIdentifyStep(photo.uri);
      }
    } catch {
      Alert.alert('Capture Failed', 'Unable to take a photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleGalleryPick = async () => {
    try {
      const asset = await pickImageAsset();
      if (asset) openIdentifyStep(asset.uri);
    } catch {
      Alert.alert('Error', 'Unable to open photo library.');
    }
  };

  const handleClear = () => {
    cancelIdentify();
    setImageUri(null);
    setPreviewText('');
    setStep('capture');
  };

  const handleIdentify = async () => {
    if (!imageUri) {
      Alert.alert('No photo', 'Take or choose a photo first.');
      return;
    }
    if (identifying || ocr.running) return;

    const generation = ++identifyGenerationRef.current;
    const isCurrent = () => generation === identifyGenerationRef.current;
    setIdentifying(true);
    try {
      if (recognitionType === 'QRCode') {
        try {
          const results = await scanFromURLAsync(imageUri, QR_TYPES);
          if (!isCurrent()) return;
          const payload = results.map(payloadFromBarcodeResult).find(Boolean);
          if (payload) {
            setPreviewText(payload.data);
          } else {
            Alert.alert('Not Found', 'No QR code was detected in this photo.');
          }
        } catch (error) {
          if (!isCurrent()) return;
          Alert.alert(
            'Not Found',
            isScanEmptyError(error)
              ? 'No QR code was detected in this photo.'
              : 'Unable to analyze this image. Please try another photo.',
          );
        }
        return;
      }

      if (recognitionType === 'Barcode') {
        try {
          const results = await scanFromURLAsync(imageUri, BARCODE_TYPES);
          if (!isCurrent()) return;
          const payload = results.map(payloadFromBarcodeResult).find(Boolean);
          if (payload) {
            setPreviewText(payload.data);
          } else {
            Alert.alert('Not Found', 'No barcode was detected in this photo.');
          }
        } catch (error) {
          if (!isCurrent()) return;
          Alert.alert(
            'Not Found',
            isScanEmptyError(error)
              ? 'No barcode was detected in this photo.'
              : 'Unable to analyze this image. Please try another photo.',
          );
        }
        return;
      }

      try {
        const recognized = await ocr.recognize(imageUri);
        if (!isCurrent()) return;
        if (recognized) {
          setRecognitionType('Text');
          setPreviewText(recognized.text);
          return;
        }
        return;
      } catch (error) {
        if (!isCurrent()) return;
        if (!isOcrError(error) || error.code !== 'no_text') {
          Alert.alert('Identify Failed', ocrErrorMessage(error));
          return;
        }
      }

      const codeResults = await scanFromURLAsync(imageUri, [...QR_TYPES, ...BARCODE_TYPES]);
      if (!isCurrent()) return;
      if (codeResults[0]?.data) {
        const isQr = QR_TYPES.includes(codeResults[0].type as BarcodeType);
        setRecognitionType(isQr ? 'QRCode' : 'Barcode');
        setPreviewText(codeResults[0].data);
        return;
      }

      previewInputRef.current?.focus();
      Alert.alert('No Text Found', OCR_ERROR_MESSAGES.no_text);
    } catch {
      if (generation !== identifyGenerationRef.current) return;
      Alert.alert('Identify Failed', 'Unable to analyze this image. Please try another photo.');
    } finally {
      if (generation === identifyGenerationRef.current) {
        setIdentifying(false);
      }
    }
  };

  const handleConfirm = () => {
    if (identifying || ocr.running) return;
    const value = previewText.trim();
    if (!value) {
      Alert.alert('Nothing to add', 'Tap the read button first, or type the text in the box.');
      return;
    }

    editorBridge.ocrResult = {
      type: recognitionType,
      data: value,
    };

    if (returnToEdit) {
      goBack();
      return;
    }

    router.replace('/edit');
  };

  if (!permission) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.onAccent} />
      </View>
    );
  }

  if (!permission.granted && step === 'capture') {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} hitSlop={12} style={styles.headerSide}>
            <AppIcon name="chevron.left" tintColor={C.onAccent} size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>Scan text</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={styles.permissionBody}>
          <View style={styles.permissionIcon}>
            <AppIcon name="camera" tintColor={C.onAccent} size={40} />
          </View>
          <Text style={styles.permissionTitle}>Allow the camera</Text>
          <Text style={styles.permissionSub}>
            The camera is used only to take the photo you want to read. Nothing is saved or sent.
          </Text>
          <View style={styles.permissionList}>
            {['Printed text', 'Barcodes', 'QR codes'].map((item) => (
              <View key={item} style={styles.permissionItem}>
                <AppIcon name="checkmark" tintColor={C.onAccent} size={16} />
                <Text style={styles.permissionItemText}>{item}</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.permissionBtn, pressed && styles.pressed]}
            onPress={permission.canAskAgain ? requestPermission : () => void Linking.openSettings()}>
            <Text style={styles.permissionBtnText}>
              {permission.canAskAgain ? 'Allow camera' : 'Open Settings'}
            </Text>
          </Pressable>
          {!permission.canAskAgain ? (
            <Text style={styles.permissionNote}>
              Camera access was turned off. Switch it on in Settings, then come back.
            </Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.permissionSecondaryBtn, pressed && styles.pressed]}
            onPress={handleGalleryPick}>
            <Text style={styles.permissionSecondaryText}>Choose a photo instead</Text>
          </Pressable>
        </View>
        {imageSourceSheet}
      </View>
    );
  }

  if (step === 'capture') {
    return (
      <View style={styles.root}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setCameraReady(true)}
        />

        <View style={[styles.header, styles.captureHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={handleBack} hitSlop={12} style={styles.headerSide}>
            <AppIcon name="chevron.left" tintColor={C.onAccent} size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>Scan text</Text>
          {helpButton}
        </View>

        <View style={styles.frameArea} pointerEvents="none">
          <WalkthroughTarget id="ocr.frame" style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </WalkthroughTarget>
          <Text style={styles.frameHint}>Point at text, a barcode or a QR code</Text>
        </View>

        <View style={[styles.captureControls, { paddingBottom: insets.bottom + 28 }]}>
          <WalkthroughTarget id="ocr.torch">
            <Pressable
              onPress={() => setTorch((prev) => !prev)}
              style={({ pressed }) => [styles.captureSideBtn, pressed && styles.pressed]}
              accessibilityLabel="Flashlight"
              hitSlop={10}>
              <AppIcon
                name={torch ? 'flashlight.on.fill' : 'flashlight.off.fill'}
                tintColor={C.onAccent}
                size={26}
              />
              <Text style={styles.captureSideLabel}>{torch ? 'Light on' : 'Light'}</Text>
            </Pressable>
          </WalkthroughTarget>

          <WalkthroughTarget id="ocr.shutter">
            <Pressable
              onPress={handleCapture}
              disabled={!cameraReady || capturing}
              accessibilityLabel="Take photo"
              style={({ pressed }) => [styles.shutterOuter, pressed && styles.pressed]}>
              {capturing ? (
                <ActivityIndicator color={C.brandInk} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
          </WalkthroughTarget>

          <WalkthroughTarget id="ocr.gallery">
            <Pressable
              onPress={handleGalleryPick}
              style={({ pressed }) => [styles.captureSideBtn, pressed && styles.pressed]}
              accessibilityLabel="Choose from gallery"
              hitSlop={10}>
              <AppIcon name="photo.on.rectangle" tintColor={C.onAccent} size={26} />
              <Text style={styles.captureSideLabel}>Gallery</Text>
            </Pressable>
          </WalkthroughTarget>
        </View>
        {imageSourceSheet}
        {tourOverlay}
      </View>
    );
  }

  const busy = identifying || ocr.running;
  const heading = HEADING[recognitionType];
  const canAdd = !busy && previewText.trim().length > 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.headerSide}>
          <AppIcon name="chevron.left" tintColor={C.onAccent} size={24} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {heading}
        </Text>
        {helpButton}
      </View>

      <View style={styles.identifyBlueSection}>
        <WalkthroughTarget id="ocr.photo">
          <View style={[styles.imageFrame, { width: previewSize, height: previewSize }]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
            ) : (
              <View style={styles.previewPlaceholder} />
            )}
          </View>
        </WalkthroughTarget>
        <Pressable
          onPress={handleClear}
          hitSlop={8}
          style={({ pressed }) => [styles.retakeBtn, pressed && styles.pressed]}>
          <Text style={styles.retakeText}>Retake</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={styles.identifyWhiteSection}>
        <FormScrollView
          style={styles.formArea}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>What is in the photo?</Text>
          <WalkthroughTarget id="ocr.type">
            <TypeSegments value={recognitionType} onChange={setRecognitionType} />
          </WalkthroughTarget>

          <WalkthroughTarget id="ocr.read" style={styles.readSlot}>
            <Pressable
              onPress={handleIdentify}
              disabled={busy}
              style={({ pressed }) => [styles.readBtn, pressed && styles.pressed]}>
              {busy ? (
                <ActivityIndicator size="small" color={C.onAccent} />
              ) : (
                <Text style={styles.readBtnText}>{READ_LABEL[recognitionType]}</Text>
              )}
            </Pressable>
          </WalkthroughTarget>

          <Text style={styles.sectionLabel}>Result</Text>
          <WalkthroughTarget id="ocr.result">
            <OcrResultPanel
              inputRef={previewInputRef}
              value={previewText}
              onChangeText={setPreviewText}
              placeholder={RESULT_PLACEHOLDER[recognitionType]}
              identifying={busy}
              errorMessage={recognitionType === 'Text' ? ocr.error?.message : null}
              onCopy={() => ocr.copy(previewText)}
              onCopyError={(error) => Alert.alert('Copy Failed', ocrErrorMessage(error))}
            />
          </WalkthroughTarget>
        </FormScrollView>

        <WalkthroughTarget id="ocr.add" style={[styles.addSlot, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            onPress={handleConfirm}
            disabled={!canAdd}
            style={({ pressed }) => [
              styles.addBtn,
              !canAdd && styles.addBtnDisabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.addBtnText}>Add to label</Text>
          </Pressable>
        </WalkthroughTarget>
      </KeyboardAvoidingView>
      {tourOverlay}
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.header,
  },
  centered: {
    flex: 1,
    backgroundColor: c.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: c.header,
    zIndex: 10,
  },
  captureHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(33, 70, 104, 0.35)', // theme-fixed: overlay on photo
  },
  headerSide: {
    width: 72,
    height: 40,
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    flexShrink: 1,
    color: c.onAccent,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
  },
  permissionBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  permissionIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.14)', // theme-fixed: white tint on the blue header
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  permissionTitle: {
    color: c.onAccent,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionSub: {
    color: 'rgba(255,255,255,0.8)', // theme-fixed: white on the blue header
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  permissionList: {
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)', // theme-fixed: white tint on the blue header
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  permissionItemText: {
    flexShrink: 1,
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '500',
  },
  permissionBtn: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: c.brandInk,
    fontSize: 16,
    fontWeight: '700',
  },
  permissionNote: {
    color: 'rgba(255,255,255,0.75)', // theme-fixed: white on the blue header
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  permissionSecondaryBtn: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionSecondaryText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  captureControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
    zIndex: 10,
  },
  captureSideBtn: {
    width: 64,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.surface,
  },
  identifyBlueSection: {
    backgroundColor: c.header,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
    alignItems: 'center',
  },
  imageFrame: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: c.surface,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    backgroundColor: c.surface,
  },
  retakeBtn: {
    marginTop: 12,
    minHeight: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  identifyWhiteSection: {
    flex: 1,
    backgroundColor: c.surface,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  formArea: {
    flex: 1,
  },
  formContent: {
    paddingBottom: 24,
  },
  addSlot: {
    paddingTop: 10,
  },
  sectionLabel: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  segments: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: c.fillStrong,
    padding: 3,
  },
  segment: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: c.accentFill,
  },
  segmentText: {
    color: c.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: c.onAccent,
    fontWeight: '600',
  },
  readSlot: {
    marginTop: 14,
    marginBottom: 18,
  },
  readBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBtnText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  addBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    color: c.onAccent,
    fontSize: 17,
    fontWeight: '700',
  },
  frameArea: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  frame: {
    width: '78%',
    aspectRatio: 1.3,
  },
  frameHint: {
    marginTop: 18,
    color: '#FFFFFF', // theme-fixed: white on camera feed
    fontSize: 15,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)', // theme-fixed: legibility on camera feed
    textShadowRadius: 4,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#FFFFFF', // theme-fixed: white on camera feed
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  captureSideLabel: {
    marginTop: 4,
    color: c.onAccent,
    fontSize: 12,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.72,
  },
}));
