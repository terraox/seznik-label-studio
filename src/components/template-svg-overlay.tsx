import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { LabelDocument } from '@/lib/label-document';

/** The outline of a catalogue template (its own SVG), stretched over the artboard. Guide only, never printed. */
export function TemplateSvgOverlay({ document }: { document: Pick<LabelDocument, 'templateSvg'> }) {
  if (!document.templateSvg) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <SvgXml
        xml={document.templateSvg.xml}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      />
    </View>
  );
}
