# Деплой superapp (MrSQM web-клиент) в Coolify

Пошаговая инструкция. Домен клиента: **`sapp.mrsqm.com`**.

> Код уже готов к деплою: в репозитории есть рабочий `Dockerfile` (собирает
> web-бандл `dist/browser` и раздаёт через nginx). Ничего в коде менять не нужно —
> Coolify соберёт образ сам по этому Dockerfile.

---

## Что собирается

- Команда сборки внутри Dockerfile: `npm run buildFrontend:prodWeb` → папка `dist/browser`.
- Supabase-настройки (URL + публичный anon-ключ) **зашиты в бандл** при сборке
  (`src/environments/environment.prod.ts`). **НЕ** нужно задавать их через
  переменные окружения Coolify.
- Внутри контейнера nginx раздаёт статику, порт настраивается переменной `APP_PORT`
  (по умолчанию 80). SPA-маршруты работают (`try_files … /index.html`).

---

## Шаг 1. DNS — направить домен на сервер

1. Зайди в панель управления доменом `mrsqm.com` (там же, где заводил `app.mrsqm.com`).
2. Добавь запись:
   - **Тип:** `A`
   - **Имя/Host:** `sapp`
   - **Значение:** `51.83.197.222`
   - **TTL:** авто / 300
3. Сохрани. (Проверить можно позже: `sapp.mrsqm.com` должен резолвиться в этот IP.)

---

## Шаг 2. Подключить приватный репозиторий к Coolify

> ⚠️ Репозиторий **приватный** — вариант «Public Repository» не подойдёт
> (Coolify не сможет его скачать). Нужно один раз подключить GitHub к Coolify
> через **GitHub App**. Если ты уже подключал GitHub для `mainapp`/`admin` —
> этот источник переиспользуется, переходи сразу к пункту «Создать приложение».

### 2a. Подключить GitHub (если ещё не подключён)

1. Coolify → **Sources** (или **Keys & Tokens → GitHub Apps**) → **+ Add** →
   **GitHub App**.
2. Выбери **GitHub.com**, нажми создать — Coolify перекинет на github.com.
3. На github.com установи приложение Coolify на аккаунт `nazarovitalii`:
   выбери **Only select repositories** → отметь **`superapp`** (можно добавить
   и остальные) → **Install**.
4. Вернёшься в Coolify — источник GitHub появится в списке.

### 2b. Создать приложение

1. Coolify → нужный **Project** → **+ New Resource** → **Application** →
   **Private Repository (with GitHub App)**.
2. Выбери только что подключённый GitHub-источник.
3. Выбери репозиторий **`nazarovitalii/superapp`**.
4. **Branch:** `main`
5. **Build Pack:** **Dockerfile** (НЕ Nixpacks). Coolify подхватит `Dockerfile`
   из корня репозитория автоматически.
6. **Port (Ports Exposes):** `80`
   - Если Coolify спросит «Ports Mappings» — оставь пустым, проксирование само.

---

## Шаг 3. Домен и HTTPS

1. В настройках приложения → поле **Domains** (или «FQDN») впиши:
   `https://sapp.mrsqm.com`
   (именно с `https://` — Coolify сам выпустит Let's Encrypt сертификат).
2. Включи **Generate SSL / Force HTTPS**, если есть такой переключатель.

---

## Шаг 4. Деплой

1. Нажми **Deploy**.
2. Первая сборка идёт долго (5–12 мин): ставятся npm-зависимости, патчится
   компилятор (ts-patch), собираются workspace-пакеты и Angular-бандл.
3. Следи за логом сборки. Если упадёт — скопируй последние ~30 строк лога и
   пришли мне, разберём.

---

## Шаг 5. Проверка

1. Открой `https://sapp.mrsqm.com` — должен загрузиться интерфейс (тема/верстка
   Super Productivity, лента MrSQM).
2. Замок (HTTPS) — зелёный/валидный.
3. Лента объектов на `/mrsqm/feed` сейчас показывает мок-данные, если пользователь
   не залогинен (auth ещё не подключён — задача M-3).

---

## Автодеплой на каждый push

Coolify по умолчанию вешает webhook на ветку `main`. После первого ручного деплоя
каждый `git push origin main` будет автоматически пересобирать и выкатывать.
Если автодеплой не включился — в настройках приложения найди **Webhooks** /
**Automatic Deployment** и включи.

---

## Если сборка падает по памяти

Angular-сборка прожорлива. Если в логе видишь `JavaScript heap out of memory`:

1. В настройках приложения Coolify → **Build** → добавь переменную окружения
   **только на этап сборки** (Build-time):
   `NODE_OPTIONS=--max-old-space-size=4096`
2. Передеплой.

---

## Частые вопросы

- **Нужны ли env-переменные Supabase в Coolify?** — Нет. Они вшиты в бандл при
  сборке. Coolify-переменные для Supabase задавать НЕ нужно.
- **Почему не `npm run build`?** — Это сборка Electron-приложения (десктоп), не
  для веба. Dockerfile использует правильную команду `buildFrontend:prodWeb`.
- **WebDAV-переменные в entrypoint** (`WEBDAV_*`) — наследие Super Productivity,
  для MrSQM не нужны, оставь пустыми.

---

## Чеклист (коротко)

- [ ] DNS: `A`-запись `sapp` → `51.83.197.222`
- [ ] Coolify: подключить GitHub App с доступом к приватному `superapp` (если ещё нет)
- [ ] New Application → **Private Repository (GitHub App)** → repo `superapp`, branch `main`, Build Pack = Dockerfile
- [ ] Port = 80
- [ ] Domain = `https://sapp.mrsqm.com` + Force HTTPS
- [ ] Deploy → дождаться сборки
- [ ] Открыть `https://sapp.mrsqm.com` и проверить
