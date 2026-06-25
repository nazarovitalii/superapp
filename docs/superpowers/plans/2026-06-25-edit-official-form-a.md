# SP-C (срез 1) — edit-Official + инвариант модерации Form A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В окне редактирования под типом «Official» показать поля Form A (как в add); приложенный новый Form A или переход в Official уводят листинг на модерацию — enforce серверным триггером, не клиентом.

**Architecture:** БД-триггер на `properties` держит инвариант «Official+active ⟺ свежий Form A одобрен, иначе pending_review» (единый источник правды, покрывает и add-INSERT). `edit_property` получает `is_exclusive`. Фронт `edit-property` показывает поля Form A, вставляет новую строку `property_form_a` (паттерн SP-B) ДО вызова `edit_property`, чтобы триггер увидел свежую неодобренную строку.

**Tech Stack:** PostgreSQL (Supabase self-hosted, роль `supabase_admin`), Angular standalone + signals + OnPush, Supabase JS под anon-ключом.

**Спека:** `docs/superpowers/specs/2026-06-25-edit-official-form-a-design.md`.

## Global Constraints

- UI/комментарии — на русском. `checkFile` каждый тронутый файл (вкл. `.html`/`.spec.ts`). `lint`+`buildFrontend:prodWeb` перед пушем.
- **DDL только с «да» создателя + показ финального SQL**, транзакционно (`apply-migration.sh`), ROLLBACK-смоук до боевого apply. Тело `edit_property` — из ЖИВОЙ БД (`pg_get_functiondef`), не из доков.
- **Инвариант:** Official может быть `active` только если САМЫЙ СВЕЖИЙ Form A одобрен (`approved_at IS NOT NULL`); иначе статус → `pending_review`. Enforce — триггером.
- **Form A insert-only** — правка существующей строки невозможна; новый Form A = новая строка (`status='active'` lifecycle, как SP-B).
- **`pdf_password`** — RLS таблицы; НЕ в `get_property`, не логировать.
- `edit_property` статус-логику НЕ менять (инвариант держит триггер). `get_property` НЕ менять.
- **НЕ трогать:** `get_feed`, чужие бакеты/таблицы. Вне scope: кнопки по статусам, expiry, «Form A <30д», архив-флоу, «Add new», общая модерация по видимости.
- Без `any` (→`unknown`); OnPush; signals; стиль — общий партиал `_property-form.scss`, без локальных CSS-оверрайдов.
- Коммиты: `type(scope): описание` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Один push по «пушь».

---

### Task 1: Миграция — триггер инварианта + `edit_property` +`is_exclusive` (контроллер, DDL-гейт)

> Выполняет КОНТРОЛЛЕР (как SP-B Task 1): пишет SQL → показывает создателю → по «да» ROLLBACK-смоук → боевой `apply-migration.sh` → верификация → `git mv` в `applied/`. НЕ субагент.

**Files:** Create `docs/migrations/2026-06-25-spc1-official-invariant.sql`.

**Interfaces (Produces):** триггер `trg_official_requires_approved_forma` на `properties`; `edit_property(...)` с НОВЫМ параметром `p_is_exclusive boolean DEFAULT false` (остальная сигнатура — без изменений).

- [ ] **Step 1: Триггер-функция + триггер (идемпотентно)**

```sql
-- Инвариант: Official может быть active только если САМЫЙ СВЕЖИЙ Form A одобрен.
-- Иначе принудительно pending_review. Только ужесточает (active→pending_review).
CREATE OR REPLACE FUNCTION public.enforce_official_forma_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_latest_approved boolean;
BEGIN
  IF NEW.listing_type = 'official' AND NEW.status = 'active' THEN
    SELECT (fa.approved_at IS NOT NULL)
      INTO v_latest_approved
      FROM public.property_form_a fa
     WHERE fa.property_id = NEW.id
     ORDER BY fa.uploaded_at DESC
     LIMIT 1;
    IF COALESCE(v_latest_approved, false) = false THEN
      NEW.status := 'pending_review';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_official_requires_approved_forma ON public.properties;
CREATE TRIGGER trg_official_requires_approved_forma
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_official_forma_approved();
```

