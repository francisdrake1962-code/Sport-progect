const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Admin JS/CSS keep stable filenames (copied verbatim), so browsers that once
// received `immutable` headers would never re-fetch them. Version the URLs with
// a content hash so a deploy changes the URL and busts the stale cache.
function adminAssetsVersion() {
  const files = [
    'src/admin/js/api.js',
    'src/admin/js/sidebar.js',
    'src/admin/js/admin.js',
    'src/admin/js/stream-upload.js',
    'src/admin/css/admin.css',
  ];
  const hash = crypto.createHash('sha1');
  for (const f of files) {
    try {
      hash.update(fs.readFileSync(path.resolve(__dirname, f)));
    } catch { /* missing file contributes nothing */ }
  }
  return hash.digest('hex').slice(0, 10);
}
const adminVersion = adminAssetsVersion();

const pages = [
  'is-it-really-free',
  'how-to-cancel',
  'about-trainer',
  '8-pieces-of-brocade',
  'yijinjing',
  'small-circulation',
  'terms',
  'refund',
  'privacy',
  'contact',
  'faq',
  'lessons',
  'player',
  'login',
  'reset-password',
  'calendar',
  'plans',
  'picker',
  'profile',
  'onboarding',
  'dashboard',
  'payment-status',
];

const adminPages = [
  'login',
  'index',
  'lessons',
  'complexes',
  'schedule',
  'users',
  'subscriptions',
  'reviews',
  'feedback',
  'faq',
  'content',
  'promo',
  'finance',
  'notifications',
  'settings',
];

module.exports = {
  entry: './src/js/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
      chunks: ['main'],
    }),
    ...pages.map(page => new HtmlWebpackPlugin({
      template: `./src/pages/${page}.html`,
      filename: `${page}.html`,
      chunks: ['main'],
    })),
    ...adminPages.map(page => new HtmlWebpackPlugin({
      template: `./src/admin/${page}.html`,
      filename: `admin/${page}.html`,
      chunks: [],
      templateParameters: { assetVersion: adminVersion },
    })),
    new MiniCssExtractPlugin({
      filename: 'styles/[name].[contenthash].css',
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'src/admin/css', to: 'admin/css' },
        { from: 'src/admin/js', to: 'admin/js' },
        { from: 'src/images', to: 'images' },
        { from: 'src/manifest.json', to: 'manifest.json' },
        { from: 'src/sw.js', to: 'sw.js' },
      ],
    }),
  ],
  optimization: {
    minimizer: [new TerserPlugin()],
    splitChunks: {
      cacheGroups: {
        styles: {
          name: 'styles',
          type: 'css/mini-extract',
          chunks: 'all',
          enforce: true,
        },
      },
    },
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
    hot: true,
    open: true,
    historyApiFallback: true,
  },
};
