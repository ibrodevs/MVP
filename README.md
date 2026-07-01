# Enterprise Software — Design Brief

Статическая одностраничная презентация (design brief). Страница `index.html`
рендерится клиентским рантаймом `support.js`, который сам подгружает
React / ReactDOM / Babel с CDN — сборка не требуется.

## Состав

- `index.html` — разметка `<x-dc>` + данные страницы (точка входа)
- `support.js` — рантайм рендеринга (сгенерирован, не редактировать вручную)
- `vercel.json` — конфигурация деплоя (статика + заголовки кеширования)

## Локальный запуск

Нужен любой статический сервер (относительный путь `./support.js` требует HTTP,
через `file://` не заработает):

```bash
npx serve .
# или
python3 -m http.server 3000
```

Открыть http://localhost:3000

## Деплой на Vercel

Проект без фреймворка и без build-шага — Vercel отдаёт файлы как есть.

**Через CLI:**

```bash
npm i -g vercel
vercel        # preview-деплой
vercel --prod # production
```

**Через дашборд:** импортировать репозиторий на vercel.com. Framework Preset —
`Other`, Build Command и Output Directory оставить пустыми (корень проекта).
