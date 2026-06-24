# SP-B — Official / Form A фундамент Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить старые official-поля (Title Deed/Plot/Municipality) на поля договора листинга + Form A PDF; надёжно хранить их (включая пароль под жёстким RLS) в приватном Storage; показывать владельцу; ставить Official всегда на модерацию и отдавать Form A модератору Админки.

**Architecture:** Расширяем существующую (дормантную, 0 строк) таблицу `property_form_a`. Новый **приватный** бакет `property_form_a` (PDF-only) → PDF читается через **signed URL** (не public). RPC `upsert_property_form_a` (DEFINER, owner-check) создаёт строку Form A + ставит `properties.status='pending_review'` + пишет `properties.is_exclusive`. `get_property` отдаёт текущий Form A (пароль — только владельцу). Старые колонки выпиливаются из тел функций и DROP-аются **второй фазой** (после выката нового фронта). Реализация — SDD; DDL — через гейт «да» с показом финального SQL.

**Tech Stack:** Supabase self-hosted (Postgres, RLS, SECURITY DEFINER RPC, Storage), Angular standalone/OnPush/signals, CDK, dart-sass.

## Global Constraints

- UI-строки и комментарии — **на русском**. Пользователь НЕ программист.
- `npm run checkFile <file>` после КАЖДОГО тронутого `.ts`/`.scss`/`.html`/`.spec.ts` (вкл. шаблоны). `npm run lint && npm run buildFrontend:prodWeb` перед пушем.
- **DDL только с явным «да» создателя и показом финального SQL.** Применять транзакционно (`apply-migration.sh`). Тела функций (`get_property`/`get_feed`) брать из ЖИВОЙ БД (`pg_get_functiondef`), патчить **staleness-proof** (anchor-replace с guard «якорь не найден»), не переписывать из доков. `pg_get_functiondef` отдаёт тело без `;` — добавлять вручную при DROP+CREATE. ROLLBACK-смоук до боевого apply.
- **RLS под каждую операцию** (на RLS-таблице нужна политика на каждый cmd, иначе молчаливый no-op). Бакет приватный — проверять и storage.objects policies.
- **Пароль Form A — чувствительный:** `pdf_password` отдаётся ТОЛЬКО владельцу (get_property: `WHEN is_owner`) и модератору (service_role); **никогда не логировать** (`Log.log({id})`, не контент), не в ленту, не чужим.
- **Official ВСЕГДА → модерация:** сабмит/правка Official → `properties.status='pending_review'` + строка Form A `status='pending'` (независимо от friends/public). Pocket-правила прежние.
- **Зеро-даунтайн (двухфазно, как WP-M):** Фаза A — аддитивно (новые колонки/бакет/RPC; get_property/get_feed ДОБАВЛЯЮТ Form A/is_exclusive, но СТАРЫЕ title_deed-ключи пока ОСТАВЛЯЮТ — старый прод-фронт их ещё читает). Фаза B (хвост, после выката нового фронта) — убрать title_deed из тел функций + DROP 4 колонок.
- **Общая БД:** `property_form_a`/`properties` наши; `wa-media`/`bayut_*` не трогать. Роль `supabase_admin`.
- Строгий TS, без `any` (→ `unknown`); OnPush; signals; стиль формы — общий партиал `_property-form.scss` (SP-A).
- **Вне scope:** движок сценариев публикации (кнопки по статусу, expiry, «Form A < 30 дней», renew/republish) — это SP-C. Здесь только захват/хранение/показ Form A + создание pending-строки.

---

### Task 1: Миграция Фаза A — схема + бакет + RLS + RPC + get_property/get_feed (аддитивно)

DDL-фундамент. Применяет контроллер на DDL-гейте «да» (не субагент). Реализатор/контроллер пишет файл, контроллер показывает финальный SQL и применяет транзакционно.

**Files:**
- Create: `docs/migrations/2026-06-25-sp-b-form-a-phaseA.sql`
- Modify (auto, хук): `docs/database.md`

