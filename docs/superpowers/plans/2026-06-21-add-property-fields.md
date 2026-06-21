# Новые поля объекта (форма + деталка) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в форму создания объекта поля is_study / original_price / cheques, перевести этажность дома на UUID, сделать этаж обязательным, перестроить «Расположение» во взаимоисключающие наборы; в деталке показать Levels и бейджи Reduced / Below OP, убрать бейдж «Торг».

**Architecture:** Форма пишет напрямую в `properties` (колонки уже есть). Этажность дома мигрирует с text `floors_in_unit` на UUID `floors_in_unit_id` (FK → property_type_values). Авто-флаги `is_below_op`/`is_reduced` считает новый BEFORE-триггер. Деталка читает новые поля из `get_property` (патч RPC).

**Tech Stack:** Angular standalone + signals, Jasmine/Karma, Supabase (PostgREST + plpgsql RPC).

## Global Constraints

- UI-строки и комментарии — на русском (идентификаторы БД — как есть).
- TypeScript strict: без `any` в проде (в спеках допускается `as any` для приватных методов — следовать существующему стилю).
- Никогда не мутировать сигналы/массивы — возвращать новые (`.set([...])`).
- `npm run checkFile <file>` на каждом изменённом `.ts`/`.scss` перед коммитом.
- Коммиты: Angular-формат `type(scope): description`; завершать строкой `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **БД-миграции (Task 6, 7) НЕ применять.** Только записать `.sql` в `docs/migrations/`. Применяет создатель вручную после ревью.
- `is_study` показывается там же, где `is_maid` (apartment & house). `original_price` — только `deal_type='sale'`. `cheques` — только `deal_type='rent'`.
- Этаж обязателен для apartment (`floor_level_id`) и house (`floors_in_unit_id`).

---

### Task 1: Форма — поля is_study / original_price / cheques

**Files:**

- Modify: `src/app/mrsqm/types/database.ts` (interface `PropertyInsert`)
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.ts`
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.html`
- Test: `src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`

**Interfaces:**

- Produces: signals `isStudy: WritableSignal<boolean>`, `originalPrice: WritableSignal<string>`, `cheques: WritableSignal<number|null>`; method `onOriginalPriceInput(val: string): void`; const `chequeOptions: readonly number[]`. Payload-ключи `is_study`, `original_price`, `cheques`.

- [ ] **Step 1: Добавить поля в `PropertyInsert`**

В `types/database.ts`, в интерфейсе `PropertyInsert`, после строки `is_vastu?: boolean | null;` добавить:

```ts
  is_study?: boolean | null;
  original_price?: number | null;
  cheques?: number | null;
```

- [ ] **Step 2: Написать падающие тесты (payload + форматирование)**

В `add-property-page.component.spec.ts` добавить новый блок в конец файла:

```ts
// ─── Новые поля: is_study / original_price / cheques ─────────────────────────
describe('AddPropertyPageComponent — новые поля формы', () => {
  let component: AddPropertyPageComponent;
  let create: FakePropertyCreateService;

  beforeEach(async () => {
    create = new FakePropertyCreateService();
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useValue: create },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  it('onOriginalPriceInput форматирует с разделителями тысяч', () => {
    component.onOriginalPriceInput('1400000');
    expect(component.originalPrice()).toBe('1,400,000');
  });

  it('chequeOptions = [1,2,3,4,6,12]', () => {
    expect([...component.chequeOptions]).toEqual([1, 2, 3, 4, 6, 12]);
  });

  it('payload (sale): пишет original_price, cheques=null, is_study', async () => {
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });
    const auth = TestBed.inject(MrsqmAuthService);
    (auth as unknown as { currentUser: () => unknown }).currentUser = () => ({
      id: 'u1',
    });
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt');
    component.locationId.set('loc1');
    component.step.set(7);
    component.dealType.set('sale');
    component.bedrooms.set(2);
    component.bathrooms.set(2);
    component.areaSqft.set('1200');
    component.floorLevelId.set('fl1');
    component.isStudy.set(true);
    component.originalPrice.set('1,400,000');
    component.price.set('1,200,000');
    await component.submit();
    const payload = captured[0] as {
      original_price: number | null;
      cheques: number | null;
      is_study: boolean;
    };
    expect(payload.original_price).toBe(1_400_000);
    expect(payload.cheques).toBeNull();
    expect(payload.is_study).toBe(true);
  });

  it('payload (rent): пишет cheques, original_price=null', async () => {
    const captured: unknown[] = [];
    spyOn(create, 'createProperty').and.callFake(async (p: unknown) => {
      captured.push(p);
      return 'id';
    });
    const auth = TestBed.inject(MrsqmAuthService);
    (auth as unknown as { currentUser: () => unknown }).currentUser = () => ({
      id: 'u1',
    });
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt');
    component.locationId.set('loc1');
    component.step.set(7);
    component.dealType.set('rent');
    component.bedrooms.set(1);
    component.bathrooms.set(1);
    component.areaSqft.set('800');
    component.floorLevelId.set('fl1');
    component.cheques.set(4);
    component.originalPrice.set('999,000');
    component.price.set('90,000');
    await component.submit();
    const payload = captured[0] as {
      original_price: number | null;
      cheques: number | null;
    };
    expect(payload.cheques).toBe(4);
    expect(payload.original_price).toBeNull();
  });
});
```

> Примечание: `FakePropertyCreateService` уже имеет `createProperty`. Тест переопределяет `currentUser` на стабе и шпионит `createProperty`. `floorLevelId.set('fl1')` нужен из-за обязательного этажа (Task 2) — поставить заранее безопасно.

- [ ] **Step 3: Запустить тесты — убедиться, что падают**

Run: `npm run test:file src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`
Expected: FAIL (`onOriginalPriceInput`/`chequeOptions`/новые ключи payload не существуют).

- [ ] **Step 4: Реализовать сигналы и метод в компоненте**

В `add-property-page.component.ts`:

(a) После `readonly isMaid = signal(false);` добавить:

```ts
  readonly isStudy = signal(false);
