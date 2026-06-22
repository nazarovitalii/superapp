# Дизайн: бейдж непросмотра по фильтру + фикс свечения своих объектов

**Дата:** 2026-06-22 (сессия 5)
**Связано:** [2026-06-22-feed-unseen-seen-tracking-design.md](2026-06-22-feed-unseen-seen-tracking-design.md) (стадии 1–3 unseen-трекинга)

## Контекст и проблемы

Подсистема непросмотра состоит из двух независимых индикаторов:

1. **Капсула на карточке** (`get_feed.is_unseen`) — «этот объект новее, чем я его видел в ленте».
2. **Бейдж на сохранённом фильтре** (`get_saved_filters.unseen_count`) — «столько матчей этого фильтра я ещё не видел».

Оба сейчас завязаны на один глобальный сигнал `user_seen_listings.shown_at`, который бампается `mark_listings_shown` при показе **любой** страницы ленты. Отсюда два дефекта:

### Баг A — свои объекты вечно светятся
`is_unseen = GREATEST(created, updated) > COALESCE(shown_at, 'epoch')`. При этом `mark_listings_shown` **намеренно пропускает** свои объекты (`owner_id IS DISTINCT FROM uid`, чтобы не пачкать воронку владельца) → у своих объектов `shown_at` всегда NULL → `is_unseen` вечно `true` → капсула светится при **каждой** перезагрузке ленты.

### Баг B (изменение бизнес-логики) — бейдж гаснет без захода в фильтр
`unseen_count` считает матчи, где `matched_at > shown_at`. Прокрутка **общей ленты** бампает `shown_at` тех же объектов → бейдж фильтра гаснет, хотя юзер в фильтр не заходил.

## Желаемое поведение

- **Капсула:** на своих объектах не появляется никогда. На чужих — как сейчас (гаснет, когда объект показан в ленте).
- **Бейдж:** гаснет **только** когда юзер реально показал объекты **внутри этого фильтра**, и **частично** — ровно на число подгруженных объектов. Пример: в фильтре 67 непросмотренных, открыл фильтр, подгрузилась первая страница 25 → бейдж становится 42; долистал — тает дальше. Прокрутка общей ленты на бейдж **не влияет**.

## Граница с командой realtime

Вся работа — **read-side, наша сторона** (superapp-миграции + Angular-фронт). Репозиторий realtime и их матчер **не трогаем**.

- `filter_matches` (+ `matched_at`) пишет матчер realtime; мы из него только **читаем**. `matched_at` уже в проде.
- seen-по-фильтру держим в **отдельной нашей таблице**, а НЕ колонкой в `filter_matches`: матчер при DLQ re-enqueue перезаливает ряды `filter_matches` → seen-состояние бы терялось. Отдельная таблица это переживает.
- Опциональная координация (вне этой задачи, не блокирует): их Delivery/push-спека может позже читать нашу seen-таблицу, чтобы не слать пуш о виденном в фильтре.

## Решение

### Часть 1 — Баг A (1 миграция, read-side)

Staleness-proof патч `get_feed` (как остальные `get_feed`-патчи): в выражение `is_unseen` добавить owner-skip, чтобы свои объекты всегда `false`:

```sql
'is_unseen', (
  p.owner_id IS DISTINCT FROM COALESCE(p_user_id, auth.uid())
  AND GREATEST(p.created_at, p.updated_at) > COALESCE(<существующий shown_at-подзапрос>, 'epoch'::timestamptz)
)
```

Фронт не меняется. Свой объект → `is_unseen=false` → капсула не рендерится.

### Часть 2 — Баг B (новая таблица + RPC + патч get_saved_filters + фронт)

**Новая таблица** `public.user_filter_seen`:

```sql
CREATE TABLE public.user_filter_seen (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filter_id   uuid NOT NULL REFERENCES public.saved_filters(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, filter_id, property_id)
);
-- RLS: юзер видит/пишет только свои строки (user_id = auth.uid()).
```

