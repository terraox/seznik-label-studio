import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';

import { WIDGET_LINKS } from '@/widgets/deep-links';
import { WIDGET_COLORS } from '@/widgets/android/tool-svg';

type PlatformTile = {
  label: string;
  uri: string;
  logo: number;
};

/** Same marketplace logos as the Shipping Labels screen. */
const PLATFORMS: PlatformTile[] = [
  { label: 'Amazon', uri: WIDGET_LINKS.amazon, logo: require('../../../assets/images/platforms/amazon.png') },
  { label: 'Flipkart', uri: WIDGET_LINKS.flipkart, logo: require('../../../assets/images/platforms/flipkart.png') },
  { label: 'Meesho', uri: WIDGET_LINKS.meesho, logo: require('../../../assets/images/platforms/meesho.png') },
];

/** Opens shipping-label flow for Amazon, Flipkart, or Meesho. */
export function ShippingWidget() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: WIDGET_COLORS.bg,
        borderRadius: 20,
        padding: 8,
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
            backgroundColor: WIDGET_COLORS.surface,
            borderRadius: 16,
            padding: 6,
          }}>
          <ImageWidget
            image={p.logo}
            imageWidth={40}
            imageHeight={40}
            style={{ width: 40, height: 40, borderRadius: 10 }}
          />
          <TextWidget
            text={p.label}
            maxLines={1}
            style={{
              fontSize: 12,
              color: WIDGET_COLORS.text,
              fontWeight: '700',
              textAlign: 'center',
              marginTop: 4,
            }}
          />
          <TextWidget
            text="Shipping labels"
            maxLines={1}
            truncate="END"
            style={{ fontSize: 10, color: WIDGET_COLORS.muted, textAlign: 'center' }}
          />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}
