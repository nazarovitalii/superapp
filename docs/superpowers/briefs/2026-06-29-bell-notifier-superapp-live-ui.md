# ТЗ superApp: live WS-интеграция — счётчики везде + визуал нотификаций колокольчика

> Источник истины контракта полей — `docs/handoff-notifier-superapp.md` (v4) + `docs/superpowers/specs/2026-06-24-notifier-design.md`.
> Это ТЗ — companion к v4, для чата/команды **superApp** (Angular/Electron, форк Super Productivity). realtime отдаёт сигнал+данные; superApp строит реактивный UI.
> **Changelog:** v1 — live-refresh + визуал. ред.2 — дропдаун = список фильтров, без фото. ред.3 — единая прочитанность (отменено). ред.4 — два счётчика (точка была привязана к объекту). **ред.5 (2026-06-29, ФИНАЛ) — точка привязана к УВЕДОМЛЕНИЮ (bell-курсор), гаснет при закрытии колокольчика; `get_bell` не читает `user_seen_listings`** (см. таблицу выше). Поправка к v4 §1A: shipped-сервер шлёт `data: {}` (пустой) — фронт на `data` НЕ опирается.

### 🔑 Модель прочитанности (ред.5) — ДВА НЕЗАВИСИМЫХ сигнала
| | 🔔 Сигнал **УВЕДОМЛЕНИЙ** | 🏠 Сигнал **ОБЪЕКТОВ** |
|---|---|---|
| Что | непросмотренные *уведомления* (бейдж колокольчика **+ оранжевая точка** у каждого) | непросмотренные *объекты* (недвижка) |
| Где | иконка-колокол: бейдж `bell_unseen`; в дропдауне: 🟠 точка у каждого непросмотренного | бейдж-счётчик у каждого **фильтра** (сайдбар + строка дропдауна) |
| Источник | `get_bell().bell_unseen` (число) + `get_bell().items[].unseen` (точка) — оба от bell-курсора | `get_saved_filters().unseen_count` |
| Гасится когда | **закрыл колокольчик** (`mark_bell_seen` двигает курсор) → бейдж=0 И все точки гаснут | **открыл сам объект** (переход в sidebar → superApp пишет `user_seen_listings`) |

**Независимость (главное):** закрыл колокольчик → бейдж уведомлений=0 и точки погасли (уведомления просмотрены), **НО** счётчики объектов у фильтров остаются (раз не перешёл ни в один объект). Открыл объект → счётчик объекта −1, **НО** бейдж/точки уведомлений не трогаются. Это РАЗНЫЕ сигналы. `get_bell` чужие seen-таблицы НЕ читает — точка считается от bell-курсора.

Карта поверхностей: **§2A** — счётчики везде; **§2B** — визуал (дропдаун/toast/нативная); **§3** — поведение/краевые.

---

## 0. Суть в одном абзаце

notifier по WebSocket шлёт **`bell.changed`** — голую подсказку «перечитай по REST» (без данных, fan-out-safety). superApp на **каждое** событие (и на (ре)коннекте) перечитывает истину двумя REST-вызовами и пишет в **один реактивный стор** → все счётчики во всех местах обновляются **разом и вживую**. Колокольчик несёт ДВА независимых сигнала (см. таблицу выше): счётчик **уведомлений** (бейдж колокольчика, гаснет при открытии колокольчика) и счётчик **объектов** per-filter (гаснет при открытии объекта; оранжевая точка = объект ещё не открыт). Дропдаун — компактный **список фильтров** (имя + счётчик объектов + строка про свежий объект + оранжевая точка), **без фото**. Инвариант: **счётчики НИКОГДА не считаются на фронте — только из стора, наполняемого бэком.**

---

## 1. Поля-контракт (realtime/бэк ОТДАЁТ, superApp только рендерит)

### 1A. WS-событие (ОТДАЁТ notifier)
- **`type`** (`string`) = `"bell.changed"` — единственный тип v1. Смысл: «перечитай колокольчик и счётчики через REST».
- **`data`** (`object`) = **`{}`** (пустой в v1). Фронт НЕ парсит, НЕ зависит.
- **`ts`** (`string` ISO-8601) — информационно.
> В сокете НЕТ id/цены/счётчика — намеренно. Всё содержимое — из REST.

