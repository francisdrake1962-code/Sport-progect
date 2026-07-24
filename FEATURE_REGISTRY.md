# Feature Registry — Qigong Landing + Admin Panel

> Canonical source of truth. Every feature with user story, implementation, tests, and status.
> Last updated: v3.2.0

---

## Landing Page — Frontend

| ID | Feature | User Story | Implementation | Tests | Status |
|----|---------|-----------|----------------|-------|--------|
| F01 | Header: Logo + Nav + CTA | As a visitor I see logo, language, login, CTA in header | `src/index.html:18-46` | `landing.test.js` | OK |
| F02 | Hero: Video + Headline + CTA | As a visitor I see hero video, h1, subtitle, CTA | `src/index.html:49-70` | `landing.test.js` | OK |
| F03 | Benefits: 4 cards | As a visitor I see 4 benefit cards with emoji icons | `src/index.html:72-110` | `landing.test.js` | OK |
| F04 | How It Works: 3 screenshots | As a visitor I see 3 app screenshots with descriptions | `src/index.html:112-148` | `landing.test.js` | OK |
| F05 | Formats: 3 practice types | As a visitor I see floor/chair/standing format cards | `src/index.html:150-180` | `landing.test.js` | OK |
| F06 | Trust Numbers: stats + reviews | As a visitor I see 4yr/1160+/6d stats and 2 testimonials | `src/index.html:182-217` | `landing.test.js` | OK |
| F07 | Program Structure | As a visitor I see program composition details | `src/index.html:219-239` | `landing.test.js` | OK (unlisted) |
| F08 | FAQ: 5 questions | As a visitor I see 5 expandable FAQ items | `src/index.html:241-292` | `landing.test.js` | OK |
| F09 | Testimonials: 6 cards | As a visitor I see 6 user review cards | `src/index.html:294-342` | `landing.test.js` | OK |
| F10 | Pricing: annual + monthly | As a visitor I see $89/yr and $12/mo pricing options | `src/index.html:344-392` | `landing.test.js` | OK |
| F11 | Final CTA | As a visitor I see a final "start free" CTA | `src/index.html:394-403` | `landing.test.js` | OK |
| F12 | Footer: 3 columns + copyright | As a visitor I see nav links and copyright in footer | `src/index.html:406-445` | `landing.test.js` | OK |
| F13 | Mobile hamburger menu | As a mobile user I toggle nav with hamburger button | `src/js/main.js:27-51` + CSS | `pages.test.js` | OK |
| F14 | FAQ accordion (JS) | As a user clicking FAQ closes others automatically | `src/js/main.js:5-16` | — | NOT TESTED |
| F15 | Video error handling | As a user, broken video hides gracefully | `src/js/main.js:19-24` | — | NOT TESTED |
| F16 | Service worker registration | As a user the SW registers for offline caching | `src/js/main.js:54-56` | — | NOT TESTED |
| F17 | CSS Responsive Design | As a mobile user the layout adapts to small screens | `src/styles/main.css:736-790` | — | NOT TESTED |
| F18 | Skip-to-content link | As a screen reader user I can skip to main content | `src/index.html:17` | `integrity.test.js` | OK |
| F19 | PWA manifest | As a mobile user I can install the app | `src/manifest.json` | — | NOT TESTED |
| F20 | Service worker (offline) | As a user I can view cached pages offline | `src/sw.js` | — | NOT TESTED |

## Sub-pages (Trust + SEO + Legal + Support)

| ID | Feature | User Story | Implementation | Tests | Status |
|----|---------|-----------|----------------|-------|--------|
| F21 | Is It Really Free page | As a visitor I learn how the free trial works | `src/pages/is-it-really-free.html` | `pages.test.js` | OK |
| F22 | How to Cancel page | As a visitor I learn how to cancel subscription | `src/pages/how-to-cancel.html` | `pages.test.js` | OK |
| F23 | About Trainer page | As a visitor I learn about the trainer's credentials | `src/pages/about-trainer.html` | `pages.test.js` | OK |
| F24 | 8 Pieces of Brocade page | As a visitor I learn about traditional qigong practice | `src/pages/8-pieces-of-brocade.html` | `pages.test.js` | OK |
| F25 | Yijinjing page | As a visitor I learn about classical gymnastics | `src/pages/yijinjing.html` | `pages.test.js` | OK |
| F26 | Small Circulation page | As a visitor I learn about energy circulation practice | `src/pages/small-circulation.html` | `pages.test.js` | OK |
| F27 | Terms of Service page | As a visitor I read legal terms of use | `src/pages/terms.html` | `components.test.js` | OK |
| F28 | Refund Policy page | As a visitor I read refund guarantee details | `src/pages/refund.html` | `components.test.js` | OK |
| F29 | Privacy Policy page | As a visitor I read data collection policy | `src/pages/privacy.html` | `components.test.js` | OK |
| F30 | Contact page | As a visitor I find support email and topics | `src/pages/contact.html` | `components.test.js` | OK |
| F31 | FAQ (standalone) page | As a visitor I read 8+ FAQ questions on dedicated page | `src/pages/faq.html` | `components.test.js` | OK |