```

(b) В блоке «Шаг 4: Цена» после `readonly isNegotiable = signal(false);` добавить:

```ts
  // Оригинальная цена (OP) — только для продажи. Кол-во чеков — только аренда.
  readonly originalPrice = signal<string>('');
  readonly cheques = signal<number | null>(null);
  readonly chequeOptions: readonly number[] = [1, 2, 3, 4, 6, 12];
```

(c) Рядом с `onPriceInput` добавить:

```ts
  onOriginalPriceInput(val: string): void {
    const digits = val.replace(/\D/g, '');
    this.originalPrice.set(digits ? Number(digits).toLocaleString('en-US') : '');
  }
```

(d) В `payload: PropertyInsert = { ... }` (метод `submit`) добавить после `is_vastu: tf.vastu ? this.isVastu() : false,`:

```ts
      is_study: tf.maid ? this.isStudy() : false,
      original_price: this.dealType() === 'sale' ? num(this.originalPrice()) : null,
      cheques: this.dealType() === 'rent' ? this.cheques() : null,
```

- [ ] **Step 5: Реализовать UI в шаблоне**

В `add-property-page.component.html`:

(a) В блоке чекбоксов (внутри `check-group`), сразу после закрывающего `}` блока `@if (fields().maid) { ... Maid room ... }` добавить чекбокс Study (показываем по тому же `fields().maid`):

```html
@if (fields().maid) {
<label class="check-row">
  <span class="check-label">Study room</span>
  <input
    type="checkbox"
    [ngModel]="isStudy()"
    (ngModelChange)="isStudy.set($event)"
  />
</label>
}
```

(b) В «ШАГ 4: Цена», после блока `<label class="toggle-row">…Торг уместен…</label>` добавить:

```html
@if (dealType() === 'sale') {
<div class="field">
  <span class="field-label">What was the original price? (optional)</span>
  <input
    [ngModel]="originalPrice()"
    (ngModelChange)="onOriginalPriceInput($event)"
    inputmode="numeric"
    placeholder="напр. 1,400,000"
  />
</div>
} @if (dealType() === 'rent') {
<div class="field">
  <span class="field-label">Количество чеков</span>
  <div class="chips">
    @for (c of chequeOptions; track c) {
    <button
      type="button"
      class="chip"
      [class.sel]="cheques() === c"
      (click)="cheques.set(c)"
    >
      {{ c }}
    </button>
    }
  </div>
</div>
}
```

- [ ] **Step 6: Запустить тесты — зелёные**

Run: `npm run test:file src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`
Expected: PASS (все, включая прежние).

- [ ] **Step 7: Линт/формат изменённых файлов**

Run: `npm run checkFile src/app/mrsqm/pages/add-property/add-property-page.component.ts && npm run checkFile src/app/mrsqm/pages/add-property/add-property-page.component.html && npm run checkFile src/app/mrsqm/types/database.ts`
Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add src/app/mrsqm/pages/add-property/add-property-page.component.ts src/app/mrsqm/pages/add-property/add-property-page.component.html src/app/mrsqm/types/database.ts src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts
git commit -m "feat(add-property): поля Study room, original price (sale), чеки (rent)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Форма — этажность дома на UUID + обязательный этаж + ярлыки

**Files:**

- Modify: `src/app/mrsqm/types/database.ts` (`PropertyInsert`)
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.ts`
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.html`
- Test: `src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`

**Interfaces:**

- Consumes: signal `floorsInUnit` (теперь хранит UUID-id, не value); `floorLevelId`.
- Produces: payload-ключ `floors_in_unit_id` (вместо `floors_in_unit`); валидация шага «Параметры» требует этаж.

- [ ] **Step 1: Поменять `PropertyInsert` (floors_in_unit → floors_in_unit_id)**

В `types/database.ts` в `PropertyInsert` заменить строку:

```ts
floors_in_unit: string | null;
```

на:

```ts
floors_in_unit_id: string | null;
```

- [ ] **Step 2: Обновить существующие apartment-тесты шага 2 (этаж стал обязательным) + добавить новые**

В `add-property-page.component.spec.ts`:

(a) В тесте `'шаг 2 (Параметры): bua-тип с areaSqft и beds/baths → возвращает null'` (apartment) добавить перед вызовом `_validateStep`:

```ts
component.floorLevelId.set('fl1');
```

(b) В тесте `'шаг 2 (Параметры): тип с rooms, оба заполнены, с areaSqft → возвращает null'` добавить перед вызовом `_validateStep`:

```ts
component.floorLevelId.set('fl1');
```

(c) Добавить новый describe-блок в конец файла:

```ts
// ─── Этаж обязателен (apartment floor_level, house floors_in_unit) ───────────
describe('AddPropertyPageComponent — обязательный этаж (шаг 2)', () => {
  let component: AddPropertyPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
  });

  it('apartment без floorLevelId → ошибка', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
    component.unitTypeId.set('apt');
    component.bedrooms.set(2);
    component.bathrooms.set(2);
    component.areaSqft.set('1200');
    component.floorLevelId.set(null);
    expect(typeof (component as any)._validateStep()).toBe('string'); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('house без floorsInUnit → ошибка', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [{ id: 'house', value: 'house', label_en: 'House', parent_id: null }],
    } as unknown as FilterOptions);
    component.unitTypeId.set('house');
    component.bedrooms.set(3);
    component.bathrooms.set(2);
    component.areaSqft.set('2500');
    component.floorsInUnit.set(null);
    expect(typeof (component as any)._validateStep()).toBe('string'); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('house с floorsInUnit (id) и площадью → null', () => {
    component.step.set(2);
    component.options.set({
      ...FAKE_OPTIONS,
      unit_types: [{ id: 'house', value: 'house', label_en: 'House', parent_id: null }],
    } as unknown as FilterOptions);
    component.unitTypeId.set('house');
    component.bedrooms.set(3);
    component.bathrooms.set(2);
    component.areaSqft.set('2500');
    component.floorsInUnit.set('fiu-uuid');
    expect((component as any)._validateStep()).toBeNull(); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
});
```

- [ ] **Step 3: Запустить тесты — падают**

Run: `npm run test:file src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`
Expected: FAIL (валидация этажа ещё не добавлена; payload использует floors_in_unit).

- [ ] **Step 4: Валидация этажа + payload floors_in_unit_id**

В `add-property-page.component.ts`, метод `_validateStep`, в `case 2:` перед `return null;` добавить:

```ts
if (tf.floorLevel && !this.floorLevelId()) return 'Укажите этажность';
if (tf.floorsInUnit && !this.floorsInUnit()) return 'Укажите этажность (Levels)';
```

В `submit`, в payload заменить строку:

```ts
      floors_in_unit: tf.floorsInUnit ? this.floorsInUnit() : null,