### 1B. `get_bell(p_limit int = 20, p_before timestamptz = null)` → `{ bell_unseen, items[] }` (ОТДАЁТ realtime)
- **`bell_unseen` (`int`)** — 🔔 **счётчик УВЕДОМЛЕНИЙ** для бейджа колокольчика: число событий с `matched_at > bell_seen_at` (bell-курсор), только `active`, cap **99+** (LEAST 100). Гасится `mark_bell_seen()` (открытие колокольчика). Считает бэк.
- **`items[]`** — поток матчей, дедуп по объекту (одна карточка на `property_id`), новые сверху, `LIMIT ~20`, keyset `p_before`. Каждый item:
  - **`property_id` (`uuid`)** — клик → объект.
  - **`filter_id` (`uuid`)** — какой фильтр сматчил (имя из `get_saved_filters`).
  - **`match_type` (`text`)** = **`new`** | `price_drop` (бэк маппит `new_listing→'new'`) → тег **New** / **Price ↓**.
  - **`matched_at` (`timestamptz`)** — сортировка, относительное время.
  - **`unseen` (`bool`)** — 🟠 **уведомление не просмотрено** (`matched_at > bell_seen_at`, bell-курсор). `true` → **оранжевая точка**; гаснет, когда юзер закрыл колокольчик (`mark_bell_seen`). Считает бэк. (Это сигнал УВЕДОМЛЕНИЙ, НЕ про открытие объекта.)
  - **`price`, `previous_price`, `price_currency`** — для price_drop-строки «2.10M (was 2.30M)».
  - **`deal_type` (`text`)** — `sale` / `rent`.
  - **`bedrooms` (`int`), `unit_type_id` (`uuid`)** — сырьё для заголовка; `title` бэк НЕ отдаёт, фронт собирает хелпером ленты.
  - **`location_label`, `community_label` (`text`)** — display-ready. 🔒 `COALESCE(public_location.name, location.name)` — чужие листинги, сырой адрес нельзя (бэк уже безопасный).
  - **`thumb_url` (`text`)** — есть в ответе, но v1-UI колокольчика его НЕ рендерит (без фото).

### 1C. `get_saved_filters()` (СУЩЕСТВУЕТ у superApp; realtime НЕ трогает) — per-filter, источник счётчика ОБЪЕКТОВ
- **`filter_id` (`uuid`)**, **`name` (`text`)** — имя фильтра для строки дропдауна и сайдбара.
- **`unseen_count` (`int`)** — 🏠 **счётчик ОБЪЕКТОВ**: число не-открытых объектов в фильтре. Денорм-колонка `saved_filters.unseen_count`, superApp декрементит при открытии объекта (`user_seen_listings.seen_at`). Бейдж у фильтра везде.

### 1D. `mark_bell_seen()` → `void` (ОТДАЁТ realtime) — вызывать при **закрытии колокольчика**: двигает bell-курсор на `now()` → `bell_unseen=0` и все `items[].unseen=false` (точки гаснут). Счётчики объектов (`unseen_count`) НЕ трогает.

---

## 2A. Что строит superApp — живые счётчики ВЕЗДЕ (один стор)

**Единый реактивный стор** (Angular `signal()`/`BehaviorSubject`):
- `bell = { bell_unseen, items }` ← `get_bell()` (bell_unseen = бейдж колокольчика; items с `seen` = строки/точки дропдауна).
- `filters = [{ filter_id, name, unseen_count }]` ← `get_saved_filters()` (счётчик объектов per-filter).

**Триггеры `refresh()`:** (1) WS `bell.changed`; (2) WS (ре)коннект; (3) fallback-поллинг ~60с (и единственный путь при тумблере OFF); (4) возврат фокуса/`visibilitychange`. `refresh()` = параллельно `get_bell()` + `get_saved_filters()` → в стор; всё подписанное перерисовывается разом.

**Поверхности (ВСЕ читают стор, ни одна не считает сама):**
| Поверхность | Значение | Источник | Гаснет при |
|---|---|---|---|
| 🔔 Иконка-колокол (хедер) | счётчик **уведомлений** (+ точки в дропдауне) | `bell.bell_unseen` + `items[].unseen` | закрытии колокольчика |
| 🏠 Сайдбар сохранённых фильтров | бейдж объектов у каждого | `filters[i].unseen_count` | открытии объекта |
| Агрегат меню «Matches (N)» | сумма объектов | `Σ filters[i].unseen_count` | открытии объектов |
| Mobile tab / Electron tray (опц.) | на выбор | тот же стор | — |

