# Передача BTE Global — Book a Consultation

Ветка: `feature/book-consultation`. Production не развёрнут. Изменения подготовлены к Pull Request; исходный support.js сохранён без изменений.

## Готовность модулей

| Модуль | Состояние |
| --- | --- |
| Страница бронирования / адаптивность | Реализовано, Chrome: 320–1920 px |
| EN/RU/AR, RTL и темы | Реализовано; проверены переходы между страницами |
| Тарифы USD в центах | Единый серверный источник, проверка подмены суммы пройдена |
| Календарь доступности | Реализованы FreeBusy, длительность, рабочие окна, UTC; нужны реальные Google credentials и согласованный график |
| Хранение и конкуренция | PostgreSQL, транзакции, GiST exclusion; тестовая PostgreSQL-проверка пройдена, нужен staging с реальным пулом |
| Payment Service | Внутреннее подтверждение, идемпотентность, поздняя оплата и mock реализованы; реальная Ziina не входит в этап |
| События и уведомления | Outbox, повторы, private event, локализованные письма/ICS реализованы и проверены с адаптерами; нужны реальные Google/SMTP-тесты |
| Безопасность | Серверная валидация, ограничения частоты, honeypot, capability status, отсутствие PII в логах/localStorage |
| Юридические страницы | Добавлены отсутствовавшие переводы; новые формулировки вынесены в LEGAL_REVIEW.md, не опубликованы |
| Документация и проверки | 28 unit/адаптерных + 7 PostgreSQL + 14 браузерных тестов, audit без известных уязвимостей |
| Production | Не выполнен; необходимы доступы, согласования и Ziina-интеграция |

## Файлы

Созданы: book-consultation.html; consultation.css/js/i18n.js; preferences.js; четыре payment*.html; assets/icons.svg и лицензия; api/consultations/config.js, availability.js, bookings.js, status.js, mock-payment.js, worker.js; lib/booking/config.js, db.js, validation.js, availability.js, http.js, orders.js, worker.js; lib/calendar/index.js; lib/payments/index.js; lib/notifications/index.js; db/migrations/001_booking.sql; scripts/dev.js, migrate.js, check.js, test-database.js; tests/booking.test.js, calendar.test.js, browser/consultation.spec.js; playwright.config.js; package.json/lock; .env.example; docs/TECH_STACK.md, DEPLOYMENT.md, GOOGLE_CALENDAR.md, PAYMENT_INTEGRATION.md, API.md, TEST_REPORT.md, LEGAL_REVIEW.md, HANDOFF.md.

Изменены: index.html (навигация и сохранение темы), legal.js/css (локализация и светлая тема), public-offer.html/refund.html (подключение языка), privacy.html/terms.html/disclaimer.html (наследование темы), sitemap.xml, vercel.json, .gitignore, README.md. Существующая контактная форма и кнопка Discuss a Project сохранены.

## Что предоставить заказчику / получить от заказчика

- PostgreSQL и доступ для миграции/пула, staging и production отдельно.
- Google Cloud service account, приватный Calendar ID и права записи.
- SMTP/transactional email credentials, подтверждённый sender, корпоративный получатель.
- Утверждённые рабочие дни/часы, шаг, горизонт, минимальное время и TTL резерва.
- Юридическое согласование точечных дополнений, проверка переводов, версии политик, правила хранения данных и операционный ответственный.
- Vercel проект, поддержка нужной частоты cron, APP_BASE_URL и CRON_SECRET.
- От Ziina: официальная спецификация API/webhook, merchant setup, достоверная проверка платежа, checkout adapter, sandbox и интеграционное тестирование. Новые реквизиты Ziina на текущем этапе не требуются.

Полный перечень переменных находится в .env.example и DEPLOYMENT.md. Секреты задаются в окружении, не в исходниках.

## Запуск и публикация

Локальный демонстрационный запуск: `npm ci` → `npm run dev:demo` → http://localhost:3000/book-consultation.html. Для реальных сервисов: заполнить .env.local, `npm run migrate`, `npm run dev`.

Vercel: импортировать репозиторий с Framework Other, с npm run build и outputDirectory=public, настроить Node 24, PostgreSQL/Google/SMTP/cron и переменные по DEPLOYMENT.md. PAYMENT_MODE=disabled до завершения Ziina. Production-деплой выполняется только после отдельного согласования.

Известные эксплуатационные ограничения: SMTP не гарантирует строго однократную доставку при аварии после принятия письма; внешний писатель Google Calendar может создать конфликт между FreeBusy и insert. Эти ограничения и способы управления описаны в PAYMENT_INTEGRATION.md и GOOGLE_CALENDAR.md.

Финальный аудит: см. AUDIT_2026-11-26.md. Добавлены миграция 002, paid_pending_calendar, независимая конфигурация, безопасная статическая сборка и реальные конкурентные PostgreSQL-тесты. Точные обязательные и опциональные переменные перечислены в DEPLOYMENT.md и .env.example.

Обновление 27 ноября: Neon подключён, production и отдельная schema-only Preview-ветка мигрированы. Локальный профиль по умолчанию — Preview; mock/тесты отвергают production-хосты. Рабочий график утверждён: Пн–Пт, 10:00–19:00, Дубай/GMT+4/Asia/Dubai. В Vercel записаны только Preview branch-specific настройки. Проверки: 33 unit + 8 Neon PostgreSQL + 14 Playwright. Для реальных адаптеров нужны GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, доступ к календарю и SMTP_PASSWORD. См. NEON.md.
