function getSidebar(activePage) {
    const links = [
        { section: 'Обзор', items: [
            { href: 'index.html', icon: '📊', label: 'Дашборд' },
        ]},
        { section: 'Контент', items: [
            { href: 'lessons.html', icon: '🎬', label: 'Уроки' },
            { href: 'complexes.html', icon: '📚', label: 'Комплексы' },
            { href: 'schedule.html', icon: '📅', label: 'Расписание' },
        ]},
        { section: 'Пользователи', items: [
            { href: 'users.html', icon: '👥', label: 'Пользователи' },
            { href: 'subscriptions.html', icon: '💳', label: 'Подписки' },
        ]},
        { section: 'Маркетинг', items: [
            { href: 'reviews.html', icon: '⭐', label: 'Отзывы' },
            { href: 'feedback.html', icon: '💬', label: 'Обратная связь' },
            { href: 'faq.html', icon: '❓', label: 'FAQ' },
            { href: 'promo.html', icon: '🎁', label: 'Промокоды' },
        ]},
        { section: 'Бизнес', items: [
            { href: 'finance.html', icon: '💰', label: 'Финансы' },
            { href: 'notifications.html', icon: '🔔', label: 'Уведомления' },
        ]},
        { section: 'Система', items: [
            { href: 'settings.html', icon: '⚙️', label: 'Настройки' },
        ]},
    ];

    return `
    <aside class="sidebar" role="navigation" aria-label="Навигация админ-панели">
        <div class="sidebar__logo">Админ-панель</div>
        <nav class="sidebar__nav">
            ${links.map(group => `
                <div class="sidebar__section">${esc(group.section)}</div>
                ${group.items.map(item => `
                    <a href="${item.href}" class="sidebar__link${activePage === item.href ? ' sidebar__link--active' : ''}" aria-label="${esc(item.label)}">
                        <span class="sidebar__link-icon" aria-hidden="true">${item.icon}</span>
                        ${esc(item.label)}
                    </a>
                `).join('')}
            `).join('')}
        </nav>
    </aside>`;
}

function getTopbar(title) {
    return `
    <header class="topbar">
        <h1 class="topbar__title">${esc(title)}</h1>
        <div class="topbar__actions">
            <a href="../index.html" class="btn btn--secondary btn--sm" target="_blank">Открыть сайт</a>
            <button onclick="window.api.logout()" class="btn btn--secondary btn--sm" type="button">Выйти</button>
        </div>
    </header>`;
}
