import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { FeaturesWidget } from '@/widgets/android/features-widget';
import { ShippingWidget } from '@/widgets/android/shipping-widget';

function renderForName(name: string) {
  switch (name) {
    case 'SeznikFeatures':
      return <FeaturesWidget />;
    case 'SeznikShipping':
      return <ShippingWidget />;
    default:
      return <FeaturesWidget />;
  }
}

/** Handles Android App Widget lifecycle events from the OS. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(renderForName(name));
      break;
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
      // OPEN_URI clicks are handled by the system; nothing to render.
      break;
    default:
      break;
  }
}
