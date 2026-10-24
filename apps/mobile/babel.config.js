module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // WatermelonDB models use legacy property decorators (@field/@text/@date).
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    // MUST BE LAST (ADR-0011). Reanimated 4 compiles its worklets through
    // react-native-worklets; the plugin rewrites functions marked for the UI thread, so any
    // plugin that runs after it would see — and mangle — already-transformed code.
    'react-native-worklets/plugin',
  ],
};
