import '../styles/main.css';
import './i18n.js';

document.addEventListener('DOMContentLoaded', function() {
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
});
