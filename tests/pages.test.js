const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '..', 'src', 'pages');

function readPage(filename) {
  return fs.readFileSync(path.join(pagesDir, filename), 'utf8');
}

describe('Sub-pages — Actual HTML Validation', () => {
  describe('Is It Really Free Page', () => {
    let html;
    beforeAll(() => { html = readPage('is-it-really-free.html'); });

    test('should exist and be readable', () => {
      expect(html.length).toBeGreaterThan(0);
    });

    test('should have proper title', () => {
      expect(html).toMatch(/<title>[^<]+<\/title>/i);
    });

    test('should explain 7 free lessons without card', () => {
      expect(html).toContain('7');
      expect(html).toMatch(/без\s+привязки\s+карты/i);
    });

    test('should explain how it works in steps', () => {
      expect(html).toMatch(/<li/i);
    });

    test('should have page-content class', () => {
      expect(html).toMatch(/class="[^"]*page-content[^"]*"/);
    });

    test('should have copyright year 2026', () => {
      expect(html).toContain('2026');
    });

    test('should have link back to main page', () => {
      expect(html).toMatch(/href="\/"/);
    });
  });

  describe('How to Cancel Page', () => {
    let html;
    beforeAll(() => { html = readPage('how-to-cancel.html'); });

    test('should exist and be readable', () => {
      expect(html.length).toBeGreaterThan(0);
    });

    test('should have clear cancellation steps', () => {
      expect(html).toMatch(/<li/i);
    });

    test('should mention no retention tactics', () => {
      expect(html).toMatch(/скидк/i);
    });

    test('should have page-content class', () => {
      expect(html).toMatch(/class="[^"]*page-content[^"]*"/);
    });

    test('should have copyright year 2026', () => {
      expect(html).toContain('2026');
    });
  });

  describe('About Trainer Page', () => {
    let html;
    beforeAll(() => { html = readPage('about-trainer.html'); });

    test('should exist and be readable', () => {
      expect(html.length).toBeGreaterThan(0);
    });

    test('should mention certification', () => {
      expect(html).toMatch(/сертифицирован/i);
    });

    test('should mention practice start date', () => {
      expect(html).toContain('17 октября 2022');
    });

    test('should mention number of lessons', () => {
      expect(html).toMatch(/тысячи\s+ста/i);
    });

    test('should have page-content class', () => {
      expect(html).toMatch(/class="[^"]*page-content[^"]*"/);
    });

    test('should have copyright year 2026', () => {
      expect(html).toContain('2026');
    });
  });

  describe('8 Pieces of Brocade Page', () => {
    let html;
    beforeAll(() => { html = readPage('8-pieces-of-brocade.html'); });

    test('should exist and be readable', () => {
      expect(html.length).toBeGreaterThan(0);
    });

    test('should have proper title', () => {
      expect(html).toMatch(/<title>[^<]*8 кусков парчи[^<]*<\/title>/i);
    });

    test('should mention 8 exercises', () => {
      expect(html).toMatch(/восьми\s+упражнений/i);
    });

    test('should mention traditional practice', () => {
      expect(html).toMatch(/традицион/i);
    });

    test('should have page-content class', () => {
      expect(html).toMatch(/class="[^"]*page-content[^"]*"/);
    });

    test('should have copyright year 2026', () => {
      expect(html).toContain('2026');
    });
  });

  describe('Yijinjing Page', () => {
    let html;
    beforeAll(() => { html = readPage('yijinjing.html'); });

    test('should exist and be readable', () => {
      expect(html.length).toBeGreaterThan(0);
    });

    test('should have proper title', () => {
      expect(html).toMatch(/<title>[^<]*И Цзинь Цзин[^<]*<\/title>/i);
    });

    test('should mention classical gymnastics', () => {
      expect(html).toMatch(/классическ/i);
    });

    test('should have page-content class', () => {
      expect(html).toMatch(/class="[^"]*page-content[^"]*"/);
    });

    test('should have copyright year 2026', () => {
      expect(html).toContain('2026');
    });
  });

  describe('Small Circulation Page', () => {
    let html;
    beforeAll(() => { html = readPage('small-circulation.html'); });

    test('should exist and be readable', () => {
      expect(html.length).toBeGreaterThan(0);
    });

    test('should have proper title', () => {
      expect(html).toMatch(/<title>[^<]*Малый небесный круг[^<]*<\/title>/i);
    });

    test('should mention energy practice', () => {
      expect(html).toMatch(/энерг/i);
    });

    test('should have page-content class', () => {
      expect(html).toMatch(/class="[^"]*page-content[^"]*"/);
    });

    test('should have copyright year 2026', () => {
      expect(html).toContain('2026');
    });
  });

  describe('All Sub-pages — Common Checks', () => {
    const files = [
      'is-it-really-free.html',
      'how-to-cancel.html',
      'about-trainer.html',
      '8-pieces-of-brocade.html',
      'yijinjing.html',
      'small-circulation.html'
    ];

    files.forEach(file => {
      describe(file, () => {
        let html;
        beforeAll(() => { html = readPage(file); });

        test('should have <!DOCTYPE html>', () => {
          expect(html).toMatch(/<!DOCTYPE\s+html>/i);
        });

        test('should have viewport meta tag', () => {
          expect(html).toMatch(/name="viewport"/);
        });

        test('should have meta description', () => {
          expect(html).toMatch(/name="description"/);
        });

        test('should have <header> element', () => {
          expect(html).toMatch(/<header/i);
        });

        test('should have <main> element', () => {
          expect(html).toMatch(/<main/i);
        });

        test('should have <footer> element', () => {
          expect(html).toMatch(/<footer/i);
        });

        test('should use CSS class .page-content', () => {
          expect(html).toMatch(/class="[^"]*page-content[^"]*"/);
        });

        test('should have copyright year 2026', () => {
          expect(html).toContain('2026');
        });

        test('should link to main page', () => {
          expect(html).toMatch(/href="\/"/);
        });

        test('should have nav with role and aria-label', () => {
          expect(html).toMatch(/role="navigation"/);
          expect(html).toMatch(/aria-label="Основная навигация"/);
        });

        test('should have hamburger with aria-expanded', () => {
          expect(html).toMatch(/class="header__menu-toggle"[^>]*aria-expanded/);
        });
      });
    });
  });
});
