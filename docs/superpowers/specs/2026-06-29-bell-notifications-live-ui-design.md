# Дизайн: live-уведомления (колокольчик) — superApp

> **Дата:** 2026-06-29 · **Эпик:** BELL-1 · **Статус:** дизайн утверждён, готов к плану.
> **Контракт (источник истины):** [`docs/superpowers/briefs/2026-06-29-bell-notifier-superapp-live-ui.md`](../briefs/2026-06-29-bell-notifier-superapp-live-ui.md) (ред.5). Этот файл — дизайн **нашей** (superApp) стороны: компоненты, поток, визуал, фазность, тесты.

## 1. Цель и объём

Браузер держит WebSocket к notifier; на сигнал `bell.changed` (и на ряд других триггеров) superApp перечитывает истину по REST в **один реактивный стор**, и все счётчик-поверхности обновляются разом. Дропдаун колокольчика — список фильтров с непросмотренным.

**Объём v1 (утверждено):** ядро + toast.
- ✅ WS-клиент, реактивный стор, живые счётчики (колокол + per-filter бейджи), дропдаун, live-toast.
- ⛔ **Вне v1 (отложено):** нативная Electron-нотификация, mobile tab-bar badge. Переиспользуем существующий [`notify.service`](../../../src/app/core/notify/notify.service.ts) позже.

**Инвариант №1:** счётчики **никогда** не считаются/не инкрементятся на фронте — только берутся из стора, который наполняет бэк.

## 2. Модель прочитанности (Рамка №0) — ДВА независимых сигнала

| | 🔔 Уведомления | 🏠 Объекты |
| --- | --- | --- |
| Где | бейдж на колоколе + 🟠 акцент у строки фильтра | счётчик ⟨N⟩ у фильтра (сайдбар + строка дропдауна) |
| Источник | `get_bell().bell_unseen` + `get_bell().items[].unseen` | `get_saved_filters().unseen_count` |
| Гаснет | при **закрытии** колокольчика → `mark_bell_seen()` | при **открытии объекта** → запись `user_seen_listings` |

⛔ Не связывать: закрытие колокола НЕ гасит счётчики объектов; открытие объекта НЕ гасит колокол. `mark_bell_seen()` объекты просмотренными НЕ метит.

## 3. Архитектура — узкие роли

Весь код — в `src/app/mrsqm/` (кроме одной вставки в хедер, см. §8).

### 3.1 `NotifierSocketService` (`mrsqm/services/notifier-socket.service.ts`)
Только WebSocket, без состояния и UI.
- `connect(getToken: () => Promise<string>)` — `new WebSocket('wss://notify.mrsqm.com', [token])` (JWT в `Sec-WebSocket-Protocol`, прил. A контракта).
- На каждый (ре)коннект — **свежий** токен из `supabase.client.auth.getSession()`.
- Реконнект сам: экспон. backoff + jitter. Heartbeat — браузер отвечает pong автоматически (клиентского кода нет).
- Эмитит наружу два события: `opened` (на `onopen`) и `changed` (на `onmessage` с `type==='bell.changed'`). Payload сокета **не парсим** в данные (`data:{}`).
- Включается только если тумблер живости ON (§7).

### 3.2 `NotifierStore` (`mrsqm/services/notifier-store.service.ts`)
**Единственный источник** для всех счётчиков и дропдауна. Сигналы:
- `bell = signal<{ bell_unseen: number; items: BellItem[] }>` ← `get_bell()`.
- `filters = signal<SavedFilterLite[]>` ← `get_saved_filters()` (`{ filter_id, name, unseen_count }`).

`refresh()` — **единственный** путь обновления истины:
```
const [bell, filters] = await Promise.allSettled([rpc('get_bell'), rpc('get_saved_filters')]);
// get_bell может отсутствовать в проде до применения 017 → allSettled, при reject bell остаётся пустым.
```
**Триггеры `refresh()`** (любой → один вызов):
1. `socket.changed`; 2. `socket.opened` (ре-синк, §3.2 контракта); 3. poll каждые ~60с (safety + единственный путь при тумблере OFF); 4. `visibilitychange`/focus (вкладка снова активна).

Методы: `start(liveOn)` (поднимает сокет+poll+visibility, либо только poll при OFF); `closeBell()` → `await rpc('mark_bell_seen')` затем `refresh()` (гасит уведомления). Дебаунс REST **не** делаем — дебаунс на стороне notifier; один сигнал → один `refresh()`.

