import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';

type AdvancedConnectProps = {
  modelName: string;
  accent: string;
  mac: string;
  onMacChange: (value: string) => void;
  onMacConnect: () => void;
  macBusy: boolean;
  showWifi: boolean;
  wifiIp: string;
  onWifiChange: (value: string) => void;
  onWifiConnect: () => void;
  wifiBusy: boolean;
  backendLabel: string;
  lastDevice: { id: string; name: string } | null;
  onReconnectLast: () => void;
  onDiagnostics: () => void;
};

export function AdvancedConnect({
  modelName,
  accent,
  mac,
  onMacChange,
  onMacConnect,
  macBusy,
  showWifi,
  wifiIp,
  onWifiChange,
  onWifiConnect,
  wifiBusy,
  backendLabel,
  lastDevice,
  onReconnectLast,
  onDiagnostics,
}: AdvancedConnectProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>More options</Text>
          <Text style={styles.sub}>Reconnect, enter a MAC, or use Wi‑Fi</Text>
        </View>
        <AppIcon
          name={open ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'}
          tintColor={Palette.muted}
          size={14}
        />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {lastDevice ? (
            <Pressable
              onPress={onReconnectLast}
              style={({ pressed }) => [styles.reconnect, pressed && styles.pressed]}>
              <Text style={styles.label}>Last {modelName}</Text>
              <Text style={styles.value}>{lastDevice.name || lastDevice.id}</Text>
              <Text style={[styles.action, { color: accent }]}>Reconnect</Text>
            </Pressable>
          ) : null}

          <Text style={styles.label}>Connect by MAC address</Text>
          <Text style={styles.help}>From phone Bluetooth settings, copy the printer address.</Text>
          <TextInput
            value={mac}
            onChangeText={onMacChange}
            placeholder="AA:BB:CC:DD:EE:FF"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable
            onPress={onMacConnect}
            disabled={macBusy}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: accent },
              macBusy && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {macBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Connect {modelName}</Text>}
          </Pressable>

          {showWifi ? (
            <>
              <Text style={styles.label}>Wi‑Fi printer</Text>
              <Text style={styles.help}>Same network as the phone. Backend {backendLabel}.</Text>
              <TextInput
                value={wifiIp}
                onChangeText={onWifiChange}
                placeholder="192.168.1.50"
                placeholderTextColor="#94A3B8"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                style={styles.input}
              />
              <Pressable
                onPress={onWifiConnect}
                disabled={wifiBusy}
                style={({ pressed }) => [styles.outline, wifiBusy && styles.disabled, pressed && styles.pressed]}>
                {wifiBusy ? (
                  <ActivityIndicator color={Palette.accent} />
                ) : (
                  <Text style={styles.outlineText}>Connect on Wi‑Fi</Text>
                )}
              </Pressable>
            </>
          ) : null}

          <Pressable onPress={onDiagnostics} style={({ pressed }) => [styles.diag, pressed && styles.pressed]}>
            <Text style={styles.outlineText}>Connection diagnostics</Text>
            <AppIcon name="chevron.right" tintColor={Palette.accent} size={14} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    gap: 12,
  },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: Palette.ink },
  sub: { fontSize: 13, color: Palette.muted },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: 8 },
  label: { marginTop: 6, fontSize: 13, fontWeight: '700', color: Palette.ink },
  help: { fontSize: 13, lineHeight: 18, color: Palette.muted },
  value: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  reconnect: { gap: 2, paddingVertical: 8 },
  action: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Palette.ink,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  outline: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { color: Palette.accent, fontSize: 14, fontWeight: '700' },
  diag: {
    marginTop: 6,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.72 },
});
