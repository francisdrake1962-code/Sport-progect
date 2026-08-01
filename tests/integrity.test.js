const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const pagesDir = path.join(srcDir, 'pages');

function readHTML(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function getAllHTMLFiles() {
  const files = [];
  files.push(path.join(srcDir, 'index.html'));
  fs.readdirSync(pagesDir).forEach(f => {
    if (f.endsWith('.html')) files.push(path.join(pagesDir, f));
  });
  return files;
}

describe('Content Integrity', () => {
  describe('No CJK characters in content', () => {
    const files = getAllHTMLFiles();

    files.forEach(file => {
      const relPath = path.relative(path.join(__dirname, '..'), file);
      test(`${relPath} should not contain Chinese/Japanese/Korean characters`, () => {
        const html = readHTML(file);
        const cjkRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g;
        const matches = html.match(cjkRegex);
        expect(matches).toBeNull();
      });
    });
  });

  describe('No hardcoded CSS/JS resource tags', () => {
    const standalonePages = ['lessons.html', 'player.html', 'login.html', 'reset-password.html', 'calendar.html', 'plans.html', 'picker.html', 'profile.html', 'dashboard.html', 'onboarding.html', 'payment-status.html'];
    const files = getAllHTMLFiles().filter(f => !standalonePages.includes(path.basename(f)));

    files.forEach(file => {
      const relPath = path.relative(path.join(__dirname, '..'), file);
      test(`${relPath} should not have hardcoded stylesheet link`, () => {
        const html = readHTML(file);
        expect(html).not.toMatch(/<link[^>]*href=["'](?:\.\.\/)?styles\/main\.css["']/);
      });

      test(`${relPath} should not have hardcoded script tag`, () => {
        const html = readHTML(file);
        expect(html).not.toMatch(/<script[^>]*src=["'](?:\.\.\/)?js\/main\.js["']/);
      });
    });
  });

  describe('Video fallback', () => {
    test('index.html video should have fallback content', () => {
      const html = readHTML(path.join(srcDir, 'index.html'));
      const videoMatch = html.match(/<video[^>]*>([\s\S]*?)<\/video>/);
      expect(videoMatch).toBeTruthy();
      const videoContent = videoMatch[1];
      expect(videoContent.trim().length).toBeGreaterThan(0);
      expect(videoContent).toMatch(/<p[\s>]/);
    });
  });

  describe('Terms page content', () => {
    test('terms.html should not contain "Об о существенных"', () => {
      const html = readHTML(path.join(pagesDir, 'terms.html'));
      expect(html).not.toMatch(/Об о существенн/);
    });

    test('terms.html should contain "Об существенных"', () => {
      const html = readHTML(path.join(pagesDir, 'terms.html'));
      expect(html).toMatch(/Об существенн/);
    });
  });

  describe('No English words in Russian content', () => {
    test('yijinjing.html should not contain English word "organically"', () => {
      const html = readHTML(path.join(pagesDir, 'yijinjing.html'));
      expect(html).not.toMatch(/organically/i);
    });

    test('8-pieces-of-brocade.html should not contain Chinese word for coordination', () => {
      const html = readHTML(path.join(pagesDir, '8-pieces-of-brocade.html'));
      const cjkRegex = /[\u4e00-\u9fff]/g;
      const matches = html.match(cjkRegex);
      expect(matches).toBeNull();
    });
  });

  describe('Round 2 — Garbled text check', () => {
    test('8-pieces-of-brocade.html should not contain garbled "ввплавно"', () => {
      const html = readHTML(path.join(pagesDir, '8-pieces-of-brocade.html'));
      expect(html).not.toMatch(/ввплавно/);
    });

    test('8-pieces-of-brocade.html should not contain duplicated "с дыханием с дыханием"', () => {
      const html = readHTML(path.join(pagesDir, '8-pieces-of-brocade.html'));
      expect(html).not.toMatch(/с дыханием с дыханием/);
    });
  });

  describe('Round 2 — No placeholder in title/meta', () => {
    test('index.html <title> should not contain placeholder brackets', () => {
      const html = readHTML(path.join(srcDir, 'index.html'));
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      expect(titleMatch).toBeTruthy();
      expect(titleMatch[1]).not.toMatch(/\[.*?\]/);
    });

    test('about-trainer.html meta description should not contain placeholder', () => {
      const html = readHTML(path.join(pagesDir, 'about-trainer.html'));
      const metaMatch = html.match(/<meta\s+name="description"\s+content="(.*?)">/);
      expect(metaMatch).toBeTruthy();
      expect(metaMatch[1]).not.toMatch(/\[.*?\]/);
    });
  });

  describe('Round 2 — No placeholder in hero', () => {
    test('index.html h1 should not contain placeholder brackets', () => {
      const html = readHTML(path.join(srcDir, 'index.html'));
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      expect(h1Match).toBeTruthy();
      expect(h1Match[1]).not.toMatch(/\[.*?\]/);
    });

    test('index.html hero subtitle should not contain placeholder brackets', () => {
      const html = readHTML(path.join(srcDir, 'index.html'));
      const subtitleMatch = html.match(/hero__subtitle[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
      expect(subtitleMatch).toBeTruthy();
      expect(subtitleMatch[1]).not.toMatch(/\[.*?\]/);
    });
  });

  describe('Round 2 — No placeholder in footer copyright', () => {
    const files = getAllHTMLFiles();

    files.forEach(file => {
      const relPath = path.relative(path.join(__dirname, '..'), file);
      test(`${relPath} footer copyright should not contain placeholder brackets`, () => {
        const html = readHTML(file);
        const copyrightMatch = html.match(/footer__copyright[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
        if (copyrightMatch) {
          expect(copyrightMatch[1]).not.toMatch(/\[.*?\]/);
        }
      });
    });
  });

  describe('Round 2 — Logo paths in sub-pages', () => {
    const subPages = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html') && !['lessons.html', 'player.html', 'login.html', 'reset-password.html', 'calendar.html', 'plans.html', 'picker.html', 'profile.html', 'dashboard.html', 'onboarding.html', 'payment-status.html'].includes(f));

    subPages.forEach(file => {
      test(`${file} logo img should use images/logo.svg (not ../images/logo.svg)`, () => {
        const html = readHTML(path.join(pagesDir, file));
        expect(html).not.toMatch(/src=["']\.\.\/images\/logo\.svg["']/);
        expect(html).toMatch(/src=["']images\/logo\.svg["']/);
      });
    });
  });

  describe('Round 2 — No 404 auth links', () => {
    const files = getAllHTMLFiles();

    files.forEach(file => {
      const relPath = path.relative(path.join(__dirname, '..'), file);
      test(`${relPath} should not link to /login or /signup`, () => {
        const html = readHTML(file);
        expect(html).not.toMatch(/href=["']\/login["']/);
        expect(html).not.toMatch(/href=["']\/signup["']/);
      });
    });
  });

  describe('Round 2 — Accessibility: focus styles', () => {
    test('main.css should contain :focus-visible rule', () => {
      const css = fs.readFileSync(path.join(srcDir, 'styles', 'main.css'), 'utf8');
      expect(css).toMatch(/focus-visible/);
    });
  });

  describe('Round 2 — Accessibility: skip-to-content link', () => {
    const files = getAllHTMLFiles().filter(f => !['lessons.html', 'player.html', 'login.html', 'reset-password.html', 'calendar.html', 'plans.html', 'picker.html', 'profile.html', 'payment-status.html'].includes(path.basename(f)));

    files.forEach(file => {
      const relPath = path.relative(path.join(__dirname, '..'), file);
      test(`${relPath} should have skip-to-content link`, () => {
        const html = readHTML(file);
        expect(html).toMatch(/skip-link/);
        expect(html).toMatch(/id="main-content"/);
      });
    });
  });

  describe('Round 2 — robots.txt cleanup', () => {
    test('robots.txt should not have duplicate Allow: /', () => {
      const robots = fs.readFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
      const allowMatches = robots.match(/^Allow: \/$/gm);
      expect(allowMatches).toHaveLength(1);
    });
  });

  describe('Round 2 — Emoji accessibility', () => {
    test('index.html benefit icons should have aria-label', () => {
      const html = readHTML(path.join(srcDir, 'index.html'));
      const iconMatches = html.match(/benefit-card__icon[^>]*>/g);
      expect(iconMatches).toBeTruthy();
      iconMatches.forEach(match => {
        expect(match).toMatch(/aria-label/);
      });
    });
  });

  describe('Round 13 — player.html stream-token per-code handling', () => {
    const playerHtml = readHTML(path.join(pagesDir, 'player.html'));

    test('should handle STREAMING_NOT_CONFIGURED (503) with a dedicated message', () => {
      expect(playerHtml).toMatch(/STREAMING_NOT_CONFIGURED/);
    });

    test('should reference EMAIL_CONFIRMATION_REQUIRED in the player page', () => {
      expect(playerHtml).toMatch(/EMAIL_CONFIRMATION_REQUIRED/);
    });

    test('should not swallow stream-token failures silently', () => {
      const m = playerHtml.match(/api\('\/api\/user\/stream-token\/'\s*\+\s*lesson\.id\)[\s\S]*?\}\s*catch\s*\(([^)]*)\)\s*\{/);
      expect(m).toBeTruthy();
      expect(m[1].trim()).not.toBe('_');
    });
  });
});
