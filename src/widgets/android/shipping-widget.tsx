import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { WIDGET_LINKS } from '@/widgets/deep-links';

const NAVY = '#12295C';
const WHITE = '#FFFFFF';
const MUTED = '#B9C7E6';

type PlatformTile = {
  label: string;
  uri: string;
  color: string;
};

const PLATFORMS: PlatformTile[] = [
  { label: 'Amazon', uri: WIDGET_LINKS.amazon, color: '#FF9900' },
  { label: 'Flipkart', uri: WIDGET_LINKS.flipkart, color: '#2874F0' },
  { label: 'Meesho', uri: WIDGET_LINKS.meesho, color: '#9F2089' },
];

/** Opens shipping-label flow for Amazon, Flipkart, or Meesho. */
export function ShippingWidget() {
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
        text="Shipping labels"
        style={{ fontSize: 12, color: MUTED, fontWeight: '700' }}
      />
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          flexDirection: 'row',
          flexGap: 8,
        }}>
        {PLATFORMS.map((p) => (
          <FlexWidget
            key={p.uri}
            clickAction="OPEN_URI"
            clickActionData={{ uri: p.uri }}
            style={{
              flex: 1,
              height: 'match_parent',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#1A3A6E',
              borderRadius: 14,
              padding: 8,
              borderWidth: 2,
              borderColor: p.color,
            }}>
            <TextWidget
              text={p.label}
              style={{
                fontSize: 14,
                color: WHITE,
                fontWeight: '800',
                textAlign: 'center',
              }}
            />
            <TextWidget
              text="Print"
              style={{
                fontSize: 10,
                color: MUTED,
                textAlign: 'center',
                marginTop: 2,
              }}
            />
          </FlexWidget>
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}