**Новый RPC** `mark_filter_seen(p_filter_id uuid, p_property_ids uuid[])`:
- `SECURITY DEFINER`, `SET search_path = public`.
- `INSERT (auth.uid(), p_filter_id, pid) ... ON CONFLICT DO NOTHING`.
- Защита: вставлять только если `p_filter_id` принадлежит `auth.uid()` (подзапрос по `saved_filters`), иначе игнор — чтобы нельзя было метить чужой фильтр.
- `GRANT EXECUTE ... TO authenticated`.

**Патч `get_saved_filters.unseen_count`** (staleness-proof, как RT-4). Заменяем текущий подзапрос (`matched_at > shown_at`) на «активные матчи фильтра, которых нет в `user_filter_seen`»:

```sql
unseen_count =
  (SELECT count(*)
     FROM filter_matches fm
     JOIN properties p ON p.id = fm.property_id AND p.status = 'active'
    WHERE fm.filter_id = sf.id
      AND NOT EXISTS (
        SELECT 1 FROM user_filter_seen ufs
         WHERE ufs.user_id = sf.user_id
           AND ufs.filter_id = sf.id
           AND ufs.property_id = fm.property_id))
```

(`matched_at`/`shown_at` для бейджа больше не нужны — счёт идёт по факту «показан внутри фильтра». `DISTINCT`/`GROUP BY` по `property_id` сохранить, т.к. на пару может быть 2 ряда `new_listing`+`price_drop`.)

**Фронт:**
- `SeenTrackingService`: добавить `markFilterSeen(filterId, propertyIds)` → RPC `mark_filter_seen`.
- `feed-page.component.ts._load`/`_markPageShown`: если активен сохранённый фильтр (`feedFilter.loadedFilterId()` задан), после загрузки страницы вызвать `markFilterSeen(filterId, ids)` для подгруженных id (в дополнение к существующему `markShown` для глобального `shown_at`/капсулы).
- **Оптимистичное обновление сразу:** при показе страницы в фильтре локально вычесть из бейджа число новых (ещё не помеченных) подгруженных матчей; сервер подтверждает фоном при следующем `get_saved_filters`. Бейдж живёт в `feed-filter-panel` (`savedFilters` signal) — обновлять там.

## Решения по краям

- **Бэкфилл:** нет. `user_filter_seen` стартует пустой; бейджи разово покажут полное число матчей, юзер разгасит заходом. (Решение создателя 2026-06-22.)
- **Грязный фильтр (`isDirtySinceLoad`):** seen помечаем, пока `loadedFilterId` задан (юзер в контексте этого фильтра), независимо от dirty. Простейший вариант; пересмотреть, если всплывёт.
- **Манипуляция фильтром без сохранённого фильтра:** `loadedFilterId=null` → `markFilterSeen` не вызывается (бейджи только у сохранённых фильтров).

## Затронутые единицы

| Единица | Изменение | Владелец |
|---|---|---|
| `get_feed` (RPC) | патч `is_unseen` (+owner-skip) | наш read-side |
| `user_filter_seen` (таблица) | новая + RLS | наш |
| `mark_filter_seen` (RPC) | новый | наш |
| `get_saved_filters` (RPC) | патч `unseen_count` | наш read-side |
| `SeenTrackingService` | +`markFilterSeen` | фронт |
| `feed-page.component.ts` | вызов `markFilterSeen` при активном фильтре + оптимистичный декремент | фронт |
| `feed-filter-panel` | оптимистичное обновление бейджа | фронт |

`filter_matches`, матчер, репо realtime — **без изменений**.

## Гейты

- Миграции (таблица + 2 RPC + 2 патча функций) — DDL на общей прод-БД → **применять только после явного «да»**. SQL пишем в `docs/migrations/`.
- Перед пушем: `npm run lint && npm run buildFrontend:prodWeb`.
- `npm run checkFile` на каждый изменённый `.ts`.

## Критерии успеха (проверяемые)

1. Свой объект в ленте: перезагрузка → капсула **не** появляется (Баг A).
2. Чужой новый объект: капсула есть, гаснет за 5с после показа (без регресса).
3. Прокрутка **общей** ленты не меняет бейдж сохранённого фильтра (Баг B).
4. Открыл фильтр с N непросмотренными, подгрузил K на первой странице → бейдж = N−K (частичное гашение).
5. Долистал все → бейдж 0; новый матч позже → бейдж снова растёт.
