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
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

function RadioOption({
  label,
  selected,
  onPress,
}: {
  label: OcrResultType;
  selected: boolean;
  onPress: () => void;
}) {
  useThemeRefresh();
  return (
    <Pressable onPress={onPress} style={styles.radioRow} hitSlop={6}>
      <View style={[styles.radioOuter, selected && styles.radioOuterActive]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={[styles.radioLabel, selected && styles.radioLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export default function OcrScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const previewSize = ocrPreviewSize(useWindowDimensions().width);
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

  const goBack = useCallback(() => {
    if (step === 'identify') {
      cancelIdentify();
      setStep('capture');
      setPreviewText('');
      return;
    }
    goBack();
  }, [cancelIdentify, step]);

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

  const handleChooseType = () => {
    Alert.alert('Choose Type', 'Select what you want to identify in the photo.', [
      { text: 'Text', onPress: () => setRecognitionType('Text') },
      { text: 'Barcode', onPress: () => setRecognitionType('Barcode') },
      { text: 'QRCode', onPress: () => setRecognitionType('QRCode') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleIdentify = async () => {
    if (!imageUri) {
      Alert.alert('No Image', 'Capture or choose a photo first.');
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
      Alert.alert('Required', 'Identify content first or enter text in the preview field.');
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
          <Pressable onPress={() => goBack()} hitSlop={12} style={styles.headerSide}>
            <AppIcon name="chevron.left" tintColor={C.onAccent} size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>OCR</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={styles.permissionBody}>
          <Text style={styles.permissionTitle}>Camera Permission Needed</Text>
          <Text style={styles.permissionSub}>
            Allow camera access to capture label text, barcodes, and QR codes for OCR.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.permissionBtn, pressed && styles.pressed]}
            onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Allow Camera Access</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.permissionSecondaryBtn, pressed && styles.pressed]}
            onPress={handleGalleryPick}>
            <Text style={styles.permissionSecondaryText}>Choose Photo Instead</Text>
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
          <Pressable onPress={() => goBack()} hitSlop={12} style={styles.headerSide}>
            <AppIcon name="chevron.left" tintColor={C.onAccent} size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>OCR</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={[styles.captureControls, { paddingBottom: insets.bottom + 28 }]}>
          <Pressable
            onPress={() => setTorch((prev) => !prev)}
            style={({ pressed }) => [styles.captureSideBtn, pressed && styles.pressed]}
            hitSlop={10}>
            <AppIcon
              name={torch ? 'flashlight.on.fill' : 'flashlight.off.fill'}
              tintColor={C.onAccent}
              size={28}
            />
          </Pressable>

          <Pressable
            onPress={handleCapture}
            disabled={!cameraReady || capturing}
            style={({ pressed }) => [styles.shutterOuter, pressed && styles.pressed]}>
            {capturing ? (
              <ActivityIndicator color={C.brandInk} />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>

          <Pressable
            onPress={handleGalleryPick}
            style={({ pressed }) => [styles.captureSideBtn, pressed && styles.pressed]}
            hitSlop={10}>
            <AppIcon name="photo.on.rectangle" tintColor={C.onAccent} size={28} />
          </Pressable>
        </View>
        {imageSourceSheet}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.headerSide}>
          <AppIcon name="chevron.left" tintColor={C.onAccent} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>OCR</Text>
        <Pressable
          onPress={handleConfirm}
          disabled={identifying || ocr.running}
          hitSlop={10}
          style={[styles.headerSide, styles.headerSideRight]}>
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </View>

      <View style={styles.identifyBlueSection}>
        <View style={[styles.imageFrame, { width: previewSize, height: previewSize }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <View style={styles.previewPlaceholder} />
          )}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleIdentify}
            disabled={identifying || ocr.running}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            {identifying || ocr.running ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Text style={styles.actionIdentifyText}>Identify</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionClearText}>Clear</Text>
          </Pressable>

          <Pressable
            onPress={handleChooseType}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
            <Text style={styles.actionIdentifyText}>Choose Type</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.identifyWhiteSection, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.typeRow}>
          <RadioOption
            label="Text"
            selected={recognitionType === 'Text'}
            onPress={() => setRecognitionType('Text')}
          />
          <RadioOption
            label="Barcode"
            selected={recognitionType === 'Barcode'}
            onPress={() => setRecognitionType('Barcode')}
          />
          <RadioOption
            label="QRCode"
            selected={recognitionType === 'QRCode'}
            onPress={() => setRecognitionType('QRCode')}
          />
        </View>

        <OcrResultPanel
          inputRef={previewInputRef}
          value={previewText}
          onChangeText={setPreviewText}
          identifying={identifying || ocr.running}
          errorMessage={recognitionType === 'Text' ? ocr.error?.message : null}
          onCopy={() => ocr.copy(previewText)}
          onCopyError={(error) => Alert.alert('Copy Failed', ocrErrorMessage(error))}
        />

        <Text style={styles.effectPreviewLabel}>Effect Preview</Text>
      </KeyboardAvoidingView>
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
    gap: 16,
  },
  permissionTitle: {
    color: c.onAccent,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionSub: {
    color: 'rgba(255,255,255,0.75)', // theme-fixed: white on photo / dark overlay
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  permissionBtn: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  permissionSecondaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)', // theme-fixed: white on photo / dark overlay
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionSecondaryText: {
    color: 'rgba(255,255,255,0.85)', // theme-fixed: white on photo / dark overlay
    fontSize: 15,
    fontWeight: '500',
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
    width: 52,
    height: 52,
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
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  actionBtn: {
    minWidth: 88,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionIdentifyText: {
    color: c.accent,
    fontSize: 16,
    fontWeight: '500',
  },
  actionClearText: {
    color: c.danger,
    fontSize: 16,
    fontWeight: '500',
  },
  identifyWhiteSection: {
    flex: 1,
    backgroundColor: c.surface,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: c.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.accentFill,
  },
  radioLabel: {
    fontSize: 15,
    color: c.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },
  radioLabelActive: {
    color: c.accent,
    fontWeight: '600',
  },
  effectPreviewLabel: {
    textAlign: 'center',
    color: c.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.72,
  },
}));
