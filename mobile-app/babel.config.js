module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': '.',
            '@/components': './components',
            '@/lib': './lib',
            '@/hooks': './hooks',
            '@/constants': './constants',
          },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        },
      ],
      ['@babel/plugin-proposal-decorators', { legacy: true }],
    ],
  };
};