**Interfaces:**
- Produces: колонки `property_form_a.contract_number text`, `property_form_a.pdf_password text`, `properties.is_exclusive boolean`; бакет `property_form_a`; RPC `upsert_property_form_a(...) RETURNS uuid`; `get_property` отдаёт ключ `form_a` (jsonb) + `is_exclusive` + (владельцу) `form_a.pdf_password`; `get_feed` отдаёт `is_exclusive`.

- [ ] **Step 1: Снять живые сигнатуры/тела (для staleness-proof патча)**

Run (введение, не правка):
```bash
bash .claude/skills/migrate/tools/psql.sh "SELECT pg_get_functiondef('public.get_property'::regproc);" > /tmp/get_property.sql
bash .claude/skills/migrate/tools/psql.sh "SELECT pg_get_functiondef('public.get_feed'::regproc);" > /tmp/get_feed.sql
```
Изучить, где формируется JSON объекта (ключи `'title_deed_number'` и т.д.), куда добавить `'form_a'`/`'is_exclusive'`, и есть ли `is_owner` в scope (для пароля).

- [ ] **Step 2: Написать миграцию Фазы A**

Создать `docs/migrations/2026-06-25-sp-b-form-a-phaseA.sql`. Комментарий-шапка: что/зачем/обратимо. Содержимое:

```sql
-- SP-B Фаза A (аддитивно, зеро-даунтайн): расширить property_form_a, добавить
-- properties.is_exclusive, приватный бакет property_form_a + RLS, RPC upsert_property_form_a,
-- get_property/get_feed ДОБАВЛЯЮТ form_a/is_exclusive (title_deed-ключи пока оставляем — Фаза B уберёт).
-- Обратимо: колонки/бакет/политики/функции дропаются; данных нет (property_form_a пуст).

-- 1) Колонки
ALTER TABLE public.property_form_a ADD COLUMN IF NOT EXISTS contract_number text;
ALTER TABLE public.property_form_a ADD COLUMN IF NOT EXISTS pdf_password text;
ALTER TABLE public.properties      ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT false;

-- 2) Приватный бакет под Form A PDF (НЕ public, только PDF, лимит 20 МБ)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property_form_a', 'property_form_a', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) RLS на storage.objects для бакета (путь {owner_id}/{property_id}/{uuid}.pdf).
--    Владелец — все операции над своими (первый сегмент = auth.uid()); модератор ходит
--    под service_role (RLS его не ограничивает). Чужой/anon — нет.
DROP POLICY IF EXISTS form_a_owner_all ON storage.objects;
CREATE POLICY form_a_owner_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'property_form_a' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'property_form_a' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4) RPC: создать строку Form A + поставить объект на модерацию + записать is_exclusive.
--    DEFINER + owner-check (как edit_property). PDF грузит клиент в бакет ДО вызова;
--    сюда передаётся p_file_url (storage path). Official всегда → pending_review.
CREATE OR REPLACE FUNCTION public.upsert_property_form_a(
  p_property_id    uuid,
  p_file_url       text,
  p_contract_number text,
  p_listing_start  date,
  p_listing_end    date,
  p_pdf_password   text,
  p_is_exclusive   boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_owner uuid;
  v_id uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.properties WHERE id = p_property_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not owner or property not found';
  END IF;

  INSERT INTO public.property_form_a
    (property_id, file_url, contract_number, listing_start, listing_end,
     pdf_password, status, uploaded_by, uploaded_at)
  VALUES
    (p_property_id, p_file_url, p_contract_number, p_listing_start, p_listing_end,
     p_pdf_password, 'pending', auth.uid(), now())
  RETURNING id INTO v_id;

  UPDATE public.properties
     SET is_exclusive = COALESCE(p_is_exclusive, false),
         status = 'pending_review'
   WHERE id = p_property_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_property_form_a(uuid,text,text,date,date,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_property_form_a(uuid,text,text,date,date,text,boolean) TO authenticated;
```

