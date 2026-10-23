import { Loader } from '@/components/ui';

/** Shown while a desk page opens, before its own data starts loading. */
export default function DeskLoading() {
  return <Loader label="Loading" />;
}
