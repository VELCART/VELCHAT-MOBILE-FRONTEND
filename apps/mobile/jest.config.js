module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/android/', '/ios/'],
  // pnpm nests deps under node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>.
  // Allow that optional prefix so RN-ecosystem ESM packages are still transformed
  // (default RN pattern assumes a flat node_modules).
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/[^/]+/node_modules/)?(?:@react-native|react-native|@react-native-community|@react-navigation|@shopify|@noble|zustand|react-native-[^/]+)/)',
  ],
  // @testing-library/react-native auto-registers its Jest matchers on import.
};