```

на:

```ts
      floors_in_unit_id: tf.floorsInUnit ? this.floorsInUnit() : null,
```

- [ ] **Step 5: Шаблон — ярлыки и хранение id для домов**

В `add-property-page.component.html`:

(a) Блок `@if (fields().floorLevel)` — заменить ярлык на «Этажность» и добавить звезду:

```html
<span class="field-label">Этажность<span class="req-star">*</span></span>
```

(b) Блок `@if (fields().floorsInUnit)` — ярлык «Levels» со звездой и хранение `id`:

```html
@if (fields().floorsInUnit) {
<div class="field">
  <span class="field-label">Levels<span class="req-star">*</span></span>
  <div class="chips">
    @for (fu of floorsInUnitOptions(); track fu.id) {
    <button
      type="button"
      class="chip"
      [class.sel]="floorsInUnit() === fu.id"
      (click)="floorsInUnit.set(fu.id)"
    >
      {{ fu.label_en }}
    </button>
    }
  </div>
</div>
}
```

- [ ] **Step 6: Тесты зелёные**

Run: `npm run test:file src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: Линт**

Run: `npm run checkFile src/app/mrsqm/pages/add-property/add-property-page.component.ts && npm run checkFile src/app/mrsqm/pages/add-property/add-property-page.component.html && npm run checkFile src/app/mrsqm/types/database.ts`

