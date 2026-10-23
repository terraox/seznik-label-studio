import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { BASELINE_PATH, countRisks, scanAll, scanSource, type Counts, type RuleId } from './layout-risk-scan';

/**
 * Ratchet: each file may have at most the layout risks recorded in layout-risks.baseline.json.
 * New risks fail. Fixed risks also fail until the baseline is lowered, so it stays the live list.
 *   npm run layout:report     list every risk with its line
 *   npm run layout:baseline   rewrite the baseline after fixing risks
 */
test('no new layout risks, and the baseline matches what is left', () => {
  const baseline: Counts = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
  const all = scanAll();
  const current = countRisks(all);
  const added: string[] = [];
  const fixed: string[] = [];
  for (const file of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    const rules = new Set([...Object.keys(baseline[file] ?? {}), ...Object.keys(current[file] ?? {})]) as Set<RuleId>;
    for (const rule of rules) {
      const was = baseline[file]?.[rule] ?? 0;
      const now = current[file]?.[rule] ?? 0;
      if (now > was) {
        const lines = all[file].filter((r) => r.rule === rule).map((r) => `  ${file}:${r.line} ${r.text}`);
        added.push(`${rule} ${was} → ${now}\n${lines.join('\n')}`);
      } else if (now < was) fixed.push(`${file} ${rule} ${was} → ${now}`);
    }
  }
  assert.deepEqual(added, [], `New layout risks (fix them, or mark a false positive in the scanner):\n${added.join('\n')}`);
  assert.deepEqual(fixed, [], `Risks fixed, lower the baseline with npm run layout:baseline:\n${fixed.join('\n')}`);
});

const rules = (src: string) => scanSource('sample.tsx', src).map((r) => r.rule);

test('stale-dimensions', () => {
  assert.deepEqual(rules(`const { width } = Dimensions.get('window');`), ['stale-dimensions']);
  assert.deepEqual(rules(`const { width } = useWindowDimensions();`), []);
});

test('fixed-height-text: text taller than its box at the font cap', () => {
  const sheet = (box: string, text: string) => `
    const styles = StyleSheet.create({ box: { ${box} }, t: { ${text} } });
    const A = () => <View style={styles.box}><Text style={styles.t}>Hi</Text></View>;`;
  assert.deepEqual(rules(sheet('height: 18', 'fontSize: 14')), ['fixed-height-text']);
  assert.deepEqual(rules(sheet('minHeight: 18', 'fontSize: 14')), []);
  assert.deepEqual(rules(sheet('height: 44', 'fontSize: 16')), []);
  // Two stacked lines need more than one row of height.
  assert.deepEqual(
    rules(`const styles = StyleSheet.create({ box: { height: 30 } });
      const A = () => <View style={styles.box}><Text>One</Text><Text>Two</Text></View>;`),
    ['fixed-height-text'],
  );
  // Side by side, they only need one.
  assert.deepEqual(
    rules(`const styles = StyleSheet.create({ box: { height: 30, flexDirection: 'row' } });
      const A = () => <View style={styles.box}><Text>One</Text><Text>Two</Text></View>;`),
    [],
  );
  // Only one branch of a ternary renders.
  assert.deepEqual(
    rules(`const styles = StyleSheet.create({ box: { height: 24 } });
      const A = () => <View style={styles.box}>{ok ? <Icon size={11} /> : <Text>1</Text>}</View>;`),
    [],
  );
  // Text that does not scale fits.
  assert.deepEqual(
    rules(`const styles = StyleSheet.create({ box: { height: 18 } });
      const A = () => <View style={styles.box}><Text allowFontScaling={false}>Hi</Text></View>;`),
    [],
  );
});

test('fixed-height-text: themedStyles, makeStyles, Pressable style functions and shared constants', () => {
  assert.deepEqual(
    rules(`const styles = themedStyles((c) => ({ box: { height: 16 } }));
      const A = () => <Pressable style={({ pressed }) => [styles.box, pressed && styles.p]}><Text>Hi</Text></Pressable>;`),
    ['fixed-height-text'],
  );
  assert.deepEqual(
    rules(`const useStyles = makeStyles((c) => ({ box: { height: Spacing.three } }));
      const A = () => <View style={useStyles().box}><Text>Hi</Text></View>;`),
    [],
    'useStyles().box is not resolved; only identifier.name is',
  );
  assert.deepEqual(
    rules(`const H = 16;
      const useStyles = makeStyles((c) => ({ box: { height: H } }));
      function A() { const styles = useStyles(); return <View style={styles.box}><Text>Hi</Text></View>; }`),
    ['fixed-height-text'],
  );
});

test('wide-fixed-width', () => {
  assert.deepEqual(rules(`const styles = StyleSheet.create({ card: { width: 320 } });`), ['wide-fixed-width']);
  assert.deepEqual(rules(`const styles = StyleSheet.create({ card: { width: 280, maxWidth: 520 } });`), []);
  assert.deepEqual(rules(`const A = () => <View style={{ minWidth: 300 }} />;`), ['wide-fixed-width']);
});

test('row-text-no-shrink', () => {
  const row = (text: string) => `
    const styles = StyleSheet.create({ row: { flexDirection: 'row' }, label: { ${text} } });
    const A = () => <View style={styles.row}><Icon /><Text style={styles.label}>{name}</Text></View>;`;
  assert.deepEqual(rules(row('fontSize: 14')), ['row-text-no-shrink']);
  assert.deepEqual(rules(row('flex: 1')), []);
  assert.deepEqual(rules(row('flexShrink: 1')), []);
  // Short fixed words cannot push siblings out.
  assert.deepEqual(
    rules(`const styles = StyleSheet.create({ row: { flexDirection: 'row' } });
      const A = () => <View style={styles.row}><Icon /><Text>Print</Text></View>;`),
    [],
  );
});

test('layout-ok marks a checked false positive', () => {
  const src = (marker: string) => `
    const styles = StyleSheet.create({ row: { flexDirection: 'row' } });
    const A = () => (
      <View style={styles.row}>
        <Icon />
        ${marker}
        <Text>{percent}</Text>
      </View>
    );`;
  assert.deepEqual(rules(src('')), ['row-text-no-shrink']);
  assert.deepEqual(rules(src('{/* layout-ok: short percentage */}')), []);
});

test('row-map-no-wrap', () => {
  const row = (rowStyle: string, item = 'width: 40') => `
    const styles = StyleSheet.create({ row: { flexDirection: 'row', ${rowStyle} }, item: { ${item} } });
    const A = () => <View style={styles.row}>{list.map((x) => <View key={x} style={styles.item} />)}</View>;`;
  assert.deepEqual(rules(row('')), ['row-map-no-wrap']);
  assert.deepEqual(rules(row(`flexWrap: 'wrap'`)), []);
  assert.deepEqual(rules(row('', 'flex: 1')), [], 'segments share the row');
  assert.deepEqual(rules(row('width: 60')), [], 'fixed-size row');
  assert.deepEqual(
    rules(`const A = () => <ScrollView horizontal><View style={{ flexDirection: 'row' }}>{list.map((x) => <Chip key={x} />)}</View></ScrollView>;`),
    [],
  );
});
