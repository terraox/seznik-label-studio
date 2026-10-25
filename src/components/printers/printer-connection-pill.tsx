import { StatusChip } from '@/components/home/status-chip';

/** The printer card in a screen header: the same one Home shows, so every screen reads alike. */
export function PrinterConnectionPill({ keepLive = false }: { keepLive?: boolean }) {
  // Home's chip already polls while the app is open; here it only syncs once on mount.
  return <StatusChip poll={false} keepLive={keepLive} />;
}