- [ ] **Step 8: Commit**

```bash
git add src/app/mrsqm/pages/add-property/ src/app/mrsqm/types/database.ts
git commit -m "feat(add-property): этажность дома на UUID, обязательный этаж, ярлыки Этажность/Levels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Форма — «Расположение» как два взаимоисключающих набора

**Files:**

- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.ts`
- Modify: `src/app/mrsqm/pages/add-property/add-property-page.component.html`
- Test: `src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`

**Interfaces:**

- Produces: computed `positionRowOptions: Signal<FilterOptionId[]>` (house: back_to_back/single_row, apt: []), `positionUnitOptions: Signal<FilterOptionId[]>` (middle/corner); метод `togglePosition(id: string): void` (radio внутри набора).

- [ ] **Step 1: Тесты на radio-логику и фильтрацию по типу**

Добавить в `add-property-page.component.spec.ts`:

```ts
// ─── Расположение: два взаимоисключающих набора ──────────────────────────────
describe('AddPropertyPageComponent — позиции (наборы)', () => {
  let component: AddPropertyPageComponent;

  const POS = [
    { id: 'b2b', value: 'back_to_back', label_en: 'Back to Back', parent_id: null },
    { id: 'sr', value: 'single_row', label_en: 'Single Row', parent_id: null },
    { id: 'mid', value: 'middle', label_en: 'Middle', parent_id: null },
    { id: 'cor', value: 'corner', label_en: 'Corner', parent_id: null },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPropertyPageComponent],
      providers: [
        { provide: PropertyCreateService, useClass: FakePropertyCreateService },
        { provide: PropertyPhotoService, useClass: FakePhotoService },
        { provide: MrsqmAuthService, useClass: FakeAuthService },
        {
          provide: Router,
          useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddPropertyPageComponent);
    component = fixture.componentInstance;
    component.options.set({
      ...FAKE_OPTIONS,
      positions: POS,
      unit_types: [
        { id: 'house', value: 'house', label_en: 'House', parent_id: null },
        { id: 'apt', value: 'apartment', label_en: 'Apartment', parent_id: null },
      ],
    } as unknown as FilterOptions);
  });

  it('house: оба набора доступны', () => {
    component.unitTypeId.set('house');
    expect(component.positionRowOptions().map((p) => p.value)).toEqual([
      'back_to_back',
      'single_row',
    ]);
    expect(component.positionUnitOptions().map((p) => p.value)).toEqual([
      'middle',
      'corner',
    ]);
  });

  it('apartment: только middle/corner', () => {
    component.unitTypeId.set('apt');
    expect(component.positionRowOptions()).toEqual([]);
    expect(component.positionUnitOptions().map((p) => p.value)).toEqual([
      'middle',
      'corner',
    ]);
  });

  it('togglePosition: выбор второго из набора снимает первый', () => {
    component.unitTypeId.set('house');
    component.togglePosition('b2b');
    expect(component.positionIds()).toEqual(['b2b']);
    component.togglePosition('sr'); // тот же набор → b2b снимается
    expect(component.positionIds()).toEqual(['sr']);
  });

  it('togglePosition: наборы независимы (можно по одному из каждого)', () => {
    component.unitTypeId.set('house');
    component.togglePosition('sr');
    component.togglePosition('mid');
    expect(component.positionIds().sort()).toEqual(['mid', 'sr']);
  });

  it('togglePosition: повторный клик снимает выбор', () => {
    component.unitTypeId.set('house');
    component.togglePosition('mid');
    component.togglePosition('mid');
    expect(component.positionIds()).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — падают**

Run: `npm run test:file src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`
Expected: FAIL (`positionRowOptions`/`positionUnitOptions`/`togglePosition` не существуют).

- [ ] **Step 3: Реализовать computeds и метод**

В `add-property-page.component.ts`, рядом с другими computed по типу (после `floorsInUnitOptions`):

```ts
  // «Расположение» = два взаимоисключающих набора. Дом — оба, апартаменты —
  // только позиция юнита (middle/corner).
  private readonly _ROW_POS = ['back_to_back', 'single_row'];
  private readonly _UNIT_POS = ['middle', 'corner'];
  readonly positionRowOptions = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    if (!opts || this._unitTypeValue() !== 'house') return [];
    return opts.positions.filter((p) => this._ROW_POS.includes(p.value));
  });
  readonly positionUnitOptions = computed<FilterOptionId[]>(() => {
    const opts = this.options();
    if (!opts) return [];
    return opts.positions.filter((p) => this._UNIT_POS.includes(p.value));
  });