❌ Никакого `count++` на фронте — событие лишь триггерит `refresh()`, число всегда из бэка.

---

## 2B. Что строит superApp — КАК ВЫГЛЯДЯТ нотификации

### (1) Дропдаун колокольчика — список ФИЛЬТРОВ, **обязательно** (БЕЗ фото)

Список сохранённых фильтров с непросмотренными объектами, новые сверху. **Одна строка = один фильтр.** Макет (~340px):

```
┌──────────────────────────────────────────────────┐
│ 🟠 2BR Marina under 2.5M                     (3)  │  ← точка(уведомл. не просмотрено) · имя · счётчик объектов
│      New · 2BR Apartment · Dubai Marina · AED 2.1M │  ← строка за свежий объект
├──────────────────────────────────────────────────┤
│ 🟠 Villas Arabian Ranches                    (1)  │
│      Price ↓ · 4BR Villa · Arabian Ranches · 2.1M  │
└──────────────────────────────────────────────────┘
```

Каждая строка:
1. **🟠 Оранжевая точка** слева — если у фильтра есть **непросмотренное уведомление** (любой его item `unseen=true`). Гаснет при **закрытии колокольчика** (`mark_bell_seen`), НЕ при открытии объекта.
2. **Имя фильтра** — `name` (§1C).
3. **Счётчик объектов** — `unseen_count` (§1C) справа бейджем, cap «99+». (Это НЕ счётчик уведомлений — тот на иконке колокольчика; и гаснет отдельно, открытием объекта.)
4. **Строка за свежий объект** — свежайший матч этого `filter_id` из `get_bell().items` (max `matched_at`): `{тег} · {title} · {location_label} · {цена}`. тег `new`→`New`/`price_drop`→`Price ↓`; `title` фронт собирает (`{bedrooms}BR {unitType}`); цена `new`→`AED 2,100,000`, `price_drop`→`AED 2.1M (was 2.3M)`.

- **БЕЗ thumbnail / без отдельной строки deal_type-community** — компактный текст.
- **Жирная** строка — пока `unseen_count > 0`; всё открыли → строка уходит.
- **Сортировка** — по `matched_at` свежего матча, новые сверху.
- **Клик по строке** → открыть объект в sidebar. Это «просмотрено ОБЪЕКТА»: superApp пишет в `user_seen_listings`, бэк декрементит `unseen_count` → следующий `refresh()`: счётчик объекта −1 (на оранжевую точку и бейдж колокольчика это НЕ влияет).
- **Закрытие дропдауна** → `mark_bell_seen()` → бейдж колокольчика = 0 И все оранжевые точки гаснут (уведомления просмотрены). Счётчики объектов при этом НЕ трогаются.

**Заголовок дропдауна:** `Notifications`. **Состояния:** loading → skeleton-строки; empty → таблица ниже; error → `Couldn't load — Retry`.

**Источник строк дропдауна (не путать два источника):**
- **Гейт строк:** фильтры с `unseen_count > 0` (`get_saved_filters`). `=0` → строки нет.
- **Превью:** свежайший матч этого `filter_id` из `get_bell().items` (max `matched_at`). **Нет в head'е** (старый бэклог за пределами ~20) → fallback **`{unseen_count} new — tap to view`** (имя+счётчик есть, превью нет; не дёргать отдельный запрос).

**Пустые / служебные состояния (точный текст):**
| Ситуация | Заголовок | Подпись | Действие |
|---|---|---|---|
| Фильтры есть, непросмотренного нет (`Σ unseen_count = 0`) | `No new matches` | `You'll see new listings for your saved filters here.` | — |
| Нет сохранённых фильтров | `No saved filters yet` | `Create a filter to get match alerts.` | `Create filter` |
| Первая загрузка | — | skeleton: 3 строки | — |
| REST упал | `Couldn't load notifications` | — | `Retry` |
| Тумблер живости OFF | — | `Live updates off` (серым, хинт) | колокольчик рабочий через REST |

