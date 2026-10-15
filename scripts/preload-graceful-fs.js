/**
 * Patch Node's fs before the Expo CLI loads. Windows + OneDrive hits EMFILE
 * while Metro is bundling; graceful-fs queues those opens instead of crashing.
 */
try {
  require('graceful-fs').gracefulify(require('fs'));
} catch {
  // graceful-fs ships with Metro. If it is missing, Metro starts unchanged.
}
