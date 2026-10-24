import { RangeSlider } from '@/components/editor/range-slider';

/**
 * Compact range slider used for image/signature thresholds and line-art
 * emoji thickness (stroke scale).
 */
export function GrayThresholdSlider({
  value,
  onChange,
  min = 0,
  max = 255,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <RangeSlider value={value} onChange={onChange} min={min} max={max} step={step} compact />
  );
}