> ⚠️ Перед написанием шага 2 свериться с `property_form_a_status_check` (введение: `bash .claude/skills/migrate/tools/psql.sh "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='property_form_a_status_check';"`) — убедиться, что `'pending'` допустим; если нет — использовать допустимое начальное значение из чека.

- [ ] **Step 3: Патч `get_property` (staleness-proof, тело из ЖИВОЙ БД)**

В ту же миграцию добавить DROP+CREATE `get_property` ИЛИ `replace()`-патч (по структуре живого тела из /tmp/get_property.sql). Требуемая дельта в JSON объекта:
- Добавить ключ `'is_exclusive', p.is_exclusive`.
- Добавить ключ `'form_a'` = подзапрос текущего Form A:
  ```sql
  'form_a', (
    SELECT jsonb_build_object(
      'file_url',       fa.file_url,
      'contract_number',fa.contract_number,
      'listing_start',  fa.listing_start,
      'listing_end',    fa.listing_end,
      'status',         fa.status,
      'pdf_password',   CASE WHEN <is_owner_expr> THEN fa.pdf_password ELSE NULL END
    )
    FROM public.property_form_a fa
    WHERE fa.property_id = p.id
    ORDER BY fa.uploaded_at DESC
    LIMIT 1
  ),
  ```
  где `<is_owner_expr>` — то же выражение владельца, что уже считается в `get_property` (найти в живом теле; обычно `p.owner_id = auth.uid()` или переменная `v_is_owner`).
- **title_deed-ключи НЕ трогаем** (Фаза A их оставляет).
- `;` после `$function$` добавить вручную. ROLLBACK-смоук обязателен.

- [ ] **Step 4: Патч `get_feed` (staleness-proof) — добавить `is_exclusive`**

В тело `get_feed` JSON карточки добавить `'is_exclusive', p.is_exclusive` (рядом с `'listing_type'`). title_deed в `get_feed` (если есть) — Фаза A оставляет. Тот же staleness-proof подход.

- [ ] **Step 5: ROLLBACK-смоук (контроллер, до боевого apply)**

Прогнать миграцию в транзакции с финальным `ROLLBACK` (или `apply-migration.sh` на копии стейтмента) — убедиться: ALTER проходят, бакет вставляется, политика создаётся, RPC создаётся, `get_property`/`get_feed` пересоздаются без syntax-error, `SELECT get_property('<owner-объект>') ? 'form_a'` = true.

- [ ] **Step 6: Применить (DDL-гейт «да» — контроллер показывает финальный SQL, ждёт «да»)**

```bash
bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-25-sp-b-form-a-phaseA.sql
```
Верификация: `pg_get_function_arguments('public.upsert_property_form_a'::regproc)`; `SELECT id,public,allowed_mime_types FROM storage.buckets WHERE id='property_form_a'`; `SELECT policyname,cmd FROM pg_policies WHERE tablename='objects' AND policyname='form_a_owner_all'`; `SELECT get_property('<owner uuid>') -> 'form_a'`.

- [ ] **Step 7: Переместить в applied/ + commit**

```bash
git mv docs/migrations/2026-06-25-sp-b-form-a-phaseA.sql docs/migrations/applied/
git add -A && git commit -m "migrate: SP-B Фаза A применена (property_form_a +поля, бакет, RPC, get_property/get_feed)"
```

---

### Task 2: Сервис Form A PDF (приватный бакет, signed URL) + типы

Загрузка PDF в приватный бакет и чтение через signed URL (бакет НЕ public → `getPublicUrl` нельзя). Плюс типы Form A.

**Files:**
- Create: `src/app/mrsqm/services/property-form-a.service.ts`
- Create: `src/app/mrsqm/services/property-form-a.service.spec.ts`
- Modify: `src/app/mrsqm/types/database.ts` (тип `PropertyFormA`, поле `form_a`/`is_exclusive` в `PropertyDetail`, `is_exclusive` в `PropertyFeedItem`; убрать из `PropertyInsert` title_deed/plot/municipality — см. Task 3)

