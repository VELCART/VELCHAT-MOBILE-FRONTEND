const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration — pnpm + Turborepo monorepo aware.
 * https://reactnative.dev/docs/metro
 *
 * With `node-linker=hoisted` most deps live in the workspace-root node_modules,
 * so Metro must (a) watch the workspace root and (b) resolve modules from both
 * the app's and the root's node_modules.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    // pnpm nests transitive deps under .pnpm/<pkg>/node_modules; Metro must walk
    // up hierarchically (following symlinks) to resolve them — do NOT disable
    // hierarchical lookup, or react-native's own deps (e.g. `invariant`) fail.
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
