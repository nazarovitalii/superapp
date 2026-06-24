# SP-A — Пересборка окна редактирования (мастер 1:1 с добавлением) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать окно редактирования объекта как линейный мастер, визуально и по поведению 1:1 с формой добавления (те же стили, тот же бегунок приватности), сохранив существующую логику (`_prefill`, `save`, бегунок, фото).

**Architecture:** Меняем презентацию, не логику. Стили формы добавления выносятся в общий SCSS-партиал `src/app/mrsqm/pages/_property-form.scss`, который `@use`-ят и add, и edit (один источник правил → идентичность навсегда). Шаблон edit переписывается с таб-бара на линейный мастер из 5 шагов (`step()`/`next()`/`prev()`), разметка шагов скопирована из add с теми же классами (`.field`/`.chip`/`.reveal*`/`.photo-*`). Сигналы полей, `_prefill`, `save`, бегунок и фото-методы в `edit-property.component.ts` остаются без изменений.

**Tech Stack:** Angular standalone-компоненты, OnPush, signals/computed, Angular Material (sparingly), CDK DragDrop, dart-sass, Jasmine/Karma.

## Global Constraints

- UI-строки и комментарии — **на русском**.
- `npm run checkFile <file>` после КАЖДОГО тронутого файла, включая `.html` и `.spec.ts` (prettier-ошибки в шаблонах всплывают только на репо-lint).
- OnPush + signals; **запрещён `any`** (использовать `unknown`); NgRx-состояние не мутировать (в этой фиче его нет).
- **Логику edit-property не менять:** `save()`, `EditPropertyPayload`, вызов `edit_property`, фото-методы (`dropExisting`/`makeMain`/`deleteExisting`/`onAddPhotos`/`removeNewPhoto`), бегунок (`selectReveal`/`onRevealPointer*`/computed `publicLocationId` и т.д.), `_prefill`, `_load`, `_loadAddressChain` — переносятся как есть.
- **Edit использует те же CSS-классы, что add** (`.add-wrap`/`.add-col`/`.steps-row`/`.step-dot`/`.block`/`.block-header`/`.block-content`/`.field`/`.field-label`/`.chip`/`.chips`/`.check-*`/`.reveal*`/`.photo-*`/`.note`/`.add-error`/`.add-nav`/`.loading`/`.loc-selected`). Никаких `ep-*`.
- **Бегунок** копируется из add **дословно** (блок `.reveal` с `[style.--n]`, `.reveal-ticks`/`.reveal-track`/`.reveal-track-fill`/`.reveal-dot`/`.reveal-thumb`) — это и есть фикс «сломанного» бегунка.
- **Разметку add-property НЕ трогаем** (только её SCSS переезжает в партиал; HTML/TS add остаются как есть).
- **Backend не трогаем.** Никаких миграций. Сохранение — текущее поведение `edit_property`.
- **Вне scope SP-A:** Official/Form A поля (SP-B); сценарии публикации/модерации/expiry и матрица кнопок (SP-C). Не добавлять.

---

### Task 1: Общий SCSS-партиал `_property-form.scss`

Выносим стили формы добавления в партиал, который `@use`-ят оба компонента. Цель — один источник правил. Разметка add-property **не меняется**, поэтому её вид остаётся байт-идентичным (тот же набор правил, просто из партиала).

**Files:**

- Create: `src/app/mrsqm/pages/_property-form.scss`
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.scss`

**Interfaces:**

- Consumes: ничего из других задач.
- Produces: партиал `_property-form.scss` со всеми классами формы (`.add-wrap`, `.add-col`, `.steps-row`, `.step-dot`, `.block*`, `.field*`, `.chip*`, `.loc-*`, `.addr-*`, `.lease-row`, `.reveal*`, `.photo-*`, `.cdk-drag-*`, `.info-*`, `.check-*`, `.note`, `.add-error`, `.add-nav`, `.loading`). Task 2 (`edit-property.component.scss`) его `@use`-ит.

- [ ] **Step 1: Создать партиал как точную копию текущего add-scss**

Скопировать **всё содержимое** `src/app/mrsqm/pages/add-property/add-property-page.component.scss` в новый файл `src/app/mrsqm/pages/_property-form.scss` **без изменений**, кроме **первой строки**: путь к globals меняется (партиал на один каталог выше), было/стало:

```scss
// БЫЛО (в add-property-page.component.scss, строка 1):
@use '../../../../styles/_globals.scss' as *;

