import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

import { HOME_TOOLS } from '@/components/home/home-tools';
import { WIDGET_LINKS } from '@/widgets/deep-links';
import { toolSvg, WIDGET_COLORS, type WidgetToolArt } from '@/widgets/android/tool-svg';

type Action = {
  art: WidgetToolArt;
  label: string;
  hint: string;
  uri: string;
};

/** Same names, hints and drawings as the Home tiles. */
const ACTIONS: Action[] = [
  { art: 'newLabel', label: HOME_TOOLS.newLabel.label, hint: 'Start blank', uri: WIDGET_LINKS.newLabel },
  { art: 'pdf', label: HOME_TOOLS.pdf.label, hint: HOME_TOOLS.pdf.hint, uri: WIDGET_LINKS.pdf },
  { art: 'shipping', label: HOME_TOOLS.shippingLabels.label, hint: HOME_TOOLS.shippingLabels.hint, uri: WIDGET_LINKS.shipping },
  { art: 'excel', label: HOME_TOOLS.excel.label, hint: HOME_TOOLS.excel.hint, uri: WIDGET_LINKS.excel },
  { art: 'serial', label: HOME_TOOLS.serialLabels.label, hint: HOME_TOOLS.serialLabels.hint, uri: WIDGET_LINKS.serial },
];

function ActionTile({ action }: { action: Action }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: action.uri }}
      style={{
        flex: 1,
        height: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: WIDGET_COLORS.surface,
        borderRadius: 16,
        padding: 6,
      }}>
      <SvgWidget svg={toolSvg(action.art)} style={{ width: 38, height: 38 }} />
      <TextWidget
        text={action.label}
        maxLines={1}
        truncate="END"
        style={{
          fontSize: 12,
          color: WIDGET_COLORS.text,
          fontWeight: '700',
          textAlign: 'center',
          marginTop: 4,
        }}
      />
      <TextWidget
        text={action.hint}
        maxLines={1}
        truncate="END"
        style={{
          fontSize: 10,
          color: WIDGET_COLORS.muted,
          textAlign: 'center',
        }}
      />
    </FlexWidget>
  );
}

function Row({ actions }: { actions: Action[] }) {
  return (
    <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
      {actions.map((action) => (
        <ActionTile key={action.uri} action={action} />
      ))}
    </FlexWidget>
  );
}

/** Home-screen shortcuts for the main create / print tools, drawn like the Home tiles. */
export function FeaturesWidget() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: WIDGET_COLORS.bg,
        borderRadius: 20,
        padding: 8,
        flexGap: 8,
      }}>
      <Row actions={ACTIONS.slice(0, 3)} />
      <Row actions={ACTIONS.slice(3)} />
    </FlexWidget>
  );
}
