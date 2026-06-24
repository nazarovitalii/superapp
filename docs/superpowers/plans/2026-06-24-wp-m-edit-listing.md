# WP-M — Редактирование листинга: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать владельцу полноценное окно редактирования своего объекта (отдельная страница, 3 таба: Параметры · Описание · Фото) с жёстким серверным whitelist редактируемых полей.

**Architecture:** Новый standalone-компонент `pages/edit-property/`, открывается по роуту `/mrsqm/edit/:id` (owner-guard). Текущие значения грузятся через существующий `get_property`. Сохранение — через новую SECURITY DEFINER RPC `edit_property`, которая физически принимает только whitelist-поля (неизменяемые поля не параметры → недостижимы из devtools). Фото редактируются расширением `PropertyPhotoService`. Старый инлайн-мини-редактор цены/описания в owner-панели убирается; кнопки «Изменить»/«Редактировать» ведут на новый роут.

**Tech Stack:** Angular standalone + signals + OnPush, Angular Material (sparingly), CDK DragDrop, Supabase RPC (anon-ключ + RLS), self-hosted Postgres (pg_get_functiondef-стиль миграции).

## Global Constraints

- Комментарии и UI-строки — **на русском**.
- Дизайн = Super Productivity: переиспользовать токены/темы, не вводить новый визуальный язык; Material — минимально.
- Strict TypeScript: никакого `any` (только `unknown`, если правда неизвестно).
- Signals предпочтительнее Observable; никакой мутации состояния.
- **`npm run checkFile <filepath>`** после каждого изменённого `.ts`/`.scss`.
- Деплой-гейт перед пушем: **`npm run lint && npm run buildFrontend:prodWeb`**.
- DDL на прод — **только с явного «да» создателя**. Миграции идемпотентны и обратимы, применять под ролью `supabase_admin`.
- Supabase: `p_user_id` не передавать с клиента — RLS берёт `auth.uid()` из JWT. Service-ключ в клиент не кладётся.
- Защита неизменяемых полей — **на сервере** (не только UI). Требование создателя: «убрать неизменяемые поля и из UI, и из функции».
- Один `git push` (CI `cancel-in-progress: true` убьёт первый билд при двух подряд).

---

## Whitelist (единственный источник истины для всех задач)

**Редактируемые поля** (только их принимает `edit_property`, только их биндит UI):
`is_maid, is_study, is_hotel_pool, is_vastu, area_sqft (→ area_sqm сервер выводит), plot_sqft (→ plot_sqm сервер выводит), floor_level_id, floor_number, floors_in_unit_id, view_ids[], position_ids[], amenity_ids[], furnished, price, price_period (аренда), occupancy_status, lease_until, listing_type, visibility, public_location_id, original_price (только если в БД NULL), description`. Фото — отдельный путь (Task 2/7).

**Неизменяемые** (НЕТ в сигнатуре RPC, UI показывает read-only либо не показывает):
`category_id, unit_type_id, sub_type_id, deal_type, location_id, bedrooms, bathrooms, original_price (если уже задана), owner_id, status (управляется логикой RPC, не клиентом)`.

**Серверная логика статуса в `edit_property`:**
- `active` → остаётся `active`, `last_actualized_at = now()` (всплывает в ленте, без модерации).
- `rejected` / `archived_withdrawn` → переопубликация: `status = (visibility='public' ? 'pending_review' : 'active')`.
- `pending_review` / `expired` / `archived_sold` → `RAISE EXCEPTION` (правка запрещена). UI для этих статусов кнопку не показывает (`OWNER_ACTIONS_BY_STATUS`).

**Логика цены:** `price <> OLD.price` → `previous_price = OLD.price`, `price_changed_at = now()` (это единственный писатель этих колонок; `is_reduced`/`is_below_op` ставит существующий триггер `set_property_price_flags` — RPC их НЕ трогает). `original_price`: писать только если `OLD.original_price IS NULL` (иначе присланное игнорируется через `COALESCE`).

---

## Deploy-ordering (КРИТИЧНО — read перед Task 1)

`edit_property` заменяет `update_property` + `republish_property`. Нельзя дропнуть старые RPC одной гейченной миграцией до выката фронта: прод-фронт (старый) зовёт `update_property`/`republish_property` из инлайн-редактора → DROP сломает прод-окно до пуша; а если задеплоить новый фронт раньше создания `edit_property` — упадёт сохранение. Поэтому **две фазы**:

1. **Фаза A (Task 1, гейт «да»):** миграция создаёт ТОЛЬКО `edit_property` (аддитивно). Старые RPC живут. И старый, и новый фронт работают.
2. **Деплой фронта** (Tasks 2–8): новый фронт зовёт `edit_property`, инлайн-редактор и вызовы старых RPC удалены.
3. **Фаза B (Task 9, отдельный гейт «да», ПОСЛЕ успешного деплоя фронта):** вторая миграция дропает `update_property` + `republish_property`.

> Это сознательное отклонение от спеки («одна миграция») ради zero-downtime. Вынести на подтверждение создателю при запросе «да».

---

## File Structure

**Создать:**
- `docs/migrations/2026-06-24-wp-m-edit-property.sql` — Фаза A: `CREATE OR REPLACE FUNCTION edit_property(...)` + GRANT + аддитивный патч `get_property` (отдать `public_location_id`).
- `docs/migrations/2026-06-24-wp-m-drop-legacy-rpcs.sql` — Фаза B: DROP `update_property` + `republish_property`.
- `src/app/mrsqm/pages/edit-property/edit-property.component.ts` — standalone, OnPush.
- `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- `src/app/mrsqm/pages/edit-property/edit-property.component.scss`
- `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`

**Модифицировать:**
- `src/app/mrsqm/services/property-photo.service.ts` — `deletePhoto()`, `reorder()`.
- `src/app/mrsqm/services/property-photo.service.spec.ts` — тесты (создать, если нет).
- `src/app/mrsqm/services/property-owner.service.ts` — `editProperty()` + `EditPropertyPayload`; (Task 8) удалить `updateProperty`/`republishProperty`.
- `src/app/mrsqm/services/property-owner.service.spec.ts` — тесты (создать, если нет).
- `src/app/app.routes.ts` — роут `mrsqm/edit/:id`.
- `src/app/mrsqm/types/database.ts` — `PropertyDetail.public_location_id` (Task 4B).
- `src/app/mrsqm/components/property-detail/property-detail.component.ts` + `.html` — навигация вместо инлайн-редактора; удалить мёртвые методы/сигналы.

---

## Task 1: Миграция Фаза A — `edit_property` + `get_property.public_location_id` (DDL, гейт «да»)

**Files:**
- Create: `docs/migrations/2026-06-24-wp-m-edit-property.sql`

**Interfaces:**
- Produces:
  - RPC `public.edit_property(p_property_id uuid, p_price numeric, p_description text, p_is_maid boolean, p_is_study boolean, p_is_hotel_pool boolean, p_is_vastu boolean, p_area_sqft numeric, p_plot_sqft numeric, p_floor_level_id uuid, p_floor_number integer, p_floors_in_unit_id uuid, p_view_ids uuid[], p_position_ids uuid[], p_amenity_ids uuid[], p_furnished text, p_price_period text, p_occupancy_status text, p_lease_until date, p_listing_type text, p_visibility text, p_public_location_id uuid, p_original_price numeric) RETURNS text` — возвращает итоговый `status`.
  - `get_property` JSON дополнен ключом `public_location_id` (uuid) — нужен фронту, чтобы выставить начальную позицию бегунка приватности (сейчас отдаётся только `public_location_path`-строка). Аддитивно (новый ключ JSON), не ломает потребителей.

- [ ] **Step 1: Запросить у создателя явное «да» на Фазу A**

Показать SQL ниже + объяснить deploy-ordering (Фаза A аддитивна, DROP откладывается на Фазу B). Дождаться «да». Без «да» — НЕ применять.

- [ ] **Step 2: Написать файл миграции**

```sql
-- WP-M Фаза A: edit_property — полноценное редактирование листинга с жёстким whitelist.
-- Неизменяемые поля (category/type/deal/location/beds/baths/owner/status) НЕ параметры →
-- недостижимы из devtools. SECURITY DEFINER + owner-check (owner_id = auth.uid()).
-- area_sqm/plot_sqm выводятся сервером из sqft (один источник округления, без клиентского дрейфа).
-- previous_price/price_changed_at пишет ТОЛЬКО эта функция (триггеров-писателей нет);
-- is_reduced/is_below_op ставит существующий trg_property_price_flags — здесь не трогаем.
-- Аддитивно: update_property/republish_property пока ЖИВЫ (дропаются в Фазе B после деплоя фронта).
-- Идемпотентно (CREATE OR REPLACE). ОБРАТИМО: DROP (внизу). Применять под supabase_admin.
CREATE OR REPLACE FUNCTION public.edit_property(
  p_property_id        uuid,
  p_price              numeric,
  p_description        text    DEFAULT NULL,
  p_is_maid            boolean DEFAULT false,
  p_is_study           boolean DEFAULT false,
  p_is_hotel_pool      boolean DEFAULT false,
  p_is_vastu           boolean DEFAULT false,
  p_area_sqft          numeric DEFAULT NULL,
  p_plot_sqft          numeric DEFAULT NULL,
  p_floor_level_id     uuid    DEFAULT NULL,
  p_floor_number       integer DEFAULT NULL,
  p_floors_in_unit_id  uuid    DEFAULT NULL,
  p_view_ids           uuid[]  DEFAULT NULL,
  p_position_ids       uuid[]  DEFAULT NULL,
  p_amenity_ids        uuid[]  DEFAULT NULL,
  p_furnished          text    DEFAULT NULL,
  p_price_period       text    DEFAULT NULL,
  p_occupancy_status   text    DEFAULT NULL,
  p_lease_until        date    DEFAULT NULL,
  p_listing_type       text    DEFAULT NULL,
  p_visibility         text    DEFAULT NULL,
  p_public_location_id uuid    DEFAULT NULL,
  p_original_price     numeric DEFAULT NULL
) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_status      text;
  v_visibility  text;
  v_old_price   numeric;
  v_old_op      numeric;
  v_new_status  text;
  v_sqft_to_sqm constant numeric := 0.092903;
