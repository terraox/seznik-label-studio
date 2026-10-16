const fs = require('fs');
const path = require('path');
const { withAndroidStyles, withDangerousMod, withMainActivity } = require('@expo/config-plugins');

/**
 * Android navigation bar buttons that stay visible in light and dark mode.
 *
 * - styles.xml: windowLightNavigationBar comes from @bool/sez_light_nav_bar, which is true in
 *   values/ (dark buttons on the light UI) and false in values-night/ (white buttons on black).
 *   This covers cold start before JS runs. No contrast scrim, so the app's own bar colour shows.
 * - At runtime the JS theme sets the buttons with expo-navigation-bar (src/theme/navigation-bar.ts)
 *   whenever the theme changes and on every resume.
 * - MainActivity: removes the old code that forced dark buttons on every resume, which would
 *   override the dark theme. Nothing is added to MainActivity.
 */
const BOOL_NAME = 'sez_light_nav_bar';

function withStyles(config) {
  return withAndroidStyles(config, (cfg) => {
    const appTheme = cfg.modResults.resources.style?.find((s) => s.$.name === 'AppTheme');
    if (!appTheme) return cfg;
    const drop = ['android:windowLightNavigationBar', 'android:enforceNavigationBarContrast'];
    appTheme.item = (appTheme.item ?? []).filter((i) => !drop.includes(i.$.name));
    appTheme.item.push(
      { $: { name: 'android:windowLightNavigationBar', 'tools:targetApi': '27' }, _: `@bool/${BOOL_NAME}` },
      { $: { name: 'android:enforceNavigationBarContrast', 'tools:targetApi': '29' }, _: 'false' },
    );
    return cfg;
  });
}

function withBools(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const [dir, value] of [['values', 'true'], ['values-night', 'false']]) {
        fs.mkdirSync(path.join(res, dir), { recursive: true });
        fs.writeFileSync(
          path.join(res, dir, 'sez_navigation_bar.xml'),
          `<resources>\n  <bool name="${BOOL_NAME}">${value}</bool>\n</resources>\n`,
        );
      }
      return cfg;
    },
  ]);
}

/** Remove the forced-dark-buttons code (old plugin output or the hand-applied copy). */
function stripForcedButtons(contents) {
  let c = contents
    .replace(/\n\s*\/\/ @sez-light-nav-bar begin\n\s*useDarkNavigationButtons\(\)\n\s*\/\/ @sez-light-nav-bar end/, '')
    .replace(/\n\n  override fun onResume\(\) \{\n    super\.onResume\(\)\n    useDarkNavigationButtons\(\)\n  \}/, '')
    .replace(/\n\s*useDarkNavigationButtons\(\)(?=\n\s*\})/, '')
    .replace(/\n\n  (\/\*\*[^\n]*\*\/\n  )?private fun useDarkNavigationButtons\(\) \{\n[^}]*\}/, '');
  if (!/WindowCompat\./.test(c)) c = c.replace(/\nimport androidx\.core\.view\.WindowCompat/, '');
  return c;
}

/** Strip the forced-dark-buttons code an earlier version of this plugin added. */
function withoutForcedButtons(config) {
  return withMainActivity(config, (cfg) => {
    const m = cfg.modResults;
    if (m.language !== 'kt' || !m.contents.includes('useDarkNavigationButtons')) return cfg;
    m.contents = stripForcedButtons(m.contents);
    return cfg;
  });
}

module.exports = function withLightNavigationBar(config) {
  return withoutForcedButtons(withBools(withStyles(config)));
};

module.exports.stripForcedButtons = stripForcedButtons;
