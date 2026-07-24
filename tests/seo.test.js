const { describe, test, expect } = require('@jest/globals');
const path = require('path');
const fs = require('fs');

describe('SEO Files', () => {
  test('should have sitemap.xml', () => {
    const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');
    expect(fs.existsSync(sitemapPath)).toBe(true);
  });

  test('should have robots.txt', () => {
    const robotsPath = path.resolve(__dirname, '../public/robots.txt');
    expect(fs.existsSync(robotsPath)).toBe(true);
  });

  test('sitemap should have proper XML structure', () => {
    const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');
    const content = fs.readFileSync(sitemapPath, 'utf8');
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).toContain('<urlset');
    expect(content).toContain('</urlset>');
  });

  test('sitemap should have all pages', () => {
    const sitemapPath = path.resolve(__dirname, '../public/sitemap.xml');
    const content = fs.readFileSync(sitemapPath, 'utf8');
    
    const pages = [
      '/',
      '/about-trainer',
      '/is-it-really-free',
      '/how-to-cancel',
      '/8-pieces-of-brocade',
      '/yijinjing',
      '/small-circulation',
      '/terms',
      '/refund',
      '/privacy',
      '/contact',
      '/faq'
    ];
    
    pages.forEach(page => {
      expect(content).toContain(`<loc>https://qigong-landing.com${page}</loc>`);
    });
  });

  test('robots.txt should allow all crawlers', () => {
    const robotsPath = path.resolve(__dirname, '../public/robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf8');
    expect(content).toContain('User-agent: *');
    expect(content).toContain('Allow: /');
  });

  test('robots.txt should reference sitemap', () => {
    const robotsPath = path.resolve(__dirname, '../public/robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf8');
    expect(content).toContain('Sitemap: https://qigong-landing.com/sitemap.xml');
  });
});

describe('HTML Meta Tags', () => {
  test('main page should have meta description', () => {
    const mainPagePath = path.resolve(__dirname, '../src/index.html');
    const content = fs.readFileSync(mainPagePath, 'utf8');
    expect(content).toContain('<meta name="description"');
  });

  test('main page should have proper title', () => {
    const mainPagePath = path.resolve(__dirname, '../src/index.html');
    const content = fs.readFileSync(mainPagePath, 'utf8');
    expect(content).toContain('<title>');
  });

  test('main page should have viewport meta', () => {
    const mainPagePath = path.resolve(__dirname, '../src/index.html');
    const content = fs.readFileSync(mainPagePath, 'utf8');
    expect(content).toContain('<meta name="viewport"');
  });

  test('trust pages should have meta descriptions', () => {
    const pages = [
      'is-it-really-free.html',
      'how-to-cancel.html',
      'about-trainer.html'
    ];
    
    pages.forEach(page => {
      const pagePath = path.resolve(__dirname, `../src/pages/${page}`);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('<meta name="description"');
    });
  });

  test('SEO pages should have meta descriptions', () => {
    const pages = [
      '8-pieces-of-brocade.html',
      'yijinjing.html',
      'small-circulation.html'
    ];
    
    pages.forEach(page => {
      const pagePath = path.resolve(__dirname, `../src/pages/${page}`);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('<meta name="description"');
    });
  });
});