```

Метод (рядом с `toggleIn`):

```ts
  // Клик по позиции: radio внутри своего набора (снять прочие того же набора),
  // не трогая чужой набор. Повторный клик — снять.
  togglePosition(id: string): void {
    const opts = this.options();
    if (!opts) return;
    const picked = opts.positions.find((p) => p.id === id);
    if (!picked) return;
    const cur = this.positionIds();
    if (cur.includes(id)) {
      this.positionIds.set(cur.filter((x) => x !== id));
      return;
    }
    const set = this._ROW_POS.includes(picked.value) ? this._ROW_POS : this._UNIT_POS;
    const sameSetIds = opts.positions.filter((p) => set.includes(p.value)).map((p) => p.id);
    this.positionIds.set([...cur.filter((x) => !sameSetIds.includes(x)), id]);
  }
```

- [ ] **Step 4: Шаблон — заменить блок `fields().positions`**

В `add-property-page.component.html` заменить весь блок `@if (fields().positions && options()!.positions.length) { … }` на:

```html
@if (fields().positions) { @if (positionRowOptions().length) {
<div class="field">
  <span class="field-label">Тип ряда</span>
  <div class="chips">
    @for (p of positionRowOptions(); track p.id) {
    <button
      type="button"
      class="chip"
      [class.sel]="positionIds().includes(p.id)"
      (click)="togglePosition(p.id)"
    >
      {{ p.label_en }}
    </button>
    }
  </div>
</div>
} @if (positionUnitOptions().length) {
<div class="field">
  <span class="field-label">Расположение юнита</span>
  <div class="chips">
    @for (p of positionUnitOptions(); track p.id) {
    <button
      type="button"
      class="chip"
      [class.sel]="positionIds().includes(p.id)"
      (click)="togglePosition(p.id)"
    >
      {{ p.label_en }}
    </button>
    }
  </div>
</div>
} }
```

- [ ] **Step 5: Тесты зелёные**

Run: `npm run test:file src/app/mrsqm/pages/add-property/add-property-page.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: Линт**

Run: `npm run checkFile src/app/mrsqm/pages/add-property/add-property-page.component.ts && npm run checkFile src/app/mrsqm/pages/add-property/add-property-page.component.html`

- [ ] **Step 7: Commit**

```bash
git add src/app/mrsqm/pages/add-property/
git commit -m "feat(add-property): Расположение как два взаимоисключающих набора (house/apartment)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Деталка — бейджи Reduced / Below OP, убрать «Торг»

**Files:**

- Modify: `src/app/mrsqm/types/database.ts` (`PropertyDetail`)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts` (vm)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html`
- Test: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`

**Interfaces:**

- Consumes: `PropertyDetail.is_reduced`, `PropertyDetail.is_below_op`.
- Produces: `vm().isReduced: boolean`, `vm().isBelowOp: boolean` (поле `vm().isNegotiable` удаляется).

- [ ] **Step 1: Добавить поля в `PropertyDetail`**

В `types/database.ts`, в `PropertyDetail`, после `is_distress: boolean;` добавить:

```ts
is_reduced: boolean | null;
is_below_op: boolean | null;
```

- [ ] **Step 2: Тесты на флаги в vm**

