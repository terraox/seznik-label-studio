import {
  forwardRef } from 'react';
import type { ScrollView,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

/** Space kept between the caret and the top of the keyboard. */
export const FORM_KEYBOARD_BOTTOM_OFFSET = 28;

/**
 * Scroll view that moves the focused field above the keyboard and keeps
 * following the caret while the user types.
 */
export const FormScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function FormScrollView(
    {
      bottomOffset = FORM_KEYBOARD_BOTTOM_OFFSET,
      keyboardShouldPersistTaps = 'handled',
      ...props
    },
    ref,
  ) {
    return (
      <KeyboardAwareScrollView
        {...props}
        ref={ref}
        bottomOffset={bottomOffset}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      />
    );
  },
);
