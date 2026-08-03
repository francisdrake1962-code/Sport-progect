const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '..', 'src', 'admin');

function readAdminPage(filename) {
  return fs.readFileSync(path.join(adminDir, filename), 'utf8');
}

const adminPages = [
  'login.html',
  'index.html',
  'lessons.html',
  'complexes.html',
  'schedule.html',
  'users.html',
  'subscriptions.html',
  'reviews.html',
  'faq.html',
  'content.html',
  'promo.html',
  'finance.html',
  'notifications.html',
  'settings.html',
];

describe('Admin Panel — HTML Structure', () => {
  adminPages.forEach(file => {
    describe(file, () => {
      let html;
      beforeAll(() => { html = readAdminPage(file); });

      test('should exist and be readable', () => {
        expect(html.length).toBeGreaterThan(0);
      });

      test('should have <!DOCTYPE html>', () => {
        expect(html).toMatch(/<!DOCTYPE\s+html>/i);
      });

      test('should have lang="ru"', () => {
        expect(html).toMatch(/lang="ru"/);
      });

      test('should have meta viewport', () => {
        expect(html).toMatch(/name="viewport"/);
      });

      test('should link admin CSS', () => {
        expect(html).toMatch(/href="css\/admin\.css(?:\?v=(?:[a-f0-9]+|<%= assetVersion %>))?"/);
      });

      test('should load sidebar.js', () => {
        if (file !== 'login.html') {
          expect(html).toMatch(/src="js\/sidebar\.js(?:\?v=(?:[a-f0-9]+|<%= assetVersion %>))?"/);
        }
      });

      test('should load admin.js', () => {
        if (file !== 'login.html') {
          expect(html).toMatch(/src="js\/admin\.js(?:\?v=(?:[a-f0-9]+|<%= assetVersion %>))?"/);
        }
      });

      test('should load api.js', () => {
        expect(html).toMatch(/src="js\/api\.js(?:\?v=(?:[a-f0-9]+|<%= assetVersion %>))?"/);
      });

      test('should not have placeholder brackets', () => {
        expect(html).not.toMatch(/\[Имя тренера\]/);
        expect(html).not.toMatch(/\[TODO\]/);
        expect(html).not.toMatch(/\[PLACEHOLDER\]/);
      });
    });
  });
});

describe('Admin Panel — Login Page', () => {
  let html;
  beforeAll(() => { html = readAdminPage('login.html'); });

  test('should have login form', () => {
    expect(html).toMatch(/id="login-form"/);
  });

  test('should have email input', () => {
    expect(html).toMatch(/type="email"/);
  });

  test('should have password input', () => {
    expect(html).toMatch(/type="password"/);
  });

  test('should redirect to index.html on submit', () => {
    expect(html).toMatch(/window\.location\.href\s*=\s*['"]index\.html['"]/);
  });
});

describe('Admin Panel — Layout Pages (non-login)', () => {
  const layoutPages = adminPages.filter(p => p !== 'login.html');

  layoutPages.forEach(file => {
    test(`${file} should have admin-layout div`, () => {
      const html = readAdminPage(file);
      expect(html).toMatch(/class="admin-layout"/);
    });

    test(`${file} should call getTopbar()`, () => {
      const html = readAdminPage(file);
      expect(html).toMatch(/getTopbar\(/);
    });

    test(`${file} should call getSidebar()`, () => {
      const html = readAdminPage(file);
      expect(html).toMatch(/getSidebar\(/);
    });
  });
});

describe('Admin Panel — CRUD Pages have tables', () => {
  const crudPages = ['lessons.html', 'complexes.html', 'users.html', 'reviews.html', 'faq.html', 'promo.html', 'content.html'];

  crudPages.forEach(file => {
    test(`${file} should have a data table`, () => {
      const html = readAdminPage(file);
      expect(html).toMatch(/<table>/);
      expect(html).toMatch(/<thead>/);
      expect(html).toMatch(/tbody/);
    });
  });
});

describe('Admin Panel — Modal dialogs', () => {
  const modalPages = ['lessons.html', 'complexes.html', 'faq.html', 'promo.html', 'notifications.html'];

  modalPages.forEach(file => {
    test(`${file} should have a modal overlay`, () => {
      const html = readAdminPage(file);
      expect(html).toMatch(/class="modal-overlay"/);
    });

    test(`${file} should have modal open trigger`, () => {
      const html = readAdminPage(file);
      expect(html).toMatch(/data-modal-open/);
    });
  });
});

describe('Admin Panel — Dashboard stats', () => {
  test('index.html should have stat cards', () => {
    const html = readAdminPage('index.html');
    expect(html).toMatch(/class="stat-card"/);
    expect(html).toMatch(/class="stats-grid"/);
  });
});

describe('Admin Panel — CSS and JS files exist', () => {
  test('admin.css should exist', () => {
    expect(fs.existsSync(path.join(adminDir, 'css', 'admin.css'))).toBe(true);
  });

  test('admin.js should exist', () => {
    expect(fs.existsSync(path.join(adminDir, 'js', 'admin.js'))).toBe(true);
  });

  test('sidebar.js should exist', () => {
    expect(fs.existsSync(path.join(adminDir, 'js', 'sidebar.js'))).toBe(true);
  });
});

describe('Admin Panel — User view entry', () => {
  test('api.js should expose enterUserView entry point', () => {
    const api = fs.readFileSync(path.join(adminDir, 'js', 'api.js'), 'utf8');
    expect(api).toMatch(/enterUserView\(\)/);
    expect(api).toMatch(/localStorage\.setItem\('user_token', adminToken\)/);
    expect(api).toMatch(/'\.\.\/dashboard\.html'/);
  });

  test('sidebar.js should include a "Просмотр как пользователь" link with action', () => {
    const sidebar = fs.readFileSync(path.join(adminDir, 'js', 'sidebar.js'), 'utf8');
    expect(sidebar).toMatch(/Просмотр как пользователь/);
    expect(sidebar).toMatch(/enterUserView\(\)/);
    expect(sidebar).toMatch(/item\.action/);
  });
});