**Interfaces:**
- Consumes: бакет `property_form_a` + RPC `upsert_property_form_a` (Task 1).
- Produces:
  - `uploadFormA(propertyId: string, ownerId: string, file: File): Promise<string>` — грузит PDF, возвращает storage path (его пишем в `file_url`).
  - `saveFormA(p: FormAPayload): Promise<string>` — зовёт RPC `upsert_property_form_a`.
  - `signedUrl(path: string): Promise<string | null>` — `createSignedUrl(path, 3600)` для просмотра PDF владельцем.
  - `interface FormAPayload { propertyId; fileUrl; contractNumber; listingStart; listingEnd; pdfPassword; isExclusive }`.

- [ ] **Step 1: Тип `PropertyFormA` + расширения в `types/database.ts`**

Добавить:
```ts
export interface PropertyFormA {
  file_url: string | null;
  contract_number: string | null;
  listing_start: string | null;
  listing_end: string | null;
  status: string | null;
  pdf_password: string | null; // только владельцу (сервер отдаёт NULL чужим)
}
```
В `PropertyDetail` добавить `form_a?: PropertyFormA | null;` и `is_exclusive?: boolean | null;`. В `PropertyFeedItem` добавить `is_exclusive?: boolean | null;`.

- [ ] **Step 2: Написать тест сервиса (spec)**

`property-form-a.service.spec.ts`: замокать `MrsqmSupabaseService.client.storage` и `.rpc`. Проверить:
- `uploadFormA` зовёт `storage.from('property_form_a').upload(path, file, {contentType:'application/pdf', upsert:true})` с путём вида `${ownerId}/${propertyId}/...pdf` и возвращает path.
- `saveFormA` зовёт `rpc('upsert_property_form_a', {...})` и возвращает id.
- `signedUrl` зовёт `createSignedUrl(path, 3600)` и возвращает `signedUrl`.

(Каркас моков — как `property-photo.service.spec.ts`.)

- [ ] **Step 3: Реализация сервиса**

```ts
import { inject, Injectable } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';

const BUCKET = 'property_form_a';

export interface FormAPayload {
  propertyId: string;
  fileUrl: string;
  contractNumber: string | null;
  listingStart: string | null;
  listingEnd: string | null;
  pdfPassword: string | null;
  isExclusive: boolean;
}

@Injectable({ providedIn: 'root' })
export class PropertyFormAService {
  private readonly _supabase = inject(MrsqmSupabaseService);

  // Грузит PDF в приватный бакет, возвращает storage-path (пишем в form_a.file_url).
  async uploadFormA(propertyId: string, ownerId: string, file: File): Promise<string> {
    const path = `${ownerId}/${propertyId}/${crypto.randomUUID()}.pdf`;
    const { error } = await this._supabase.client.storage
      .from(BUCKET)
      .upload(path, file, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    return path;
  }

  // Создаёт строку Form A + ставит объект на модерацию (серверный RPC).
  async saveFormA(p: FormAPayload): Promise<string> {
    return this._supabase.rpc<string>('upsert_property_form_a', {
      p_property_id: p.propertyId,
      p_file_url: p.fileUrl,
      p_contract_number: p.contractNumber,
      p_listing_start: p.listingStart,
      p_listing_end: p.listingEnd,
      p_pdf_password: p.pdfPassword,
      p_is_exclusive: p.isExclusive,
    });
  }

  // Подписанная ссылка на PDF (бакет приватный) — для просмотра владельцем.
  async signedUrl(path: string): Promise<string | null> {
    const { data, error } = await this._supabase.client.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    return error ? null : (data?.signedUrl ?? null);
  }
}
```

- [ ] **Step 4: Прогнать тест + checkFile**

`npm run test:file .../property-form-a.service.spec.ts` → PASS. `npm run checkFile` на `.service.ts`, `.spec.ts`, `types/database.ts`.

- [ ] **Step 5: Commit**
```bash
git add src/app/mrsqm/services/property-form-a.service.ts src/app/mrsqm/services/property-form-a.service.spec.ts src/app/mrsqm/types/database.ts
git commit -m "feat(mrsqm): сервис Form A PDF (приватный бакет, signed URL) + типы"
```

