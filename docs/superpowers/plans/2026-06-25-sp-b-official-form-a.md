# SP-B — Official / Form A (лёгкий вариант) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Заменить старые official-поля на поля договора + Form A PDF; хранить (PDF в приватном бакете, пароль в колонке под RLS); показывать в панели **список строк Form A** (не файл); Official всегда на модерацию.

**Architecture:** Следуем паттерну `property_photos` — **прямой `insert` + RLS**, без кастомного RPC, без лайфсайкла, без фаз. Form A insert-only (история). `get_property` отдаёт массив `form_a` (без файла/пароля) + `is_exclusive`. Реализация — SDD; Task 1 (DDL) ведёт контроллер через гейт «да».

**Tech Stack:** Supabase (Postgres/RLS/Storage), Angular standalone/OnPush/signals.

## Global Constraints
- UI/комментарии — на русском. `checkFile` каждый тронутый файл (вкл. `.html`/`.spec.ts`). `lint`+`buildFrontend:prodWeb` перед пушем.
- **DDL только с «да» + показ финального SQL**, транзакционно, ROLLBACK-смоук до боевого apply. Тело `get_property` — из ЖИВОЙ БД (staleness-proof anchor-replace, guard «якорь не найден»), не из доков.
- **Без кастомного RPC** — `insert` в `property_form_a` под RLS (как фото). `properties.status` ставит фронт в payload.
- **Form A insert-only** (строки не удаляем/не помечаем). **`status='active'`** при вставке (чек: active/expired/replaced — это lifecycle, НЕ модерация). Модерация = `approved_at`/`moderation_note` (Админка).
- **`pdf_password`** — RLS таблицы; **НЕ в `get_property`**, не в ленту, не чужим, **не логировать**.
- **Official всегда → `pending_review`**. Pocket — прежние правила.
- **НЕ трогаем:** `get_feed`, `edit-property`, чужие бакеты (`wa-media`)/таблицы. DROP старых колонок — отдельная уборка (Task 4, после выката).
- Без `any` (→`unknown`); OnPush; signals; стиль — общий партиал `_property-form.scss`.
- **Вне scope:** «Add new»/переподача, «Опубликовать вместо Сохранить»/Cancel, движок сценариев — SP-C.

---

### Task 1: Миграция (аддитивно) — колонки + приватный бакет + RLS + get_property

Контроллер пишет, ROLLBACK-смоук, показывает финальный SQL, применяет на «да».

**Files:** Create `docs/migrations/2026-06-25-sp-b-form-a.sql` · Modify (хук) `docs/database.md`

**Interfaces (Produces):** `property_form_a.contract_number/pdf_password`; `properties.is_exclusive`; бакет `property_form_a`; RLS-политики (таблица+бакет); `get_property` отдаёт `form_a` (jsonb-массив) + `is_exclusive`.

- [ ] **Step 1: Снять живое тело get_property**
```bash
bash .claude/skills/migrate/tools/psql.sh "SELECT pg_get_functiondef('public.get_property'::regproc);" > /tmp/gp.sql
```
Подтвердить якоря: `'is_vastu',            p.is_vastu,` и `'developer_name_ref',  d.name,` (есть в теле), выражение владельца `(p.owner_id = v_current_user_id)`.

