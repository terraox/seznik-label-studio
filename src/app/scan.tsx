import { router, useLocalSearchParams } from 'expo-router';
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IosAlertModal, IosAlertInput } from '@/components/ui/ios-alert-modal';
import { editorBridge } from '@/constants/editor-bridge';
import { cloneLabelFromImage } from '@/lib/label-clone';
import { clampLabelMm } from '@/lib/label-geometry';
import { isScanEmptyError, payloadFromBarcodeResult, SCAN_CODE_TYPES } from '@/lib/scan-codes';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_FRAME_SIZE = Math.min(Math.round(SCREEN_WIDTH * 0.72), 280);
const CORNER_COLOR = '#A3E635'; // Lime green matching screenshot // theme-fixed: camera overlay
const CORNER_LENGTH = 28;
const CORNER_THICKNESS = 4.5;

/** SVG-less clean lightbulb icon */
function LightbulbIcon({ active = false, size = 38 }: { active?: boolean; size?: number }) {
  useThemeRefresh();
  const color = active ? '#FFD600' : '#FFFFFF'; // theme-fixed: camera overlay
  return (
    <View style={[styles.bulbContainer, { width: size, height: size }]}>
      {/* Bulb head */}
      <View
        style={[
          styles.bulbHead,
          {
            borderColor: color,
            backgroundColor: active ? 'rgba(255, 214, 0, 0.25)' : 'transparent', // theme-fixed: camera overlay
          },
        ]}
      />
      {/* Bulb base */}
      <View style={[styles.bulbBase, { borderColor: color }]} />
      <View style={[styles.bulbThread, { backgroundColor: color }]} />
      {/* Glow rays if active */}
      {active && (
        <>
          <View style={[styles.glowRay, styles.glowTop, { backgroundColor: color }]} />
          <View style={[styles.glowRay, styles.glowLeft, { backgroundColor: color }]} />
          <View style={[styles.glowRay, styles.glowRight, { backgroundColor: color }]} />
        </>
      )}
    </View>
  );
}