---

### Task 3: Форма добавления — Official-поля Form A (замена title_deed)

В шаге Листинг `add-property` заменить старые official-поля на новые; грузить PDF + звать RPC; Official всегда `pending_review`; перестать слать title_deed в insert.

**Files:**
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.ts`
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.html`
- Modify: `src/app/mrsqm/types/database.ts` (убрать из `PropertyInsert` поля `title_deed_number`, `title_deed_year`, `plot_number`, `municipality_number`; добавить `is_exclusive: boolean`)
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`

**Interfaces:**
- Consumes: `PropertyFormAService` (Task 2), RPC через сервис.
- Produces: Official-сабмит создаёт объект (без title_deed) → грузит PDF → `saveFormA` (ставит pending_review).

- [ ] **Step 1: Сигналы и валидация (.ts)**
- Удалить сигналы `titleDeedNumber`, `titleDeedYear`, `plotNumber`, `municipalityNumber`.
- Добавить: `contractNumber = signal('')`, `contractStart = signal<string|null>(null)`, `contractEnd = signal<string|null>(null)`, `isExclusive = signal(false)`, `formAFile = signal<File|null>(null)`, `formAPassword = signal('')`.
- `onFormAFile(e: Event)`: взять файл, проверить `type === 'application/pdf'` (иначе `error.set('Только PDF')`), `formAFile.set(file)`.
- В `_validateStep()` (шаг Листинг, case 5): для official требовать `contractNumber()`, `formAFile()`, даты — иначе сообщение. Заменить прежнюю проверку `titleDeedNumber`.
- Inject `PropertyFormAService`.

- [ ] **Step 2: Payload + сабмит (.ts)**
- В `payload` убрать `title_deed_number/title_deed_year/plot_number/municipality_number`; добавить `is_exclusive: isOfficial ? this.isExclusive() : false`.
- Статус: `status: isOfficial ? 'pending_review' : (this.visibility() === 'network' ? 'active' : 'pending_review')` — **Official всегда модерация**.
- После `createProperty` (получили `id`), если `isOfficial && formAFile()`:
  ```ts
  const path = await this._formA.uploadFormA(id, owner.id, this.formAFile()!);
  await this._formA.saveFormA({
    propertyId: id, fileUrl: path,
    contractNumber: this.contractNumber().trim() || null,
    listingStart: this.contractStart(), listingEnd: this.contractEnd(),
    pdfPassword: this.formAPassword() || null,
    isExclusive: this.isExclusive(),
  });
  ```
  (порядок: создать объект → фото → Form A; сбой Form A — сообщить, не падать молча).

- [ ] **Step 3: Шаблон (.html), шаг Листинг (official)**
Заменить блок Title Deed/Plot/Municipality (внутри `@if (listingType() === 'official')`) на (классы из общего партиала):
```html
<div class="field">
  <span class="field-label">Contract Number<span class="req-star">*</span></span>
  <input type="text" [ngModel]="contractNumber()" (ngModelChange)="contractNumber.set($event)" placeholder="Номер договора" />
</div>
<div class="field">
  <span class="field-label">Срок договора (с / по)</span>
  <div class="lease-row">
    <input type="date" [ngModel]="contractStart()" (ngModelChange)="contractStart.set($event)" />
    <input type="date" [ngModel]="contractEnd()" (ngModelChange)="contractEnd.set($event)" />
  </div>
</div>
<div class="field">
  <div class="check-group">
    <label class="check-row">
      <span class="check-label">Exclusive</span>
      <input type="checkbox" [ngModel]="isExclusive()" (ngModelChange)="isExclusive.set($event)" />
    </label>
  </div>
</div>
<div class="field">
  <span class="field-label">Form A (PDF)<span class="req-star">*</span></span>
  <label class="photo-add">
    <mat-icon>upload_file</mat-icon>
    <span>{{ formAFile() ? formAFile()!.name : 'Выбрать PDF' }}</span>
    <input type="file" accept="application/pdf" hidden (change)="onFormAFile($event)" />
  </label>
