const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '..', 'src', 'pages');

function readPage(filename) {
  return fs.readFileSync(path.join(pagesDir, filename), 'utf8');
}

describe('Footer Pages — Actual HTML Validation', () => {
  const footerPages = [
    { file: 'terms.html', title: 'Условия использования' },
    { file: 'refund.html', title: 'Политика возврата' },
    { file: 'privacy.html', title: 'Политика конфиденциальности' },
    { file: 'contact.html', title: 'Связаться с нами' },
    { file: 'faq.html', title: 'FAQ' },
  ];

  footerPages.forEach(({ file, title }) => {
    describe(file, () => {
      let html;
      beforeAll(() => { html = readPage(file); });

      test('should exist and be readable', () => {
        expect(html.length).toBeGreaterThan(0);
      });

      test('should have <!DOCTYPE html>', () => {
        expect(html).toMatch(/<!DOCTYPE\s+html>/i);
      });

      test('should have proper title', () => {
        expect(html).toMatch(new RegExp(`<title>[^<]*${title}[^<]*</title>`, 'i'));
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

      test('should have hamburger button', () => {
        expect(html).toMatch(/class="header__menu-toggle"/);
      });

      test('should have nav with role and aria-label', () => {
        expect(html).toMatch(/role="navigation"/);
        expect(html).toMatch(/aria-label="Основная навигация"/);
      });

      test('should have footer links to all other pages', () => {
        expect(html).toMatch(/href="\/terms"/);
        expect(html).toMatch(/href="\/refund"/);
        expect(html).toMatch(/href="\/privacy"/);
        expect(html).toMatch(/href="\/contact"/);
        expect(html).toMatch(/href="\/faq"/);
      });
    });
  });

  describe('FAQ Page — Content', () => {
    let html;
    beforeAll(() => { html = readPage('faq.html'); });

    test('should have a faq-list container for dynamic loading', () => {
      expect(html).toMatch(/id="faq-list"/);
    });

    test('should show loading placeholder while fetching FAQ', () => {
      expect(html).toMatch(/Загрузка/);
    });

    test('should fetch FAQ data from /api/faq', () => {
      expect(html).toMatch(/fetch\(['"']\/api\/faq['"']\)/);
    });

    test('should render FAQ items using <details> elements via JS', () => {
      expect(html).toMatch(/<details class="faq__item">/);
    });

    test('should use esc() for XSS protection in FAQ rendering', () => {
      expect(html).toMatch(/function esc\(/);
    });

    test('should handle FAQ load errors gracefully', () => {
      expect(html).toMatch(/Не удалось загрузить FAQ/);
    });

    test('should include CTA block for contacting support', () => {
      expect(html).toMatch(/Связаться с нами/);
    });
  });

  describe('Terms Page — Content', () => {
    let html;
    beforeAll(() => { html = readPage('terms.html'); });

    test('should mention subscription', () => {
      expect(html).toMatch(/подписк/i);
    });

    test('should mention intellectual property', () => {
      expect(html).toMatch(/интеллектуальн/i);
    });

    test('should mention limitation of liability', () => {
      expect(html).toMatch(/ответственн/i);
    });
  });

  describe('Refund Page — Content', () => {
    let html;
    beforeAll(() => { html = readPage('refund.html'); });

    test('should explain refund process', () => {
      expect(html).toMatch(/<li/i);
    });

    test('should mention refund guarantee', () => {
      expect(html).toMatch(/гаранти/i);
    });
  });

  describe('Contact Page — Content', () => {
    let html;
    beforeAll(() => { html = readPage('contact.html'); });

    test('should have email link', () => {
      expect(html).toMatch(/mailto:/);
    });

    test('should list help topics', () => {
      expect(html).toMatch(/<li/i);
    });
  });
});