export default function ScanScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string | string[]; mode?: string | string[] }>();
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const isLabelClone = modeParam === 'labelClone';
  const returnToEdit = fromParam === 'edit';
  const screenTitle = isLabelClone ? 'Label Clone' : 'Scan';
  const defaults = useSettingsStore((s) => s.defaults);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scannedResult, setScannedResult] = useState<{ type: string; data: string } | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [scanCooldown, setScanCooldown] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();

  // Animated laser scan bar
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startScanAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startScanAnimation();
  }, [scanLineAnim]);

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_FRAME_SIZE - 6],
  });

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanCooldown || scannedResult) return;
    const payload = payloadFromBarcodeResult(result);
    if (!payload) return;
    setScanCooldown(true);
    setScannedResult(payload);
  };

  const openLabelFromImage = async (uri: string, width: number, height: number) => {
    router.replace({
      pathname: '/new-label-setup',
      params: {
        importImageUri: uri,
        importImageWidth: String(width || 0),
        importImageHeight: String(height || 0),
        isSingleCanvas: 'true',
      },
    });
  };

  const processLabelCloneImage = async (uri: string, width: number, height: number) => {
    if (cloning) return;
    setCloning(true);
    try {
      const size = clampLabelMm(defaults.labelWidth || 50, defaults.labelHeight || 30);
      const doc = await cloneLabelFromImage({
        uri,
        width,
        height,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        paperType: defaults.paperType,
      });
      if (doc) {
        upsertDocument(doc);
        router.replace({ pathname: '/edit', params: { labelId: doc.id } });
        return;
      }
      Alert.alert(
        'Could not rebuild this label',
        'No readable text, QR, or barcode was found. Import the photo as your label design instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import Label Image',
            onPress: () => {
              void openLabelFromImage(uri, width, height);
            },
          },
        ],
      );
    } catch {
      Alert.alert('Error', 'Unable to clone this photo. Try another image, or import the label image directly.');
    } finally {
      setCloning(false);
    }
  };

  const handleCaptureLabel = async () => {
    if (!isLabelClone || !cameraRef.current || capturing || cloning) return;
    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });
      if (!photo?.uri) return;
      await processLabelCloneImage(photo.uri, photo.width ?? 0, photo.height ?? 0);
    } catch {
      Alert.alert('Capture Failed', 'Unable to take a photo. Please try again, or pick one from the gallery.');
    } finally {
      setCapturing(false);
    }
  };

  const handleImportLabelFromImage = async () => {
    try {
      const asset = await pickImageAsset();
      if (!asset) return;
      await processLabelCloneImage(asset.uri, asset.width, asset.height);
    } catch {
      Alert.alert('Error', 'Unable to open this image. Try another photo.');
    }
  };

  const handlePhotoPick = async () => {
    try {
      const asset = await pickImageAsset();
      if (!asset) return;
      if (isLabelClone) {
        await processLabelCloneImage(asset.uri, asset.width, asset.height);
        return;
      }

      const results = await scanFromURLAsync(asset.uri, SCAN_CODE_TYPES);
      const payload = results.map(payloadFromBarcodeResult).find(Boolean);
      if (payload) {
        setScannedResult(payload);
        return;
      }
      Alert.alert(
        'Nothing Detected',
        'No barcode or QR code was found in this photo. Try a closer, sharper photo of just the code, or enter it manually.',
      );
    } catch (error) {
      if (isScanEmptyError(error)) {
        Alert.alert(
          'Nothing Detected',
          'No barcode or QR code was found in this photo. Try a closer, sharper photo of just the code, or enter it manually.',
        );
        return;
      }
      Alert.alert('Error', 'Unable to read this photo. Try another image, or enter the code manually.');
    }
  };

  const handleManualSubmit = () => {
    if (!manualInput.trim()) {
      Alert.alert('Required', 'Please enter a barcode number or text');
      return;
    }
    const val = manualInput.trim();
    setManualModalVisible(false);
    setManualInput('');
    setScannedResult({ type: 'MANUAL', data: val });
  };

  const handleScanAgain = () => {
    setScannedResult(null);
    setTimeout(() => {
      setScanCooldown(false);
    }, 800);
  };

  const handleUseInEditor = () => {
    if (!scannedResult) return;

    editorBridge.scanResult = scannedResult;
    setScannedResult(null);

    if (returnToEdit) {
      router.back();
      return;
    }

    router.replace('/edit');
  };

  const handlePrintScanned = () => {
    if (!scannedResult) return;

    const payload = scannedResult;
    setScannedResult(null);
    router.replace({
      pathname: '/print',
      params: {
        scanType: payload.type,
        scanData: payload.data,
      },
    });
  };

  // Permission Request State
  if (!permission) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.onAccent} />
        <Text style={styles.permissionText}>Initializing camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{screenTitle}</Text>
          <View style={styles.headerRightPlaceholder} />
        </View>

        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <Text style={styles.cameraEmoji}>📷</Text>
          </View>
          <Text style={styles.permissionHeading}>Camera Permission Needed</Text>
          <Text style={styles.permissionSub}>
            {isLabelClone
              ? 'Please enable camera access so you can photograph a label and clone its text, QR, barcode, and border.'
              : 'Please enable camera access so Sez Print can scan barcodes, QR codes, and label tags.'}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.btnPressed]}
            onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Allow Camera Access</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.btnPressed]}
            onPress={() => setManualModalVisible(true)}>
            <Text style={styles.secondaryButtonText}>Enter Barcode Manually</Text>
          </Pressable>

          {isLabelClone ? (
            <Pressable
              style={({ pressed }) => [styles.importLabelButton, pressed && styles.btnPressed]}
              onPress={() => {
                void handleImportLabelFromImage();
              }}>
              <Text style={styles.importLabelButtonText}>Import Label from Image</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Manual Modal Fallback */}
        <IosAlertModal
          visible={manualModalVisible}
          onClose={() => setManualModalVisible(false)}
          title="Enter Barcode Manually"
          buttons={[
            { text: 'Cancel', style: 'cancel', onPress: () => setManualModalVisible(false) },
            { text: 'Done', style: 'default', bold: true, onPress: handleManualSubmit },
          ]}>
          <IosAlertInput
            placeholder="Enter barcode or serial number"
            value={manualInput}
            onChangeText={setManualInput}
            autoFocus
          />
        </IosAlertModal>
        {imageSourceSheet}
      </View>
    );
  }

  const topMaskHeight = Math.max((SCREEN_HEIGHT - SCAN_FRAME_SIZE) / 2 - 40, insets.top + 70);

  return (
    <View style={styles.container}>
      {/* Real Camera View */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        onCameraReady={() => setCameraReady(true)}
        barcodeScannerSettings={
          isLabelClone ? undefined : { barcodeTypes: SCAN_CODE_TYPES }
        }
        onBarcodeScanned={
          isLabelClone || scannedResult ? undefined : handleBarcodeScanned
        }
      />

      {/* Dark Mask Surrounding Scan Viewfinder */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Top Dark Mask */}
        <View style={[styles.maskDark, { height: topMaskHeight }]} />

        {/* Middle Row */}
        <View style={{ flexDirection: 'row', height: SCAN_FRAME_SIZE }}>
          <View style={[styles.maskDark, { flex: 1 }]} />
          {/* Central Cutout Frame */}
          <View style={styles.scanBox}>
            {/* 4 Lime-Green Corner Brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Animated Green Scanning Laser Line */}
            <Animated.View
              style={[
                styles.scanLaser,
                {
                  transform: [{ translateY }],
                },
              ]}
            />
          </View>
          <View style={[styles.maskDark, { flex: 1 }]} />
        </View>

        {/* Bottom Dark Mask */}
        <View style={[styles.maskDark, styles.maskBottom]}>
          {isLabelClone ? null : (
          <Pressable
            style={({ pressed }) => [styles.manualEntryBtn, pressed && styles.btnPressed]}
            onPress={() => setManualModalVisible(true)}>
            <Text style={styles.manualEntryText}>If not recognized, enter manually</Text>
          </Pressable>
          )}
          {isLabelClone ? (
            <>
              <Pressable
                onPress={() => void handleCaptureLabel()}
                disabled={!cameraReady || capturing || cloning}
                style={({ pressed }) => [styles.cloneShutter, pressed && styles.btnPressed]}>
                {capturing || cloning ? (
                  <ActivityIndicator color={C.text} />
                ) : (
                  <View style={styles.cloneShutterInner} />
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.importLabelBtn, pressed && styles.btnPressed]}
                onPress={() => {
                  void handleImportLabelFromImage();
                }}>
                <Text style={styles.importLabelBtnText}>Import Label from Image</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {/* Top Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={14} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{screenTitle}</Text>
        <Pressable onPress={handlePhotoPick} hitSlop={14} style={styles.photoButton}>
          <Text style={styles.photoText}>{isLabelClone ? 'Gallery' : 'Photo'}</Text>
        </Pressable>
      </View>

      {/* Bottom Torch / Flashlight Section */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 26 }]}>
        <Pressable
          style={({ pressed }) => [styles.torchButton, pressed && styles.btnPressed]}
          onPress={() => setTorch((prev) => !prev)}>
          <LightbulbIcon active={torch} size={36} />
          <Text style={[styles.torchText, torch && styles.torchTextActive]}>
            {torch ? 'Touch to Turn Off' : 'Touch and Light Up'}
          </Text>
        </Pressable>
      </View>

      {/* Manual Entry Modal */}
      <IosAlertModal
        visible={manualModalVisible}
        onClose={() => {
          setManualModalVisible(false);
          setManualInput('');
        }}
        title="Enter Barcode Manually"
        buttons={[
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setManualModalVisible(false);
              setManualInput('');
            },
          },
          { text: 'Confirm', style: 'default', bold: true, onPress: handleManualSubmit },
        ]}>
        <IosAlertInput
          placeholder="e.g. 8901234567890"
          value={manualInput}
          onChangeText={setManualInput}
          autoCapitalize="none"
          autoFocus
        />
      </IosAlertModal>

      {/* Scan Result Modal */}
      <Modal
        visible={!!scannedResult}
        transparent
        animationType="slide"
        onRequestClose={handleScanAgain}>
        <View style={styles.resultBackdrop}>
          <View style={[styles.resultCard, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.resultHeader}>
              <View style={styles.successBadge}>
                <Text style={styles.successCheck}>✓</Text>
              </View>
              <Text style={styles.resultHeading}>{isLabelClone ? 'Code Scanned' : 'Label Scanned'}</Text>
              <Text style={styles.resultTypeTag}>{scannedResult?.type?.toUpperCase() ?? 'CODE'}</Text>
            </View>

            <View style={styles.resultContentBox}>
              <Text style={styles.resultLabel}>Scanned Content:</Text>
              <Text style={styles.resultDataText} numberOfLines={3} selectable>
                {scannedResult?.data}
              </Text>
            </View>

            <View style={styles.resultActions}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.primaryActionBtn, pressed && styles.btnPressed]}
                onPress={handleUseInEditor}>
                <Text style={styles.primaryActionText}>
                  {returnToEdit
                    ? 'Use in Label Editor'
                    : isLabelClone
                      ? 'Create Label from Scan'
                      : 'Open in Label Editor'}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.secondaryActionBtn, pressed && styles.btnPressed]}
                onPress={handlePrintScanned}>
                <Text style={styles.secondaryActionText}>Print Label</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.cancelActionBtn, pressed && styles.btnPressed]}
                onPress={handleScanAgain}>
                <Text style={styles.cancelActionText}>Scan Another</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {imageSourceSheet}
      {cloning ? (
        <View style={styles.cloningOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={C.onAccent} />
          <Text style={styles.cloningText}>Rebuilding label…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  container: {
    flex: 1,
    backgroundColor: '#000000', // theme-fixed: camera background
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000000', // theme-fixed: camera background
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  maskDark: {
    backgroundColor: c.scrim,
  },
  maskBottom: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#101419', // theme-fixed: camera chrome
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permissionIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B', // theme-fixed: camera chrome
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  cameraEmoji: {
    fontSize: 40,
  },
  permissionHeading: {
    color: c.onAccent,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  permissionSub: {
    color: c.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  permissionText: {
    color: c.onAccent,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: c.accentFill,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: c.text,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: c.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: c.scrim,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backChevron: {
    color: c.onAccent,
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 38,
  },
  headerTitle: {
    color: c.onAccent,
    fontSize: 19,
    fontWeight: '600',
  },
  photoButton: {
    minWidth: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  photoText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '500',
  },
  headerRightPlaceholder: {
    width: 44,
  },
  scanBox: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  // Lime green corner brackets
  corner: {
    position: 'absolute',
    width: CORNER_LENGTH,
    height: CORNER_LENGTH,
    borderColor: CORNER_COLOR,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 3,
  },
  // Sweeping laser
  scanLaser: {
    width: '100%',
    height: 2.5,
    backgroundColor: '#A3E635', // theme-fixed: camera overlay
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  manualEntryBtn: {
    borderWidth: 1,
    borderColor: c.surface,
    backgroundColor: c.scrim,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  manualEntryText: {
    color: c.onAccent,
    fontSize: 13.5,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  importLabelBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  importLabelBtnText: {
    color: c.onAccent,
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  importLabelButton: {
    backgroundColor: c.accentFill,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
  },
  importLabelButtonText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  torchText: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  torchTextActive: {
    color: '#FFD600', // theme-fixed: camera overlay
    fontWeight: '600',
  },
  // Lightbulb Icon Graphics
  bulbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bulbHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  bulbBase: {
    width: 10,
    height: 6,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    marginTop: -2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  bulbThread: {
    width: 6,
    height: 2,
    borderRadius: 1,
    marginTop: 1,
  },
  glowRay: {
    position: 'absolute',
    borderRadius: 1,
  },
  glowTop: {
    top: 0,
    width: 2,
    height: 5,
  },
  glowLeft: {
    left: 2,
    top: 14,
    width: 5,
    height: 2,
  },
  glowRight: {
    right: 2,
    top: 14,
    width: 5,
    height: 2,
  },
  // Manual Entry Dialog
  modalBackdrop: {
    flex: 1,
    backgroundColor: c.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 22,
    ...Platform.select({
      ios: {
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: c.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.fill,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: c.fill,
  },
  modalSubmitBtn: {
    backgroundColor: c.accentFill,
  },
  modalCancelText: {
    color: c.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  modalSubmitText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  // Result Modal
  resultBackdrop: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'flex-end',
  },
  resultCard: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  resultHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successCheck: {
    color: c.success,
    fontSize: 24,
    fontWeight: '700',
  },
  resultHeading: {
    fontSize: 19,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  resultTypeTag: {
    fontSize: 11,
    fontWeight: '600',
    color: c.accent,
    backgroundColor: c.fillStrong,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  resultContentBox: {
    backgroundColor: c.fill,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.hairline,
    padding: 14,
    marginBottom: 20,
  },
  resultLabel: {
    fontSize: 12,
    color: c.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  resultDataText: {
    fontSize: 16,
    color: c.text,
    fontWeight: '600',
  },
  resultActions: {
    gap: 10,
  },
  actionBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionBtn: {
    backgroundColor: c.accentFill,
  },
  primaryActionText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.border,
  },
  secondaryActionText: {
    color: c.link,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelActionBtn: {
    backgroundColor: c.fill,
  },
  cancelActionText: {
    color: c.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  btnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  cloneShutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', // theme-fixed: camera overlay
  },
  cloneShutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.surface,
  },
  cloningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 20,
  },
  cloningText: {
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
}));