// СТАЛО (строка 1 нового _property-form.scss):
@use '../../../styles/_globals.scss' as *;
```

Все остальные строки (со `:host` до `.add-nav`) копируются дословно. Партиал содержит и `:host { display:block; height:100%; overflow-y:auto }`, и `.add-wrap`/`.add-col` — они общие для обоих компонентов (Angular скоупит `:host` per-component, поэтому каждый компонент получает свой корректный хост).

- [ ] **Step 2: Заменить add-property-page.component.scss на `@use` партиала**

Заменить **всё содержимое** `src/app/mrsqm/pages/add-property/add-property-page.component.scss` ровно на одну строку:

```scss
@use '../property-form';
```

(`@use '../property-form'` резолвится в `../_property-form.scss` — стандартная Sass-резолюция партиалов. Партиал уже подключает globals, поэтому отдельный `@use globals` в компонентном scss больше не нужен.)

- [ ] **Step 3: checkFile обоих scss**

Run:

```bash
npm run checkFile src/app/mrsqm/pages/_property-form.scss
npm run checkFile src/app/mrsqm/pages/add-property/add-property-page.component.scss
```

Expected: оба PASS (prettier + stylelint без ошибок).

- [ ] **Step 4: Проверить, что add-property собирается с партиалом (Sass резолвится)**

Run:

```bash
npm run buildFrontend:prodWeb
```

Expected: сборка проходит без Sass-ошибок (`Can't find stylesheet to import` отсутствует). Это подтверждает, что `@use '../property-form'` резолвится и партиал валиден. Вид add-property не изменился — разметка `add-property-page.component.html` не тронута, набор CSS-правил тот же.

- [ ] **Step 5: Commit**

```bash
git add src/app/mrsqm/pages/_property-form.scss src/app/mrsqm/pages/add-property/add-property-page.component.scss
git commit -m "refactor(mrsqm): вынести стили формы в общий партиал _property-form.scss"
```

---

### Task 2: Переписать edit-property в линейный мастер (ts/html/scss/spec)

Свап презентации: таб-бар → мастер из 5 шагов, разметка из add с общими классами, бегунок дословно из add. Логика (поля, `_prefill`, `save`, бегунок, фото) сохраняется. Это одна когезивная замена — `.ts` (навигация) и `.html` (мастер) неразделимы (шаблон ссылается на новые `step()`/`next()`/`prev()`), поэтому идут одной задачей.

**Files:**

- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.ts`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.html`
- Modify: `src/app/mrsqm/pages/edit-property/edit-property.component.scss`
- Test: `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts`

**Interfaces:**

- Consumes: партиал `_property-form.scss` из Task 1 (через `@use '../property-form'`).
- Produces: компонент с публичными `step: WritableSignal<number>`, `steps: readonly string[]`, `stepIcons: readonly string[]`, `error: Signal<string|null>`, методами `next(): void`, `prev(): void`. Удалены: тип `EditTab`, сигнал `tab`, метод `setTab`.

- [ ] **Step 1: Переписать spec.ts под мастер (сначала тесты)**

Полностью заменить содержимое `src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts` на:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EditPropertyPageComponent } from './edit-property.component';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PropertyCreateService } from '../../services/property-create.service';
import { PropertyPhotoService } from '../../services/property-photo.service';
import { PropertyOwnerService } from '../../services/property-owner.service';
import { SnackService } from '../../../core/snack/snack.service';