BEGIN
  SELECT status, visibility, price, original_price
    INTO v_status, v_visibility, v_old_price, v_old_op
    FROM properties
   WHERE id = p_property_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found or not owned by current user';
  END IF;

  -- Статус: active остаётся active; rejected/withdrawn → переопубликация по (новой) видимости;
  -- остальное запрещено (pending ждёт модерации, expired — сперва «Продлить», sold — архив).
  IF v_status = 'active' THEN
    v_new_status := 'active';
  ELSIF v_status IN ('rejected', 'archived_withdrawn') THEN
    v_new_status := CASE
      WHEN COALESCE(p_visibility, v_visibility) = 'public' THEN 'pending_review'
      ELSE 'active'
    END;
  ELSE
    RAISE EXCEPTION 'cannot edit listing in status %', v_status;
  END IF;

  UPDATE properties SET
    is_maid            = p_is_maid,
    is_study           = p_is_study,
    is_hotel_pool      = p_is_hotel_pool,
    is_vastu           = p_is_vastu,
    area_sqft          = p_area_sqft,
    area_sqm           = CASE WHEN p_area_sqft IS NULL THEN NULL
                              ELSE round(p_area_sqft * v_sqft_to_sqm, 2) END,
    plot_sqft          = p_plot_sqft,
    plot_sqm           = CASE WHEN p_plot_sqft IS NULL THEN NULL
                              ELSE round(p_plot_sqft * v_sqft_to_sqm, 2) END,
    floor_level_id     = p_floor_level_id,
    floor_number       = p_floor_number,
    floors_in_unit_id  = p_floors_in_unit_id,
    view_ids           = p_view_ids,
    position_ids       = p_position_ids,
    amenity_ids        = p_amenity_ids,
    furnished          = p_furnished,
    price              = p_price,
    price_period       = p_price_period,
    occupancy_status   = p_occupancy_status,
    lease_until        = p_lease_until,
    listing_type       = p_listing_type,
    visibility         = COALESCE(p_visibility, v_visibility),
    public_location_id = p_public_location_id,
    original_price     = COALESCE(v_old_op, p_original_price),
    description        = p_description,
    previous_price     = CASE WHEN p_price IS DISTINCT FROM v_old_price
                              THEN v_old_price ELSE previous_price END,
    price_changed_at   = CASE WHEN p_price IS DISTINCT FROM v_old_price
                              THEN now() ELSE price_changed_at END,
    last_actualized_at = now(),
    status             = v_new_status
  WHERE id = p_property_id AND owner_id = auth.uid();

  RETURN v_new_status;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.edit_property(
  uuid, numeric, text, boolean, boolean, boolean, boolean, numeric, numeric,
  uuid, integer, uuid, uuid[], uuid[], uuid[], text, text, text, date, text, text, uuid, numeric
) TO authenticated;

-- ОТКАТ Фазы A (edit_property):
--   DROP FUNCTION IF EXISTS public.edit_property(
--     uuid, numeric, text, boolean, boolean, boolean, boolean, numeric, numeric,
--     uuid, integer, uuid, uuid[], uuid[], uuid[], text, text, text, date, text, text, uuid, numeric);