### (2) Live-toast (in-app) — **рекомендуется** (текст, без фото)
При `bell.changed`, если окно открыто И тумблер ON. Компактный текст, правый-нижний угол:
```
┌────────────────────────────────────────┐
│ New match in «2BR Marina under 2.5M»  ✕ │
│ 2BR Apartment · Dubai Marina · AED 2.1M │
└────────────────────────────────────────┘
```
- `bell_unseen` вырос **>1** за refresh → агрегат **`N new matches`** + `Tap to view`.
- ровно +1 → строка свежего объекта (тег·title·location·цена) + имя фильтра. Без фото.
- Auto-dismiss ~5с; клик → открыть дропдаун. Не более 1 тоста.

### (3) Нативная OS-нотификация (Electron desktop) — **опционально**
При `bell.changed` и неактивном окне (+ OS-permission + тумблер ON): Electron `Notification` — `New match` / тело `2BR Apartment · Dubai Marina` (или `N new matches`); клик → focus + дропдаун/объект.

---

## 3. Поведение — динамика и краевые случаи

### 3.1 Сокет = подсказка, не данные. UI всегда из REST. Не строить из payload сокета.
### 3.2 Ре-синк на (ре)коннекте: на open сразу `refresh()` — пропущенное самозалечивается.
### 3.3 Дебаунс — на notifier (всплеск → один `bell.changed`). Фронт не троттлит; один сигнал → один `refresh()`.
### 3.4 🔑 ДВА НЕЗАВИСИМЫХ СИГНАЛА (главное — см. таблицу в шапке):
  - **Сигнал уведомлений** = `bell_unseen` (бейдж колокольчика) + `items[].unseen` (оранжевые точки). Оба от bell-курсора; гаснут при **закрытии колокольчика** (`mark_bell_seen`).
  - **Сигнал объектов** = `unseen_count` (бейдж фильтра). Гаснет при **открытии объекта** (superApp пишет `user_seen_listings`).
  - ❌ НЕ связывать: закрытие колокольчика НЕ трогает счётчики объектов; открытие объекта НЕ трогает бейдж/точки уведомлений.
### 3.5 Дедуп: объект в 2 фильтрах = одна карточка (бэк дедупит). Карточка умеет оба `match_type`.
### 3.6 `price_drop` в проде пока 0 строк (≈15× `new`) — но тег/строка обязаны уметь оба.
### 3.7 Тумблер живости OFF → нет сокета/тостов/нативных; счётчики живые через poll (3) + on-focus (4).
### 3.8 Multi-tab / Electron-окна: у каждого свой сокет+стор, обновляются независимо (cap ≤10/юзера/реплику).
### 3.9 Протухший токен у живого сокета — не рвём; на реконнекте свежий JWT из Supabase-сессии.
### 3.10 Счётчик есть, свежего объекта в `get_bell` нет (бэклог): строка фильтра ВСЁ РАВНО показывается — имя + `unseen_count` + fallback `{N} new — tap to view`. `get_bell` отдаёт только голову (~20), бэклог считается в `unseen_count`, но превью у него нет. Клик → результаты фильтра.
### 3.11 Закрытие колокольчика гасит сигнал уведомлений (бейдж → 0 И все точки), но счётчики объектов у фильтров остаются (раз объекты не открывали) — это by design (3.4), НЕ баг.

### НЕ делать
- ❌ строить UI из payload сокета; ❌ JWT в query `?token=` (только `Sec-WebSocket-Protocol`, прил. A);
- ❌ считать/инкрементить счётчики на фронте — только из стора;
- ❌ путать два счётчика: бейдж колокольчика = `bell_unseen` (уведомления), бейдж фильтра = `unseen_count` (объекты);
- ❌ гасить счётчик уведомлений при открытии объекта или счётчики объектов при открытии колокольчика (3.4);
- 🔒 ❌ показывать сырой `locations.name` — только `location_label`/`community_label`.

---

## 4. Зависимости (без них поля §1 пусты)