### 3.3 `mrsqm-bell-button` (`mrsqm/components/bell-button/`)
Иконка в хедере справа от GPT (`smart_toy`). Состояния:
- `bell_unseen === 0` → серая иконка `notifications` (как соседняя GPT-кнопка).
- `bell_unseen > 0` → **оранжевая** (`--color-warning`) + бейдж-число (cap «99+»).
Клик → открыть дропдаун (top-layer `<dialog>`). На **закрытие** дропдауна → `store.closeBell()`.

### 3.4 `mrsqm-bell-dropdown` (`mrsqm/components/bell-dropdown/`)
Top-layer `<dialog>` (иначе `will-change:transform` правой панели запирает `position:fixed` — известная гоча, см. галерея-лайтбокс). Дизайн — §5.

### 3.5 Toast — через существующий `SnackService`
На `socket.changed`, если окно в фокусе И тумблер ON. ред.5 сделал тост текстовым (без фото) → snackbar подходит, свой компонент не нужен. Логика:
- Если `bell_unseen` за `refresh()` вырос **>1** → агрегат `N new matches`.
- Если ровно +1 → `New match in «{filter}»` + строка свежего объекта.
- Стиль `mrsqm-snack` (низ-лево), auto-dismiss ~5с, клик → открыть дропдаун. Не более 1 тоста.

### 3.6 Per-filter бейджи (сайдбар) — переиспużование
Бейджи `unseen_count` у фильтров уже существуют (RT-4, `saved-filter.service`). Источником делаем `store.filters`: сайдбар читает стор, бейджи обновляются живо на тех же триггерах. Никакого второго счётчика.

### 3.7 Заголовок строки — хелпер ленты
`title` бэк не отдаёт. Собираем тем же хелпером, что карточка ленты: `{bedrooms}BR {unitType(unit_type_id)}` (резолв `unit_type_id`→название через справочник superApp, как в `property-card`).

## 4. Поток данных

```
[WS changed | reopen | poll 60с | focus] → store.refresh()
   → Promise.allSettled(get_bell, get_saved_filters)
   → bell.set(...) + filters.set(...)
   → ВСЕ подписчики перерисовываются разом:
        bell-button (точка/число), bell-dropdown (строки), сайдбар (бейджи)
```
Ни одна поверхность не считает сама. На `socket.changed` дополнительно — toast (§3.5), если фокус+ON.

## 5. Дизайн дропдауна (соцсеть-grade, токены SP)

Контейнер ~360px, `--card-bg`, `--whiteframe-shadow-*`, радиус 14px, тонкий бордер.

```
┌────────────────────────────────────────────────┐
│  Notifications                    Mark all read  │
├────────────────────────────────────────────────┤
│▎ 2BR Marina under 2.5M                   2h  ⟨3⟩ │ ← непрочит.: оранж. полоса слева + тонир. фон
│   🟢 New · 2BR Apartment · Dubai Marina · 2.1M   │
│ ──────────────────────────────────────────────── │
│  Villas Arabian Ranches                  5h  ⟨1⟩ │ ← прочит.: без тона
│   🟠 Price↓ · 4BR Villa · Arabian R. · 2.1M ↓2.3 │
├────────────────────────────────────────────────┤
│  ⚡ Live  ◉──                     View all matches│
└────────────────────────────────────────────────┘
```

**Строка** (min-height 56px, hover-фон, cursor-pointer). Гейт строки — фильтры с `unseen_count > 0`.
| Элемент | Токен / правило | Сигнал |
| --- | --- | --- |
| Левая **акцент-полоса** + тонированный фон строки | `--color-warning`, фон `color-mix(warning 8%)` | `items[].unseen` (есть непросмотренное уведомление) → гаснет на закрытие колокола |
| **имя фильтра** | `--text-color`, weight 600 пока `unseen_count>0`, ellipsis | — |
| **время** | `--text-color-muted`, относит. (`2h`/`5h`) из max `matched_at` | — |
| **бейдж ⟨N⟩** | нейтральный pill, cap «99+» | `unseen_count` (объекты) → гаснет открытием объекта |
| **превью** | `--text-color-muted` 0.8rem; тег-чип **New**=`--color-success`, **Price↓**=`--color-warning` | свежайший item фильтра; нет в head(~20) → fallback `{N} new — tap to view` |