-- ── Аддитивный патч get_property: отдать public_location_id (uuid) ────────────
-- Зачем: фронт edit-property выставляет начальную позицию бегунка приватности по id
-- (сейчас отдаётся только public_location_path-строка — по ней нельзя точно найти узел).
-- Патч staleness-proof: pg_get_functiondef + regexp по живому определению (НЕ переписываем
-- тело из доков), с guard «якорь не найден» (см. [[staleness-proof-pg-function-patch.md]]).
-- Якорь — существующий ключ JSON 'public_location_path'. Добавляем рядом 'public_location_id'.
DO $$
DECLARE def text; new_def text;
BEGIN
  def := pg_get_functiondef('public.get_property(uuid, uuid)'::regprocedure);
  -- Вставляем ключ ПЕРЕД 'public_location_path' в json_build_object.
  new_def := regexp_replace(
    def,
    E'(\\'public_location_path\\')',
    E'''public_location_id'', p.public_location_id,\n      \\1',
    'g'
  );
  IF new_def = def THEN
    RAISE NOTICE 'якорь "public_location_path" не найден — формат get_property изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;
-- ОТКАТ патча: повторно применить предыдущее определение get_property из applied/.
```

> **Гоча:** точное имя сигнатуры (`get_property(uuid, uuid)`) и алиас таблицы (`p.`) сверить с живым `pg_get_functiondef` перед применением — если алиас в текущем определении иной, поправить regexp. Guard `RAISE NOTICE` не даст применить мусор.

- [ ] **Step 3: Применить миграцию (после «да») через /migrate skill**

Применять под `supabase_admin`. Гоча `psql.sh` выпивает stdin — слать SQL аргументом/файлом, не пайпом (см. [[migrate-psql-sh-stdin-gotcha]]).

- [ ] **Step 4: ROLLBACK-смоук на тестовом объекте владельца**

В одной транзакции (`BEGIN; ... ROLLBACK;`), от имени владельца (через `SET LOCAL request.jwt.claims`), проверить:
1. Владелец active: `SELECT edit_property(<id>, <new_price>, 'desc')` → вернул `'active'`; `price`, `last_actualized_at` обновились; `previous_price = OLD.price`, `price_changed_at` обновился.
2. Цена без изменения → `previous_price`/`price_changed_at` НЕ перезаписаны.
3. Неизменяемые: `bedrooms`/`category_id`/`location_id` после вызова не изменились (их нет в сигнатуре — невозможно).
4. `original_price` уже задан → присланный `p_original_price` проигнорирован (`COALESCE`).
5. rejected → `pending_review` (public) / `active` (network).
6. Чужой объект (`auth.uid()` ≠ owner) → `RAISE` 'property not found or not owned'.
7. `pending_review`/`expired`/`archived_sold` → `RAISE` 'cannot edit listing in status'.

Expected: все 7 проходят, затем `ROLLBACK` (данные не изменены).

- [ ] **Step 4b: Смоук патча get_property**

`SELECT get_property('<id>', NULL) -> 'public_location_id';` → отдаёт uuid (или null, если адрес полный). `location_full_path`/`public_location_path` не сломались (прежние значения на месте).

- [ ] **Step 5: Зафиксировать результат смоука**

Запись в `docs/tests.md` (T-N): что проверено, что прошло. Файл миграции пока НЕ переносить в `applied/` — он перенесётся вместе с деплоем фронта.

---

## Task 2: `PropertyPhotoService` — `deletePhoto` + `reorder`

**Files:**
- Modify: `src/app/mrsqm/services/property-photo.service.ts`
- Test: `src/app/mrsqm/services/property-photo.service.spec.ts` (создать)

**Interfaces:**
- Consumes: существующие `BUCKET = 'property_photos'`, `MrsqmSupabaseService` (`.client.storage`, `.client.from`).
- Produces:
  - `async deletePhoto(propertyId: string, photo: { full_url: string; thumb_url: string }): Promise<void>` — удаляет full+thumb из Storage и строку из `property_photos`.
  - `async reorder(propertyId: string, photoType: 'gallery' | 'floor_plan', orderedFullUrls: string[]): Promise<void>` — переписывает `order_index` = позиция в массиве для строк данного `photo_type`.
  - приватный `private _storageKey(url: string): string` — извлекает ключ бакета из публичного URL.

- [ ] **Step 1: Написать падающие тесты**

```ts
import { TestBed } from '@angular/core/testing';
import { PropertyPhotoService } from './property-photo.service';
import { MrsqmSupabaseService } from './supabase.service';

describe('PropertyPhotoService (delete/reorder)', () => {
  let service: PropertyPhotoService;
  let storageRemove: jasmine.Spy;
  let tableDelete: jasmine.Spy;
  let tableUpdate: jasmine.Spy;
  let eqSpy: jasmine.Spy;

  beforeEach(() => {
    storageRemove = jasmine.createSpy('remove').and.resolveTo({ error: null });
    // .from('property_photos').delete().eq().eq() и .update().eq().eq() — цепочки
    eqSpy = jasmine.createSpy('eq');
    const chain = { eq: eqSpy };
    eqSpy.and.returnValue({ ...chain, then: undefined });
    tableDelete = jasmine.createSpy('delete').and.returnValue(chain);
    tableUpdate = jasmine.createSpy('update').and.returnValue(chain);

    const supabaseStub = {
      client: {
        storage: { from: () => ({ remove: storageRemove }) },
        from: () => ({ delete: tableDelete, update: tableUpdate }),
      },
    };
    TestBed.configureTestingModule({
      providers: [
        PropertyPhotoService,
        { provide: MrsqmSupabaseService, useValue: supabaseStub },
      ],
    });
    service = TestBed.inject(PropertyPhotoService);
  });

  it('deletePhoto удаляет оба ключа из Storage', async () => {
    const base = 'https://x/storage/v1/object/public/property_photos/';
    await service.deletePhoto('p1', {
      full_url: `${base}p1/0_full.webp`,
      thumb_url: `${base}p1/0_thumb.webp`,
    });
    expect(storageRemove).toHaveBeenCalledWith(['p1/0_full.webp', 'p1/0_thumb.webp']);
    expect(tableDelete).toHaveBeenCalled();
  });

  it('reorder обновляет order_index по позиции в массиве', async () => {
    const base = 'https://x/storage/v1/object/public/property_photos/';
    await service.reorder('p1', 'gallery', [`${base}p1/2_full.webp`, `${base}p1/0_full.webp`]);
    // два UPDATE: первый url → order_index 0, второй → 1
    expect(tableUpdate).toHaveBeenCalledTimes(2);
    expect(tableUpdate.calls.argsFor(0)[0]).toEqual({ order_index: 0 });
    expect(tableUpdate.calls.argsFor(1)[0]).toEqual({ order_index: 1 });
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/services/property-photo.service.spec.ts`
Expected: FAIL — `service.deletePhoto is not a function`.

- [ ] **Step 3: Реализовать методы**

Добавить в `PropertyPhotoService` (после `getPhotos`):

```ts
  // Точечное удаление одного фото: из Storage (full+thumb) и строки в property_photos.
  // НЕ через storage_cleanup_queue — та для полного удаления объекта.
  // Ключ строки в БД — по full_url (уникален). Storage-DELETE защищён политикой
  // property_photos_modify (владелец папки); строку чистим прямым DELETE (как uploadAndAttach — INSERT).
  async deletePhoto(
    propertyId: string,
    photo: { full_url: string; thumb_url: string },
  ): Promise<void> {
    const keys = [this._storageKey(photo.full_url), this._storageKey(photo.thumb_url)];
    const { error: storageErr } = await this._supabase.client.storage
      .from(BUCKET)
      .remove(keys);
    if (storageErr) throw storageErr;
    const { error } = await this._supabase.client
      .from('property_photos')
      .delete()
      .eq('property_id', propertyId)
      .eq('full_url', photo.full_url);
    if (error) throw error;
  }

  // Перестановка: order_index = позиция в orderedFullUrls, в рамках одного photo_type.
  // Галерея и floor_plan нумеруются независимо (каждый со своего 0).
  async reorder(
    propertyId: string,
    photoType: 'gallery' | 'floor_plan',
    orderedFullUrls: string[],
  ): Promise<void> {
    for (let i = 0; i < orderedFullUrls.length; i++) {
      const { error } = await this._supabase.client
        .from('property_photos')
        .update({ order_index: i })
        .eq('property_id', propertyId)
        .eq('full_url', orderedFullUrls[i]);
      if (error) throw error;
    }
  }

  // Ключ бакета из публичного URL: .../property_photos/<propertyId>/<file> → <propertyId>/<file>.
  private _storageKey(url: string): string {
    const marker = `/${BUCKET}/`;
    const idx = url.indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : url;
  }
```

> **Verify во время реализации:** убедиться, что прямой `DELETE`/`UPDATE` на `public.property_photos` проходит под `authenticated` (на таблице RLS-политика только SELECT; INSERT работает в `uploadAndAttach`, значит RLS на таблице, скорее всего, не enabled и DML открыт грантами). Если DELETE/UPDATE отбивается RLS — поднять флаг создателю: понадобится SECURITY DEFINER RPC вместо прямого DML (не реализовывать молча).

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/services/property-photo.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/services/property-photo.service.ts
npm run checkFile src/app/mrsqm/services/property-photo.service.spec.ts
git add src/app/mrsqm/services/property-photo.service.ts src/app/mrsqm/services/property-photo.service.spec.ts
git commit -m "feat(mrsqm): PropertyPhotoService.deletePhoto + reorder для редактирования фото"
```

---

## Task 3: `PropertyOwnerService.editProperty` + `EditPropertyPayload`

**Files:**
- Modify: `src/app/mrsqm/services/property-owner.service.ts`
- Test: `src/app/mrsqm/services/property-owner.service.spec.ts` (создать)

**Interfaces:**
- Consumes: `MrsqmSupabaseService.rpc<T>(name, params)`, `changedTick`.
- Produces:
  - `export interface EditPropertyPayload { propertyId: string; price: number; description: string | null; isMaid: boolean; isStudy: boolean; isHotelPool: boolean; isVastu: boolean; areaSqft: number | null; plotSqft: number | null; floorLevelId: string | null; floorNumber: number | null; floorsInUnitId: string | null; viewIds: string[] | null; positionIds: string[] | null; amenityIds: string[] | null; furnished: string | null; pricePeriod: string | null; occupancyStatus: string | null; leaseUntil: string | null; listingType: string | null; visibility: string | null; publicLocationId: string | null; originalPrice: number | null; }`
  - `async editProperty(p: EditPropertyPayload): Promise<string>` — зовёт RPC `edit_property`, бампает `changedTick`, возвращает итоговый статус.

> На этом шаге `updateProperty`/`republishProperty` НЕ удаляем — их ещё зовёт property-detail (удалим в Task 8, чтобы билд оставался зелёным между задачами).

- [ ] **Step 1: Написать падающий тест**

```ts
import { TestBed } from '@angular/core/testing';
import { PropertyOwnerService, EditPropertyPayload } from './property-owner.service';
import { MrsqmSupabaseService } from './supabase.service';

describe('PropertyOwnerService.editProperty', () => {
  let service: PropertyOwnerService;
  let rpc: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo('active');
    TestBed.configureTestingModule({
      providers: [
        PropertyOwnerService,
        { provide: MrsqmSupabaseService, useValue: { rpc } },
      ],
    });
    service = TestBed.inject(PropertyOwnerService);
  });

  it('шлёт whitelist-параметры и возвращает статус', async () => {
    const payload: EditPropertyPayload = {
      propertyId: 'p1', price: 100, description: 'd', isMaid: true, isStudy: false,
      isHotelPool: false, isVastu: false, areaSqft: 900, plotSqft: null,
      floorLevelId: 'fl', floorNumber: null, floorsInUnitId: null,
      viewIds: ['v1'], positionIds: null, amenityIds: null, furnished: 'furnished',
      pricePeriod: null, occupancyStatus: 'vacant', leaseUntil: null,
      listingType: 'pocket', visibility: 'public', publicLocationId: null, originalPrice: null,
    };
    const before = service.changedTick();
    const status = await service.editProperty(payload);

    expect(status).toBe('active');
    expect(service.changedTick()).toBe(before + 1);
    const [name, params] = rpc.calls.mostRecent().args;
    expect(name).toBe('edit_property');
    expect(params).toEqual(jasmine.objectContaining({
      p_property_id: 'p1', p_price: 100, p_is_maid: true,
      p_area_sqft: 900, p_view_ids: ['v1'], p_visibility: 'public',
    }));
    // неизменяемых полей в параметрах быть не должно
    expect(params['p_bedrooms']).toBeUndefined();
    expect(params['p_category_id']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/services/property-owner.service.spec.ts`
Expected: FAIL — `editProperty is not a function`.

- [ ] **Step 3: Реализовать payload-интерфейс и метод**

В начало файла (рядом с `ArchiveStatus`):

```ts
// Полное редактирование объекта (WP-M). Поля = whitelist RPC edit_property.
// Неизменяемые поля (категория/тип/сделка/адрес/beds/baths) сюда НЕ входят —
// сервер их физически не принимает (защита от devtools-обхода).
export interface EditPropertyPayload {
  propertyId: string;
  price: number;
  description: string | null;
  isMaid: boolean;
  isStudy: boolean;
  isHotelPool: boolean;
  isVastu: boolean;
  areaSqft: number | null;
  plotSqft: number | null;
  floorLevelId: string | null;
  floorNumber: number | null;
  floorsInUnitId: string | null;
  viewIds: string[] | null;
  positionIds: string[] | null;
  amenityIds: string[] | null;
  furnished: string | null;
  pricePeriod: string | null;
  occupancyStatus: string | null;
  leaseUntil: string | null;
  listingType: string | null;
  visibility: string | null;
  publicLocationId: string | null;
  originalPrice: number | null;
}
```

В класс (рядом с `republishProperty`):

```ts
  // Полное редактирование (WP-M): заменяет узкие updateProperty/republishProperty.
  // Возвращает итоговый статус (серверная истина) — клиент его не пересчитывает.
  async editProperty(p: EditPropertyPayload): Promise<string> {
    const status = await this._supabase.rpc<string>('edit_property', {
      p_property_id: p.propertyId,
      p_price: p.price,
      p_description: p.description,
      p_is_maid: p.isMaid,
      p_is_study: p.isStudy,
      p_is_hotel_pool: p.isHotelPool,
      p_is_vastu: p.isVastu,
      p_area_sqft: p.areaSqft,
      p_plot_sqft: p.plotSqft,
      p_floor_level_id: p.floorLevelId,
      p_floor_number: p.floorNumber,
      p_floors_in_unit_id: p.floorsInUnitId,
      p_view_ids: p.viewIds,
      p_position_ids: p.positionIds,
      p_amenity_ids: p.amenityIds,
      p_furnished: p.furnished,
      p_price_period: p.pricePeriod,
      p_occupancy_status: p.occupancyStatus,
      p_lease_until: p.leaseUntil,
      p_listing_type: p.listingType,
      p_visibility: p.visibility,
      p_public_location_id: p.publicLocationId,
      p_original_price: p.originalPrice,
    });
    this.changedTick.update((n) => n + 1);
    return status;
  }
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/services/property-owner.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/services/property-owner.service.ts
npm run checkFile src/app/mrsqm/services/property-owner.service.spec.ts
git add src/app/mrsqm/services/property-owner.service.ts src/app/mrsqm/services/property-owner.service.spec.ts
git commit -m "feat(mrsqm): PropertyOwnerService.editProperty + EditPropertyPayload"
```

---

## Task 4: Роут `/mrsqm/edit/:id` + owner-guard + scaffold компонента (шапка + 3 пустых таба + загрузка)

**Files:**
- Create: `src/app/mrsqm/pages/edit-property/edit-property.component.ts`
- Create: `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- Create: `src/app/mrsqm/pages/edit-property/edit-property.component.scss`
- Create: `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
- Modify: `src/app/app.routes.ts`

**Interfaces:**
- Consumes: `MrsqmSupabaseService.rpc<PropertyDetail>('get_property', { p_property_id })`, `PropertyCreateService.getFilterOptions()`, `PropertyPhotoService.getPhotos()`, `typeFieldsFor`, `PropertyDetail`, `FilterOptions`, `PropertyPhoto`.
- Produces (используется в Tasks 5–8): сигналы `detail`, `options`, `tab`, `isLoading`, `loadError`; computed `fields` (TypeFields), `headerLine`; метод `setTab(tab)`. Owner-доступ проверяется сервером (`get_property` отдаёт чужой объект без приватных полей; `is_owner` контролирует доступ к правке).

- [ ] **Step 1: Написать падающий тест scaffold**

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { EditPropertyPageComponent } from './edit-property.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';

describe('EditPropertyPageComponent', () => {
  let fixture: ComponentFixture<EditPropertyPageComponent>;

  const detailStub = {
    id: 'p1', is_owner: true, status: 'active', category_id: 'c1', unit_type_id: 'u1',
    deal_type: 'sale', price: 100, location_full_path: 'Dubai / Marina', description: 'd',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPropertyPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'p1' } } } },
        { provide: MrsqmSupabaseService, useValue: { rpc: () => Promise.resolve(detailStub) } },
        { provide: PropertyCreateService, useValue: { getFilterOptions: () => Promise.resolve({
          categories: [], unit_types: [{ id: 'u1', value: 'apartment', label_en: 'Apt', parent_id: 'c1' }],
          sub_types: [], views: [], positions: [], amenities: [], floor_levels: [],
          floors_in_unit_apt: [], floors_in_unit_house: [],
        }) } },
        { provide: PropertyPhotoService, useValue: { getPhotos: () => Promise.resolve([]) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EditPropertyPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('грузит деталь и стартует на табе params', () => {
    const c = fixture.componentInstance;
    expect(c.detail()?.id).toBe('p1');
    expect(c.tab()).toBe('params');
  });

  it('setTab переключает таб', () => {
    fixture.componentInstance.setTab('photos');
    expect(fixture.componentInstance.tab()).toBe('photos');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: FAIL — компонент не существует.

- [ ] **Step 3: Создать компонент (scaffold: загрузка, шапка, табы)**

`edit-property.component.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { FilterOptions, PropertyDetail, PropertyPhoto } from '../../types/database';
import { typeFieldsFor, TypeFields } from '../add-property/property-type-fields';

type EditTab = 'params' | 'description' | 'photos';

@Component({
  selector: 'mrsqm-edit-property-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './edit-property.component.html',
  styleUrl: './edit-property.component.scss',
})
export class EditPropertyPageComponent {
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _createService = inject(PropertyCreateService);
  private readonly _photoService = inject(PropertyPhotoService);

  readonly detail = signal<PropertyDetail | null>(null);
  readonly options = signal<FilterOptions | null>(null);
  readonly photos = signal<PropertyPhoto[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly tab = signal<EditTab>('params');

  // value unit_type объекта → ключ конфига полей таба «Параметры».
  private readonly _unitTypeValue = computed<string | null>(() => {
    const opts = this.options();
    const id = this.detail()?.unit_type_id;
    if (!opts || !id) return null;
    return opts.unit_types.find((u) => u.id === id)?.value ?? null;
  });
  readonly fields = computed<TypeFields>(() => typeFieldsFor(this._unitTypeValue()));

  // Read-only шапка: полный адрес (категория/сделка добавит вёрстка по labels из options).
  readonly headerPath = computed<string>(() => this.detail()?.location_full_path ?? '');

  constructor() {
    void this._load();
  }

  setTab(t: EditTab): void {
    this.tab.set(t);
  }

  cancel(): void {
    void this._router.navigateByUrl('/mrsqm/feed');
  }

  private async _load(): Promise<void> {
    const id = this._route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Объект не найден');
      this.isLoading.set(false);
      return;
    }
    try {
      const [detail, options, photos] = await Promise.all([
        this._supabase.rpc<PropertyDetail>('get_property', { p_property_id: id }),
        this._createService.getFilterOptions(),
        this._photoService.getPhotos(id),
      ]);
      if (!detail || detail.error || !detail.is_owner) {
        this.loadError.set('Редактировать можно только свой объект');
        return;
      }
      this.detail.set(detail);
      this.options.set(options);
      this.photos.set(photos);
      this._prefill(detail); // реализуется в Task 5 (заглушка-метод сейчас)
    } catch {
      this.loadError.set('Не удалось загрузить объект');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Заполнение полей формы из detail. Тело — Task 5.
  protected _prefill(_detail: PropertyDetail): void {
    // no-op в scaffold
  }
}
```

`edit-property.component.html`:

```html
@if (isLoading()) {
  <div class="edit-loading"><mat-spinner diameter="32"></mat-spinner></div>
} @else if (loadError()) {
  <div class="edit-error">
    <mat-icon>error_outline</mat-icon>
    <p>{{ loadError() }}</p>
    <button mat-stroked-button (click)="cancel()">Назад</button>
  </div>
} @else {
  <div class="edit-page">
    <!-- Read-only шапка: контекст объекта, правке не подлежит -->
    <header class="edit-header">
      <span class="edit-header-path">{{ headerPath() }}</span>
    </header>

    <nav class="edit-tabs">
      <button [class.active]="tab() === 'params'" (click)="setTab('params')">Параметры</button>
      <button [class.active]="tab() === 'description'" (click)="setTab('description')">Описание</button>
      <button [class.active]="tab() === 'photos'" (click)="setTab('photos')">Фото</button>
    </nav>

    <section class="edit-body">
      @if (tab() === 'params') {
        <!-- Task 5 -->
      } @else if (tab() === 'description') {
        <!-- Task 6 -->
      } @else {
        <!-- Task 7 -->
      }
    </section>

    <!-- футер кнопок «Сохранить»/«Отмена» — Task 8 -->
  </div>
}
```

`edit-property.component.scss`: минимальная раскладка на SP-токенах (по аналогии с add-property). Без локальных оверрайдов Material.

```scss
.edit-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  max-width: 720px;
  margin: 0 auto;
}
.edit-header-path {
  color: var(--text-color-muted);
  font-size: 13px;
}
.edit-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--extra-border-color);
}
.edit-tabs button {
  background: none;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--text-color-muted);
}
.edit-tabs button.active {
  color: var(--text-color);
  border-bottom: 2px solid var(--c-primary);
}
.edit-loading,
.edit-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px;
}
```

- [ ] **Step 4: Добавить роут**

В `src/app/app.routes.ts` после блока `mrsqm/add` (строки ~151–158) добавить:

```ts
  {
    path: 'mrsqm/edit/:id',
    loadComponent: () =>
      import('./mrsqm/pages/edit-property/edit-property.component').then(
        (m) => m.EditPropertyPageComponent,
      ),
    data: { page: 'mrsqm-edit', title: 'Редактировать объект', icon: 'edit' },
    canActivate: [mrsqmAuthGuard],
  },
```

> Доступ «только владелец» обеспечивается в компоненте (`get_property.is_owner`) + сервером (`edit_property` owner-check). Отдельный route-guard не нужен — id известен только из ссылки в своей карточке, а сервер всё равно отбивает чужого.

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: PASS (оба теста).

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.scss
npm run checkFile src/app/app.routes.ts
git add src/app/mrsqm/pages/edit-property/ src/app/app.routes.ts
git commit -m "feat(mrsqm): scaffold edit-property (роут, шапка, 3 таба, загрузка через get_property)"
```

---

## Task 4B: Read-only адрес + бегунок приватности (шапка формы)

> **Требование создателя (2026-06-24):** «при редактировании ОБЯЗАТЕЛЬНО вверху формы вернуть адрес (он не меняется) и бегунок под ним (его можно редактировать)». Бегунок живёт в шапке, видим всегда (не в табе).

**Files:**
- Modify: `src/app/mrsqm/types/database.ts` (добавить `public_location_id`)
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.ts` + `.html` + `.scss` + `.spec.ts`

**Interfaces:**
- Consumes: `PropertyCreateService.locationInfo(locationId)` → `{ location: {id,name,level}, breadcrumb: LocationBreadcrumbItem[], children, ... }`; `revealIndexFromFraction` (export из `add-property-page.component`); `LocationBreadcrumbItem`; `detail().location_id`, `detail().public_location_id`.
- Produces (для save Task 8): computed `publicLocationId(): string | null` (заменяет сигнал-заглушку из Task 5 — НЕ создавать сигнал `publicLocationId` в Task 5).

- [ ] **Step 1: Добавить `public_location_id` в `PropertyDetail`**

В `src/app/mrsqm/types/database.ts`, в `interface PropertyDetail` рядом с `public_location_path`:

```ts
  // Узел адреса, раскрытый публично (id); null = полный адрес. Источник позиции бегунка.
  public_location_id: string | null;
```

- [ ] **Step 2: Написать падающий тест слайдера**

```ts
  it('бегунок: addrPath реконструируется, leaf = полный адрес при public_location_id=null', async () => {
    const c = fixture.componentInstance;
    // locationInfo застаблен ниже; ждём реконструкции
    await fixture.whenStable();
    expect(c.addrPath().length).toBeGreaterThan(0);
    // public_location_id null → revealIndex = leaf → publicLocationId null
    expect(c.publicLocationId()).toBeNull();
  });
```

(В стаб `PropertyCreateService` добавить `locationInfo: () => Promise.resolve({ location: { id: 'leaf', name: 'Tower A', level: 'building' }, breadcrumb: [{ id: 'city', name: 'Dubai', level: 'city' }, { id: 'comm', name: 'Marina', level: 'community' }], children: [], developer_ids: [] })`. В `detailStub` — `location_id: 'leaf'`, `public_location_id: null`.)

- [ ] **Step 3: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: FAIL — `addrPath is not a function`.

- [ ] **Step 4: Реализовать реконструкцию адреса + механику бегунка**

В компонент импортировать:

```ts
import { ElementRef, viewChild } from '@angular/core';
import { LocationBreadcrumbItem } from '../../types/database';
import { revealIndexFromFraction } from '../add-property/add-property-page.component';
```

Добавить (механика 1:1 с add-property, адрес неизменяем — поэтому только бегунок, без поиска/каскада):

```ts
  private readonly _revealEl = viewChild<ElementRef<HTMLDivElement>>('revealEl');
  readonly isDragging = signal(false);

  // Цепочка адреса (от верхнего предка до leaf). Реконструируется из get_property.location_id.
  readonly addrPath = signal<LocationBreadcrumbItem[]>([]);
  readonly revealIndex = signal<number>(0);

  // Минимум бегунка — индекс комьюнити (ниже нельзя раскрывать). Нет комьюнити → 0.
  readonly communityIndex = computed<number>(() => {
    const idx = this.addrPath().findIndex((p) => p.level === 'community');
    return idx < 0 ? 0 : idx;
  });
  readonly leafIndex = computed<number>(() => Math.max(0, this.addrPath().length - 1));
  readonly canSlide = computed<boolean>(() => this.leafIndex() > this.communityIndex());
  readonly revealLabel = computed<string>(
    () => this.addrPath()[this.revealIndex()]?.name ?? '',
  );
  // Узел, видимый всем. revealIndex == leaf → полный адрес (null).
  readonly publicLocationId = computed<string | null>(() => {
    const ri = this.revealIndex();
    if (ri >= this.leafIndex()) return null;
    return this.addrPath()[ri]?.id ?? null;
  });

  selectReveal(i: number): void {
    if (i < this.communityIndex()) return;
    this.revealIndex.set(i);
  }
  onRevealPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    const el = this._revealEl()?.nativeElement;
    if (!el) return;
    el.setPointerCapture(ev.pointerId);
    this.isDragging.set(true);
    this._applyRevealPosition(ev, el);
  }
  onRevealPointerMove(ev: PointerEvent): void {
    if (!this.isDragging()) return;
    const el = this._revealEl()?.nativeElement;
    if (!el) return;
    this._applyRevealPosition(ev, el);
  }
  onRevealPointerUpOrCancel(): void {
    this.isDragging.set(false);
  }
  private _applyRevealPosition(ev: PointerEvent, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const fraction = (ev.clientX - rect.left) / rect.width;
    const idx = revealIndexFromFraction(
      fraction,
      this.addrPath().length,
      this.communityIndex(),
    );
    this.selectReveal(idx);
  }

  // Реконструкция цепочки адреса из leaf location_id (breadcrumb + self, с дедупом
  // self-ref building — см. [[locations-path-building-gotcha]]). Затем стартовая позиция
  // бегунка по public_location_id (null → leaf = полный адрес).
  private async _loadAddressChain(d: PropertyDetail): Promise<void> {
    if (!d.location_id) return;
    const info = await this._createService.locationInfo(d.location_id);
    if (!info) return;
    const self: LocationBreadcrumbItem = {
      level: info.location.level,
      id: info.location.id,
      name: info.location.name,
    };
    const bc = info.breadcrumb;
    const endsWithSelf = bc.length > 0 && bc[bc.length - 1].id === self.id;
    const path = endsWithSelf ? [...bc] : [...bc, self];
    this.addrPath.set(path);
    const leaf = Math.max(0, path.length - 1);
    const pubIdx = d.public_location_id
      ? path.findIndex((p) => p.id === d.public_location_id)
      : -1;
    this.revealIndex.set(pubIdx >= 0 ? pubIdx : leaf);
  }
```

Вызвать `void this._loadAddressChain(detail)` в `_load()` после `this.detail.set(detail)` (параллельно prefill).

- [ ] **Step 5: Свёрстать шапку с адресом + бегунком**

В `.html` заменить блок `<header class="edit-header">` на: read-only полный адрес + (если `canSlide()`) трек бегунка с точками по `addrPath()`, подпись `revealLabel()`, pointer-обработчики (`#revealEl`, `onRevealPointerDown/Move/UpOrCancel`). Разметку/SCSS бегунка копировать из add-property (шаг «Адрес», блок reveal-слайдера) — те же computed-контракты (`communityIndex/leafIndex/revealIndex/selectReveal`). Подпись: «Адрес виден коллегам до уровня: {{ revealLabel() }}» / при полном — «Полный адрес виден».

- [ ] **Step 6: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/types/database.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.scss
git add src/app/mrsqm/types/database.ts src/app/mrsqm/pages/edit-property/
git commit -m "feat(mrsqm): шапка edit-property — read-only адрес + бегунок приватности"
```

---

## Task 5: Таб «Параметры» — prefill + биндинги по типу объекта

**Files:**
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.ts`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`

**Interfaces:**
- Consumes: `fields` (TypeFields), `options()` (FilterOptions), `detail()` (PropertyDetail), `FormsModule`.
- Produces (для Task 8 save): редактируемые сигналы `isMaid, isStudy, isHotelPool, isVastu, areaSqft (string), plotSqft (string), floorLevelId, floorNumber (string), floorsInUnitId, viewIds (string[]), positionIds (string[]), amenityIds (string[]), furnished, price (string), pricePeriod, occupancyStatus, leaseUntil (string|null), listingType, visibility, publicLocationId, originalPrice (string)`; computed `originalPriceLocked` (true если `detail().original_price != null`); методы `toggleId(sig, id)`, `onPriceInput(val)`.

- [ ] **Step 1: Дописать тест prefill**

Добавить в spec (используя `detailStub` с числовыми полями):

```ts
  it('prefill заполняет редактируемые сигналы из detail', () => {
    const c = fixture.componentInstance;
    expect(c.price()).toBe('100');         // detailStub.price = 100
    expect(c.description()).toBe('d');
    expect(c.isMaid()).toBe(false);
  });
```

(Расширить `detailStub` нужными полями: `is_maid:false, is_study:false, is_hotel_pool:false, is_vastu:false, area_sqft:null, plot_sqft:null, floor_level_id:null, floor_number:null, floors_in_unit_id:null, view_ids:null, position_ids:null, amenity_ids:null, furnished:null, price_period:null, occupancy_status:'vacant', lease_until:null, listing_type:'pocket', visibility:'public', public_location_path:null, original_price:null`.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: FAIL — `c.price is not a function`.

- [ ] **Step 3: Добавить сигналы, prefill, хелперы**

В компонент добавить `FormsModule` в `imports`. Добавить сигналы (значения как строки для числовых input'ов, как в add-property):

```ts
  readonly isMaid = signal(false);
  readonly isStudy = signal(false);
  readonly isHotelPool = signal(false);
  readonly isVastu = signal(false);
  readonly areaSqft = signal<string>('');
  readonly plotSqft = signal<string>('');
  readonly floorLevelId = signal<string | null>(null);
  readonly floorNumber = signal<string>('');
  readonly floorsInUnitId = signal<string | null>(null);
  readonly viewIds = signal<string[]>([]);
  readonly positionIds = signal<string[]>([]);
  readonly amenityIds = signal<string[]>([]);
  readonly furnished = signal<string | null>(null);
  readonly price = signal<string>('');
  readonly pricePeriod = signal<string>('yearly');
  readonly occupancyStatus = signal<string>('vacant');
  readonly leaseUntil = signal<string | null>(null);
  readonly listingType = signal<string>('pocket');
  readonly visibility = signal<string>('public');
  readonly originalPrice = signal<string>('');
  readonly description = signal<string>('');
  // ВНИМАНИЕ: `publicLocationId` НЕ объявлять здесь — это computed из бегунка (Task 4B).

  // OP read-only, если в БД уже задана (серверный guard дублирует это).
  readonly originalPriceLocked = computed(() => this.detail()?.original_price != null);
  readonly isRent = computed(() => this.detail()?.deal_type === 'rent');

  // Справочники для селектов/мультиселектов таба (фильтрация — как в add-property).
  readonly floorsInUnitOptions = computed(() => {
    const opts = this.options();
    if (!opts) return [];
    return this._unitTypeValue() === 'house'
      ? opts.floors_in_unit_house
      : opts.floors_in_unit_apt;
  });
```

Реализовать `_prefill` (заменить no-op):

```ts
  protected _prefill(d: PropertyDetail): void {
    this.isMaid.set(d.is_maid ?? false);
    this.isStudy.set(d.is_study ?? false);
    this.isHotelPool.set(d.is_hotel_pool ?? false);
    this.isVastu.set(d.is_vastu ?? false);
    this.areaSqft.set(d.area_sqft != null ? String(d.area_sqft) : '');
    this.plotSqft.set(d.plot_sqft != null ? String(d.plot_sqft) : '');
    this.floorLevelId.set(d.floor_level_id ?? null);
    this.floorNumber.set(d.floor_number != null ? String(d.floor_number) : '');
    this.floorsInUnitId.set(d.floors_in_unit_id ?? null);
    this.viewIds.set(d.view_ids ?? []);
    this.positionIds.set(d.position_ids ?? []);
    this.amenityIds.set(d.amenity_ids ?? []);
    this.furnished.set(d.furnished ?? null);
    this.price.set(d.price != null ? String(d.price) : '');
    this.pricePeriod.set(d.price_period ?? 'yearly');
    this.occupancyStatus.set(d.occupancy_status ?? 'vacant');
    this.leaseUntil.set(d.lease_until ?? null);
    this.listingType.set(d.listing_type ?? 'pocket');
    this.visibility.set(d.visibility ?? 'public');
    // publicLocationId — computed из бегунка (Task 4B); здесь НЕ трогаем.
    this.originalPrice.set(d.original_price != null ? String(d.original_price) : '');
    this.description.set(d.description ?? '');
  }

  // Тоггл значения в мультиселекте (views/positions/amenities).
  toggleId(sig: ReturnType<typeof signal<string[]>>, id: string): void {
    const cur = sig();
    sig.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  // Форматирование цены с разделителями (как в add-property).
  onPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.price.set(digits ? Number(digits).toLocaleString('en-US') : '');
  }
```

> **Бегунок приватности адреса** реализован в Task 4B (шапка формы): `publicLocationId` — computed из позиции бегунка, цепочка адреса реконструируется через `locationInfo(location_id)`. Здесь его не трогаем.

- [ ] **Step 4: Свёрстать таб «Параметры» в HTML**

В блок `@if (tab() === 'params')` добавить разметку по `fields()` (чекбоксы Maid/Study/Hotel/Vastu, BUA/Plot input, floorLevel select, floorsInUnit select, views/positions/amenities мультиселекты, furnished, цена + `original_price` с `[disabled]="originalPriceLocked()"`, occupancy + lease, listingType, visibility). Паттерн «показывать поле только если `fields().<flag>`» копировать из add-property HTML (тот же `fields` контракт). Material — минимально; чекбоксы/инпуты — нативные с SP-классами.

Конкретный фрагмент-образец (цена + OP):

```html
<label class="ep-field">
  <span>Цена (AED)</span>
  <input type="text" inputmode="numeric" [value]="price()"
    (input)="onPriceInput($any($event.target).value)" />
</label>
@if (detail()?.deal_type === 'sale') {
  <label class="ep-field">
    <span>Оригинальная цена</span>
    <input type="text" inputmode="numeric" [value]="originalPrice()"
      [disabled]="originalPriceLocked()"
      (input)="originalPrice.set($any($event.target).value)" />
    @if (originalPriceLocked()) {
      <small>Изменить нельзя — задана при создании</small>
    }
  </label>
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.scss
git add src/app/mrsqm/pages/edit-property/
git commit -m "feat(mrsqm): таб «Параметры» edit-property — prefill + биндинги по типу"
```

---

## Task 6: Таб «Описание»

**Files:**
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`

**Interfaces:**
- Consumes: `description` signal (создан в Task 5).
- Produces: ничего нового.

- [ ] **Step 1: Дописать тест**

```ts
  it('таб «Описание» биндит сигнал description', () => {
    const c = fixture.componentInstance;
    c.setTab('description');
    fixture.detectChanges();
    const ta: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(ta.value).toBe('d');
  });
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: FAIL — `textarea` отсутствует / value пустой.

- [ ] **Step 3: Свёрстать таб**

В блок `@else if (tab() === 'description')`:

```html
<label class="ep-field ep-field--full">
  <span>Описание</span>
  <textarea rows="8" [value]="description()"
    (input)="description.set($any($event.target).value)"></textarea>
</label>
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.scss
git add src/app/mrsqm/pages/edit-property/
git commit -m "feat(mrsqm): таб «Описание» edit-property"
```

---

## Task 7: Таб «Фото» — список существующих, удаление, перестановка (CDK), добавление новых

**Files:**
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.ts`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`

**Interfaces:**
- Consumes: `photos()` (PropertyPhoto[]), `PropertyPhotoService.deletePhoto`, `.reorder`, `.uploadAndAttach`, `.getPhotos`; `CdkDropList`, `CdkDrag`, `moveItemInArray` (`src/app/util/move-item-in-array`); `CdkDragDrop`.
- Produces (для Task 8): сигналы `newPhotos: File[]`, `newPreviews: string[]`, `photosBusy`; методы `onAddPhotos(event)`, `removeNewPhoto(i)`, `dropExisting(event)`, `deleteExisting(photo)`, `makeMain(i)`; внутренний `_galleryPhotos` computed (только `photo_type==='gallery'`). Сохранение фото происходит в `save()` (Task 8): сначала `uploadAndAttach(newPhotos)`, затем `reorder('gallery', currentOrder)`.

- [ ] **Step 1: Дописать тесты**

```ts
  it('deleteExisting зовёт сервис и перечитывает фото', async () => {
    const c = fixture.componentInstance;
    const svc = TestBed.inject(PropertyPhotoService) as any;
    spyOn(svc, 'deletePhoto').and.resolveTo(undefined);
    spyOn(svc, 'getPhotos').and.resolveTo([]);
    await c.deleteExisting({ full_url: 'f', thumb_url: 't', order_index: 0, photo_type: 'gallery' });
    expect(svc.deletePhoto).toHaveBeenCalledWith('p1', jasmine.objectContaining({ full_url: 'f' }));
  });
```

(Дополнить `PropertyPhotoService`-stub методами `deletePhoto`, `reorder`, `uploadAndAttach`.)

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: FAIL — `deleteExisting is not a function`.

- [ ] **Step 3: Реализовать логику фото**

Добавить в `imports`: `CdkDropList, CdkDrag`. Импорт `moveItemInArray` и `CdkDragDrop`. Добавить:

```ts
  readonly newPhotos = signal<File[]>([]);
  readonly newPreviews = signal<string[]>([]);
  readonly photosBusy = signal(false);

  readonly galleryPhotos = computed(() =>
    this.photos().filter((p) => p.photo_type === 'gallery'),
  );

  onAddPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const list = input.files;
    if (!list || !list.length) return;
    const added = Array.from(list);
    this.newPhotos.set([...this.newPhotos(), ...added]);
    this.newPreviews.set([
      ...this.newPreviews(),
      ...added.map((f) => URL.createObjectURL(f)),
    ]);
    input.value = '';
  }

  removeNewPhoto(i: number): void {
    const url = this.newPreviews()[i];
    if (url) URL.revokeObjectURL(url);
    this.newPhotos.set(this.newPhotos().filter((_, idx) => idx !== i));
    this.newPreviews.set(this.newPreviews().filter((_, idx) => idx !== i));
  }

  // Перестановка существующих фото галереи (CDK). Пишем в БД сразу через reorder.
  async dropExisting(event: CdkDragDrop<PropertyPhoto[]>): Promise<void> {
    const { previousIndex, currentIndex } = event;
    if (previousIndex === currentIndex) return;
    const gallery = moveItemInArray(this.galleryPhotos(), previousIndex, currentIndex);
    const others = this.photos().filter((p) => p.photo_type !== 'gallery');
    this.photos.set([...gallery, ...others]);
    const id = this.detail()?.id;
    if (!id) return;
    this.photosBusy.set(true);
    try {
      await this._photoService.reorder('gallery', id ? gallery.map((p) => p.full_url) : []);
    } finally {
      this.photosBusy.set(false);
    }
  }

  // Сделать главным: переместить на позицию 0 и записать порядок.
  makeMain(i: number): void {
    if (i === 0) return;
    void this.dropExisting({ previousIndex: i, currentIndex: 0 } as CdkDragDrop<PropertyPhoto[]>);
  }

  async deleteExisting(photo: PropertyPhoto): Promise<void> {
    const id = this.detail()?.id;
    if (!id) return;
    this.photosBusy.set(true);
    try {
      await this._photoService.deletePhoto(id, {
        full_url: photo.full_url,
        thumb_url: photo.thumb_url,
      });
      this.photos.set(await this._photoService.getPhotos(id));
    } finally {
      this.photosBusy.set(false);
    }
  }
```

> Сигнатура reorder из Task 2 — `reorder(propertyId, photoType, orderedFullUrls)`. Поправить вызов: `this._photoService.reorder(id, 'gallery', gallery.map((p) => p.full_url))`.

- [ ] **Step 4: Свёрстать таб «Фото» в HTML**

В блок `@else` (tab photos): drag-список существующих (`cdkDropList (cdkDropListDropped)="dropExisting($event)"`, элементы `cdkDrag`), у каждого — thumb, кнопка «Сделать главным» (`makeMain(i)`), кнопка удаления (`deleteExisting(photo)`); ниже — input `type=file multiple` (`onAddPhotos`) и превью новых (`newPreviews()` с `removeNewPhoto(i)`). Паттерн drag/preview копировать из add-property HTML (галерея).

- [ ] **Step 5: Запустить — PASS**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.scss
git add src/app/mrsqm/pages/edit-property/
git commit -m "feat(mrsqm): таб «Фото» edit-property — список/удаление/reorder/добавление"
```

---

## Task 8: Сохранение + навигация из owner-панели + удаление инлайн-редактора

**Files:**
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.ts` + `.html` + `.spec.ts`
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts` + `.html`
- Modify: `src/app/mrsqm/services/property-owner.service.ts`

**Interfaces:**
- Consumes: `PropertyOwnerService.editProperty(EditPropertyPayload)`, `SnackService`, `Router`, все сигналы Task 5/7.
- Produces: метод `save()` в edit-компоненте; навигация `/mrsqm/edit/:id` из карточки.

- [ ] **Step 1: Тест save() в edit-компоненте**

```ts
  it('save() собирает payload и зовёт editProperty', async () => {
    const c = fixture.componentInstance;
    const owner = TestBed.inject(PropertyOwnerService) as any; // добавить в провайдеры стаб с editProperty
    const spy = spyOn(owner, 'editProperty').and.resolveTo('active');
    c.price.set('150');
    await c.save();
    expect(spy).toHaveBeenCalled();
    const payload = spy.calls.mostRecent().args[0];
    expect(payload.propertyId).toBe('p1');
    expect(payload.price).toBe(150);
  });
```

(Добавить в провайдеры теста стаб `PropertyOwnerService` с `editProperty`, `PropertyPhotoService.uploadAndAttach`/`reorder`, `Router`, `SnackService`.)

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`
Expected: FAIL — `save is not a function`.

- [ ] **Step 3: Реализовать save() + кнопки**

Инжектировать `PropertyOwnerService`, `SnackService`. Добавить:

```ts
  readonly saving = signal(false);

  // Текст кнопки: active → «Сохранить»; rejected/withdrawn → «Отправить на проверку».
  readonly saveLabel = computed(() => {
    const s = this.detail()?.status;
    return s === 'active' ? 'Сохранить' : 'Отправить на проверку';
  });

  async save(): Promise<void> {
    const d = this.detail();
    if (!d || this.saving()) return;
    const num = (v: string): number | null => {
      const digits = v.replace(/[^\d.]/g, '');
      return digits ? Number(digits) : null;
    };
    const price = num(this.price());
    if (!price || price <= 0) {
      this._notify('Укажите корректную цену', 'ERROR');
      return;
    }
    const tf = this.fields();
    this.saving.set(true);
    try {
      // 1) Новые фото — до сохранения полей (нужен только id, он уже есть).
      if (this.newPhotos().length) {
        await this._photoService.uploadAndAttach(d.id, this.newPhotos(), []);
        this.newPhotos.set([]);
        this.newPreviews.set([]);
        this.photos.set(await this._photoService.getPhotos(d.id));
      }
      // 2) Поля (whitelist). Неприменимые по типу — null (как в add-property).
      const status = await this._owner.editProperty({
        propertyId: d.id,
        price,
        description: this.description().trim() || null,
        isMaid: tf.maid ? this.isMaid() : false,
        isStudy: tf.maid ? this.isStudy() : false,
        isHotelPool: tf.hotelPool ? this.isHotelPool() : false,
        isVastu: tf.vastu ? this.isVastu() : false,
        areaSqft: tf.bua ? num(this.areaSqft()) : null,
        plotSqft: tf.plot ? num(this.plotSqft()) : null,
        floorLevelId: tf.floorLevel ? this.floorLevelId() : null,
        floorNumber: num(this.floorNumber()),
        floorsInUnitId: tf.floorsInUnit ? this.floorsInUnitId() : null,
        viewIds: tf.views && this.viewIds().length ? this.viewIds() : null,
        positionIds: tf.positions && this.positionIds().length ? this.positionIds() : null,
        amenityIds: tf.amenities && this.amenityIds().length ? this.amenityIds() : null,
        furnished: tf.furnished ? this.furnished() : null,
        pricePeriod: this.isRent() ? this.pricePeriod() : null,
        occupancyStatus: this.occupancyStatus() || null,
        leaseUntil: this.leaseUntil(),
        listingType: this.listingType(),
        visibility: this.visibility(),
        publicLocationId: this.publicLocationId(),
        originalPrice: this.originalPriceLocked() ? null : num(this.originalPrice()),
      });
      this._notify(
        status === 'pending_review' ? 'Объект отправлен на проверку' : 'Сохранено',
        'SUCCESS',
      );
      await this._router.navigateByUrl('/mrsqm/feed');
    } catch {
      this._notify('Не удалось сохранить', 'ERROR');
    } finally {
      this.saving.set(false);
    }
  }
```

Добавить приватный `_notify` (скопировать конфиг снека из property-detail: позиция bottom-left, `mrsqm-snack`). HTML-футер:

```html
<footer class="edit-footer">
  <button mat-stroked-button (click)="cancel()" [disabled]="saving()">Отмена</button>
  <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
    {{ saveLabel() }}
  </button>
</footer>
```

- [ ] **Step 4: Навигация из owner-панели + удаление инлайн-редактора**

В `property-detail.component.ts`:
- Инжектировать `Router` (если ещё нет).
- Добавить метод:
```ts
  goEdit(): void {
    const id = this.detail()?.id;
    if (id) void this._router.navigateByUrl(`/mrsqm/edit/${id}`);
  }
```
- Удалить ставшие мёртвыми: `isEditing`, `editPrice`, `editDescription`, `startEdit()`, `cancelEdit()`, `saveEdit()` и импорт `PropertyStatus` (если он использовался только в saveEdit — проверить!).

В `property-detail.component.html`:
- Удалить весь блок `@if (isEditing()) { ... } @else { ... }` — оставить только содержимое ветки `@else` (кнопки действий).
- Кнопку `edit` заменить: `(click)="goEdit()"` вместо `startEdit()`.

В `property-owner.service.ts`:
- Удалить `updateProperty()` и `republishProperty()` (теперь без потребителей).

- [ ] **Step 5: Прогнать ВСЕ затронутые специи**

Run:
```
npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts
npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
npm run test:file src/app/mrsqm/services/property-owner.service.spec.ts
```
Expected: PASS во всех. Если property-detail.spec ссылается на удалённые методы — обновить тест (это `test:`-правка).

- [ ] **Step 6: checkFile + commit**

```bash
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.scss
npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.ts
npm run checkFile src/app/mrsqm/services/property-owner.service.ts
git add -A
git commit -m "feat(mrsqm): save edit-property + навигация из карточки; убран инлайн-редактор"
```

---

## Task 9: Финальная верификация + Фаза B (DROP legacy RPC, гейт «да»)

**Files:**
- Create: `docs/migrations/2026-06-24-wp-m-drop-legacy-rpcs.sql`
- Modify: `docs/tabs.md`, `docs/TODO.md`, `docs/commits.md` (хук)

- [ ] **Step 1: Полный лок + прод-сборка**

Run: `npm run lint && npm run buildFrontend:prodWeb`
Expected: lint clean, прод-сборка проходит (AOT + бюджеты). См. [[deploy-prodbuild-gate-before-push]].

- [ ] **Step 2: Полный юнит-сьют по mrsqm**

Run: `npm test` (или таргетно по затронутым специям)
Expected: зелёно.

- [ ] **Step 3: Документация**

- `docs/tabs.md` — секция `/mrsqm/edit/:id` (3 таба, read-only шапка, кто видит).
- `docs/TODO.md` — отметить WP-M реализованным; зафиксировать открытый вопрос «бегунок приватности адреса в edit» (см. Task 5).
- Записать в спеку отметку о двухфазной миграции (отклонение от «одна миграция»).

- [ ] **Step 4: Подготовить Фазу B (DROP), но НЕ применять до деплоя фронта**

```sql
-- WP-M Фаза B: дроп устаревших RPC после выката фронта на edit_property.
-- Применять ТОЛЬКО после успешного деплоя фронта (иначе старый прод-фронт сломается).
-- Идемпотентно (IF EXISTS). ОБРАТИМО: восстановить из applied/2026-06-16 и applied/2026-06-24-lm6.
DROP FUNCTION IF EXISTS public.update_property(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.republish_property(uuid, numeric, text);
```

- [ ] **Step 5: Гейт + деплой (по явной просьбе создателя)**

Порядок: (1) один `git push` всех коммитов WP-M вместе с отложенными (`c350c8b99` + docs) — см. [[feedback-deploy-one-push]]; (2) дождаться зелёного деплоя; (3) запросить «да» на Фазу B и применить DROP-миграцию; (4) `git mv` обеих миграций в `docs/migrations/applied/`.

- [ ] **Step 6: Прод-смоук (`/test-prod`)**

Открыть свой active-объект → «Изменить» → поменять цену/описание/параметр/фото → «Сохранить» → проверить в ленте: цена обновилась, объект всплыл (last_actualized_at), фото изменились. Открыть rejected-объект → «Редактировать» → «Отправить на проверку» → статус `pending_review`. Записать T-N в `docs/tests.md`.

---

## Self-Review (выполнено при написании плана)

**1. Покрытие спеки:**
- §1 раскладка 3 таба + read-only шапка → Tasks 4, 4B–7. ✅
- §2 whitelist + неизменяемые не в сигнатуре → Task 1 (RPC), Task 3 (payload). ✅
- §3 UI табы + кнопка по статусу + бегунок приватности в шапке → Tasks 4B–8. ✅
- §4 RPC статус-логика + цена + original_price → Task 1. ✅
- §5 фото deletePhoto/reorder + add → Tasks 2, 7. ✅
- §6 архитектура (standalone, reuse ассетов, роут+guard) → Task 4. ✅
- §7 тесты (сервер/сервис/компонент) → Steps в Tasks 1–8. ✅
- §8 одна миграция → **подтверждено: 2 фазы** (zero-downtime). Фаза A несёт ещё аддитивный патч `get_property` (public_location_id для бегунка). ✅
- §9 вне scope: бегунок приватности адреса — **внесён в scope** по требованию создателя (Task 4B). ✅

**2. Плейсхолдеры:** код приведён в каждом шаге; «копировать паттерн из add-property» — для объёмной декоративной вёрстки таба и разметки бегунка (контракты `fields()`/`communityIndex/leafIndex/revealIndex` идентичны), не для логики.

**3. Согласованность типов:** `reorder(propertyId, photoType, orderedFullUrls)` — единая сигнатура в Task 2 и вызове Task 7 (Step 3 содержит явную поправку вызова). `publicLocationId` — единый computed (Task 4B), Task 5 его НЕ дублирует сигналом, `save()` (Task 8) читает `this.publicLocationId()`. `EditPropertyPayload` — поля camelCase в Task 3, маппятся на `p_*` внутри `editProperty`; `edit_property` SQL-параметры (Task 1) 1:1 с `p_*`. `PropertyDetail.public_location_id` добавлен в Task 4B, читается в `_loadAddressChain`.

---

## Решено создателем (2026-06-24)

1. **Двухфазная миграция** — ✅ подтверждено («Да, 2 фазы»).
2. **Бегунок приватности адреса** — ✅ обязателен сейчас, в шапке формы (Task 4B); требует аддитивного патча `get_property` (Task 1).

## Остаётся на усмотрение (минор, не блокирует)

- **`floor_number`** в whitelist: add-property его всегда пишет `null` (используется только `floor_level_id`). План биндит сигнал, но UI-инпут по умолчанию НЕ показываю (как в add-property). Включить, только если создатель попросит.
```
