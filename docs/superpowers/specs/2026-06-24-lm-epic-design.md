# Дизайн: Эпик LM — управление статусами своих листингов

> **Дата:** 2026-06-24 · **Статус:** утверждён к планированию (brainstorming-фаза пройдена)
> **Мандат:** продакшн на 30 000+ бизнес-юзеров (риелторы Дубая), **костыли запрещены**.
> **Источники:** `docs/TODO.md` секция «Эпик LM» (LM-1…LM-6); `docs/superpowers/specs/2026-06-23-get-feed-scope-rework-design.md` строки 40–62; `docs/superpowers/briefs/2026-06-24-lm-epic-start-prompt.md`.

## 0. Контекст и цель

Владелец объекта должен управлять жизненным циклом своего листинга прямо в карточке: продлевать, переопубликовывать отклонённое/снятое, архивировать, удалять. Сейчас в карточке (`property-detail`) есть только Изменить (цена+описание) + Архивировать (sold/withdrawn) — одинаковые кнопки независимо от статуса. Нужно **набор действий, управляемый статусом**, и три недостающие серверные операции (renew, republish, delete) с поддерживающей инфраструктурой (истечение, durable-чистка Storage, аудит).

### Уже готово (НЕ переделывать)

- **LM-1:** поле «Status» в карточке (`statusLabel()`, только `is_owner`). → в этом эпике **сворачивается в баннер** (см. §3).
- `archive_property(uuid, status)` RPC + `PropertyOwnerService.archiveProperty()` (sold/withdrawn).
- `update_property` (цена+описание), `actualize_property` (поднять в ленте).
- **SC-2** (`get_feed` `p_my_status`), **SC-5** (статус-фильтр под «Охват»).

### Статусы объекта (источник истины)

`pending_review, active, rejected, expired, archived_sold, archived_withdrawn` (`draft` УБРАН).
Метки — `PROPERTY_STATUS_LABELS` (`types/database.ts`): На модерации / Активен / Отклонён / Истёк / Продан / Снят.

## 1. Закрытые решения (из brainstorming 2026-06-24)

| #                                    | Решение                                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirm-диалоги                      | Подтверждение перед **Удалить** (жёсткое, с предупреждением о необратимости) и **Архивировать** (мягкое). **Продлить** — без диалога.                                                          |
| «Редактировать» (rejected/withdrawn) | **Правка + авто-републикация:** инлайн-редактор (цена+описание), при «Сохранить» объект публикуется заново (статус меняется на сервере).                                                       |
| Макет зоны действий                  | **Вариант B — баннер статуса + кнопки**: цветной баннер статуса возглавляет группу действий; причина отклонения — под баннером. Поле «Status» из «Характеристик» сворачивается в баннер (DRY). |
| Истечение                            | **Добавляем авто-истечение** (pg_cron + триггер активации). Срок жизни листинга = **30 дней** (консистентно с renew).                                                                          |
| Чистка Storage при удалении          | **Durable серверная**: очередь `storage_cleanup_queue` + pg_cron-дренер через `pg_net`. Клиент за полноту НЕ отвечает.                                                                         |
| Аудит удалений                       | **Тонкий аудит**: строка в `deleted_listings_audit` (id, owner_id, deleted_at) при удалении.                                                                                                   |

## 2. Серверная архитектура

Все серверные единицы — DDL под **гейтом** (объяснение → явное «да» → ROLLBACK-смоук → транзакционное применение под `supabase_admin`). `pg_get_functiondef` не ставит `;` после `$function$` — добавлять вручную; многострочный SQL слать прямым ssh с редиректом файла (psql.sh выпивает stdin). RPC зеркалят паттерн `archive_property`: `SECURITY DEFINER`, `SET search_path TO 'public','extensions'`, owner-check `WHERE owner_id = auth.uid()`, `IF NOT FOUND THEN RAISE`, `RETURN`, `GRANT EXECUTE ... TO authenticated`.

### 2.1. Ось истечения — единое правило `expires_at`

**Принцип:** `expires_at` устанавливается ровно тогда, когда объект становится `active`, в одном месте — триггере. RPC не дублируют эту логику.

- **Триггер `set_expires_on_activation()`** BEFORE INSERT OR UPDATE ON properties:
  при `NEW.status='active'` и (TG_OP='INSERT' ИЛИ `OLD.status` <> 'active') → `NEW.expires_at := now() + interval '30 days'`.
  - network-объект (INSERT active) → срок ставится сразу.
  - public-объект (INSERT pending_review) → срок НЕ ставится; стартует при одобрении модератором (UPDATE status→active в Админке — триггер наш, срабатывает независимо от того, кто делает UPDATE).
  - renew (expired→active) и republish-network (withdrawn→active) → срок ставится автоматически (RPC лишь меняют статус).