Добавить в `property-detail.component.spec.ts` (внутри основного `describe('PropertyDetailComponent', …)`):

```ts
it('is_reduced true → vm().isReduced true', async () => {
  const { comp, supa } = makeComponent();
  supa.rpcResult = detail({ is_reduced: true });
  await comp.loadProperty();
  expect(comp.vm().isReduced).toBe(true);
});

it('is_below_op true → vm().isBelowOp true', async () => {
  const { comp, supa } = makeComponent();
  supa.rpcResult = detail({ is_below_op: true });
  await comp.loadProperty();
  expect(comp.vm().isBelowOp).toBe(true);
});

it('флаги null → false', async () => {
  const { comp, supa } = makeComponent();
  supa.rpcResult = detail({ is_reduced: null, is_below_op: null });
  await comp.loadProperty();
  expect(comp.vm().isReduced).toBe(false);
  expect(comp.vm().isBelowOp).toBe(false);
});

it('бейдж «Торг» не рендерится даже при is_negotiable', async () => {
  const { comp, fixture, supa } = makeComponent();
  supa.rpcResult = detail({ is_negotiable: true });
  await comp.loadProperty();
  fixture.detectChanges();
  const chips: string =
    fixture.nativeElement.querySelector('.type-chips')?.textContent ?? '';
  expect(chips).not.toContain('Торг');
});
```

- [ ] **Step 3: Запустить — падают**

Run: `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
Expected: FAIL (`vm().isReduced`/`isBelowOp` отсутствуют; «Торг» ещё рендерится).

- [ ] **Step 4: vm — добавить флаги, убрать isNegotiable**

В `property-detail.component.ts`, в объекте `vm` computed:

- удалить строку `isNegotiable: d?.is_negotiable ?? false,`
- после `isDistress: d?.is_distress ?? f.is_distress,` добавить:

```ts
      isReduced: d?.is_reduced ?? false,
      isBelowOp: d?.is_below_op ?? false,
```

- [ ] **Step 5: Шаблон — блок бейджей цены**

В `property-detail.component.html` заменить блок `<div class="type-chips"> … </div>` (внутри `.price-row`) на:

```html
<div class="type-chips">
  @if (vm().isReduced) {
  <span class="type-chip"> <mat-icon>trending_down</mat-icon>Reduced </span>
  } @if (vm().isBelowOp) {
  <span class="type-chip">Below OP</span>
  } @if (vm().isDistress) {
  <span class="type-chip">Срочно</span>
  } @if (vm().commissionIncluded) {
  <span class="type-chip">Комиссия включена</span>
  }
</div>
```

> Зачёркнутая прошлая цена (`price-old`) остаётся без изменений; бейдж «Снижение» заменён на «Reduced», «Торг» удалён.

- [ ] **Step 6: Тесты зелёные**

Run: `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: Линт**

Run: `npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.ts && npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.html && npm run checkFile src/app/mrsqm/types/database.ts`

- [ ] **Step 8: Commit**

```bash
git add src/app/mrsqm/components/property-detail/ src/app/mrsqm/types/database.ts
git commit -m "feat(property-detail): бейджи Reduced и Below OP у цены, убран бейдж Торг

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Деталка — Levels из floors_in_unit_id

**Files:**

- Modify: `src/app/mrsqm/types/database.ts` (`PropertyDetail`)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts` (vm)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html`
- Test: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`

**Interfaces:**

- Consumes: `PropertyDetail.floors_in_unit_id`; `FilterOptions.floors_in_unit_house`.
- Produces: `vm().floorsInUnit` резолвится из `floors_in_unit_id` по справочнику.

- [ ] **Step 1: `PropertyDetail` — floors_in_unit → floors_in_unit_id**

В `types/database.ts`, в `PropertyDetail`, заменить:

```ts
floors_in_unit: string | null;
```

на:

```ts
floors_in_unit_id: string | null;
```

- [ ] **Step 2: Тест на резолв Levels**

Добавить в `property-detail.component.spec.ts`:

```ts
it('floors_in_unit_id резолвится в label (Levels) по floors_in_unit_house', async () => {
  const { comp, supa, create } = makeComponent();
  supa.rpcResult = detail({ floors_in_unit_id: 'fiu2' });
  create.options = {
    floors_in_unit_house: [
      { id: 'fiu1', value: 'G+0', label_en: 'G+0' },
      { id: 'fiu2', value: 'G+1', label_en: 'G+1' },
    ],
  };
  await comp.loadProperty();
  expect(comp.vm().floorsInUnit).toBe('G+1');
});
```

