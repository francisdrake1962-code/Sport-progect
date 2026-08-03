/**
 * i18n module — lightweight internationalization for vanilla JS pages.
 *
 * Usage (any page that includes this script):
 *   1. Add data-i18n="key" to any element whose textContent should be translated.
 *   2. Call window.i18n.init() on DOMContentLoaded (or let the auto-init handle it).
 *   3. Use window.i18n.t('key') for dynamic strings in inline scripts.
 *   4. Call window.i18n.setLanguage(lang) to switch language at runtime.
 *
 * Language priority:
 *   1. localStorage 'preferred_language'
 *   2. Logged-in subscriber's preferred_language from /api/user/me
 *   3. IP-based detection from /api/user/detect-language
 *   4. Fallback 'ru'
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'preferred_language';
  var translations = {};
  var currentLang = localStorage.getItem(STORAGE_KEY) || 'ru';
  var loaded = {};

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadTranslations(lang) {
    if (loaded[lang]) return Promise.resolve(translations[lang]);
    return fetch('/api/i18n/' + lang)
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + lang);
        return r.json();
      })
      .then(function (data) {
        translations[lang] = data;
        loaded[lang] = true;
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function applyTranslations() {
    var dict = translations[currentLang] || {};
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var text = dict[key];
      if (text !== undefined) {
        el.textContent = text;
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var text = dict[key];
      if (text !== undefined) {
        el.placeholder = text;
      }
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      var text = dict[key];
      if (text !== undefined) {
        el.setAttribute('aria-label', text);
      }
    });
    var langLabel = dict['lang.code'] || currentLang;
    document.querySelectorAll('.language-switcher__current').forEach(function (el) {
      el.textContent = langLabel.toUpperCase();
    });
    if (document.documentElement) {
      document.documentElement.lang = currentLang;
    }
  }

  function setLanguage(lang) {
    if (!lang || lang === currentLang) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    loadTranslations(lang).then(function () {
      applyTranslations();
    });
    var token = localStorage.getItem('user_token');
    if (token) {
      fetch('/api/user/language', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ language: lang })
      }).catch(function () {});
    }
  }

  function t(key) {
    var dict = translations[currentLang] || translations['ru'] || {};
    return dict[key] !== undefined ? dict[key] : key;
  }

  function getCurrentLang() {
    return currentLang;
  }

  function showLanguageBanner(detectedLang) {
    if (localStorage.getItem('lang_banner_dismissed') === '1') return;
    var dict = translations[detectedLang] || {};
    var bannerText = dict['lang.banner.text'] || '';
    var bannerChange = dict['lang.banner.change'] || 'Change';
    if (!bannerText) return;
    var banner = document.createElement('div');
    banner.id = 'lang-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#f1ece2;border-top:1px solid #e3d8c3;padding:0.75rem 1rem;display:flex;align-items:center;justify-content:center;gap:1rem;z-index:9999;font-size:0.85rem;color:#2b2721;font-family:sans-serif;';
    banner.innerHTML = esc(bannerText) +
      ' <button id="lang-banner-change" style="background:none;border:1px solid #d8cbb2;padding:0.3rem 0.8rem;border-radius:4px;color:#8a6f52;cursor:pointer;font-size:0.8rem;">' + esc(bannerChange) + '</button>' +
      ' <button id="lang-banner-dismiss" style="background:none;border:none;color:#8a6f52;cursor:pointer;font-size:1.1rem;padding:0 0.3rem;">&times;</button>';
    document.body.appendChild(banner);
    document.getElementById('lang-banner-change').addEventListener('click', function () {
      var newLang = currentLang === 'ru' ? 'en' : 'ru';
      setLanguage(newLang);
      banner.remove();
      localStorage.setItem('lang_banner_dismissed', '1');
    });
    document.getElementById('lang-banner-dismiss').addEventListener('click', function () {
      banner.remove();
      localStorage.setItem('lang_banner_dismissed', '1');
    });
  }

  function detectAndInit(callback) {
    var token = localStorage.getItem('user_token');
    var p1 = loadTranslations(currentLang);

    var p2 = token
      ? fetch('/api/user/me', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (user) {
          if (user && user.preferred_language && user.preferred_language !== currentLang) {
            currentLang = user.preferred_language;
            localStorage.setItem(STORAGE_KEY, currentLang);
            return loadTranslations(currentLang);
          }
          return null;
        })
        .catch(function () { return null; })
      : Promise.resolve(null);

    Promise.all([p1, p2]).then(function () {
      applyTranslations();
      if (callback) callback();
    });

    if (!token && !localStorage.getItem(STORAGE_KEY)) {
      fetch('/api/user/detect-language')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.language && data.language !== currentLang) {
            currentLang = data.language;
            localStorage.setItem(STORAGE_KEY, currentLang);
            loadTranslations(currentLang).then(function () {
              applyTranslations();
              showLanguageBanner(data.language);
            });
          } else {
            showLanguageBanner(currentLang);
          }
        })
        .catch(function () {});
    }
  }

  function init(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { detectAndInit(callback); });
    } else {
      detectAndInit(callback);
    }
  }

  window.i18n = {
    init: init,
    t: t,
    setLanguage: setLanguage,
    getCurrentLang: getCurrentLang,
    loadTranslations: loadTranslations,
    applyTranslations: applyTranslations
  };
})();