### 4.1 RPC `get_bell` + `mark_bell_seen` + таблица-курсор `notification_cursor`+RLS (НОВЫЕ) — **realtime**, `migrations/product/017`. ✅ код готов, **владелец применяет в проде**. Читает только superApp-таблицы `filter_matches`/`saved_filters`/`properties`/`locations`/`property_photos` (чужие seen-таблицы НЕ читает). `bell_unseen` и `items[].unseen` — от bell-курсора (`notification_cursor`); `mark_bell_seen` двигает курсор при закрытии колокольчика.
### 4.2 Триггер `product/016_bell_changed_notify` на `filter_matches` (НОВЫЙ) — realtime пишет, **владелец применяет**. Без него `bell.changed` не приходит (REST на poll всё равно работает).
### 4.3 `get_saved_filters()` (СУЩЕСТВУЕТ, **superApp**) — отдаёт `filter_id`, `name`, `unseen_count`. ⚠️ СВЕРИТЬ наличие `unseen_count` (если нет — задача superApp). Декремент `unseen_count` при открытии объекта — логика superApp.
### 4.4 WSS-эндпоинт + JWT-секрет — **владелец** (go-live): сервис `start:notifier` PORT 3403, `wss://notify.mrsqm.com` (Traefik: прокинуть `Upgrade`/`Connection`, сохранить эхо `Sec-WebSocket-Protocol`), origin allowlist `https://sapp.mrsqm.com`, secret `SUPABASE_JWT_SECRET`(=`GOTRUE_JWT_SECRET`).
### 4.5 Title-хелпер + unit_type-справочник — СУЩЕСТВУЕТ у superApp.

---

## Граница ответственности

- **realtime гарантирует:** WSS-шлюз (auth/registry/heartbeat/cap), дебаунс на `user_id`, fan-out-safety; `get_bell` → `{bell_unseen, items[unseen]}` (поток, дедуп, active, privacy-safe location; bell_unseen и items[].unseen из bell-курсора — чужие seen-таблицы не читаем); `mark_bell_seen()`; канон триггера 016.
- **superApp строит:** WS-клиент (auth/reconnect/re-sync), реактивный стор + ВСЕ счётчики (колокол=`bell_unseen`, фильтры=`unseen_count`), визуал нотификаций; `mark_bell_seen()` при ЗАКРЫТИИ колокольчика; пишет `user_seen_listings` при открытии объекта; берёт `name`/`unseen_count` из `get_saved_filters`; собирает `title`.
- **Прод-зависимости (владелец):** применение 016/017, секрет, WSS-роут.

---

## Приложение A — WS-хендшейк (дословно)

```
URL:        wss://notify.mrsqm.com
Subprotocol (транспорт токена — браузер не шлёт Authorization на WS):
            new WebSocket(url, [ supabaseAccessToken ])  → заголовок Sec-WebSocket-Protocol: <JWT>
Сервер:     верифицирует JWT (HS256, SUPABASE_JWT_SECRET; exp ОБЯЗАТЕЛЕН; user_id = JWT.sub),
            эхо-возвращает subprotocol (иначе браузерный handshake рвётся).
Невалид/нет exp/просрочен → сервер закрывает сокет на upgrade.
Heartbeat:  сервер ping → браузер pong автоматически.
Cap:        ≤ NOTIFIER_MAX_CONN_PER_USER (10) на юзера на реплику.
Reconnect:  клиент: backoff + jitter; на каждом open → refresh().
```

## Приложение B — пример ответа `get_bell()`

```json
{
  "bell_unseen": 2,
  "items": [
    {
      "property_id": "1111...", "filter_id": "aaaa...",
      "match_type": "new", "matched_at": "2026-06-29T08:42:13.520Z",
      "unseen": true,
      "price": 2100000, "previous_price": null, "price_currency": "AED",
      "deal_type": "sale", "bedrooms": 2, "unit_type_id": "cccc...",
      "location_label": "Dubai Marina", "community_label": "Marina Gate", "thumb_url": "https://.../t.jpg"
    },
    {
      "property_id": "2222...", "filter_id": "aaaa...",
      "match_type": "price_drop", "matched_at": "2026-06-29T07:10:00.000Z",
      "unseen": false,
      "price": 2100000, "previous_price": 2300000, "price_currency": "AED",
      "deal_type": "sale", "bedrooms": 2, "unit_type_id": "cccc...",
      "location_label": "Dubai Marina", "community_label": null, "thumb_url": null
    }
  ]
}
```
> `bell_unseen` = счётчик уведомлений (бейдж колокольчика). `unseen` per-item = уведомление не просмотрено (`true` → оранжевая точка). Оба гаснут при `mark_bell_seen` (закрытие колокольчика). `title` собирает фронт; `thumb_url` UI не рендерит.

