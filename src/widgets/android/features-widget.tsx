import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { WIDGET_LINKS } from '@/widgets/deep-links';

const NAVY = '#12295C';
const BLUE = '#0A8CF0';
const WHITE = '#FFFFFF';
const MUTED = '#B9C7E6';

type Action = {
  label: string;
  sub: string;
  uri: string;
  accent?: string;
};

const ACTIONS: Action[] = [
  { label: 'New Label', sub: 'Blank', uri: WIDGET_LINKS.newLabel, accent: BLUE },
  { label: 'PDF', sub: 'Print', uri: WIDGET_LINKS.pdf },
  { label: 'Shipping', sub: 'Marketplace', uri: WIDGET_LINKS.shipping },
  { label: 'Excel', sub: 'Bulk', uri: WIDGET_LINKS.excel },
  { label: 'Serial', sub: '001…', uri: WIDGET_LINKS.serial },
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
        backgroundColor: action.accent ?? '#1A3A6E',
        borderRadius: 14,
        padding: 8,
      }}>
      <TextWidget
        text={action.label}
        style={{
          fontSize: 13,
          color: WHITE,
          fontWeight: '700',
          textAlign: 'center',
        }}
      />
      <TextWidget
        text={action.sub}
        style={{
          fontSize: 10,
          color: MUTED,
          textAlign: 'center',
          marginTop: 2,
        }}
      />
    </FlexWidget>
  );
}

/** Home-screen shortcuts for the main create / print tools. */
export function FeaturesWidget() {
  const top = ACTIONS.slice(0, 3);
  const bottom = ACTIONS.slice(3);

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: NAVY,
        borderRadius: 20,
        padding: 12,
        flexGap: 8,
      }}>
      <TextWidget
        text="Seznik"
        style={{ fontSize: 11, color: MUTED, fontWeight: '700', marginBottom: 2 }}
      />
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          flexDirection: 'row',
          flexGap: 8,
        }}>
        {top.map((action) => (
          <ActionTile key={action.uri} action={action} />
        ))}
      </FlexWidget>
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          flexDirection: 'row',
          flexGap: 8,
        }}>
        {bottom.map((action) => (
          <ActionTile key={action.uri} action={action} />
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}
