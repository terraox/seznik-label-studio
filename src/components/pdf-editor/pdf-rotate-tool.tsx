import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';

import { parsePageRange, type PageScope } from '@/lib/pdf-editor/session';
import { themedStyles, useThemeRefresh } from '@/theme';

const ANGLES = [0, 90, 180, 270] as const;

export function PdfRotateTool({
  value,
  pageCount,
  onChange,
}: {
  value: number;
  pageCount: number;
  onChange: (deg: number, scope: PageScope) => void;
}) {
  useThemeRefresh();
  const [scope, setScope] = useState<PageScope>({ mode: 'this' });
  const rangeError =
    scope.mode === 'range' ? parsePageRange(String(scope.start), String(scope.end), pageCount).error : undefined;

  return (
    <View style={styles.wrap}>
      <Text style={styles.help}>
        {pageCount < 2 ? 'Rotates this page.' : 'Choose which pages receive this rotation.'}
      </Text>
      <View style={styles.row}>
        {ANGLES.map((d) => (
          <Pressable key={d} onPress={() => onChange(d, scope)} style={[styles.btn, value === d && styles.btnOn]}>
            <Text style={[styles.btnText, value === d && styles.btnTextOn]}>{d}°</Text>
          </Pressable>
        ))}
      </View>
      <PdfScopeSelector
        scope={scope}
        pageCount={pageCount}
        rangeError={rangeError}
        onChange={(next) => {
          const resolved =
            next.mode === 'range'
              ? {
                  mode: 'range' as const,
                  start: parsePageRange(String(next.start), String(next.end), pageCount).start,
                  end: parsePageRange(String(next.start), String(next.end), pageCount).end,
                }
              : next;
          setScope(resolved);
          onChange(value, resolved);
        }}
      />
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { gap: 8 },
  help: { fontSize: 12, color: c.textMuted },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  btnOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  btnText: { fontSize: 14, color: c.text, fontWeight: '600' },
  btnTextOn: { color: c.accent },
}));
