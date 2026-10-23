/**
 * Largest system font scale the app follows. A user with a bigger font setting gets text at this
 * scale; smaller settings are followed exactly.
 *
 * Applied to every Text and TextInput that does not set its own `maxFontSizeMultiplier`, through
 * patches/react-native+0.81.5.patch (React 19 ignores `Text.defaultProps`). The patch hard-codes
 * the value; font-scale.test.ts keeps the two in sync. Pure data so node:test can load it.
 */
export const FONT_SCALE_CAP = 1.3;