## Admin Panel

| ID | Feature | User Story | Implementation | Tests | Status |
|----|---------|-----------|----------------|-------|--------|
| F32 | Login page | As admin I log in with email/password, get JWT | `src/admin/login.html` | `admin.test.js` | OK |
| F33 | Auth guard | As admin I'm redirected to login if no token | All admin pages | `admin.test.js` | OK |
| F34 | Dashboard | As admin I see stats: users, revenue, lessons, reviews | `src/admin/index.html` | `admin.test.js` | OK |
| F35 | Lessons CRUD | As admin I create/edit/delete lessons with modal | `src/admin/lessons.html` | `admin.test.js` | OK |
| F36 | Complexes CRUD | As admin I create/edit/delete complexes with modal | `src/admin/complexes.html` | `admin.test.js` | OK |
| F37 | Exercises CRUD | As admin I create/edit/delete exercises with modal | `src/admin/exercises.html` | `admin.test.js` | OK |
| F38 | Schedule CRUD | As admin I create/edit/delete schedule with modal | `src/admin/schedule.html` | `admin.test.js` | OK |
| F39 | Users (read-only) | As admin I view subscriber list with stats | `src/admin/users.html` | `admin.test.js` | OK |
| F40 | Subscriptions (read-only) | As admin I view subscription stats and list | `src/admin/subscriptions.html` | `admin.test.js` | OK |
| F41 | Reviews moderation | As admin I approve/delete pending reviews | `src/admin/reviews.html` | `admin.test.js` | OK |
| F42 | FAQ CRUD | As admin I create/edit/delete FAQ items | `src/admin/faq.html` | `admin.test.js` | OK |
| F43 | Promo Codes CRUD | As admin I create/edit/delete promo codes | `src/admin/promo.html` | `admin.test.js` | OK |
| F44 | Finance (read-only) | As admin I view transaction list and revenue stats | `src/admin/finance.html` | `admin.test.js` | OK |
| F45 | Notifications CRUD | As admin I create/delete notifications | `src/admin/notifications.html` | `admin.test.js` | OK |
| F46 | Settings editor | As admin I edit app settings (name, email, prices) | `src/admin/settings.html` | `admin.test.js` | OK |
| F47 | Sidebar navigation | As admin I navigate between sections via sidebar | `src/admin/js/sidebar.js` | `admin.test.js` | OK |
| F48 | Modal system | As admin I open/close modals via buttons, Escape, click-outside | `src/admin/js/admin.js` | `admin.test.js` | OK |
| F49 | XSS protection (esc) | As a user all dynamic content is HTML-escaped | `src/admin/js/api.js:54-62` | — | NOT TESTED |
| F50 | Status badges | As admin I see colored status badges in tables | `src/admin/js/api.js:65-74` | — | NOT TESTED |
| F51 | Format date | As admin I see dates in ru-RU locale | `src/admin/js/api.js:77-86` | — | NOT TESTED |

## Backend API

