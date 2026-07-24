const fs = require('fs');
const path = require('path');

function readHTML(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function countOccurrences(html, substring) {
  return html.split(substring).length - 1;
}

describe('Landing Page — Actual HTML Validation', () => {
  let html;

  beforeAll(() => {
    html = readHTML('../src/index.html');
  });

  describe('Header', () => {
    test('should contain logo image', () => {
      expect(html).toMatch(/<img[^>]*alt="[^"]*"[^>]*>/i);
    });

    test('should have language switcher button with aria-label', () => {
      expect(html).toMatch(/<button[^>]*class="language-switcher"[^>]*aria-label="[^"]*"/i);
    });

    test('should have login link', () => {
      expect(html).toMatch(/<a[^>]*href="login\.html"[^>]*class="header__login"[^>]*>Войти<\/a>/s);
    });

    test('should have CTA button with text "Начать бесплатно"', () => {
      expect(html).toMatch(/id="hero-cta"[\s\S]*?>[\s\S]*?Начать бесплатно/);
    });

    test('should have mobile hamburger button', () => {
      expect(html).toMatch(/header__menu-toggle/);
    });
  });

  describe('Hero Section', () => {
    test('should have h1 with meaningful content', () => {
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      expect(h1Match).toBeTruthy();
      const h1Text = h1Match[1].trim();
      expect(h1Text.length).toBeGreaterThan(5);
      expect(h1Text).not.toMatch(/\[.*?\]/);
    });

    test('should have subtitle mentioning "4 года"', () => {
      expect(html).toMatch(/почти 4 года/);
    });

    test('should have CTA mentioning "7 занятий"', () => {
      expect(html).toMatch(/7 занятий/);
    });

    test('should have video element', () => {
      expect(html).toMatch(/<video[^>]*>/);
    });
  });

  describe('Benefits Section', () => {
    test('should have exactly 4 benefit cards', () => {
      expect(countOccurrences(html, 'benefit-card"')).toBe(4);
    });

    test('should contain benefit about daily practice', () => {
      expect(html).toMatch(/Занятие на каждый день/);
    });

    test('should contain benefit about filtering', () => {
      expect(html).toMatch(/Подбор по самочувствию/);
    });

    test('should contain benefit about year without repeats', () => {
      expect(html).toMatch(/Целый год без повторов/);
    });

    test('should contain benefit about TV', () => {
      expect(html).toMatch(/Смотрите на телевизоре/);
    });
  });

  describe('How It Works Section', () => {
    test('should have 3 screenshot cards', () => {
      expect(countOccurrences(html, 'screenshot-card')).toBeGreaterThanOrEqual(3);
    });

    test('should mention "Сегодня" screen', () => {
      expect(html).toMatch(/Сегодня/);
    });

    test('should mention "Подобрать занятие" screen', () => {
      expect(html).toMatch(/Подобрать занятие/);
    });

    test('should mention "Календарь" screen', () => {
      expect(html).toMatch(/Календарь/);
    });
  });

  describe('Formats Section', () => {
    test('should have 3 format cards', () => {
      expect(countOccurrences(html, 'format-card')).toBeGreaterThanOrEqual(3);
    });

    test('should mention floor format', () => {
      expect(html).toMatch(/На полу/);
    });

    test('should mention chair format', () => {
      expect(html).toMatch(/На стуле/);
    });

    test('should mention standing format', () => {
      expect(html).toMatch(/Стоя/);
    });
  });

  describe('Trust Numbers', () => {
    test('should have trust numbers section', () => {
      expect(html).toMatch(/trust-numbers/);
    });

    test('should have stat-lessons element for dynamic load', () => {
      expect(html).toMatch(/id="stat-lessons"/);
    });

    test('should have stat-subscribers element for dynamic load', () => {
      expect(html).toMatch(/id="stat-subscribers"/);
    });

    test('should fetch stats from /api/user/stats', () => {
      expect(html).toMatch(/\/api\/user\/stats/);
    });
  });

  describe('FAQ Section', () => {
    test('should have 5 FAQ items using <details> elements', () => {
      expect(countOccurrences(html, '<details class="faq__item">')).toBe(5);
    });

    test('should include question about physical preparation', () => {
      expect(html).toMatch(/Нужна ли физическая подготовка/);
    });

    test('should include question about injuries', () => {
      expect(html).toMatch(/травма или ограничение/);
    });

    test('should include question about free start', () => {
      expect(html).toMatch(/Это правда бесплатно/);
    });

    test('should include question about TV', () => {
      expect(html).toMatch(/заниматься на телевизоре/);
    });

    test('should include question about cancellation', () => {
      expect(html).toMatch(/Как отменить подписку/);
    });
  });

  describe('Testimonials Section', () => {
    test('should have testimonials grid container for dynamic load', () => {
      expect(html).toMatch(/id="testimonials-grid"/);
    });

    test('should fetch reviews from /api/reviews', () => {
      expect(html).toMatch(/\/api\/reviews/);
    });
  });

  describe('Final CTA', () => {
    test('hero should mention "7 занятий бесплатно"', () => {
      expect(html).toMatch(/7 занятий бесплатно/);
    });
  });

  describe('Footer', () => {
    test('should have link to About Trainer', () => {
      expect(html).toMatch(/href="\/about-trainer"/);
    });

    test('should have link to Is It Really Free', () => {
      expect(html).toMatch(/href="\/is-it-really-free"/);
    });

    test('should have link to How to Cancel', () => {
      expect(html).toMatch(/href="\/how-to-cancel"/);
    });

    test('should have link to 8 Pieces of Brocade', () => {
      expect(html).toMatch(/href="\/8-pieces-of-brocade"/);
    });

    test('should have link to Yijinjing', () => {
      expect(html).toMatch(/href="\/yijinjing"/);
    });

    test('should have link to Small Circulation', () => {
      expect(html).toMatch(/href="\/small-circulation"/);
    });

    test('should have Terms of Service link', () => {
      expect(html).toMatch(/href="\/terms"/);
    });

    test('should have Refund Policy link', () => {
      expect(html).toMatch(/href="\/refund"/);
    });

    test('should have Privacy Policy link', () => {
      expect(html).toMatch(/href="\/privacy"/);
    });

    test('should have Contact link', () => {
      expect(html).toMatch(/href="\/contact"/);
    });

    test('should have FAQ link', () => {
      expect(html).toMatch(/href="\/faq"/);
    });

    test('should have copyright year 2026', () => {
      expect(html).toMatch(/© 2026/);
    });
  });

  describe('Semantic HTML', () => {
    test('should have <header> element', () => {
      expect(html).toMatch(/<header[\s>]/);
    });

    test('should have <main> element', () => {
      expect(html).toMatch(/<main[\s>]/);
    });

    test('should have <footer> element', () => {
      expect(html).toMatch(/<footer[\s>]/);
    });

    test('should have at least 8 <section> elements', () => {
      expect(countOccurrences(html, '<section')).toBeGreaterThanOrEqual(8);
    });

    test('should have viewport meta tag', () => {
      expect(html).toMatch(/<meta name="viewport"/);
    });

    test('should have meta description', () => {
      expect(html).toMatch(/<meta name="description"/);
    });
  });
});
