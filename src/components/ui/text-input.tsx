import { forwardRef, useCallback, useRef } from 'react';
import {
  TextInput as RNTextInput,
  type TextInput as TextInputInstance,
  type TextInputProps,
} from 'react-native';

export type TextInput = TextInputInstance;

/**
 * App text field. Tapping focuses it, opens the keyboard, and selects the
 * current value so the next keystroke replaces it.
 */
export const TextInput = forwardRef<TextInputInstance, TextInputProps>(function TextInput(
  { selectTextOnFocus = true, showSoftInputOnFocus = true, onFocus, value, ...rest },
  ref,
) {
  const innerRef = useRef<TextInputInstance>(null);

  const setRef = useCallback(
    (node: TextInputInstance | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <RNTextInput
      {...rest}
      ref={setRef}
      value={value}
      selectTextOnFocus={selectTextOnFocus}
      showSoftInputOnFocus={showSoftInputOnFocus}
      onFocus={(event) => {
        onFocus?.(event);
        if (!selectTextOnFocus) return;
        const length = typeof value === 'string' ? value.length : 0;
        if (length === 0) return;
        requestAnimationFrame(() => {
          innerRef.current?.setSelection(0, length);
        });
      }}
    />
  );
});
