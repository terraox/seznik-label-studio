import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplash } from '@/components/animated-splash';
import { IosAlertHost } from '@/components/ui/ios-alert-host';
import { APP_FONT_MAP } from '@/lib/app-fonts';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { useIncomingSharedFile } from '@/lib/file-import/use-incoming-shared-file';
import { startInstalledFontHydration } from '@/lib/fonts/runtime';
import { hydrateUserClipartSvgs } from '@/lib/clipart/user-storage';
import { migrateLegacyUserFiles } from '@/lib/user-files/migrate';
// import { useAuthStore } from '@/stores/auth-store';
import { useIncomingFileStore } from '@/stores/incoming-file-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sez Print failed to start', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF', padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#111827' }}>
            Sez Print failed to start
          </Text>
          <ScrollView>
            <Text selectable style={{ color: '#374151', fontSize: 14 }}>
              {this.state.error.message}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppRoot() {
  const colorScheme = useColorScheme();
  useFonts(APP_FONT_MAP);

  useEffect(() => startInstalledFontHydration(), []);

  useEffect(() => {
    getPrinterManager().maybeAutoReconnect({ force: true });
  }, []);

  useEffect(() => {
    void migrateLegacyUserFiles()
      .catch(() => undefined)
      .finally(() => {
        void hydrateUserClipartSvgs().catch(() => undefined);
      });
  }, []);

  // The splash plays alone first. The navigator (and so the home screen, its tabs and the
  // first-run walkthrough) only mounts once the animation has finished.
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinish = useCallback(() => setAppReady(true), []);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);
  // Login / register is switched off for now: the app always opens signed in.
  // const authHydrated = useAuthStore((s) => s.hydrated);
  // const signedIn = useAuthStore((s) => s.sessionPhone !== null);
  const authHydrated = true;
  const signedIn = true;

  // A spreadsheet shared to the app opens Data File once the app is ready and signed in.
  useIncomingSharedFile();
  const hasIncomingFile = useIncomingFileStore((s) => s.pending !== null);
  useEffect(() => {
    if (hasIncomingFile && appReady && authHydrated && signedIn) {
      router.push('/data-file');
    }
  }, [hasIncomingFile, appReady, authHydrated, signedIn]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
      {appReady && authHydrated ? (
        <Stack screenOptions={{ headerShown: false }}>
          {/* Login / register switched off for now.
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="login" />
            <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
          </Stack.Protected>
          */}
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Screen name="edit" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="print" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="share"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen
            name="new-label"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen
            name="print-photo-modal"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen name="photo-frames" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="print-photo" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="scan" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ocr" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="asr" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="pdf" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="pdf-editor" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="pdf-thermal" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="data-file" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="excel-print" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="excel-data-preview" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="excel-bulk-setup" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="language-switch" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="font-library" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="column-name" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="clipart" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="border-library" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="advanced-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="printing-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="editing-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="editor-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="default-property-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="label-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="drawing-color" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="cache-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="app-permissions" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="printing-history" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="printer-connect" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="printer-diagnostics" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="calibration-print" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="canvas-skia-prototype" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase2-canvas" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="image-crop" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase3-image-import" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase4-text" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase5-barcode-qr" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase6-editor" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase7-pipeline" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase8-shape-detect" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phase9-robustness" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="stage-a-gates" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ground-truth-parity" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="calibration-dots" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="location-dots" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="file-picker-diagnostics" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="dot-buffer-1k" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="new-label-setup" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="shipping-label"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen
            name="customize-template"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen
            name="img-to-label"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="image-to-label"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="jewellery-label"
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen
            name="serial-label"
            options={{ animation: 'slide_from_right' }}
          />
        </Stack>
      ) : null}
      {splashDone ? null : <AnimatedSplash onFinish={handleSplashFinish} onDone={handleSplashDone} />}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppRoot />
        <IosAlertHost />
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
