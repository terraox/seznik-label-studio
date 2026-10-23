import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';

import {
  CONSUMER_PRINTER_LIST,
  toDriverModel,
  type ConsumerPrinter,
  type ConsumerPrinterId,
  type SeznikPrinterModelId,
} from '@/constants/printer-models';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

interface SeznikPrinterGridProps {
  onSelectModel?: (model: ConsumerPrinter) => void;
  selectedModelId?: ConsumerPrinterId | null;
  onTestPrint?: (model: ConsumerPrinter) => void | Promise<void>;
  onDisconnect?: (model: ConsumerPrinter) => void | Promise<void>;
  compact?: boolean;
}

export const SeznikPrinterGrid: React.FC<SeznikPrinterGridProps> = ({
  onSelectModel,
  selectedModelId,
  onTestPrint,
  onDisconnect,
  compact = false,
}) => {
  useThemeRefresh();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const activeModelId = usePrinterStore((s) => s.selectedPrinterModel);
  const setSelectedPrinterModel = usePrinterStore((s) => s.setSelectedPrinterModel);
  const clearConnection = usePrinterStore((s) => s.clearConnection);

  const [connectedSdk, setConnectedSdk] = useState<SeznikPrinterModelId | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const refreshSdkStates = useCallback(() => {
    const mgr = getPrinterManager();
    if (mgr.isModelConnected('td404')) {
      setConnectedSdk('td404');
    } else if (mgr.isModelConnected('josh')) {
      setConnectedSdk('josh');
    } else if (mgr.isModelConnected('dev')) {
      setConnectedSdk('dev');
    } else if (mgr.isModelConnected('tez')) {
      setConnectedSdk('tez');
    } else if (mgr.isModelConnected('labelx')) {
      setConnectedSdk('labelx');
    } else if (status === 'connected') {
      setConnectedSdk(activeModelId);
    } else {
      setConnectedSdk(null);
    }
  }, [status, activeModelId]);

  useEffect(() => {
    refreshSdkStates();
    const interval = setInterval(refreshSdkStates, 2500);
    return () => clearInterval(interval);
  }, [refreshSdkStates]);

  const getModelStatus = (model: ConsumerPrinter) => {
    const driver = toDriverModel(model.id);
    if (connectedSdk === driver && (status === 'connected' || getPrinterManager().isModelConnected(driver))) {
      return 'connected';
    }
    return 'disconnected';
  };

  const handleSelect = async (model: ConsumerPrinter) => {
    setSelectedPrinterModel(model.id);
    if (onSelectModel) {
      onSelectModel(model);
    }
  };

  const handleInternalDisconnect = async (model: ConsumerPrinter) => {
    setIsDisconnecting(true);
    try {
      if (onDisconnect) {
        await onDisconnect(model);
      } else {
        await getPrinterManager().disconnect();
      }
      setConnectedSdk(null);
      clearConnection();
    } catch {
      // Ignored
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleInternalTestPrint = async (model: ConsumerPrinter) => {
    setIsTesting(true);
    try {
      if (onTestPrint) {
        await onTestPrint(model);
      } else {
        const mgr = getPrinterManager();
        await mgr.printTestLabel();
        Alert.alert('Test Label Sent!', `Test pattern transmitted to ${model.name}.`);
      }
    } catch (err: any) {
      Alert.alert(
        'Print Error',
        err?.message || 'Failed to print test pattern. Please verify printer connection and label roll.',
      );
    } finally {
      setIsTesting(false);
    }
  };

  const currentSelection = selectedModelId ?? activeModelId;

  return (
    <View style={styles.container}>
      {CONSUMER_PRINTER_LIST.map((model) => {
        const modelConnected = getModelStatus(model) === 'connected';
        const isSelected = currentSelection === model.id;

        return (
          <View
            key={model.id}
            style={[
              styles.modelCard,
              isSelected && styles.modelCardSelected,
              modelConnected && styles.modelCardConnected,
            ]}>
            <Pressable
              onPress={() => handleSelect(model)}
              style={({ pressed }) => [styles.cardHeader, pressed && styles.cardPressed]}>
              {/* Icon Container */}
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: model.accentSoft },
                ]}>
                <AppIcon
                  name="printer"
                  tintColor={model.accent}
                  size={compact ? 20 : 24}
                />
              </View>

              {/* Info Container */}
              <View style={styles.infoContainer}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.modelName}>
                    {model.name}
                  </Text>
                  <View
                    style={[
                      styles.typeBadge,
                      {
                        backgroundColor: model.accentSoft,
                        borderColor: model.accentBorder,
                      },
                    ]}>
                    <Text style={[styles.typeBadgeText, { color: model.accent }]}>
                      {model.shortName}
                    </Text>
                  </View>
                </View>

                <Text numberOfLines={1} style={styles.tagline}>
                  {model.tagline}
                </Text>

                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: modelConnected ? C.successFill : isSelected ? C.accentFill : C.textMuted },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: modelConnected ? C.success : isSelected ? C.accent : C.textSecondary },
                    ]}>
                    {modelConnected
                      ? `Connected: ${deviceName ?? model.name}`
                      : isSelected
                      ? 'Selected — Tap to Scan & Link'
                      : 'Ready to Connect'}
                  </Text>
                </View>
              </View>

              {/* Action Arrow / Check */}
              <View style={styles.actionArrow}>
                {modelConnected ? (
                  <AppIcon name="checkmark.circle.fill" tintColor={C.success} size={22} />
                ) : (
                  <AppIcon name="chevron.right" tintColor={isSelected ? C.accent : C.textMuted} size={18} />
                )}
              </View>
            </Pressable>

            {/* Connected Action Buttons */}
            {modelConnected && (
              <View style={styles.connectedActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.testPrintBtn, pressed && styles.btnPressed]}
                  onPress={() => handleInternalTestPrint(model)}
                  disabled={isTesting}>
                  {isTesting ? (
                    <ActivityIndicator size="small" color={C.link} />
                  ) : (
                    <>
                      <AppIcon name="printer" tintColor={C.link} size={15} />
                      <Text style={styles.testPrintBtnText}>Test Print</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.disconnectBtn, pressed && styles.btnPressed]}
                  onPress={() => handleInternalDisconnect(model)}
                  disabled={isDisconnecting}>
                  {isDisconnecting ? (
                    <ActivityIndicator size="small" color={C.danger} />
                  ) : (
                    <>
                      <AppIcon name="xmark" tintColor={C.danger} size={14} />
                      <Text style={styles.disconnectBtnText}>Disconnect</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {!modelConnected && !compact && model.howToConnect ? (
              <View style={[styles.warningBox, { borderColor: model.accentBorder }]}>
                <Text style={styles.warningText}>{model.howToConnect}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = themedStyles((c) => ({
  container: {
    gap: 12,
  },
  modelCard: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: c.hairline,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  modelCardSelected: {
    borderColor: c.accent,
    borderWidth: 1.5,
    backgroundColor: c.fill,
  },
  modelCardConnected: {
    borderColor: c.success,
    borderWidth: 1.5,
    backgroundColor: c.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardPressed: {
    opacity: 0.75,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 12,
    color: c.textSecondary,
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  actionArrow: {
    marginLeft: 8,
  },
  connectedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  testPrintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.border,
    gap: 6,
  },
  testPrintBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.link,
  },
  disconnectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: c.dangerSoft,
    borderWidth: 1,
    borderColor: c.dangerSoft,
    gap: 6,
  },
  disconnectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.danger,
  },
  btnPressed: {
    opacity: 0.7,
  },
  warningBox: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: c.fill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  warningText: {
    fontSize: 11,
    color: c.textSecondary,
    lineHeight: 15,
  },
}));
