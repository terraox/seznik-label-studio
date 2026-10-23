import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Rect } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';

import { acrossLayout } from '@/lib/across';
import type { LabelDocument } from '@/lib/label-document';

/** Label colour of the stock: the document's own colour, white by default. */
function labelColor(doc: Pick<LabelDocument, 'background' | 'paperType'>): string | null {
  return doc.background?.type === 'color' ? doc.background.color : '#FFFFFF'; // theme-fixed: label paper colour (document data)
}

/**
 * The outline of a catalogue template (its own SVG), stretched over the artboard. Guide only, never printed.
 * Labels edited together get each cell filled with the label colour first, so the labels read as labels
 * and the gaps between them as bare backing.
 */
export function TemplateSvgOverlay({
  document,
}: {
  document: Pick<LabelDocument, 'templateSvg' | 'across' | 'ups' | 'widthMm' | 'heightMm' | 'background' | 'paperType'>;
}) {
  if (!document.templateSvg) return null;
  const layout = document.across ? acrossLayout(document as LabelDocument) : null;
  const fill = layout ? labelColor(document) : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {layout && fill ? (
        <View style={StyleSheet.absoluteFillObject}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${document.widthMm} ${document.heightMm}`} preserveAspectRatio="none">
            {Array.from({ length: layout.columns }, (_, i) => {
              const x = i * layout.pitchMm;
              return document.across?.round ? (
                <Ellipse
                  key={i}
                  cx={x + layout.cellWidthMm / 2}
                  cy={layout.cellHeightMm / 2}
                  rx={layout.cellWidthMm / 2}
                  ry={layout.cellHeightMm / 2}
                  fill={fill}
                />
              ) : (
                <Rect key={i} x={x} y={0} width={layout.cellWidthMm} height={layout.cellHeightMm} rx={1} fill={fill} />
              );
            })}
          </Svg>
        </View>
      ) : null}
      <SvgXml
        xml={document.templateSvg.xml}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      />
    </View>
  );
}
