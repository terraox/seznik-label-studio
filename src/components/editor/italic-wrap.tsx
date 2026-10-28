import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { italicSkewChain } from '@/lib/fonts/italic-skew';
import { previewItalicWrapStyle } from '@/lib/fonts/preview-text-style';

const CHAIN = italicSkewChain();

const inner = StyleSheet.create({
  fill: { alignSelf: 'stretch', flexGrow: 1, flexShrink: 1 },
});

/**
 * Slants its children for the preview. iOS shears the view directly; Android cannot, so it nests
 * three views (rotate, scale, rotate) that together make the same shear. See italic-skew.ts.
 */
export function ItalicWrap({
  italic,
  style,
  children,
  ...rest
}: ViewProps & { italic?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  if (!italic) {
    return (
      <View style={style} {...rest}>
        {children}
      </View>
    );
  }
  if (Platform.OS !== 'android') {
    return (
      <View style={[style, previewItalicWrapStyle(true)]} {...rest}>
        {children}
      </View>
    );
  }
  // The caller's alignment belongs on the innermost view, where the children sit.
  const flat = StyleSheet.flatten(style) ?? {};
  const { alignItems, justifyContent } = flat;
  return (
    <View style={[style, { alignItems: 'stretch', justifyContent: 'flex-start', transform: [{ rotate: `${CHAIN.outerDeg}deg` }] }]} {...rest}>
      <View style={[inner.fill, { transform: [{ scaleX: CHAIN.scaleX }, { scaleY: CHAIN.scaleY }] }]}>
        <View style={[inner.fill, { alignItems, justifyContent, transform: [{ rotate: `${CHAIN.innerDeg}deg` }] }]}>
          {children}
        </View>
      </View>
    </View>
  );
}