## Приложение C — реактивный стор (Angular, псевдокод-эскиз)

```ts
@Injectable({ providedIn: 'root' })
export class NotifierStore {
  bell    = signal<{ bell_unseen: number; items: BellItem[] }>({ bell_unseen: 0, items: [] });
  filters = signal<SavedFilter[]>([]);            // { filter_id, name, unseen_count }
  private ws?: WebSocket;

  start(token: string) {
    if (liveDisabled()) { this.refresh(); this.startPoll(); return; }   // тумблер OFF → только REST
    this.connect(token); this.startPoll();
    document.addEventListener('visibilitychange', () => !document.hidden && this.refresh());
  }
  private connect(token: string) {
    this.ws = new WebSocket('wss://notify.mrsqm.com', [token]);   // JWT в subprotocol (прил. A)
    this.ws.onopen    = () => this.refresh();                     // ре-синк (3.2)
    this.ws.onmessage = (e) => { if (JSON.parse(e.data).type === 'bell.changed') this.refresh(); };
    this.ws.onclose   = () => this.scheduleReconnect();
  }
  async refresh() {
    const [bell, filters] = await Promise.all([rpc('get_bell'), rpc('get_saved_filters')]);
    this.bell.set(bell);        // bell_unseen → бейдж колокольчика; items.unseen → оранжевые точки
    this.filters.set(filters);  // unseen_count → бейджи фильтров + агрегат
  }
  // 🔔 ЗАКРЫЛ колокольчик → гаснет бейдж уведомлений И все точки (mark_bell_seen). Объекты не трогаем.
  async closeBell() { await rpc('mark_bell_seen'); await this.refresh(); }
  // 🏠 открыл объект → гаснет счётчик объекта (бейдж/точки уведомлений не трогаем)
  async openListing(propertyId: string, filterId: string) {
    /* navigate to listing in sidebar */
    await rpc('mark_listing_seen', { property_id: propertyId, filter_id: filterId }); // superApp: user_seen_listings.seen_at
    await this.refresh();
  }
}
```
> Любой компонент подписан на `bell`/`filters` — обновляются разом. Два действия гасят два разных сигнала: `closeBell`→уведомления (бейдж+точки), `openListing`→объекты (`unseen_count`).

## Приложение D — Definition of Done (superApp)

- [ ] WS-клиент: коннект JWT-в-subprotocol, backoff-реконнект, `refresh()` на open.
- [ ] Реактивный стор `bell`+`filters`, триггеры (событие/реконнект/poll-60с/focus).
- [ ] 🔔 Бейдж колокольчика = `bell_unseen`; гаснет при ЗАКРЫТИИ колокольчика (`mark_bell_seen`).
- [ ] 🟠 Оранжевая точка в строке дропдауна = у фильтра есть item с `unseen=true`; гаснет при ЗАКРЫТИИ колокольчика (вместе с бейджем).
- [ ] 🏠 Бейджи фильтров (сайдбар + строка дропдауна) + агрегат = `unseen_count`; гаснут при открытии объекта.
- [ ] Дропдаун §2B(1): список фильтров, строка = точка(уведомл.) + имя + счётчик объектов + строка свежего объекта, БЕЗ фото; клик→объект.
- [ ] Независимость (3.4): закрыл колокольчик → бейдж+точки 0, счётчики объектов НЕ изменились; открыл объект → счётчик объекта −1, бейдж/точки уведомлений НЕ изменились.
- [ ] Гейт строк `unseen_count>0`; бэклог без превью → fallback `{N} new — tap to view` (3.10).
- [ ] Пустые/служебные состояния по таблице §2B(1).
- [ ] Live-toast §2B(2): одиночный vs агрегат `N new matches`, auto-dismiss, клик→дропдаун.
- [ ] (опц.) Нативная Electron-нотификация при неактивном окне.
- [ ] Тумблер живости OFF → нет сокета/тостов, счётчики через poll.
- [ ] 🔒 нигде не сырой адрес — только `location_label`/`community_label`.
```
