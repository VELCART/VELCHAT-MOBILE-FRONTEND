module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // WatermelonDB models use legacy property decorators (@field/@text/@date).
  plugins: [['@babel/plugin-proposal-decorators', { legacy: true }]],
};