- [ ] **Step 3: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
Expected: FAIL (vm берёт `d?.floors_in_unit` text, которого больше нет).

- [ ] **Step 4: vm — резолв по справочнику**

В `property-detail.component.ts`, в `vm`, заменить строку:

```ts
      floorsInUnit: d?.floors_in_unit ?? null,
```

на:

```ts
      floorsInUnit: this._label(d?.floors_in_unit_id, opts?.floors_in_unit_house),
```

- [ ] **Step 5: Шаблон — ярлык «Levels»**

В `property-detail.component.html`, в секции «Характеристики», заменить ярлык строки этажности дома:

```html
<span class="kv-label">Floors</span>
```

на:

```html
<span class="kv-label">Levels</span>
```

- [ ] **Step 6: Тесты зелёные**

Run: `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
Expected: PASS.

- [ ] **Step 7: Линт**

Run: `npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.ts && npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.html && npm run checkFile src/app/mrsqm/types/database.ts`

- [ ] **Step 8: Commit**

```bash
git add src/app/mrsqm/components/property-detail/ src/app/mrsqm/types/database.ts
git commit -m "feat(property-detail): Levels из floors_in_unit_id (резолв по справочнику)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Миграция БД — floors_in_unit_id (UUID) + патч get_property

**Files:**

- Create: `docs/migrations/2026-06-21-floors-in-unit-uuid.sql`

> **НЕ применять.** Только записать файл. Создатель применяет вручную после ревью.

- [ ] **Step 1: Написать миграцию**

Содержимое `docs/migrations/2026-06-21-floors-in-unit-uuid.sql`:

```sql
-- ============================================================================
-- Миграция: этажность дома text → UUID (floors_in_unit_id) + патч get_property
--
-- ПРИЧИНА: floors_in_unit хранится текстом ('G+1'); переводим на FK к
--   property_type_values(group_name='floors_in_unit_house') для консистентности
--   и будущих фильтров. Старую колонку floors_in_unit НЕ дропаем (откат).
--
-- get_property: заменяем ключ floors_in_unit → floors_in_unit_id и добавляем
--   is_reduced / is_below_op (для бейджей деталки). Патч staleness-proof:
--   читаем живое тело через pg_get_functiondef и правим regexp'ом.
-- ОБРАТИМО: см. блок ОТКАТ внизу.
-- ============================================================================

-- 1) Новая колонка (FK) ------------------------------------------------------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS floors_in_unit_id uuid REFERENCES public.property_type_values(id);

-- 2) Бэкфилл из текста (исторически только дома, значения G+x) ---------------
UPDATE public.properties p
   SET floors_in_unit_id = ptv.id
  FROM public.property_type_values ptv
 WHERE ptv.group_name = 'floors_in_unit_house'
   AND ptv.value = p.floors_in_unit
   AND p.floors_in_unit IS NOT NULL
   AND p.floors_in_unit_id IS NULL;

-- 3) Патч get_property: floors_in_unit → floors_in_unit_id + флаги ----------
DO $$
DECLARE
  def text;
BEGIN
  def := pg_get_functiondef('public.get_property(uuid, uuid)'::regprocedure);

  -- 3a) этажность: ключ и колонка
  def := regexp_replace(
    def,
    '''floors_in_unit''(\s*),(\s*)p\.floors_in_unit\b',
    '''floors_in_unit_id''\1,\2p.floors_in_unit_id',
    'g'
  );

  -- 3b) добавить флаги после is_distress (идемпотентно)
  IF position('is_below_op' in def) = 0 THEN
    def := regexp_replace(
      def,
      '(''is_distress''\s*,\s*p\.is_distress\s*,)',
      E'\\1\n      ''is_reduced'',          p.is_reduced,\n      ''is_below_op'',         p.is_below_op,',
      'g'
    );
  END IF;

  EXECUTE def;
END $$;

-- ============================================================================
-- ВЕРИФИКАЦИЯ (выполнить после применения):
--   -- бэкфилл без потерь:
--   SELECT count(*) FILTER (WHERE floors_in_unit IS NOT NULL) AS txt,
--          count(*) FILTER (WHERE floors_in_unit_id IS NOT NULL) AS uuid
--     FROM public.properties;   -- txt должно совпасть с uuid (по домам)
--   -- get_property отдаёт новые ключи:
--   SELECT (get_property('<любой property_id>'::uuid))
--          ?| array['floors_in_unit_id','is_reduced','is_below_op'];  -- t
--
-- ОТКАТ:
--   -- вернуть прежний get_property из docs/migrations/applied/2026-06-18-get-property-layer2b.sql
--   ALTER TABLE public.properties DROP COLUMN IF EXISTS floors_in_unit_id;
-- ============================================================================
```