</div>
<div class="field">
  <span class="field-label">Пароль к Form A PDF</span>
  <input type="text" [ngModel]="formAPassword()" (ngModelChange)="formAPassword.set($event)" placeholder="Пароль, если PDF защищён" />
</div>
<p class="note">Official-листинг уходит на проверку модератором.</p>
```

- [ ] **Step 4: Тесты (.spec.ts)**
Обновить/добавить: official-сабмит зовёт `createProperty` без title_deed-ключей, затем `uploadFormA`+`saveFormA`; `status='pending_review'` для official+network; `onFormAFile` отклоняет не-PDF. (Замокать `PropertyFormAService`.)

- [ ] **Step 5: test:file + checkFile (все 4 файла, вкл. .html) + commit**
```bash
git commit -m "feat(mrsqm): форма добавления — поля Form A/договора вместо title_deed; Official всегда на модерацию"
```

---

### Task 4: Окно редактирования — Official-поля Form A (шаг Листинг)

Те же поля в `edit-property` (мастер SP-A, шаг 3 «Листинг»), при `listing_type='official'`. Префилл из `detail().form_a`. Правка Official → новый Form A + pending_review.

**Files:**
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.ts`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`

**Interfaces:**
- Consumes: `PropertyFormAService`, `detail().form_a`, `detail().is_exclusive`.
- Produces: при сохранении official — `uploadFormA` (если выбран новый файл) + `saveFormA`.

- [ ] **Step 1: Сигналы + префилл (.ts)**
Добавить сигналы `contractNumber/contractStart/contractEnd/isExclusive/formAFile/formAPassword` + `onFormAFile`. В `_prefill`: из `d.form_a` (contract_number, listing_start/end, status, pdf_password — владельцу приходит) и `d.is_exclusive`. Inject `PropertyFormAService`.

- [ ] **Step 2: save() — official-ветка**
В `save()` после `editProperty`, если `listingType()==='official'`: если выбран новый `formAFile()` — `uploadFormA`, затем `saveFormA({...})` (ставит pending_review). Снек/нав — как есть. (Файл не обязателен при правке, если Form A уже есть и не меняется — но смена pocket→official требует файла; добавить валидацию.)

- [ ] **Step 3: Шаблон (.html) шаг 3 «Листинг»**
Под чипами «Тип листинга» добавить `@if (listingType() === 'official') { ... }` с теми же полями, что в Task 3 Step 3 (Contract Number, даты, Exclusive, Form A PDF, пароль). Текущий PDF (если есть) — ссылка через `signedUrl` (кнопка «Открыть текущий Form A»).

- [ ] **Step 4: Тесты + checkFile (вкл. .html) + commit**
```bash
git commit -m "feat(mrsqm): окно редактирования — поля Form A в шаге Листинг (official)"
```

---

### Task 5: Деталь-панель — блок Form A + бейдж Exclusive

Показ Form A владельцу (ссылка на PDF через signed URL, contract number, срок, статус модерации) + бейдж Exclusive всем.

**Files:**
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts`
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html`
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`

**Interfaces:**
- Consumes: `detail().form_a`, `detail().is_exclusive`, `PropertyFormAService.signedUrl`.

- [ ] **Step 1: vm + signed URL (.ts)**
В `vm()` добавить `isExclusive: d?.is_exclusive ?? false` и `formA: d?.form_a ?? null`. Метод `openFormA()`: `const url = await this._formA.signedUrl(this.detail()?.form_a?.file_url ?? ''); if (url) window.open(url, '_blank')`. Inject `PropertyFormAService`.

- [ ] **Step 2: Шаблон (.html)**
- Бейдж Exclusive (рядом с official-бейджем) при `vm().isExclusive`.
- Владельцу (`isOwner()`) — блок «Form A»: contract number, срок (start–end), статус модерации, кнопка «Открыть Form A (PDF)» → `openFormA()`. Пароль показать владельцу (если `form_a.pdf_password`). Чужим — ничего.

