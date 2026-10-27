/**
 * Android "Open with" and share hand the app a content:// or file:// URL. Expo Router would try to
 * match that as a screen and show "Unmatched route". The file itself is read by the share-target
 * module and opened on its own screen (a PDF on Print PDF), so the router just lands on Home.
 * The app's own links (sezprint://, widgets) pass through untouched.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (/^\/?(content|file):/i.test(path)) return '/';
  return path;
}
