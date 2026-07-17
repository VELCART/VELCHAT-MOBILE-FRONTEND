/**
 * React Native CLI config. Bundled fonts live in assets/fonts and are also copied
 * into android/app/src/main/assets/fonts (Android bundles them directly). For iOS,
 * run `npx react-native-asset` to link them into the Xcode project + Info.plist.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assets/fonts'],
};