- [ ] **Step 2: Написать миграцию**
`docs/migrations/2026-06-25-sp-b-form-a.sql`:
```sql
-- SP-B (аддитивно): поля Form A/договора, приватный бакет, RLS, get_property → form_a + is_exclusive.
-- Без RPC, без DROP (старые колонки — отдельной уборкой). property_form_a пуст → безопасно.

-- 1) Колонки
ALTER TABLE public.property_form_a ADD COLUMN IF NOT EXISTS contract_number text;
ALTER TABLE public.property_form_a ADD COLUMN IF NOT EXISTS pdf_password text;
ALTER TABLE public.properties      ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT false;

-- 2) RLS таблицы property_form_a (дормантная — добавляем клиентские политики; владелец объекта).
ALTER TABLE public.property_form_a ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS form_a_owner_select ON public.property_form_a;
DROP POLICY IF EXISTS form_a_owner_insert ON public.property_form_a;
DROP POLICY IF EXISTS form_a_owner_update ON public.property_form_a;
DROP POLICY IF EXISTS form_a_owner_delete ON public.property_form_a;
CREATE POLICY form_a_owner_select ON public.property_form_a FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid()));
CREATE POLICY form_a_owner_insert ON public.property_form_a FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid()));
CREATE POLICY form_a_owner_update ON public.property_form_a FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid()));
CREATE POLICY form_a_owner_delete ON public.property_form_a FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.owner_id = auth.uid()));

-- 3) Приватный бакет под Form A PDF (НЕ public, только PDF, 20 МБ).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property_form_a', 'property_form_a', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public=false, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;

-- 4) RLS storage.objects для бакета: владелец (путь {owner_id}/{property_id}/...); модератор=service_role.
DROP POLICY IF EXISTS form_a_obj_owner_all ON storage.objects;
CREATE POLICY form_a_obj_owner_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='property_form_a' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id='property_form_a' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 3: Патч get_property (DO-блок, staleness-proof) — добавить is_exclusive + form_a**
В ту же миграцию (тело берётся из живой БД на apply, не хардкодим):
```sql
DO $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.get_property'::regproc);
  IF position('''is_vastu''' IN v_def) = 0 OR position('''developer_name_ref''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'get_property: якорь не найден — патч прерван';
  END IF;
  -- is_exclusive после is_vastu (regexp учитывает выравнивание пробелами)
  v_def := regexp_replace(v_def,
    '(''is_vastu'',\s+p\.is_vastu,)',
    '\1' || E'\n      ''is_exclusive'', p.is_exclusive,', 'g');
  -- form_a-массив (история, без файла/пароля) перед developer_name_ref
  v_def := regexp_replace(v_def,
    '(''developer_name_ref'',\s+d\.name,)',
    E'''form_a'', (SELECT COALESCE(jsonb_agg(jsonb_build_object('
    || '''contract_number'', fa.contract_number, ''listing_start'', fa.listing_start, '
    || '''listing_end'', fa.listing_end, ''approved_at'', fa.approved_at, '
    || '''moderation_note'', fa.moderation_note) ORDER BY fa.uploaded_at DESC), ''[]''::jsonb) '
    || 'FROM public.property_form_a fa WHERE fa.property_id = p.id),' || E'\n      ' || '\1', 'g');
  EXECUTE v_def;
END $patch$;
```
(`EXECUTE` гоняет `CREATE OR REPLACE` из живого def — проблемы «нет `;`» нет, это один стейтмент.)

- [ ] **Step 4: ROLLBACK-смоук (контроллер)** — прогнать в транзакции с `ROLLBACK`: ALTER/политики/бакет/патч без ошибок; `SELECT get_property('<owner-объект>') ? 'form_a'` = true; `-> 'is_exclusive'` присутствует. Прод-объект для смоука: `5f6a3c58-b3f9-433c-a51e-72bbbf502c8f`.

- [ ] **Step 5: DDL-гейт — показать финальный SQL, ждать «да», применить**
```bash
bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-25-sp-b-form-a.sql
```
Верификация: колонки есть; `SELECT id,public,allowed_mime_types FROM storage.buckets WHERE id='property_form_a'`; `SELECT policyname,cmd FROM pg_policies WHERE tablename='property_form_a'` (4 шт); `get_property('<owner>') -> 'form_a'` = `[]`.

- [ ] **Step 6: `git mv` в applied/ + commit** (`migrate: SP-B Form A — колонки/бакет/RLS/get_property`).

---

### Task 2: Сервис Form A + типы + add-property (поля Official, прямой insert)

**Files:** Create `src/app/mrsqm/services/property-form-a.service.ts` (+`.spec.ts`); Modify `types/database.ts`, `add-property-page.component.{ts,html,spec.ts}`.

**Interfaces:**
- Produces: `PropertyFormAService.uploadFormA(propertyId, ownerId, file): Promise<string>` (path), `.insertFormA(row): Promise<void>`. Тип `PropertyFormA`, `PropertyDetail.form_a?: PropertyFormA[]`, `.is_exclusive?: boolean`.

- [ ] **Step 1: Типы (`types/database.ts`)**
```ts
export interface PropertyFormA {
  contract_number: string | null;
  listing_start: string | null;
  listing_end: string | null;
  approved_at: string | null;     // NULL = на проверке
  moderation_note: string | null; // причина отклонения
}
```
В `PropertyDetail`: `form_a?: PropertyFormA[] | null;`, `is_exclusive?: boolean | null;`. В `PropertyInsert`: убрать `title_deed_number/title_deed_year/plot_number/municipality_number`; добавить `is_exclusive: boolean`.

- [ ] **Step 2: Сервис (тест → реализация)**
`property-form-a.service.spec.ts`: мок `storage` + `from().insert`; проверить `uploadFormA` зовёт `upload(path, file, {contentType:'application/pdf', upsert:true})` с путём `${ownerId}/${propertyId}/...pdf` → возвращает path; `insertFormA` зовёт `from('property_form_a').insert(row)`.
Реализация:
```ts
import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
const BUCKET = 'property_form_a';
export interface FormARow {
  property_id: string; file_url: string; contract_number: string | null;
  listing_start: string | null; listing_end: string | null;
  pdf_password: string | null; status: string; uploaded_by: string;
}
@Injectable({ providedIn: 'root' })
export class PropertyFormAService {
  private readonly _supabase = inject(MrsqmSupabaseService);
  async uploadFormA(propertyId: string, ownerId: string, file: File): Promise<string> {
    const path = `${ownerId}/${propertyId}/${crypto.randomUUID()}.pdf`;
    const { error } = await this._supabase.client.storage
      .from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    return path;
  }
  async insertFormA(row: FormARow): Promise<void> {
    const { error } = await this._supabase.client.from('property_form_a').insert(row);
    if (error) throw error;
  }
}
```

- [ ] **Step 3: add-property `.ts` — сигналы/валидация/payload/сабмит**
- Удалить сигналы `titleDeedNumber/titleDeedYear/plotNumber/municipalityNumber`. Добавить `contractNumber/contractStart/contractEnd/isExclusive/formAFile/formAPassword` + `onFormAFile(e)` (проверка `type==='application/pdf'`). Inject `PropertyFormAService`.
- `_validateStep` case Листинг: official требует `contractNumber()` и `formAFile()` (заменить проверку titleDeed).
- payload: убрать 4 title_deed-ключа; `is_exclusive: isOfficial ? this.isExclusive() : false`; `status: isOfficial ? 'pending_review' : (this.visibility()==='network' ? 'active' : 'pending_review')`.
- В `submit()` после `createProperty(payload)` (id) и загрузки фото, если `isOfficial && formAFile()`:
```ts
const path = await this._formA.uploadFormA(id, owner.id, this.formAFile()!);
await this._formA.insertFormA({
  property_id: id, file_url: path,
  contract_number: this.contractNumber().trim() || null,
  listing_start: this.contractStart(), listing_end: this.contractEnd(),
  pdf_password: this.formAPassword() || null, status: 'active', uploaded_by: owner.id,
});
```

- [ ] **Step 4: add-property `.html` — шаг Листинг (official)**
Заменить блок title_deed на (классы из партиала): Contract Number (`req-star`), Срок (две `type="date"` в `.lease-row`), Exclusive (`.check-row`), Form A PDF (`.photo-add` + `input type=file accept="application/pdf"`, имя файла в подписи), Password (`input`). Подпись «Official уходит на модерацию». (Разметка — как в прошлой версии плана, шаг 3 Step 3.)

- [ ] **Step 5: Тесты + checkFile (4 файла вкл .html) + commit**
Тесты: official-сабмит без title_deed-ключей → `uploadFormA`+`insertFormA`; `status='pending_review'` для official+network; `onFormAFile` отклоняет не-PDF. (Мок `PropertyFormAService`.)
`feat(mrsqm): add-property — поля Form A/договора (прямой insert), Official всегда на модерацию`

---

### Task 3: Панель — список строк Form A + бейдж Exclusive

**Files:** Modify `property-detail.component.{ts,html,spec.ts}`

- [ ] **Step 1: vm (.ts)** — добавить `isExclusive: d?.is_exclusive ?? false` и `formA: d?.form_a ?? []`. Хелпер статуса строки: `formAStatus(r: PropertyFormA): string` → `r.approved_at ? 'approved' : (r.moderation_note ? 'rejected' : 'на проверке')`.
- [ ] **Step 2: шаблон (.html)** — бейдж Exclusive при `vm().isExclusive`; блок «Form A»: `@for (r of vm().formA)` строка `Form A {{ r.listing_start }}–{{ r.listing_end }} · {{ formAStatus(r) }}`. Файл/пароль НЕ показываем. (Кнопка «Add new» — SP-C, здесь не добавляем.)
- [ ] **Step 3: тесты** — `is_exclusive=true` → бейдж; `form_a=[{...approved_at}]` → строка со статусом «approved»; пустой `form_a` → блок пуст/скрыт. checkFile + commit (`feat(mrsqm): деталь — строки Form A + бейдж Exclusive`).

---

### Task 4 (уборка, ПОСЛЕ выката Tasks 1–3): DROP старых official-колонок

После подтверждения, что новый `add-property` live (не пишет/не читает title_deed). DDL-гейт «да».

**Files:** Create `docs/migrations/2026-06-25-sp-b-drop-title-deed.sql`
- [ ] Патч `get_property` (staleness-proof) — убрать ключи `title_deed_number/title_deed_year/plot_number/municipality_number`; затем `ALTER TABLE public.properties DROP COLUMN IF EXISTS title_deed_number, DROP COLUMN IF EXISTS title_deed_year, DROP COLUMN IF EXISTS plot_number, DROP COLUMN IF EXISTS municipality_number;`. ROLLBACK-смоук → «да» → apply → applied/.

---

## Порядок / зависимости
1. **Task 1** (DDL, аддитивно) → база. 2. **Task 2** (сервис+типы+add). 3. **Task 3** (панель). 4. Финальное opus-ревью → lint+prodWeb → деплой Tasks 1–3 (по «пушь»). 5. После live → **Task 4** (DROP, отдельный «да»).

## Self-Review
- Покрытие спеки: §2 → Task 1; §3 get_property → Task 1 Step 3; §4 UI → Tasks 2–3; §6 уборка → Task 4; §7 безопасность (RLS/пароль-не-в-get_property/не логируем) — Global Constraints + Task 1. edit-property не трогаем (спека §4). get_feed не трогаем.
- Плейсхолдеры: тело get_property патчится из ЖИВОЙ БД (staleness-proof regexp с guard) — требование /migrate, не плейсхолдер; якоря и выражение владельца подтверждены интроспекцией.
- Типы: `PropertyFormA`/`form_a[]`/`is_exclusive` объявлены в Task 2 Step 1, используются в Task 3; `PropertyInsert` теряет title_deed в Task 2 (insert прямой — лишних ключей не шлём; колонки живы до Task 4).