describe('EditPropertyPageComponent', () => {
  let fixture: ComponentFixture<EditPropertyPageComponent>;

  const detailStub = {
    id: 'p1',
    is_owner: true,
    status: 'active',
    category_id: 'c1',
    unit_type_id: 'u1',
    deal_type: 'sale',
    price: 100,
    location_full_path: 'Dubai / Marina',
    description: 'd',
    location_id: 'leaf',
    public_location_id: null,
    is_maid: false,
    is_study: false,
    is_hotel_pool: false,
    is_vastu: false,
    area_sqft: null,
    plot_sqft: null,
    floor_level_id: null,
    floor_number: null,
    floors_in_unit_id: null,
    view_ids: null,
    position_ids: null,
    amenity_ids: null,
    furnished: null,
    price_period: null,
    occupancy_status: 'vacant',
    lease_until: null,
    listing_type: 'pocket',
    visibility: 'public',
    public_location_path: null,
    original_price: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPropertyPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
        },
        { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
        {
          provide: MrsqmSupabaseService,
          useValue: { rpc: () => Promise.resolve(detailStub) },
        },
        {
          provide: PropertyCreateService,
          useValue: {
            getFilterOptions: () =>
              Promise.resolve({
                categories: [],
                unit_types: [
                  { id: 'u1', value: 'apartment', label_en: 'Apt', parent_id: 'c1' },
                ],
                sub_types: [],
                views: [],
                positions: [],
                amenities: [],
                floor_levels: [],
                floors_in_unit_apt: [],
                floors_in_unit_house: [],
              }),
            locationInfo: () =>
              Promise.resolve({
                location: { id: 'leaf', name: 'Tower A', level: 'building' },
                breadcrumb: [
                  { id: 'city', name: 'Dubai', level: 'city' },
                  { id: 'comm', name: 'Marina', level: 'community' },
                ],
                children: [],
                developer_ids: [],
              }),
          },
        },
        {
          provide: PropertyPhotoService,
          useValue: {
            getPhotos: () => Promise.resolve([]),
            deletePhoto: () => Promise.resolve(undefined),
            reorder: () => Promise.resolve(undefined),
            uploadAndAttach: () => Promise.resolve(undefined),
          },
        },
        {
          provide: PropertyOwnerService,
          useValue: { editProperty: () => Promise.resolve('active') },
        },
        { provide: SnackService, useValue: { open: () => {} } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EditPropertyPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('грузит деталь и стартует на шаге 0', () => {
    const c = fixture.componentInstance;
    expect(c.detail()?.id).toBe('p1');
    expect(c.step()).toBe(0);
    expect(c.steps.length).toBe(5);
  });

  it('next() с шага 0 переходит на шаг 1', () => {
    const c = fixture.componentInstance;
    c.next();
    expect(c.step()).toBe(1);
  });

  it('prev() со шага 0 не уходит в минус', () => {
    const c = fixture.componentInstance;
    c.prev();
    expect(c.step()).toBe(0);
  });

  it('next() на шаге цены блокирует пустую цену и пропускает корректную', () => {
    const c = fixture.componentInstance;
    c.next(); // → шаг 1 (Цена и состояние)
    expect(c.step()).toBe(1);
    c.price.set('');
    c.next();
    expect(c.step()).toBe(1); // остался — валидация не пустила
    expect(c.error()).toBeTruthy();
    c.price.set('150');
    c.next();
    expect(c.step()).toBe(2);
    expect(c.error()).toBeNull();
  });

  it('prefill заполняет редактируемые сигналы из detail', () => {
    const c = fixture.componentInstance;
    expect(c.price()).toBe('100');
    expect(c.description()).toBe('d');
    expect(c.isMaid()).toBe(false);
  });

  it('бегунок: addrPath реконструируется, leaf = полный адрес при public_location_id=null', async () => {
    const c = fixture.componentInstance;
    await fixture.whenStable();
    expect(c.addrPath().length).toBeGreaterThan(0);
    expect(c.publicLocationId()).toBeNull();
  });

  it('шаг «Описание» (index 3) биндит сигнал description', () => {
    const c = fixture.componentInstance;
    c.step.set(3);
    fixture.detectChanges();
    const ta: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(ta.value).toBe('d');
  });

  it('saveLabel = «Сохранить» для active', () => {
    expect(fixture.componentInstance.saveLabel()).toBe('Сохранить');
  });

  it('deleteExisting зовёт сервис и перечитывает фото', async () => {
    const c = fixture.componentInstance;
    const svc = TestBed.inject(PropertyPhotoService);
    const delSpy = spyOn(svc, 'deletePhoto').and.resolveTo(undefined);
    spyOn(svc, 'getPhotos').and.resolveTo([]);
    await c.deleteExisting({
      full_url: 'f',
      thumb_url: 't',
      order_index: 0,
      photo_type: 'gallery',
    });
    expect(delSpy).toHaveBeenCalledWith(
      'p1',
      jasmine.objectContaining({ full_url: 'f' }),
    );
  });

  it('save() собирает payload и зовёт editProperty', async () => {
    const c = fixture.componentInstance;
    const owner = TestBed.inject(PropertyOwnerService);
    const spy = spyOn(owner, 'editProperty').and.resolveTo('active');
    c.price.set('150');
    await c.save();
    expect(spy).toHaveBeenCalled();
    const payload = spy.calls.mostRecent().args[0];
    expect(payload.propertyId).toBe('p1');
    expect(payload.price).toBe(150);
  });
});
```

- [ ] **Step 2: Запустить spec — убедиться, что падает**

Run:

```bash
npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts
```

Expected: FAIL — `c.step is not a function` / `c.steps is undefined` / `c.next is not a function` (компонент ещё на табах).

- [ ] **Step 3: Обновить `edit-property.component.ts` — навигация мастера**

В `src/app/mrsqm/pages/edit-property/edit-property.component.ts` внести точечные правки (всё остальное — поля, `_prefill`, `save`, бегунок, фото, `_load`, `_loadAddressChain` — НЕ трогать):

**3a.** Удалить строку с типом таба (было после импортов, ~строка 33):

```ts
type EditTab = 'params' | 'description' | 'photos';
```

и **добавить вместо неё** константы мастера:

```ts
// 5 шагов окна редактирования (группировка создателя).
const STEPS = [
  'Адрес и параметры',
  'Цена и состояние',
  'Листинг',
  'Описание',
  'Фото',
] as const;
const STEP_ICONS = [
  'place',
  'payments',
  'verified',
  'description',
  'photo_library',
] as const;
```

**3b.** Заменить объявление сигнала таба:

```ts
// БЫЛО:
readonly tab = signal<EditTab>('params');

// СТАЛО:
readonly steps = STEPS;
readonly stepIcons = STEP_ICONS;
readonly step = signal(0);
readonly error = signal<string | null>(null);
```

**3c.** Удалить метод `setTab` (был ~строка 347):

```ts
setTab(t: EditTab): void {
  this.tab.set(t);
}
```

и **добавить вместо него** навигацию мастера:

```ts
// Валидация текущего шага. Цена обязательна на шаге «Цена и состояние» (index 1);
// остальные поля префиллятся из объекта → необязательны.
private _validateStep(): string | null {
  if (this.step() === 1) {
    const digits = this.price().replace(/[^\d.]/g, '');
    const p = digits ? Number(digits) : 0;
    if (!p || p <= 0) return 'Укажите корректную цену';
  }
  return null;
}

next(): void {
  const err = this._validateStep();
  if (err) {
    this.error.set(err);
    return;
  }
  this.error.set(null);
  this.step.update((s) => Math.min(s + 1, STEPS.length - 1));
}

prev(): void {
  this.error.set(null);
  this.step.update((s) => Math.max(s - 1, 0));
}
```

(Сигнал `tab` и тип `EditTab` после этого нигде не используются — `save()`/`_prefill`/бегунок/фото на них не ссылаются. Импорты остаются прежними: `signal`, `computed`, `viewChild`, CDK и т.д. уже используются другими местами.)

- [ ] **Step 4: Переписать `edit-property.component.html` на мастер**

Полностью заменить содержимое `src/app/mrsqm/pages/edit-property/edit-property.component.html` на:

```html
@if (isLoading()) {
<div class="loading"><mat-spinner [diameter]="28"></mat-spinner></div>
} @else if (loadError()) {
<div class="add-wrap">
  <div class="add-col">
    <div class="add-error">
      <mat-icon>error_outline</mat-icon>
      <span>{{ loadError() }}</span>
    </div>
    <div class="add-nav">
      <button
        mat-stroked-button
        type="button"
        (click)="cancel()"
      >
        Назад
      </button>
    </div>
  </div>
</div>
} @else {
<div class="add-wrap">
  <div class="add-col">
    <!-- Прогресс шагов с нумерацией -->
    <div class="steps-row">
      @for (s of steps; track s; let i = $index) {
      <div
        class="step-dot"
        [class.active]="i === step()"
        [class.done]="i < step()"
      >
        @if (i < step()) {
        <mat-icon>check</mat-icon>
        } @else { {{ i + 1 }} }
      </div>
      }
    </div>

    <section class="block">
      <div class="block-header">
        <mat-icon>{{ stepIcons[step()] }}</mat-icon>
        <span class="block-title">{{ steps[step()] }}</span>
        <span class="block-step-no">Шаг {{ step() + 1 }} / {{ steps.length }}</span>
      </div>

      <div class="block-content">
        <!-- ШАГ 1: Адрес (read-only) + бегунок + параметры -->
        @if (step() === 0) {
        <div class="field">
          <span class="field-label">Адрес</span>
          <div class="loc-selected">
            <mat-icon>place</mat-icon>
            <span>{{ headerPath() }}</span>
          </div>
        </div>

        <!-- Бегунок приватности адреса (виден только если есть что двигать) -->
        @if (canSlide()) {
        <div class="field reveal-field">
          <span class="field-label reveal-label">Что видят коллеги</span>
          <div
            #revealEl
            class="reveal"
            [class.dragging]="isDragging()"
            [style.--n]="addrPath().length"
            (pointerdown)="onRevealPointerDown($event)"
            (pointermove)="onRevealPointerMove($event)"
            (pointerup)="onRevealPointerUpOrCancel()"
            (pointercancel)="onRevealPointerUpOrCancel()"
          >
            <div class="reveal-ticks">
              @for (p of addrPath(); track p.id; let i = $index) {
              <span
                class="reveal-tick"
                [class.muted]="i < communityIndex()"
                [class.on]="i <= revealIndex()"
                [title]="p.name"
              >
                {{ p.name }}
              </span>
              }
            </div>
            <div class="reveal-track">
              <div
                class="reveal-track-fill"
                [style.right.%]="(1 - (revealIndex() + 0.5) / addrPath().length) * 100"
              ></div>
            </div>
            @for (p of addrPath(); track p.id; let i = $index) {
            <button
              type="button"
              class="reveal-dot"
              [class.muted]="i < communityIndex()"
              [class.on]="i <= revealIndex()"
              [class.active]="i === revealIndex()"
              [style.left.%]="((i + 0.5) / addrPath().length) * 100"
              [disabled]="i < communityIndex()"
              (click)="selectReveal(i)"
              [attr.aria-label]="p.name"
            ></button>
            }
            <div
              class="reveal-thumb"
              [style.left.%]="((revealIndex() + 0.5) / addrPath().length) * 100"
              aria-hidden="true"
            ></div>
          </div>
          <p class="note reveal-note">
            В ленте всем (и вам) показывается: <b>{{ revealLabel() }}</b>. Точный адрес
            виден только вам. Ниже комьюнити скрыть нельзя.
          </p>
        </div>
        }

        <!-- Чекбоксы: Maid/Study/Hotel/Vastu (по типу объекта) -->
        @if (fields().maid || fields().hotelPool || fields().vastu) {
        <div class="field">
          <div class="check-group">
            @if (fields().maid) {
            <label class="check-row">
              <span class="check-label">Maid room</span>
              <input
                type="checkbox"
                [ngModel]="isMaid()"
                (ngModelChange)="isMaid.set($event)"
              />
            </label>
            <label class="check-row">
              <span class="check-label">Study room</span>
              <input
                type="checkbox"
                [ngModel]="isStudy()"
                (ngModelChange)="isStudy.set($event)"
              />
            </label>
            } @if (fields().hotelPool) {
            <label class="check-row">
              <span class="check-label">Hotel Apartment</span>
              <input
                type="checkbox"
                [ngModel]="isHotelPool()"
                (ngModelChange)="isHotelPool.set($event)"
              />
            </label>
            } @if (fields().vastu) {
            <label class="check-row">
              <span class="check-label">Vastu Compliant</span>
              <input
                type="checkbox"
                [ngModel]="isVastu()"
                (ngModelChange)="isVastu.set($event)"
              />
            </label>
            }
          </div>
        </div>
        } @if (fields().bua) {
        <div class="field">
          <span class="field-label">Площадь BUA, sqft</span>
          <input
            type="text"
            inputmode="numeric"
            [ngModel]="areaSqft()"
            (ngModelChange)="areaSqft.set($event)"
            placeholder="напр. 1200"
          />
        </div>
        } @if (fields().plot) {
        <div class="field">
          <span class="field-label">Площадь участка (Plot), sqft</span>
          <input
            type="text"
            inputmode="numeric"
            [ngModel]="plotSqft()"
            (ngModelChange)="plotSqft.set($event)"
            placeholder="напр. 3500"
          />
        </div>
        } @if (fields().floorLevel && options()?.floor_levels?.length) {
        <div class="field">
          <span class="field-label">Этажность</span>
          <div class="chips">
            @for (fl of options()!.floor_levels; track fl.id) {
            <button
              type="button"
              class="chip"
              [class.sel]="floorLevelId() === fl.id"
              (click)="floorLevelId.set(fl.id)"
            >
              {{ fl.label_en }}
            </button>
            }
          </div>
        </div>
        } @if (fields().floorsInUnit && floorsInUnitOptions().length) {
        <div class="field">
          <span class="field-label">Levels</span>
          <div class="chips">
            @for (fu of floorsInUnitOptions(); track fu.id) {
            <button
              type="button"
              class="chip"
              [class.sel]="floorsInUnitId() === fu.id"
              (click)="floorsInUnitId.set(fu.id)"
            >
              {{ fu.label_en }}
            </button>
            }
          </div>
        </div>
        } @if (fields().views && options()?.views?.length) {
        <div class="field">
          <span class="field-label">Вид из окна</span>
          <div class="chips">
            @for (v of options()!.views; track v.id) {
            <button
              type="button"
              class="chip"
              [class.sel]="viewIds().includes(v.id)"
              (click)="toggleId(viewIds, v.id)"
            >
              {{ v.label_en }}
            </button>
            }
          </div>
        </div>
        } @if (fields().positions && options()?.positions?.length) {
        <div class="field">
          <span class="field-label">Расположение</span>
          <div class="chips">
            @for (p of options()!.positions; track p.id) {
            <button
              type="button"
              class="chip"
              [class.sel]="positionIds().includes(p.id)"
              (click)="toggleId(positionIds, p.id)"
            >
              {{ p.label_en }}
            </button>
            }
          </div>
        </div>
        } @if (fields().amenities && options()?.amenities?.length) {
        <div class="field">
          <span class="field-label">Удобства</span>
          <div class="chips">
            @for (a of options()!.amenities; track a.id) {
            <button
              type="button"
              class="chip"
              [class.sel]="amenityIds().includes(a.id)"
              (click)="toggleId(amenityIds, a.id)"
            >
              {{ a.label_en }}
            </button>
            }
          </div>
        </div>
        } @if (fields().furnished && options()?.furnished_options?.length) {
        <div class="field">
          <span class="field-label">Мебель</span>
          <div class="chips">
            @for (fo of options()!.furnished_options; track fo.id) {
            <button
              type="button"
              class="chip"
              [class.sel]="furnished() === fo.value"
              (click)="furnished.set(fo.value)"
            >
              {{ fo.label_en }}
            </button>
            }
          </div>
        </div>
        } }

        <!-- ШАГ 2: Цена и состояние -->
        @if (step() === 1) {
        <div class="field">
          <span class="field-label">Цена, AED</span>
          <input
            [ngModel]="price()"
            (ngModelChange)="onPriceInput($event)"
            inputmode="numeric"
            placeholder="напр. 1,200,000"
          />
        </div>

        @if (detail()?.deal_type === 'sale') {
        <div class="field">
          <span class="field-label">Оригинальная цена (необязательно)</span>
          <input
            [ngModel]="originalPrice()"
            (ngModelChange)="originalPrice.set($event)"
            [disabled]="originalPriceLocked()"
            inputmode="numeric"
            placeholder="напр. 1,400,000"
          />
          @if (originalPriceLocked()) {
          <p class="note">Изменить нельзя — задана при создании.</p>
          }
        </div>
        } @if (isRent() && options()?.price_periods?.length) {
        <div class="field">
          <span class="field-label">Период оплаты</span>
          <div class="chips">
            @for (p of options()!.price_periods; track p.value) {
            <button
              type="button"
              class="chip"
              [class.sel]="pricePeriod() === p.value"
              (click)="pricePeriod.set(p.value)"
            >
              {{ p.label_en }}
            </button>
            }
          </div>
        </div>
        } @if (options()?.occupancy_options?.length) {
        <div class="field">
          <span class="field-label">Занятость</span>
          <div class="chips">
            @for (o of options()!.occupancy_options; track o.value) {
            <button
              type="button"
              class="chip"
              [class.sel]="occupancyStatus() === o.value"
              (click)="occupancyStatus.set(o.value)"
            >
              {{ o.label_en }}
            </button>
            }
          </div>
        </div>
        } @if (occupancyStatus() === 'occupied') {
        <div class="field">
          <span class="field-label">Занято до (необязательно)</span>
          <input
            type="month"
            [ngModel]="leaseUntil()"
            (ngModelChange)="leaseUntil.set($event)"
          />
        </div>
        }

        <div class="field">
          <span class="field-label">Видимость</span>
          <div class="chips">
            <button
              type="button"
              class="chip"
              [class.sel]="visibility() === 'public'"
              (click)="visibility.set('public')"
            >
              Все агенты
            </button>
            <button
              type="button"
              class="chip"
              [class.sel]="visibility() === 'network'"
              (click)="visibility.set('network')"
            >
              Только моя сеть
            </button>
          </div>
        </div>
        }

        <!-- ШАГ 3: Листинг -->
        @if (step() === 2) { @if (options()?.listing_types?.length) {
        <div class="field">
          <span class="field-label">Тип листинга</span>
          <div class="chips">
            @for (l of options()!.listing_types; track l.value) {
            <button
              type="button"
              class="chip"
              [class.sel]="listingType() === l.value"
              (click)="listingType.set(l.value)"
            >
              {{ l.label_en }}
            </button>
            }
          </div>
        </div>
        } }

        <!-- ШАГ 4: Описание -->
        @if (step() === 3) {
        <div class="field">
          <span class="field-label">Описание</span>
          <textarea
            rows="5"
            [ngModel]="description()"
            (ngModelChange)="description.set($event)"
            placeholder="Опишите объект…"
          ></textarea>
        </div>
        }

        <!-- ШАГ 5: Фото -->
        @if (step() === 4) { @if (photosBusy()) {
        <div class="loading"><mat-spinner [diameter]="24"></mat-spinner></div>
        }

        <div class="field">
          <span class="field-label">Фотографии галереи</span>
          @if (galleryPhotos().length) {
          <div
            class="photo-grid"
            cdkDropList
            cdkDropListOrientation="horizontal"
            (cdkDropListDropped)="dropExisting($event)"
          >
            @for (photo of galleryPhotos(); track photo.full_url; let i = $index) {
            <div
              class="photo-cell"
              cdkDrag
            >
              <img
                [src]="photo.thumb_url"
                alt="фото"
              />
              @if (i === 0) {
              <span class="photo-main">Главное</span>
              } @if (i > 0) {
              <button
                type="button"
                class="photo-make-main"
                (click)="makeMain(i)"
                title="Сделать главным"
              >
                <mat-icon>star</mat-icon>
              </button>
              }
              <button
                type="button"
                class="photo-del"
                (click)="deleteExisting(photo)"
                aria-label="Удалить фото"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>
            }
          </div>
          <p class="note">Перетащите для изменения порядка. Первое фото — главное.</p>
          } @else {
          <p class="note">Фотографий нет</p>
          }
        </div>

        <div class="field">
          <span class="field-label">Добавить новые фото</span>
          <label class="photo-add">
            <mat-icon>add_photo_alternate</mat-icon>
            <span>Выбрать файлы</span>
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              (change)="onAddPhotos($event)"
            />
          </label>
          @if (newPreviews().length) {
          <div class="photo-grid">
            @for (src of newPreviews(); track src; let i = $index) {
            <div class="photo-cell">
              <img
                [src]="src"
                alt="новое фото"
              />
              <button
                type="button"
                class="photo-del"
                (click)="removeNewPhoto(i)"
                aria-label="Убрать"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>
            }
          </div>
          <p class="note">Фото будут загружены при сохранении.</p>
          }
        </div>
        }
      </div>
    </section>

    @if (error()) {
    <div class="add-error">
      <mat-icon>error_outline</mat-icon>
      <span>{{ error() }}</span>
    </div>
    }

    <div class="add-nav">
      @if (step() > 0) {
      <button
        mat-stroked-button
        type="button"
        (click)="prev()"
      >
        Назад
      </button>
      } @else {
      <span></span>
      } @if (step() < steps.length - 1) {
      <button
        mat-flat-button
        color="primary"
        type="button"
        (click)="next()"
      >
        Далее
      </button>
      } @else {
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="saving()"
        (click)="save()"
      >
        @if (saving()) {
        <mat-spinner [diameter]="20"></mat-spinner>
        } @else { {{ saveLabel() }} }
      </button>
      }
    </div>
  </div>
</div>
}
```

- [ ] **Step 5: Заменить `edit-property.component.scss` на `@use` партиала**

Полностью заменить содержимое `src/app/mrsqm/pages/edit-property/edit-property.component.scss` ровно на одну строку:

```scss
@use '../property-form';
```

(Все классы шаблона — `.add-wrap`, `.field`, `.chip`, `.reveal*`, `.photo-*`, `.loading`, `.loc-selected`, `.add-error`, `.add-nav` и т.д. — теперь приходят из партиала. Старые `ep-*` стили удаляются вместе со старым содержимым.)

- [ ] **Step 6: Запустить spec — убедиться, что проходит**

Run:

```bash
npm run test:file src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts
```

Expected: PASS (все it-блоки зелёные).

- [ ] **Step 7: checkFile всех тронутых файлов (вкл. .html и .spec.ts)**

Run:

```bash
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.ts
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.html
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.scss
npm run checkFile src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts
```

Expected: все четыре PASS. (Особенно `.html` — prettier в шаблонах иначе всплывёт только на репо-lint.)

- [ ] **Step 8: Commit**

```bash
git add src/app/mrsqm/pages/edit-property/edit-property.component.ts \
        src/app/mrsqm/pages/edit-property/edit-property.component.html \
        src/app/mrsqm/pages/edit-property/edit-property.component.scss \
        src/app/mrsqm/pages/edit-property/edit-property.component.spec.ts
git commit -m "feat(mrsqm): окно редактирования — линейный мастер 1:1 с формой добавления"
```

---

## Финальный гейт перед пушем (контроллер, не задача плана)

После обеих задач и финального whole-branch ревью — перед деплоем (по явному «пушь» создателя):

```bash
npm run lint
npm run buildFrontend:prodWeb
```

Expected: lint чистый; прод-сборка проходит (AOT + бюджеты). Затем — прод-смоук: открыть свой active-объект → «Изменить» → пройти 5 шагов мастера → проверить бегунок (выглядит как в add), сохранение, ленту.

## Self-Review (выполнено при написании плана)

- **Покрытие спеки:** §2 (сохранить логику) → Task 2 переносит `_prefill`/`save`/бегунок/фото без изменений; §3 (5 шагов, источники разметки) → Task 2 Step 4 (шаги 1–5); §2 общий партиал → Task 1; §4 навигация мастера → Task 2 Step 3; §5 сохранение текущее → не трогаем `save()`; §6 тесты → Task 2 Step 1. Вне scope (§7) — не добавляем.
- **Плейсхолдеры:** нет. Партиал = точная копия существующего файла с одной изменённой строкой (источник указан явно), остальные файлы приведены целиком.
- **Согласованность типов:** новые публичные члены `step`/`steps`/`stepIcons`/`error`/`next`/`prev` объявлены в Task 2 Step 3 и используются в Step 4 (шаблон) и Step 1 (тесты) с теми же именами/сигнатурами. Удаляемые `tab`/`setTab`/`EditTab` нигде больше не упоминаются.