- **pg_cron expire-джоба** (раз в сутки/час): `UPDATE properties SET status='expired' WHERE status='active' AND expires_at IS NOT NULL AND expires_at < now()`.
- **Бэкфилл при раскатке:** существующим active-объектам (`expires_at IS NULL`) проставить `expires_at := now() + interval '30 days'` (свежие 30 дней от момента раскатки для всех), иначе старые объекты не истекают, а новые истекают — несогласованное поведение.
- **Взаимодействие с RT-2:** на событии status→active уже висит AFTER-триггер enqueue match-jobs (realtime). Наш — BEFORE (правит колонку), их — AFTER (пишет в очередь). Конфликта по времени нет.

### 2.2. LM-3 — `rejection_reason` (колонка + owner-гейт)

- `ALTER TABLE properties ADD COLUMN rejection_reason text;` (NULL по умолчанию).
- Патч `get_property`: добавить поле, **видимое только владельцу** (как whatsapp_phone/broker_license, строки 630/642): в json-сборке отдавать
  `'rejection_reason', CASE WHEN p.owner_id = v_current_user_id THEN p.rejection_reason ELSE NULL END`.
  Не-владельцу заметка модератора НЕ уходит в JSON (защита от утечки PII конкурентам).
  Патч — staleness-proof DO-блок на живом теле (regexp), якорь после `'status', p.status,`; учесть, что у `get_property` несколько json-веток.
- Колонку **пишет модератор Админки** (cross-repo) в своём флоу модерации. Наша сторона — только колонка + чтение; флоу Админки не блокирует нас.

### 2.3. LM-4 — `renew_property(uuid)`

```
SECURITY DEFINER, owner-check.
Guard: текущий статус = 'expired' (иначе RAISE 'cannot renew: property is not expired').
UPDATE properties SET status='active' WHERE id=p_property_id AND owner_id=auth.uid();
-- expires_at проставит триггер set_expires_on_activation (§2.1).
RETURN true;
GRANT EXECUTE ON FUNCTION public.renew_property(uuid) TO authenticated;
```

Продление → `active` сразу, без модерации (решение зафиксировано).

### 2.4. LM-6 — `republish_property(uuid, price, description)` RETURNS text

```
SECURITY DEFINER, owner-check.
Guard: текущий статус ∈ ('rejected','archived_withdrawn') (иначе RAISE).
v_new_status := CASE WHEN visibility='public' THEN 'pending_review' ELSE 'active' END;
UPDATE properties
   SET price=p_price, description=p_description, status=v_new_status
 WHERE id=p_property_id AND owner_id=auth.uid();
-- expires_at: при network→active проставит триггер; при public→pending_review не ставится (корректно).
RETURN v_new_status;   -- клиент берёт серверную истину, не пересчитывает visibility→status
GRANT EXECUTE ... TO authenticated;
```

Один атомарный RPC = одно действие «Сохранить» (правка полей + републикация). Возвращает итоговый статус.

> ⚠️ Sync-замечание: republish network→active → срабатывает RT-2-триггер матчинга (релистнутый объект заново входит в выдачу/уведомления). Это намеренно (relisted = должен матчиться снова).

### 2.5. LM-5 — `delete_property(uuid)` ⚠️ ДЕСТРУКТИВНО

Отдельное согласие + аудит FK + смоук на тестовом объекте. Состоит из нескольких частей:

**(a) FK-аудит (живой, на гейте):**

```sql
SELECT conrelid::regclass AS child, conname, confdeltype
FROM pg_constraint
WHERE confrelid = 'public.properties'::regclass AND contype='f';
```

На каждом FK→properties гарантировать `ON DELETE CASCADE` (confdeltype='c'); где нет — `ALTER ... DROP CONSTRAINT ... ADD CONSTRAINT ... ON DELETE CASCADE`. Ожидаемые: `property_photos`, `filter_matches`, `user_filter_seen`, `user_seen_listings`, события/история цены (`property_events`), будущие comments + всё, что вскроет аудит.

> ⚠️ `filter_matches`/`user_filter_seen` принадлежат realtime — правка их констрейнтов согласуется (awareness), не молча.

**(b) Аудит-таблица:**

```sql
CREATE TABLE deleted_listings_audit (
  property_id uuid PRIMARY KEY,
  owner_id    uuid NOT NULL,
  deleted_at  timestamptz NOT NULL DEFAULT now()
);
-- RLS: только владелец читает свои (или вовсе закрыта от anon/authenticated, пишет DEFINER-функция).
```

