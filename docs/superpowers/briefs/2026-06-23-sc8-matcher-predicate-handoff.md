# SC-8 — Матчер `property_matches_filter`: зеркалить новый предикат охвата (handoff в realtime)

> **Назначение:** этот документ — задание для сессии/команды репозитория **`~/Projects/realtime`**.
> Из superapp-сессии мы матчер НЕ трогаем (конвенция: чужой репозиторий не редактируем). Здесь — точный
> предикат и критерии приёмки, чтобы реализовать SC-8 на их стороне.

**Статус апстрима:** эпик SC (`get_feed` scope rework) **применён на прод** 2026-06-23
(`docs/migrations/applied/2026-06-23-get-feed-scope-rework.sql`). Матчер сейчас зеркалит СТАРЫЙ широкий
предикат → расхождение (см. ниже). SC-8 закрывает это расхождение.

## Что не так сейчас

`property_matches_filter` (realtime) определяет, какие объекты «матчат» сохранённый фильтр (→ жёлтый бейдж
непросмотра у All/Friends-фильтров). Он зеркалит прежнюю видимость `get_feed`:

```sql
p.status = 'active' AND p.visibility IN ('public','network')   -- СТАРОЕ, БЕЗ ограничения сети
```

`get_feed` теперь сужен (P2-фикс, решение D1): `network`-объекты видны только если владелец в сети юзера,
и свои объекты исключены из All/Friends. Пока матчер не обновлён, бейджи All/Friends-фильтров считают
**чужие карманные (network) объекты не из сети юзера**, которых в ленте больше нет → **бейдж > лента**
(известное временное расхождение, не баг апстрима).

## Что нужно сделать (SC-8)

Матчер должен для фильтра `F` (владелец `U`, scope `S = F.filters->>'scope'`):

1. **scope='my' → НЕ матчить вообще.** My-фильтры не получают матчей/бейджей
   (апстрим уже выставляет `get_saved_filters.unseen_count = 0` для них —
   `docs/migrations/applied/2026-06-23-get-saved-filters-my-scope-zero.sql`).

2. **scope ∈ {public/all, friends} → матчить только видимое под этим охватом для `U`**, зеркаля §3.2
   дизайна (`docs/superpowers/specs/2026-06-23-get-feed-scope-rework-design.md`). С `v_network_ids(U)` =
   `user_network.friend_ids ∪ colleague_ids` владельца фильтра:

   ```sql
   -- all (он же клиентский 'public'):
   p.status = 'active'
   AND p.owner_id IS DISTINCT FROM U
   AND ( p.visibility = 'public'
         OR (p.visibility = 'network' AND p.owner_id = ANY(v_network_ids)) )

   -- friends:
   p.status = 'active'
   AND p.owner_id IS DISTINCT FROM U
   AND p.visibility = 'network'
   AND p.owner_id = ANY(v_network_ids)
   ```

   (плюс прочие критерии самого фильтра — цена/локация/тип и т.д., как и раньше).

   **Важно:** `user_network` — это МАТЕРИАЛИЗОВАННОЕ ПРЕДСТАВЛЕНИЕ, выводимое из `friendships`
   (`status='accepted'`, направленно: `friend_ids[U] = friendships.friend_id WHERE user_id=U`) и
   `agency_members` (коллеги). Источник истины — `friendships`; matview обновляется триггером
   `trg_refresh_network_friendships`. Матчер должен читать `user_network` (как и `get_feed`), не
   `friendships` напрямую.

## Источник истины предиката

- `get_feed` (живое тело после применения): предикат охвата в одном CTE `base`, ветки
  `p_scope IN ('all','friends','my')` — копировать оттуда, не из устаревшего `docs/database.md`.
- Дизайн §3.2 + решения D1 (сужение network до сети), D-эпик.

## Критерии приёмки

1. Для фильтра `scope='my'` матчей не создаётся (бейдж всегда 0).
2. Для `scope ∈ {all, friends}` множество матчей фильтра `F(U)` ⊆ множества объектов, которые
   `get_feed(p_user_id:=U, p_scope:=<scope>, <критерии F>)` возвращает (бейдж ≤ лента, расхождение закрыто).
3. Чужой карманный (`network`) объект не из сети `U` НЕ матчит ни один All/Friends-фильтр `U` (P2).
4. Свой объект `U` не матчит его же All/Friends-фильтр (owner-skip).

## Проверка (пример на тест-данных апстрима)

Тест-юзеры подружены (`friendships` accepted): `nazarovitalii@gmail.com` (8db1f713) ↔
`test2@mrsqm.dev` (b0000002). У test2 — 3 active sale (visibility=network). После SC-8:
All/Friends-фильтр nazarovitalii должен матчить ровно эти 3 (как и `get_feed friends` = 3), не больше.
