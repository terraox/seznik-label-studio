import { router, type Href } from 'expo-router';

/**
 * Back that never dead-ends. With nothing to go back to (app reloaded on this screen, opened by a
 * link, or the screen is the stack root) a plain `router.back()` raises "GO_BACK was not handled
 * by any navigator", so go to `fallback` (Home) instead.
 */
export function goBack(fallback: Href = '/'): void {
  // canGoBack() is true whenever any navigator (e.g. tab history) could go back, yet the screen's
  // own stack may have nothing to pop; that dispatch is what raises GO_BACK. canDismiss() asks the
  // stack itself.
  if (router.canDismiss()) router.back();
  else router.replace(fallback);
}