| ID | Feature | User Story | Implementation | Tests | Status |
|----|---------|-----------|----------------|-------|--------|
| F52 | JWT authentication | As admin I get a JWT token on login | `server/auth.js` + `server/routes/auth.js` | `backend.test.js` | OK |
| F53 | Auth middleware | As API I reject requests without valid JWT | `server/auth.js:10-22` | `backend.test.js` | OK |
| F54 | Rate limiting | As API I limit login to 10 attempts/minute | `server/routes/auth.js:9-15` | — | NOT TESTED |
| F55 | Input validation (login) | As API I require email+password on login | `server/routes/auth.js:18-20` | `backend.test.js` | OK |
| F56 | CRUD factory | As API I provide generic CRUD for 9 tables | `server/routes/crud.js` | `backend.test.js` | OK |
| F57 | Schedule custom routes | As API I handle schedule CRUD with custom fields | `server/index.js:44-97` | `backend.test.js` | OK |
| F58 | Settings custom routes | As API I handle settings as key-value store | `server/index.js:100-142` | `backend.test.js` | OK |
| F59 | Dashboard aggregation | As API I compute stats from multiple tables | `server/index.js:145-169` | `backend.test.js` | OK |
| F60 | Health check | As a load balancer I check /api/health | `server/index.js:21-23` | `backend.test.js` | OK |
| F61 | Seed data | As a fresh DB I get sample data on first start | `server/index.js:197-308` | `backend.test.js` | OK |
| F62 | CORS restriction | As API I only accept requests from ALLOWED_ORIGIN | `server/index.js:14` | — | NOT TESTED |

## Infrastructure

| ID | Feature | User Story | Implementation | Tests | Status |
|----|---------|-----------|----------------|-------|--------|
| F63 | Webpack 5 build | As developer I build optimized dist/ from src/ | `webpack.config.js` | `build.test.js` | OK |
| F64 | Multi-page HTML | As developer I build 12 landing + 14 admin HTML pages | `webpack.config.js` | `build.test.js` | OK |
| F65 | CSS extraction + hashing | As developer I get hashed CSS for cache busting | `webpack.config.js` | `build.test.js` | OK |
| F66 | Asset copying | As developer I copy images, manifest, SW to dist/ | `webpack.config.js` CopyWebpackPlugin | `build.test.js` | OK |
| F67 | sql.js database | As backend I persist data in SQLite via sql.js | `server/db.js` | `backend.test.js` | OK |
| F68 | Async saveDb | As backend I write DB async with 300ms debounce | `server/db.js:181-200` | `backend.test.js` | OK |
| F69 | SEO: sitemap.xml | As crawler I read page URLs and priorities | `public/sitemap.xml` | `seo.test.js` | OK |
| F70 | SEO: robots.txt | As crawler I read allow/disallow and sitemap URL | `public/robots.txt` | `seo.test.js` | OK |
| F71 | Deploy: vercel.json | As deployer I deploy frontend to Vercel | `vercel.json` | — | NOT TESTED |
| F72 | Deploy: Dockerfile | As deployer I deploy backend via Docker | `Dockerfile` | — | NOT TESTED |
| F73 | Deploy: render.yaml | As deployer I deploy backend to Render.com | `render.yaml` | — | NOT TESTED |

---

## Subscriber-Facing Features (v3.0.0)

