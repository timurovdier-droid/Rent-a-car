# Альтернативный дизайн (ветка `design/impeccable-alt`)

Экспериментальный облик сайта по Impeccable: **ночной диспетчерский** — тёмный фон, бирюзовый акcent, плитки в виде горизонтальных карточек.

## Как переключаться

```bash
# Старая версия (как на main)
git checkout main

# Новый вариант
git checkout design/impeccable-alt
```

После переключения: `npm run build --workspace client` и выкладка как обычно.

## Что менялось

- `client/src/styles/skin-alt.css` — палитра и мобильные плитки
- `client/src/main.jsx` — `data-skin="alt"`
- Главная: заголовок «GTA Rent»

На `main` эти файлы не попадают, пока вы не сольёте ветки.
