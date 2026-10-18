export type RegistrationSource = 'web' | 'mobile' | 'legacy';

export function getRegistrationSource(userId: string | number): RegistrationSource {
  const id = String(userId);
  if (id.startsWith('w')) return 'web';
  if (id.startsWith('m') && id.length === 37) return 'mobile';
  return 'legacy';
}

export function getRegistrationSourceLabel(source: RegistrationSource): string {
  switch (source) {
    case 'web':
      return 'Web';
    case 'mobile':
      return 'Mobile';
    default:
      return 'Legacy';
  }
}

export function getRegistrationSourceStyle(source: RegistrationSource): { color: string; background: string } {
  switch (source) {
    case 'web':
      return { color: '#2563EB', background: 'rgba(37, 99, 235, 0.12)' };
    case 'mobile':
      return { color: '#059669', background: 'rgba(5, 150, 105, 0.12)' };
    default:
      return { color: 'var(--text-muted)', background: 'var(--bg-main)' };
  }
}
