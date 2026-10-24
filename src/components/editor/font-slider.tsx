import { RangeSlider } from '@/components/editor/range-slider';

/** Font-size slider used by text / barcode / time / arc / degrees menus. */
export function FontSlider({
  value,
  onChange,
  min = 6,
  max = 72,
  step = 0.5,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return <RangeSlider value={value} onChange={onChange} min={min} max={max} step={step} />;
}