- [ ] **Step 2: Self-review SQL**

Проверить глазами:

- сигнатура `get_property(uuid, uuid)` соответствует живой (см. `docs/migrations/applied/2026-06-18-get-property-layer2b.sql:26`);
- якоря regexp (`'floors_in_unit', p.floors_in_unit`, `'is_distress', p.is_distress,`) присутствуют в живом теле;
- блок ОТКАТ заполнен.

- [ ] **Step 3: Commit (только файл, без применения)**

```bash
git add docs/migrations/2026-06-21-floors-in-unit-uuid.sql
git commit -m "feat(db): миграция floors_in_unit→UUID + патч get_property (is_reduced/is_below_op)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Миграция БД — триггер авто-флагов is_below_op / is_reduced

**Files:**

- Create: `docs/migrations/2026-06-21-property-price-flags-trigger.sql`

> **НЕ применять.** Только записать файл. Создатель применяет вручную после ревью.

- [ ] **Step 1: Написать миграцию**

Содержимое `docs/migrations/2026-06-21-property-price-flags-trigger.sql`:

```sql
-- ============================================================================
-- Миграция: авто-флаги цены на properties
--   is_below_op — производное: original_price задан И price < original_price
--                 (на каждый INSERT/UPDATE).
--   is_reduced  — sticky: при снижении цены (UPDATE) ставим true, не сбрасываем.
--
-- Отдельная функция/триггер; существующий log_property_changes НЕ трогаем
-- (использует OLD.price напрямую → не зависит от порядка BEFORE-триггеров).
-- ОБРАТИМО: DROP внизу.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_property_price_flags()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  -- ниже Original Price (производное)
  NEW.is_below_op := (NEW.original_price IS NOT NULL AND NEW.price < NEW.original_price);

  -- sticky «когда-либо снижали»: только при UPDATE и снижении цены
  IF (TG_OP = 'UPDATE') AND (NEW.price < OLD.price) THEN
    NEW.is_reduced := true;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_property_price_flags ON public.properties;
CREATE TRIGGER trg_property_price_flags
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_property_price_flags();

-- ============================================================================
-- ВЕРИФИКАЦИЯ (после применения, на тестовом объекте владельца):
--   -- insert ниже OP → is_below_op=true; снижение цены → is_reduced=true;
--   -- рост цены назад выше OP → is_below_op=false, is_reduced остаётся true.
--
-- ОТКАТ:
--   DROP TRIGGER IF EXISTS trg_property_price_flags ON public.properties;
--   DROP FUNCTION IF EXISTS public.set_property_price_flags();
-- ============================================================================
```

- [ ] **Step 2: Self-review SQL**

Проверить: sticky-логика только на UPDATE; is_below_op считается и на INSERT, и на UPDATE; блок ОТКАТ заполнен.

- [ ] **Step 3: Commit**

```bash
git add docs/migrations/2026-06-21-property-price-flags-trigger.sql
git commit -m "feat(db): триггер авто-флагов is_below_op (производное) и is_reduced (sticky)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Финальная проверка (после всех задач)

- [ ] `npm test` — весь набор зелёный.
- [ ] Показать создателю обе миграции (Task 6, 7), получить явное «применяй». Порядок деплоя: **сначала применить миграции** (иначе INSERT с `floors_in_unit_id` и чтение новых ключей упадут), затем выкатывать фронт.
- [ ] Обновить `docs/database.md` (новые колонки/триггер/ключи get_property) и `docs/tabs.md` (форма/деталка) — по факту применения миграций.

## Карта зависимостей (что перезапускать при правках)

- Task 1 → Task 2 → Task 3: общий файл формы, строго последовательно.
- Task 4 → Task 5: общий файл деталки, последовательно.
- Task 6 даёт ключи `get_property`, которые читает Task 5 (в проде — после применения). Task 7 независим.
- `types/database.ts` трогают Tasks 1, 2, 4, 5 — только последовательно (не параллелить).
