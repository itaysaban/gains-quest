const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro's web bundle runs as a classic <script>, not a real ES module. Its package-exports
// resolver always offers the "import" condition when the importing statement is ESM syntax,
// regardless of platform — so on web (which has no "react-native" condition to match first)
// a package's ESM build can get picked even though only its CJS build is safe to evaluate
// outside a module context. That's fatal for any ESM build containing top-level `import.meta`
// (e.g. zustand's "zustand/middleware", whose devtools code uses `import.meta.env`): the whole
// bundle fails to parse and the app never mounts. Disabling package-exports resolution for web
// only falls back to legacy `main`-field resolution, which correctly resolves such packages to
// their CJS build. Native platforms (unaffected by this) are untouched.
const { resolveRequest } = config.resolver;

config.resolver.resolveRequest = (context, moduleName, platform, ...rest) => {
  const resolveContext = platform === 'web' ? { ...context, unstable_enablePackageExports: false } : context;
  if (resolveRequest) {
    return resolveRequest(resolveContext, moduleName, platform, ...rest);
  }
  return resolveContext.resolveRequest(resolveContext, moduleName, platform);
};

module.exports = config;
