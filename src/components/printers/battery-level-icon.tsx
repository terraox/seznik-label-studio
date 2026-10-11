import { AppIcon } from '@/components/app-icon';

export function batteryIconName(percent: number): string {
  if (percent <= 5) return 'battery.0';
  if (percent <= 25) return 'battery.25';
  if (percent <= 50) return 'battery.50';
  if (percent <= 75) return 'battery.75';
  return 'battery.100';
}

export function batteryTint(percent: number): string {
  if (percent <= 10) return '#DC2626';
  if (percent <= 25) return '#B45309';
  return '#18794A';
}

export function BatteryLevelIcon({
  percent,
  size = 16,
  tintColor,
}: {
  percent: number;
  size?: number;
  tintColor?: string;
}) {
  return (
    <AppIcon
      name={batteryIconName(percent)}
      tintColor={tintColor ?? batteryTint(percent)}
      size={size}
      pointerEvents="none"
    />
  );
}