**(c) RPC:**

```
SECURITY DEFINER, owner-check.
Guard: статус ∈ ('archived_sold','archived_withdrawn') — удалять только из архива
       (живые/pending/rejected защищены; rejected → сперва «Снять», затем «Удалить»).
INSERT INTO deleted_listings_audit (property_id, owner_id) SELECT id, owner_id FROM properties WHERE id=p AND owner_id=auth.uid();
DELETE FROM properties WHERE id=p_property_id AND owner_id=auth.uid();  -- каскад добивает следы БД
RETURN true;
GRANT EXECUTE ON FUNCTION public.delete_property(uuid) TO authenticated;
```

**(d) Durable-чистка Storage (по префиксу объекта):**

> Реальная схема: `property_photos` хранит `full_url`/`thumb_url` (публичные URL), **колонки пути нет**. Все файлы объекта лежат под общим префиксом `{property_id}/` в бакете `property_photos` (`{id}/0_full.webp`, `{id}/0_thumb.webp`, `{id}/fp_0_full.webp`…). Поэтому чистим **по префиксу объекта**, а не по пути каждого фото (иначе пришлось бы парсить URL обратно в путь — костыль).

- `CREATE TABLE storage_cleanup_queue (id bigserial PK, prefix text NOT NULL, enqueued_at timestamptz DEFAULT now(), attempts int DEFAULT 0, last_error text)`.
- Триггер `AFTER DELETE ON properties` → `INSERT INTO storage_cleanup_queue (prefix) VALUES (OLD.id::text || '/')`. Срабатывает при любом удалении объекта (через `delete_property` или иначе).
- **pg_cron-дренер** (раз в минуту), функция `drain_storage_cleanup_queue()`: для каждого префикса берёт ключи объектов из локальной `storage.objects` (`WHERE bucket_id='property_photos' AND name LIKE prefix || '%'`) → один `pg_net` HTTP DELETE к Storage API (`/storage/v1/object/property_photos`, тело `{prefixes:[<ключи>]}`, service-role key из **Supabase Vault**) → при 2xx удаляет строку очереди, иначе `attempts++`, `last_error` (ретрай). Если ключей нет (объект без фото) — сразу снимает из очереди. Идемпотентно, переживает краш = **0 сирот**.
- **Предпосылка (проверить на гейте):** `pg_net` + `pg_cron` включены; service-role key в Vault (узнать имя секрета); доступ DEFINER-функции к схеме `storage`. Если `pg_net` недоступен на self-hosted — дренер уходит в инструкцию создателю (edge-function/внешний крон), но очередь и триггер остаются наши.

## 3. Фронт — зона действий (вариант B)

Файлы: `property-detail.component.{ts,html,scss}`, `services/property-owner.service.ts`, `types/database.ts`.

### 3.1. Матрица «статус → баннер → кнопки»

| Статус               | Баннер (семантический токен) | Кнопки                                                    |
| -------------------- | ---------------------------- | --------------------------------------------------------- |
| `active`             | success (зелёный)            | Изменить · Поднять вверх · Архивировать ▾                 |
| `pending_review`     | warning (жёлтый)             | Архивировать ▾                                            |
| `rejected`           | error (красный)              | _причина (под баннером)_ · Редактировать · Архивировать ▾ |
| `expired`            | neutral                      | Продлить (+30 дней) · Архивировать ▾                      |
| `archived_sold`      | neutral                      | Удалить                                                   |
| `archived_withdrawn` | neutral                      | Редактировать · Удалить                                   |

- **Баннер** — единственная поверхность статуса в карточке владельца (поле «Status» из «Характеристик» убирается). Цвета — из семантических токенов темы Super Productivity, **без хардкода hex и без override Material**.
- **Причина отклонения** показывается под баннером только при `rejected` и непустом `rejection_reason`.
- **«Изменить»** (active) и **«Редактировать»** (rejected/withdrawn) открывают **один** инлайн-редактор (цена+описание, уже существующий). Save:
  - active → `updateProperty` (статус не меняется);
  - rejected/withdrawn → `republishProperty` → клиент применяет **возвращённый** статус.
- **«Поднять вверх»** (actualize) переезжает из ряда «В избранное» в баннер-зону (только active) — консолидация по матрице.
- **Архивировать ▾** — существующее меню (Продан / Снять) + confirm (§3.3).
- После **delete** — карточка закрывается (объект исчез) + `changedTick`.

