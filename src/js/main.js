import '../styles/main.css';
import './i18n.js';

// CONTENT-001: static sub-pages carry data-content-slug on <body>. When a
// site_content record exists for that slug, replace the editable block with
// the admin-saved HTML (title/meta too). No record -> keep the static markup.
function applySiteContent() {
    var main = document.getElementById('main-content');
    var body = document.body;
    var slug = body && body.getAttribute('data-content-slug');
    if (!main || !slug) return;

    fetch('/api/content/' + encodeURIComponent(slug))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data || !data.content) return;
            main.innerHTML = data.content;
            if (data.meta_title) document.title = data.meta_title;
            if (data.meta_description) {
                var meta = document.querySelector('meta[name="description"]');
                if (meta) meta.setAttribute('content', data.meta_description);
            }
        })
        .catch(function() { /* keep static fallback */ });
}

// RBAC-aware header. A single login page now serves both subscribers and
// admins, so the public header must show role-appropriate links:
//   guest      -> Войти / Начать бесплатно
//   subscriber -> Дашборд · Профиль · Выйти
//   admin      -> Админ-панель · Выйти  (admins may also visit user pages)
function applyAuthNav() {
    var nav = document.querySelector('.header__nav');
    if (!nav) return;

    var adminToken = localStorage.getItem('admin_token');
    var userToken = localStorage.getItem('user_token');
    if (!adminToken && !userToken) return;

    var langWrap = nav.querySelector('.header__language, #lang-switcher');
    nav.innerHTML = '';

    if (langWrap) nav.appendChild(langWrap);

    var links = [];
    if (adminToken) {
        // Admin browsing the public site: link to the admin panel only. Subscriber
        // pages are previewed from the panel via "Просмотр как пользователь".
        links.push({ href: 'admin/index.html', text: 'Админ-панель', cls: 'header__login' });
    } else if (userToken) {
        links.push({ href: 'dashboard.html', text: 'Дашборд', cls: 'header__login' });
        links.push({ href: 'profile.html', text: 'Профиль', cls: 'header__login' });
    }
    links.push({ href: '#', text: 'Выйти', cls: 'header__login header__login--logout' });

    links.forEach(function(link) {
        var a = document.createElement('a');
        a.href = link.href;
        a.textContent = link.text;
        a.className = link.cls;
        if (link.href === '#') {
            a.addEventListener('click', function(e) {
                e.preventDefault();
                localStorage.removeItem('admin_token');
                localStorage.removeItem('user_token');
                localStorage.removeItem('user_data');
                window.location.href = '/';
            });
        }
        nav.appendChild(a);
    });
}

// When an admin opens user-facing pages (dashboard/profile/lessons/…), show a
// persistent banner clarifying this is a demo view and how to get back to the
// admin panel. Only user-facing pages get it (admin pages have their own layout).
function applyDemoBanner() {
    if (!localStorage.getItem('admin_token')) return;
    var allowList = ['dashboard.html', 'profile.html', 'lessons.html', 'calendar.html', 'player.html', 'plans.html', 'picker.html', 'onboarding.html'];
    var page = window.location.pathname.split('/').pop() || 'index.html';
    if (allowList.indexOf(page) === -1) return;
    if (document.getElementById('admin-demo-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'admin-demo-banner';
    banner.style.cssText = 'position:sticky;top:0;z-index:1000;background:#332d0a;border-bottom:1px solid #6b5a12;color:#fff;padding:0.5rem 1rem;font-family:sans-serif;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:0.75rem;flex-wrap:wrap;text-align:center;';
    banner.innerHTML =
        '<span>👁️ Режим просмотра как пользователь — данные демонстрационные</span>' +
        '<a href="/admin/index.html" style="color:#ffd75e;font-weight:600;text-decoration:underline;white-space:nowrap;">Вернуться в админ-панель →</a>';
    document.body.insertBefore(banner, document.body.firstChild);
}

document.addEventListener('DOMContentLoaded', function() {
    applyDemoBanner();
    applyAuthNav();
    if (window.i18n) window.i18n.init();

    // Language switcher dropdown
    var langBtn = document.querySelector('.language-switcher');
    var langDropdown = document.querySelector('.language-switcher__dropdown');
    if (langBtn && langDropdown) {
        langBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            langDropdown.classList.toggle('open');
        });
        document.addEventListener('click', function() {
            langDropdown.classList.remove('open');
        });
        langDropdown.querySelectorAll('.language-switcher__option').forEach(function(opt) {
            opt.addEventListener('click', function(e) {
                e.stopPropagation();
                var lang = opt.getAttribute('data-lang');
                if (window.i18n) window.i18n.setLanguage(lang);
                langDropdown.classList.remove('open');
                document.querySelectorAll('.language-switcher__option').forEach(function(o) {
                    o.classList.toggle('active', o.getAttribute('data-lang') === lang);
                });
            });
        });
        // Mark current language active
        var curLang = window.i18n ? window.i18n.getCurrentLang() : 'ru';
        document.querySelectorAll('.language-switcher__option').forEach(function(o) {
            o.classList.toggle('active', o.getAttribute('data-lang') === curLang);
        });
    }

    // FAQ accordion functionality
    document.querySelectorAll('.faq__item').forEach(item => {
        item.addEventListener('toggle', function() {
            if (this.open) {
                // Close other FAQ items
                document.querySelectorAll('.faq__item').forEach(otherItem => {
                    if (otherItem !== this && otherItem.open) {
                        otherItem.open = false;
                    }
                });
            }
        });
    });

    // Video error handling
    const heroVideo = document.querySelector('.hero__video video');
    if (heroVideo) {
        heroVideo.addEventListener('error', function() {
            this.style.display = 'none';
        });
    }

    // Mobile menu toggle
    const menuToggle = document.querySelector('.header__menu-toggle');
    const nav = document.querySelector('.header__nav');
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', function() {
            const isOpen = nav.classList.toggle('is-open');
            this.setAttribute('aria-expanded', isOpen);
        });

        // Close menu on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && nav.classList.contains('is-open')) {
                nav.classList.remove('is-open');
                menuToggle.setAttribute('aria-expanded', 'false');
                menuToggle.focus();
            }
        });

        // Close menu on outside click
        document.addEventListener('click', function(e) {
            if (nav.classList.contains('is-open') && !nav.contains(e.target) && !menuToggle.contains(e.target)) {
                nav.classList.remove('is-open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Service worker disabled — was causing cached stale pages, blocked CSS/video
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
            regs.forEach(function(r) { r.unregister(); });
        });
    }

    applySiteContent();
});