| ID | Feature | User Story | Implementation | Tests | Status |
|----|---------|-----------|----------------|-------|--------|
| F74 | User Registration | As a visitor I can register with name, email, password | `server/routes/user.js:12-45` | `backend.test.js` | OK |
| F75 | User Login | As a subscriber I can login with email/password | `server/routes/user.js:47-75` | `backend.test.js` | OK |
| F76 | User Profile (me) | As a subscriber I can view my profile | `server/routes/user.js:77-92` | `backend.test.js` | OK |
| F77 | Email Confirmation | As a subscriber I can confirm my email via token | `server/routes/user.js:94-105` | `backend.test.js` | OK |
| F78 | Login Page | As a user I see login/register tabs on auth page | `src/pages/login.html` | — | NOT TESTED |
| F79 | Today's Lesson | As a subscriber I see today's scheduled lesson | `src/pages/lessons.html:93-101` | — | NOT TESTED |
| F80 | Lesson Browser | As a subscriber I can browse all lessons and complexes | `src/pages/lessons.html` | — | NOT TESTED |
| F81 | Video Player | As a subscriber I can watch lesson videos with controls | `src/pages/player.html` | — | NOT TESTED |
| F82 | Free Period Limiting | As a trial user I can watch max 7 lessons for free | `src/pages/player.html:136-155` | — | NOT TESTED |
| F83 | Watch Progress | As a subscriber my watch progress is saved | `server/routes/user.js:107-128` | `backend.test.js` | OK |
| F84 | Progress API | As a subscriber I can view my watched lessons | `server/routes/user.js:130-145` | `backend.test.js` | OK |
| F85 | 365-Day Schedule | As a subscriber I see unique lessons for each day of the year | `server/index.js:319-330` | `backend.test.js` | OK |
| F86 | Reviews from DB | As a visitor I see approved reviews from database | `src/index.html:314-335` (dynamic) | — | NOT TESTED |
| F87 | Landing → User Login | As a visitor "Войти" links to user login, not admin | `src/index.html:59` | `landing.test.js` | OK |
| F88 | Video Serving | As a subscriber I can stream videos with range requests | `server/index.js:212-273` | `backend.test.js` | OK |
| F89 | Server-side Free Check | As a server I enforce free limit on video access endpoint | `server/index.js:220-246` | `backend.test.js` | OK |
| F90 | Can-Watch API | As a subscriber I can check if I'm allowed to watch a lesson | `server/routes/user.js:136-173` | `backend.test.js` | OK |
| F91 | Calendar API | As a subscriber I can view full year schedule with progress | `server/routes/user.js:175-209` | `backend.test.js` | OK |
| F92 | Calendar Page | As a subscriber I can view calendar in year/month/week views | `src/pages/calendar.html` | `integrity.test.js` | OK |
| F93 | Free Lesson Flag | As admin I can mark lessons as free (Module 0) | `server/db.js:85-86`, `src/admin/lessons.html` | `backend.test.js` | OK |
| F94 | User Auth Rate Limiting | As server I rate-limit subscriber register/login (15/min) | `server/routes/user.js:14-19` | — | NOT TESTED |
| F95 | Email Confirmation Validation | As server I reject invalid/expired confirmation tokens | `server/routes/user.js:83-97` | `backend.test.js` | OK |
| F96 | fs Import | As server I can serve video files | `server/index.js:5` | `backend.test.js` | OK |
| F97 | JWT_SECRET Export | As server I use consistent JWT_SECRET across all routes | `server/auth.js:32` | `backend.test.js` | OK |
| F98 | Calendar Link on Lessons | As subscriber I can navigate to calendar from lessons page | `src/pages/lessons.html:128` | `integrity.test.js` | OK |
| F99 | Path Traversal Protection | As server I reject `../` sequences in video URLs | `server/index.js:243-255` | `backend.test.js` | OK |
| F100 | Video Auth Error Handling | As server I log JWT errors instead of silently bypassing | `server/index.js:274-276` | `backend.test.js` | OK |
| F101 | XSS Protection (login) | As user, registration email is HTML-escaped in success message | `src/pages/login.html:72` | — | NOT TESTED |
| F102 | Dev Link Guard | As production user I don't see dev confirmation links | `src/pages/login.html:155` | — | NOT TESTED |
| F103 | FREE_LIMIT Constant | As developer I use a single source of truth for free limit (7) | `server/routes/user.js:12` | `backend.test.js` | OK |
| F104 | Gallery Init Refactor | As admin, trainer photos gallery loads correctly | `src/admin/settings.html:96` | — | NOT TESTED |

---

## Test Suites Summary

| Suite | Tests | Coverage |
|-------|-------|----------|
| `landing.test.js` | 56 | All landing page sections |
| `pages.test.js` | 54 | 6 sub-pages: structure, content, ARIA |
| `components.test.js` | 70 | 5 footer pages: structure, content, ARIA |
| `integrity.test.js` | 53 | CJK leaks, hardcoded tags, video fallback, typos |
| `admin.test.js` | 178 | 14 admin pages: structure, modals, CRUD |
| `build.test.js` | 24 | File existence, webpack, admin pages |
| `seo.test.js` | 42 | Meta tags, sitemap, robots.txt |
| `backend.test.js` | 181 | File structure, db, auth, CRUD, user auth, progress, calendar, free enforcement, video security |
| **Total** | **658** | |

---

## Known Issues (from previous rounds, some resolved)

| ID | Issue | Status |
|----|-------|--------|
| ISSUE-01 | Fake tests | RESOLVED (v1.4.0) |
| ISSUE-02 | Broken sub-page asset paths | RESOLVED (v1.5.0) |
| ISSUE-03 | Missing CSS classes | RESOLVED (v1.3.0) |
| ISSUE-04 | No mobile hamburger | RESOLVED (v1.3.0) |
| ISSUE-05 | Broken footer links | RESOLVED (v1.4.0) |
| ISSUE-08 | Copyright year 2024 | RESOLVED (v1.3.0) |
| ISSUE-10 | Chinese text leaks | RESOLVED (v1.5.0) |
| ISSUE-11 | Duplicate resource tags | RESOLVED (v1.5.0) |
