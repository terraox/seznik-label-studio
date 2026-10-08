/**
 * Dev-only file picker diagnostics for Android local vs Drive behaviour.
 * Route: /file-picker-diagnostics
 */

import { getFilePickerDiagnostics } from 'local-file-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import type { FilePickerDiagnostics } from 'local-file-picker';

export default function FilePickerDiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FilePickerDiagnostics | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS !== 'android') {
        setError('File picker diagnostics are Android-only.');
        setData(null);
        return;
      }
      const diagnostics = await getFilePickerDiagnostics();
      if (!diagnostics) {
        setError('LocalFilePicker native module is not linked. Rebuild with npx expo run:android.');
        setData(null);
        return;
      }
      setData(diagnostics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load diagnostics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="chevron-back" size={22} tintColor="#111" />
        </Pressable>
        <Text style={styles.title}>File picker diagnostics</Text>
        <Pressable onPress={() => void load()} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#208AEF" />
        </View>
      ) : error ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.error}>{error}</Text>
        </ScrollView>
      ) : data ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <Section title="Device">
            <Line label="Manufacturer" value={data.manufacturer} />
            <Line label="Model" value={data.model} />
            <Line label="SDK" value={String(data.sdkInt)} />
            <Line
              label="expo-document-picker patch compiled"
              value={data.expoDocumentPickerPatched ? 'yes' : 'no'}
            />
          </Section>

          {data.intents.map((intent) => (
            <Section key={intent.name} title={intent.name}>
              <Line label="Default package" value={intent.defaultPackage ?? '(none)'} />
              <Line label="Default label" value={intent.defaultLabel ?? '(none)'} />
              <Line label="Default activity" value={intent.defaultActivity ?? '(none)'} />
              <Text style={styles.subheading}>Handlers ({intent.handlers.length})</Text>
              {intent.handlers.length === 0 ? (
                <Text style={styles.muted}>No handlers found.</Text>
              ) : (
                intent.handlers.map((handler) => (
                  <Text key={`${handler.packageName}:${handler.activityName}`} style={styles.mono}>
                    {handler.label} · {handler.packageName}
                  </Text>
                ))
              )}
            </Section>
          ))}

          <Section title="Known file-manager packages">
            {data.knownPackages.map((pkg) => (
              <Line
                key={pkg.packageName}
                label={pkg.packageName}
                value={pkg.installed ? pkg.label ?? 'installed' : 'not installed'}
              />
            ))}
          </Section>

          <Section title="Preferred local packages">
            {data.preferredPackages.map((pkg) => (
              <Line
                key={pkg.packageName}
                label={pkg.packageName}
                value={
                  pkg.installed
                    ? pkg.handlesGetContent
                      ? 'installed, handles GET_CONTENT'
                      : 'installed, no GET_CONTENT handler'
                    : 'not installed'
                }
              />
            ))}
          </Section>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: { padding: 8 },
  refreshBtn: { padding: 8 },
  refreshText: { color: '#208AEF', fontWeight: '600' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, gap: 16 },
  error: { color: '#B42318', fontSize: 15, lineHeight: 22 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  subheading: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 4 },
  muted: { color: '#667085', fontSize: 13 },
  mono: { fontSize: 12, color: '#222', lineHeight: 18 },
  line: { gap: 2 },
  lineLabel: { fontSize: 12, color: '#667085' },
  lineValue: { fontSize: 14, color: '#111' },
});
