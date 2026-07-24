const { describe, test, expect } = require('@jest/globals');
const path = require('path');
const fs = require('fs');

describe('Build System', () => {
  test('should have webpack config', () => {
    const configPath = path.resolve(__dirname, '../webpack.config.js');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  test('should have entry point', () => {
    const entryPath = path.resolve(__dirname, '../src/js/main.js');
    expect(fs.existsSync(entryPath)).toBe(true);
  });

  test('should have CSS file', () => {
    const cssPath = path.resolve(__dirname, '../src/styles/main.css');
    expect(fs.existsSync(cssPath)).toBe(true);
  });

  test('should have all page templates', () => {
    const pages = [
      'index.html',
      'is-it-really-free.html',
      'how-to-cancel.html',
      'about-trainer.html',
      '8-pieces-of-brocade.html',
      'yijinjing.html',
      'small-circulation.html',
      'terms.html',
      'refund.html',
      'privacy.html',
      'contact.html',
      'faq.html'
    ];
    
    pages.forEach(page => {
      const pagePath = path.resolve(__dirname, `../src/pages/${page}`);
      const indexPath = path.resolve(__dirname, `../src/${page}`);
      expect(fs.existsSync(pagePath) || fs.existsSync(indexPath)).toBe(true);
    });
  });

  test('should have proper package.json scripts', () => {
    const packageJson = require('../package.json');
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.scripts.dev).toBeDefined();
    expect(packageJson.scripts.test).toBeDefined();
  });

  test('should have webpack dependencies', () => {
    const packageJson = require('../package.json');
    expect(packageJson.devDependencies.webpack).toBeDefined();
    expect(packageJson.devDependencies['webpack-cli']).toBeDefined();
    expect(packageJson.devDependencies['html-webpack-plugin']).toBeDefined();
  });
});

describe('File Structure', () => {
  test('should have src directory', () => {
    const srcPath = path.resolve(__dirname, '../src');
    expect(fs.existsSync(srcPath)).toBe(true);
  });

  test('should have tests directory', () => {
    const testsPath = path.resolve(__dirname, '../tests');
    expect(fs.existsSync(testsPath)).toBe(true);
  });

  test('should have styles directory', () => {
    const stylesPath = path.resolve(__dirname, '../src/styles');
    expect(fs.existsSync(stylesPath)).toBe(true);
  });

  test('should have js directory', () => {
    const jsPath = path.resolve(__dirname, '../src/js');
    expect(fs.existsSync(jsPath)).toBe(true);
  });

  test('should have pages directory', () => {
    const pagesPath = path.resolve(__dirname, '../src/pages');
    expect(fs.existsSync(pagesPath)).toBe(true);
  });

  test('should have admin directory', () => {
    const adminPath = path.resolve(__dirname, '../src/admin');
    expect(fs.existsSync(adminPath)).toBe(true);
  });

  test('should have all admin page templates', () => {
    const adminPages = [
      'login.html', 'index.html', 'lessons.html', 'complexes.html',
      'schedule.html', 'users.html', 'subscriptions.html',
      'reviews.html', 'faq.html', 'promo.html', 'finance.html',
      'notifications.html', 'settings.html'
    ];
    adminPages.forEach(page => {
      const pagePath = path.resolve(__dirname, `../src/admin/${page}`);
      expect(fs.existsSync(pagePath)).toBe(true);
    });
  });
});