### 3.2. Confirm-диалоги (переиспользуем `ui/dialog-confirm`, сырые RU-строки)

`DialogConfirmComponent` гоняет тексты через `| translate` — несуществующие ключи проходят насквозь, сырой русский работает без правок локалей. Открытие: `MatDialog.open(DialogConfirmComponent, {data:{...}}).afterClosed()` → boolean. `showDontShowAgain` НЕ использовать (удаление не должно «замолкать»).

- **Удалить** (жёсткий): title «Удалить объект навсегда?»; message «Объект и все его следы будут стёрты безвозвратно: фотографии, история цены, совпадения с фильтрами. Это действие нельзя отменить.»; okTxt «Удалить навсегда».
- **Архивировать → Продан** (мягкий): «Отметить объект как проданный? Он уйдёт из активной выдачи.»; ok «Отметить проданным».
- **Архивировать → Снять** (мягкий): «Снять объект с публикации?»; ok «Снять».
- **Продлить** — без диалога.
- (Тексты черновые — подтвердить на ревью спеки.)

### 3.3. Сервис `PropertyOwnerService` (зеркало существующих)

```
renewProperty(id): rpc('renew_property') → changedTick++
republishProperty(id, price, desc): rpc('republish_property') → returns new status → changedTick++
deleteProperty(id): rpc('delete_property') → changedTick++   // Storage-чистка — серверная, клиент НЕ трогает Storage
```

Паттерн как у `archiveProperty`: успех → `changedTick++`; ошибка → бампа нет.

### 3.4. Типы (`types/database.ts`)

- `PropertyDetail`: `rejection_reason: string | null`.
- Маппинг статус → семантический токен баннера (единый источник, не инлайн).

## 4. Поток данных / синк-корректность

- MrSQM-данные **вне** Super Productivity NgRx/op-log синка → правила effects/`LOCAL_ACTIONS`/meta-reducer **не затрагиваются** (это серверные RPC на authenticated, не NgRx-actions). Подтверждено.
- Все мутации → `PropertyOwnerService.changedTick` → лента перечитывается (существующий механизм W-7).
- Конкурентность между устройствами безопасна: каждый RPC проверяет статус-guard на сервере (renew требует expired; republish требует rejected/withdrawn; delete требует архив) → устаревшее действие со второго устройства даёт RAISE, а не порчу данных.

## 5. Порядок реализации

Серверные единицы по очереди (каждая = объяснение → «да» → ROLLBACK-смоук → apply):

1. **LM-3:** `rejection_reason` колонка + owner-гейт в `get_property`.
2. **Истечение:** триггер `set_expires_on_activation` + бэкфилл active-объектов + pg_cron expire-джоба.
3. **LM-4:** `renew_property`.
4. **LM-6-сервер:** `republish_property`.
5. **LM-5:** FK-аудит/каскады → `deleted_listings_audit` → `delete_property` → `storage_cleanup_queue`+триггер → pg_cron-дренер+Vault (отдельное согласие, смоук на тест-объекте).

Затем **фронт одним заходом** (LM-2 баннер+кнопки+confirm + чтение `rejection_reason` + wiring renew/republish/delete). Реализация — **subagent-driven** (серверные единицы независимы). TDD: юнит-тесты на новые методы сервиса и на логику «статус → набор кнопок»; `npm run checkFile` на каждый `.ts/.scss`. Деплой — по `/deploy` (гейт `lint && buildFrontend:prodWeb`, один пуш, TG, чеклист 7 доков).

## 6. Открытые подтверждения (на ревью спеки / на гейтах)

- Срок жизни листинга = 30 дней (§2.1) — подтвердить.
- Тексты confirm-диалогов (§3.2) — подтвердить/поправить.
- Гейт LM-5: точное имя bucket'а и path-колонки `property_photos`, наличие `pg_net`/`pg_cron`/Vault — проверить живьём.
- Cross-repo awareness: правка FK-констрейнтов `filter_matches`/`user_filter_seen` (realtime); запись `rejection_reason` модератором (Админка).

## 7. Карта зависимостей (что перезапускать при правке)

- Триггер активации ↔ renew/republish/INSERT/модераторский UPDATE — все пути активации funnel через него; правка срока = одна константа.
- `delete_property` → каскады FK → Storage-очередь → дренер: правка состава следов = аудит FK заново.
- `get_property` owner-гейт `rejection_reason` ↔ фронт-карточка (показ при rejected).
- Фронт-матрица ↔ серверные guard'ы: набор кнопок на статус должен соответствовать допустимым переходам RPC.