- [ ] **Step 2: `edit_property` +`p_is_exclusive` (DROP+CREATE из ЖИВОЙ БД)**

Тело берётся из живой БД (НЕ из доков — может отставать):

```bash
bash .claude/skills/migrate/tools/psql.sh "select pg_get_function_identity_arguments('public.edit_property'::regproc);"  # для DROP
bash .claude/skills/migrate/tools/psql.sh "select pg_get_functiondef('public.edit_property'::regproc);"                  # тело
```

Собрать в файле миграции: `DROP FUNCTION public.edit_property(<identity args>);` затем `CREATE OR REPLACE FUNCTION ...` с телом из живой БД и ДВУМЯ дельтами:

1. в список параметров (после `p_original_price numeric DEFAULT NULL`) добавить `, p_is_exclusive boolean DEFAULT false`;
2. в `UPDATE properties SET ...` добавить строку `is_exclusive = p_is_exclusive,`.
   ⚠️ `pg_get_functiondef` возвращает тело БЕЗ `;` после `$function$` — добавить вручную. Статус-логику (`v_new_status`) НЕ менять.

- [ ] **Step 3: ROLLBACK-смоук (контроллер, до боевого apply)**

`BEGIN; <миграция>; <проверки>; ROLLBACK;` через прямой ssh (не пайпом — `psql.sh` выпивает stdin). Проверки (owner JWT не нужен — `get_property` тут не трогаем; используем прямой SELECT/UPDATE на тест-объекте):

- official+active без одобренного Form A → после `UPDATE properties SET status='active', listing_type='official' WHERE id=<тест>` фактический `status='pending_review'`;
- не-official active → `UPDATE ... listing_type='pocket', status='active'` → остаётся `active`;
- `edit_property` принял `p_is_exclusive` (вызвать с новым параметром, без ошибки сигнатуры);
- `ROLLBACK` чистый.

- [ ] **Step 4: Показать финальный SQL → «да» → боевой apply**

```bash
bash .claude/skills/migrate/tools/apply-migration.sh docs/migrations/2026-06-25-spc1-official-invariant.sql
```

- [ ] **Step 5: Верификация на живой БД + git mv**

```bash
# триггер существует
bash .claude/skills/migrate/tools/psql.sh "select tgname from pg_trigger where tgrelid='public.properties'::regclass and tgname='trg_official_requires_approved_forma';"
# edit_property принимает p_is_exclusive
bash .claude/skills/migrate/tools/psql.sh "select pg_get_function_arguments('public.edit_property'::regproc) ilike '%p_is_exclusive%';"
git mv docs/migrations/2026-06-25-spc1-official-invariant.sql docs/migrations/applied/
git commit -m "migrate: SP-C1 — триггер инварианта Official/Form A + edit_property is_exclusive"
```

---

### Task 2: Фронт — `edit-property` Official-поля + сабмит + сервис `is_exclusive`

**Files:**

