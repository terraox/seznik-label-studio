const fs = require('fs');
const os = require('os');
const { getDefaultConfig } = require('expo/metro-config');

// Windows + OneDrive hits EMFILE when Metro opens thousands of files for
// source maps. Queue/retry those opens instead of crashing the bundler.
try {
  require('graceful-fs').gracefulify(fs);
} catch {
  // graceful-fs is a Metro/Expo transitive dependency.
}

const config = getDefaultConfig(__dirname);

if (process.platform === 'win32') {
  config.maxWorkers = Math.min(2, os.cpus().length || 2);
}

// Prevent Metro from watching native build output and sibling trees.
const blockListPatterns = [
  /.*[\/\\]\.cxx[\/\\].*/,
  /.*[\/\\]android[\/\\]build[\/\\].*/,
  /.*[\/\\]build[\/\\]intermediates[\/\\].*/,
  /.*[\/\\]build[\/\\]tmp[\/\\].*/,
  /.*[\/\\]ios[\/\\]Pods[\/\\].*/,
  /.*[\/\\]\.git[\/\\].*/,
  /.*[\/\\]admin[\/\\].*/,
];

if (Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList.push(...blockListPatterns);
} else if (config.resolver.blockList instanceof RegExp) {
  config.resolver.blockList = [config.resolver.blockList, ...blockListPatterns];
} else {
  config.resolver.blockList = blockListPatterns;
}

module.exports = config;
