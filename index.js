// Custom entry so Android home-screen widgets can run without booting the full UI.
// `@expo/metro-runtime` MUST be first for Fast Refresh.
import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  // Lazy require keeps iOS bundles from pulling the Android-only module.
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/android/widget-task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}

renderRootComponent(App);