- Modify: `src/app/mrsqm/services/property-owner.service.ts`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.ts`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- Test: `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`

**Interfaces:**

- Consumes (готово): `PropertyFormAService.uploadFormA(propertyId, ownerId, file): Promise<string>`, `.insertFormA(row): Promise<void>` (SP-B); `PropertyDetail.is_exclusive?: boolean|null`, `.form_a?`, `.owner_id`; RPC `edit_property` с `p_is_exclusive` (Task 1).
- Produces: `EditPropertyPayload.isExclusive: boolean`; в `editProperty` RPC-вызов добавлен `p_is_exclusive`.

- [ ] **Step 1: Тест сервиса — `editProperty` шлёт `p_is_exclusive`**

В `src/app/mrsqm/services/property-owner.service.spec.ts` (если нет — создать по образцу существующих spec сервисов) тест: мок `MrsqmSupabaseService.rpc`; вызвать `editProperty({...isExclusive:true})`; проверить, что `rpc` вызван с `edit_property` и объектом, содержащим `p_is_exclusive: true`.

- [ ] **Step 2: Сервис — добавить `isExclusive`**

В `property-owner.service.ts`: в `interface EditPropertyPayload` добавить `isExclusive: boolean;` (после `originalPrice`). В `editProperty(...)` в объект RPC добавить `p_is_exclusive: p.isExclusive,` (рядом с `p_visibility`).

- [ ] **Step 3: Запустить тест сервиса — зелёный**

`npm run test:file src/app/mrsqm/services/property-owner.service.spec.ts`

- [ ] **Step 4: Компонент `.ts` — сигналы Form A + onFormAFile + inject сервиса**

В `edit-property.component.ts`: `import { PropertyFormAService } from '../../services/property-form-a.service';` и `private readonly _formA = inject(PropertyFormAService);`. Добавить сигналы (рядом с `description`):

```ts
readonly contractNumber = signal<string>('');
readonly contractStart = signal<string>('');
readonly contractEnd = signal<string>('');
readonly isExclusive = signal<boolean>(false);
readonly formAFile = signal<File | null>(null);
readonly formAFileName = signal<string>('');
readonly formAPassword = signal<string>('');
```

Метод (идентичен add-property):

```ts
onFormAFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (file && file.type !== 'application/pdf') {
    this.formAFile.set(null);
    this.formAFileName.set('');
    input.value = '';
    return;
  }
  this.formAFile.set(file);
  this.formAFileName.set(file?.name ?? '');
  input.value = '';
}
```

Computed-подпись кнопки (UX-подсказка; сервер авторитетен):

```ts
readonly submitLabel = computed(() => {
  const d = this.detail();
  const willModerate =
    (this.listingType() === 'official' && this.formAFile() != null) ||
    (this.listingType() === 'official' && d?.listing_type !== 'official') ||
    (this.visibility() === 'public' && d?.visibility !== 'public');
  return willModerate ? 'Опубликовать' : 'Сохранить';
});
```

- [ ] **Step 5: Компонент `.ts` — префилл `is_exclusive`**

В `_prefill(d)` добавить: `this.isExclusive.set(d.is_exclusive ?? false);` (поля нового Form A НЕ префиллим — это «приложить новый», строка старого read-only в шаблоне).

- [ ] **Step 6: Компонент `.ts` — сабмит: Form A ДО `edit_property` + `isExclusive`**

В `save()` ПЕРЕД вызовом `this._owner.editProperty(...)` (и после блока загрузки фото) вставить:

```ts
// Новый Form A (official): загрузить PDF + вставить строку ДО edit_property,
// чтобы триггер увидел свежую неодобренную строку. Сбой — прерываем сохранение.
if (this.listingType() === 'official' && this.formAFile()) {
  try {
    const pdfPath = await this._formA.uploadFormA(d.id, d.owner_id, this.formAFile()!);
    await this._formA.insertFormA({
      property_id: d.id,
      file_url: pdfPath,
      contract_number: this.contractNumber().trim() || null,
      listing_start: this.contractStart() || null,
      listing_end: this.contractEnd() || null,
      pdf_password: this.formAPassword() || null,
      status: 'active',
      uploaded_by: d.owner_id,
    });
  } catch {
    this._notify('Не удалось загрузить Form A — попробуйте ещё раз', 'ERROR');
    this.saving.set(false);
    return;
  }
}
```

В объект `this._owner.editProperty({...})` добавить `isExclusive: this.isExclusive(),`.

- [ ] **Step 7: Шаблон `.html` — блок Form A в шаге «Листинг»**

В `edit-property.component.html`, внутри `@if (step() === 2) { ... }`, ПОСЛЕ блока чипов типа листинга (после закрытия `@if (options()?.listing_types?.length) { ... }`), добавить блок (классы из партиала `_property-form.scss`):

```html
<!-- Поля Form A / договора — только для official-листинга (SP-C1). -->
@if (listingType() === 'official') {
<div class="field">
  <span class="field-label">Номер договора</span>
  <input
    type="text"
    [ngModel]="contractNumber()"
    (ngModelChange)="contractNumber.set($event)"
    placeholder="Contract Number"
  />
</div>
<div class="field">
  <span class="field-label">Срок договора</span>
  <div class="lease-row">
    <input
      type="date"
      [ngModel]="contractStart()"
      (ngModelChange)="contractStart.set($event)"
    />
    <input
      type="date"
      [ngModel]="contractEnd()"
      (ngModelChange)="contractEnd.set($event)"
    />
  </div>
</div>
<div class="field">
  <div class="check-row">
    <input
      type="checkbox"
      id="edit-exclusive-check"
      [ngModel]="isExclusive()"
      (ngModelChange)="isExclusive.set($event)"
    />
    <label for="edit-exclusive-check">Эксклюзивный договор</label>
  </div>
</div>
<div class="field">
  <span class="field-label">Приложить новый Form A (PDF)</span>
  <label class="photo-add">
    <mat-icon>upload_file</mat-icon>
    <span>{{ formAFileName() || 'Выбрать файл PDF' }}</span>
    <input
      type="file"
      accept="application/pdf"
      (change)="onFormAFile($event)"
    />
  </label>
</div>
<div class="field">
  <span class="field-label">Пароль PDF (если есть)</span>
  <input
    type="text"
    [ngModel]="formAPassword()"
    (ngModelChange)="formAPassword.set($event)"
    placeholder="Пароль для открытия PDF"
  />
</div>
}
```

Заменить подпись финальной кнопки сохранения на `{{ submitLabel() }}` (найти кнопку «Сохранить» на последнем шаге).

- [ ] **Step 8: Тесты компонента (`.spec.ts`)**

Добавить в `edit-property.component.spec.ts` (мок `PropertyFormAService` через `jasmine.createSpyObj('PropertyFormAService', ['uploadFormA','insertFormA'])`, провайдить в TestBed):

```ts
it('official + новый Form A: uploadFormA+insertFormA вызваны ДО editProperty, status pending_review', async () => {
  // detail official, owner; formAFile = PDF; editProperty spy resolveTo('pending_review')
  // вызвать save(); проверить formASvc.uploadFormA вызван, insertFormA вызван,
  // ownerSvc.editProperty вызван с isExclusive
});
it('обычная правка без нового Form A: Form A-сервис не зван, editProperty с isExclusive', async () => { ... });
it('префилл is_exclusive из detail', () => { /* _prefill(detail{is_exclusive:true}) → isExclusive()===true */ });
it('onFormAFile отклоняет не-PDF', () => { /* event с file type text/plain → formAFile()===null */ });
it('сбой Form A: editProperty НЕ вызван, _notify ERROR', async () => { /* uploadFormA rejectWith → editProperty НЕ зван */ });
it('submitLabel: official+formAFile → Опубликовать; обычная → Сохранить', () => { ... });
```

Реальные ассерты (не пустые), мок `editProperty`/`uploadFormA`/`insertFormA` через спаи. Существующие тесты (бегунок/префилл/changedTick) — оставить зелёными.

- [ ] **Step 9: checkFile + тесты + commit**

```bash
npm run checkFile src/app/mrsqm/services/property-owner.service.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.html
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts
npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts
git add -A && git commit -m "feat(mrsqm): edit-property — поля Form A под Official + is_exclusive (новый Form A → модерация)"
```

---

## Порядок / зависимости

Task 1 (миграция, сигнатура `edit_property` + триггер) — ПЕРЕД Task 2 (фронт шлёт `p_is_exclusive` и полагается на триггер). После выката — прод-смоук T-SPC1 (edit official: приложить новый Form A → объект ушёл в pending_review; правка цены одобренного official → остаётся active). Обновить контракт Админки (порядок одобрения — уже в спеке §5; дописать при реализации Админки).

## Self-Review

- **Покрытие спеки:** §2.1 триггер → Task 1 Step 1; §2.2 edit_property+is_exclusive → Task 1 Step 2; §2.3 get_property без изменений → не трогаем; §3 фронт (поля/префилл/сабмит/кнопка) → Task 2 Steps 4–7; §5 контракт Админки → отмечено в «Порядок»; §7 тесты → Task 1 Step 3 + Task 2 Step 8. Покрыто.
- **Плейсхолдеры:** код приведён дословно (signals, onFormAFile, submit-блок, html, триггер). Тела `edit_property` — из живой БД (gotcha смены сигнатуры), это не плейсхолдер, а обязательный способ.
- **Согласованность типов:** `EditPropertyPayload.isExclusive: boolean` ↔ `p_is_exclusive: p.isExclusive` ↔ `isExclusive: this.isExclusive()` в save() ↔ `p_is_exclusive boolean` в RPC (Task 1). Совпадает.