Два сигнала разнесены: **лево = уведомления (оранж), право = объекты (нейтр)** — не путаются.
**Сортировка** строк — по свежему `matched_at`. **Клик** → объект в sidebar (= просмотр объекта: пишем `user_seen_listings` → бэк декрементит `unseen_count` → следующий `refresh()`; на колокол/полосу НЕ влияет).

**Состояния:**
- Загрузка → 2–3 skeleton-строки.
- Пусто (фильтры есть, новых нет) → `No new matches` + приглушённая 🔔.
- Нет фильтров → `No saved filters yet` + кнопка **Create filter**.
- Ошибка → `Couldn't load` + **Retry**.

**Подвал:** тумблер `⚡ Live` (§7) + ссылка `View all matches` → лента.

**A11y:** `aria-live="polite"` на бейдже колокола; «непрочитано» не только цветом (полоса + вес имени); фокус по строкам; Esc закрывает; touch-target ≥44px.

## 6. Колокол в хедере

Вставка `<mrsqm-bell-button>` справа от AI-кнопки в [`desktop-panel-buttons.component.ts`](../../../src/app/core-ui/main-header/desktop-panel-buttons/desktop-panel-buttons.component.ts) (файл уже MrSQM-кастомный). Серый по умолчанию, оранжевый+счётчик при `bell_unseen>0`. Видим на всех экранах MrSQM (как соседняя GPT-кнопка). Гейт: только для залогиненного MrSQM-юзера.

## 7. Тумблер живости

localStorage-флаг (`mrsqm.bellLive`, default ON). Переключатель — в подвале дропдауна.
- ON → сокет + toast + poll + focus.
- OFF → **сокета и тостов нет**, но счётчики **живые** через poll(60с) + focus. Колокол/дропдаун работают полностью на REST.

## 8. Касание апстрима — минимальное

Единственная правка вне `mrsqm/` — добавить `<mrsqm-bell-button>` в `desktop-panel-buttons.component.ts` (там уже есть MrSQM-кастомизация AI-кнопки). Вся логика/стили — в `mrsqm/`.

## 9. Фазность (что работает когда)

- **Сегодня (poll-режим, без go-live):** `get_saved_filters` живой → сайдбар-бейджи + строки-фильтры в дропдауне работают. `refresh()` через `Promise.allSettled` устойчив к **отсутствию `get_bell`/WSS** → колокол=0, дропдаун показывает фильтры по `unseen_count`, toast/точки молчат. Билдим и шипим против контракта.
- **После go-live владельца (016/017 + WSS):** оживают `bell_unseen`/`items[].unseen` + WS-пуш + toast + оранжевые полосы.

## 10. Тесты

- **NotifierStore:** `refresh()` сводит оба RPC в сигналы; каждый триггер зовёт один `refresh()`; `closeBell()` зовёт `mark_bell_seen` затем `refresh`; `get_bell` reject (allSettled) НЕ ломает `filters`; нет инкремента на фронте.
- **NotifierSocketService:** коннект с токеном в subprotocol; backoff-реконнект; свежий токен на каждый коннект; эмит `opened`/`changed` (mock `WebSocket`).
- **bell-button:** серая/оранжевая+число по `bell_unseen`; закрытие дропдауна зовёт `closeBell()`.
- **bell-dropdown:** гейт строк по `unseen_count>0`; оранжевая полоса по `items[].unseen`; превью vs fallback; теги New/Price↓; состояния loading/empty/no-filters/error; клик пишет `user_seen_listings`; Рамка №0 (закрытие колокола НЕ трогает `unseen_count`).
- **title-хелпер:** `{bedrooms}BR {unitType}`.
- E2E — после go-live (нужен живой WS).

## 11. Зависимости (прод, владелец БД — go-live)

Не блокируют разработку, блокируют «оживление»:
- `migrations/product/016` (триггер `bell_changed_notify` на `filter_matches`) + `017` (`get_bell`/`mark_bell_seen`) — применить в проде.
- `wss://notify.mrsqm.com` (Traefik: проброс `Upgrade`/`Connection`, эхо `Sec-WebSocket-Protocol`; origin allowlist `https://sapp.mrsqm.com`), secret `SUPABASE_JWT_SECRET`.
- §4.3 контракта — `get_saved_filters().unseen_count` ✅ **уже есть** у нас (RT-4), правок не нужно.

## 12. Вне scope v1

Нативная Electron-нотификация; mobile tab-bar / tray badge; rich-view карточек с фото (`thumb_url` в контракте остаётся, но в UI v1 не используется).