- [ ] **Step 3: Тесты (.spec.ts)**
`is_exclusive=true` → бейдж рендерится; владельцу с `form_a` — блок виден, кнопка зовёт `signedUrl`; не-владельцу form_a-блок скрыт. (Замокать `PropertyFormAService`.)

- [ ] **Step 4: checkFile (вкл. .html) + commit**
```bash
git commit -m "feat(mrsqm): деталь — блок Form A (signed URL) + бейдж Exclusive"
```

---

### Task 6 (хвост, ПОСЛЕ выката Tasks 2–5): Фаза B — выпилить title_deed + DROP + контракт Админке

Выполняется **только после подтверждения, что новый фронт live** (иначе старый прод-фронт читает title_deed из get_property). DDL-гейт «да».

**Files:**
- Create: `docs/migrations/2026-06-25-sp-b-form-a-phaseB-drop.sql`
- Create: `docs/superpowers/briefs/2026-06-25-form-a-moderation-contract.md`

- [ ] **Step 1: Контракт Админке (брифом)**
`briefs/2026-06-25-form-a-moderation-contract.md`: как модератор (их репо, service_role) читает строку `property_form_a` (+`pdf_password`), пишет `status='approved'|'rejected'`, `approved_by`, `approved_at`, `moderation_note`; approve листинга → `properties.status='active'` (UPDATE-путь активации, RT-2); reject → `rejected` + `rejection_reason` (LM-3). superApp кода Админки не трогает.

- [ ] **Step 2: Миграция Фазы B**
`phaseB-drop.sql` (одной транзакцией): staleness-proof патч тел `get_property`/`get_feed` — убрать ключи `title_deed_number/title_deed_year/plot_number/municipality_number`; затем `ALTER TABLE public.properties DROP COLUMN IF EXISTS title_deed_number, DROP COLUMN IF EXISTS title_deed_year, DROP COLUMN IF EXISTS plot_number, DROP COLUMN IF EXISTS municipality_number;`. На гейте контроллер дополнительно спрашивает создателя, не дропнуть ли что-то из `property_form_a` (рекомендация — оставить всё).

- [ ] **Step 3: ROLLBACK-смоук → DDL-гейт «да» → apply → applied/ → commit**
Верификация: `get_property` больше не отдаёт title_deed-ключи и не падает; колонки отсутствуют.

---

## Карта зависимостей / порядок выката

1. **Task 1** (Фаза A, DDL) → база для всего.
2. **Task 2** (сервис+типы) → нужен Tasks 3–5.
3. **Tasks 3,4,5** (UI) — после Task 2; можно подряд.
4. Финальное whole-branch ревью (opus) → lint+prodWeb → **деплой** Tasks 1–5 (по «пушь»).
5. После подтверждения, что фронт live → **Task 6** (Фаза B DROP + контракт), отдельный DDL-гейт «да».

## Self-Review (выполнено)

- **Покрытие спеки:** §2 схема → Task 1; §3 бакет → Task 1; §4 RPC/get_property/пароль → Task 1+2; §5 UI → Tasks 3–5; §6 граница (без SP-C) — соблюдена; §7 безопасность (RLS, пароль не логируем/не чужим) — в Global Constraints + Task 1 Step 3; контракт Админке → Task 6.
- **Плейсхолдеры:** тела `get_property`/`get_feed` намеренно патчатся из ЖИВОЙ БД (staleness-proof, не из доков) — это требование /migrate, не плейсхолдер; указаны точные ключи/дельта и `<is_owner_expr>` для поиска в живом теле.
- **Двухфазность:** title_deed остаётся в Фазе A (старый фронт жив), убирается в Фазе B после выката — зеро-даунтайн.
- **Типы:** `PropertyFormA`/`form_a`/`is_exclusive` объявлены в Task 2 и используются в Tasks 3–5 с теми же именами; `PropertyInsert` теряет title_deed в Task 3 (после Фазы A, до Фазы B — insert прямой, лишних ключей просто не шлём).
