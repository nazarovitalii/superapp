# Карточка объекта — Слой 1 (фронт-редизайн) — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать карточку объекта (right-panel) в 3 таба (Details/Comments/Metrics, Metrics — только владельцу), с блоками Agent/Location/Tech/Project/Description/Additional в формате «Поле: Значение», кнопкой избранного под фото, аккуратным no-photo блоком и центрированными кнопками действий — без изменений БД.

**Architecture:** Один standalone-компонент `PropertyDetailComponent` (signals + OnPush). Данные из уже существующего `get_property` (+ feed-item фолбэк). Поля, которых пока нет в БД (Project, slider-адрес, active-listings, `+vastu`, Layout-имя, контакт-метрика) — скрываются через `@if`, подключатся в слоях 2–4.

**Tech Stack:** Angular 18 (standalone, signals, `@if`/`@for`), Angular Material (icon/button/menu/spinner), Jasmine/Karma, Swiper (лайтбокс — не трогаем).

## Global Constraints

- Комментарии и UI-строки — на русском; видимые лейблы табов — `Details` / `Comments` / `Metrics` (англ., по спеке).
- Строгий TypeScript: без `any` (в шаблоне допускается существующий паттерн `$any($event.target)` — не расширять).
- Не мутировать сигналы/состояние — только `set`/новые объекты.
- `npm run checkFile <path>` зелёный на каждом изменённом `.ts`/`.scss` перед коммитом.
- Не рестайлить Angular Material через `.mat-*`/`.mdc-*` в локальном SCSS; использовать существующие классы/токены карточки.
- Коммиты: `feat(property-detail): …` (тип `feat`/`refactor`/`style`), без `fix(test):`.
- `property-detail.component` — НЕ hot-path ленты (рендерится 1 раз в панели), но избегать лишних геттеров в шаблоне: производные значения — через `computed`.
- Поля слоёв 2–4 рендерить только `@if (значение)` — пустые строки/блоки не показывать.

---

## Карта файлов

- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts` — типы табов, новые `computed` для vm (typeLabel, метрики), избранное (signal + toggle), инъекция `SavedPropertiesService`.
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html` — шапка табов (+Metrics owner-only), ветки табов, кнопка избранного, no-photo блок, реструктуризация блоков Details, центрированные кнопки.
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.scss` — стили табов Metrics, кнопки избранного, no-photo, Tech «label:value», центрированных кнопок.
- Modify: `src/app/mrsqm/types/database.ts` — добавить в `PropertyDetail`: `unique_views_count`, `impressions_count` (get_property их уже возвращает, в типе нет).
- Test: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts` — новые тесты + стаб `SavedPropertiesService`.

---

## Task 1: Типы табов — details/comments/metrics + Metrics только владельцу

**Files:**

- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts:77` (тип `activeTab`), `:164-166` (`setTab`)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html:15-36` (шапка табов), `:38-96` (ветки)
- Test: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`

**Interfaces:**

- Consumes: существующие `isOwner()` (`:307`), `commentsCount()` (`:94`), `activeTab` signal.
- Produces: `activeTab: WritableSignal<'details' | 'comments' | 'metrics'>`, `setTab(tab: 'details' | 'comments' | 'metrics'): void`.

- [ ] **Step 1: Написать падающий тест**

Добавить в `describe('PropertyDetailComponent', …)`:

```typescript
it('таб по умолчанию — details', () => {
  const { comp } = makeComponent();
  expect(comp.activeTab()).toBe('details');
});

it('setTab переключает на metrics', () => {
  const { comp } = makeComponent();
  comp.setTab('metrics');
  expect(comp.activeTab()).toBe('metrics');
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
Expected: FAIL — `activeTab()` равен `'info'`, не `'details'`; `setTab('metrics')` не типизируется/не работает.

- [ ] **Step 3: Минимальная реализация в .ts**

`:77` заменить:

```typescript
  readonly activeTab = signal<'details' | 'comments' | 'metrics'>('details');
```

`:164-166` заменить:

```typescript
  setTab(tab: 'details' | 'comments' | 'metrics'): void {
    this.activeTab.set(tab);
  }
```

- [ ] **Step 4: Обновить шаблон табов**

`:15-36` заменить блок `.detail-tabs` на:

```html
<!-- Табы Details / Comments / Metrics (Metrics — только владельцу) -->
<div class="detail-tabs">
  <button
    type="button"
    class="detail-tab"
    [class.is-active]="activeTab() === 'details'"
    (click)="setTab('details')"
  >
    Details
  </button>
  <button
    type="button"
    class="detail-tab"
    [class.is-active]="activeTab() === 'comments'"
    (click)="setTab('comments')"
  >
    Comments @if (commentsCount()) {
    <span class="tab-count">{{ commentsCount() }}</span>
    }
  </button>
  @if (isOwner()) {
  <button
    type="button"
    class="detail-tab"
    [class.is-active]="activeTab() === 'metrics'"
    (click)="setTab('metrics')"
  >
    Metrics
  </button>
  }
</div>
```

`:96` — ветка `@else` (контент Details) остаётся как есть (она показывается, когда не loading и не comments). Metrics-ветку добавим в Task 2; пока добавить пустой каркас перед финальным `@else`:

`:42` блок `} @else if (activeTab() === 'comments') {` оставить. Перед `} @else {` (`:96`) вставить:

```html
} @else if (activeTab() === 'metrics') {
<div class="detail-scroll metrics-tab">
  <!-- содержимое — Task 2 -->
</div>
```

- [ ] **Step 5: Запустить тесты и линт**

Run: `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts`
Expected: PASS (все, включая 2 новых).
Run: `npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.ts`
Expected: All checks passed.

- [ ] **Step 6: Коммит**

```bash
git add src/app/mrsqm/components/property-detail/property-detail.component.ts \
        src/app/mrsqm/components/property-detail/property-detail.component.html \
        src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "feat(property-detail): три таба details/comments/metrics, Metrics только владельцу"
```

---

## Task 2: Контент таба Metrics (views/unique/impressions/comments)

**Files:**

- Modify: `src/app/mrsqm/types/database.ts` (интерфейс `PropertyDetail`, после `views_count` `:369`)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts` (новый `computed metricsVm`)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html` (ветка `metrics-tab`)
- Test: `…/property-detail.component.spec.ts`

**Interfaces:**

- Consumes: `detail()` (`PropertyDetail | null`), `isOwner()`.
- Produces: `metricsVm: Signal<{ views: number; uniqueViews: number; impressions: number; comments: number; contacts: number }>`.

- [ ] **Step 1: Падающий тест**

```typescript
it('metricsVm берёт метрики из detail', async () => {
  const { comp, supa } = makeComponent();
  supa.rpcResult = detail({
    is_owner: true,
    views_count: 42,
    unique_views_count: 30,
    impressions_count: 100,
    contacts_count: 7,
    comments_count: 3,
  });
  await comp.loadProperty();
  const m = comp.metricsVm();
  expect(m.views).toBe(42);
  expect(m.uniqueViews).toBe(30);
  expect(m.impressions).toBe(100);
  expect(m.contacts).toBe(7);
  expect(m.comments).toBe(3);
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file …/property-detail.component.spec.ts`
Expected: FAIL — `comp.metricsVm` не существует; `unique_views_count`/`impressions_count`/`contacts_count` отсутствуют в типе.

- [ ] **Step 3: Дополнить тип `PropertyDetail`**

`src/app/mrsqm/types/database.ts`, после строки `views_count: number | null;` (`:369`) добавить:

```typescript
unique_views_count: number | null;
impressions_count: number | null;
```

(`contacts_count` и `comments_count` в типе уже есть — `:370-371`.)

- [ ] **Step 4: Добавить `metricsVm` в компонент**

После `commentsCount` (`:94-96`) добавить:

```typescript
  // Метрики объекта (таб Metrics, только владельцу). Источник — get_property.
  readonly metricsVm = computed(() => {
    const d = this.detail();
    return {
      views: d?.views_count ?? 0,
      uniqueViews: d?.unique_views_count ?? 0,
      impressions: d?.impressions_count ?? 0,
      contacts: d?.contacts_count ?? 0,
      comments: d?.comments_count ?? this.property().comments_count ?? 0,
    };
  });
```

- [ ] **Step 5: Заполнить ветку `metrics-tab` в шаблоне**

Заменить каркас из Task 1 на:

```html
} @else if (activeTab() === 'metrics') {
<div class="detail-scroll metrics-tab">
  <div class="metric-row">
    <span class="metric-label">Показы</span>
    <span class="metric-value">{{ metricsVm().impressions | number }}</span>
  </div>
  <div class="metric-row">
    <span class="metric-label">Просмотры</span>
    <span class="metric-value">{{ metricsVm().views | number }}</span>
  </div>
  <div class="metric-row">
    <span class="metric-label">Уникальные просмотры</span>
    <span class="metric-value">{{ metricsVm().uniqueViews | number }}</span>
  </div>
  <div class="metric-row">
    <span class="metric-label">Комментарии</span>
    <span class="metric-value">{{ metricsVm().comments | number }}</span>
  </div>
  <!-- «Ваш контакт просмотрено: N» — данные/дедуп в слое 3 -->
  <div class="metric-row metric-row--accent">
    <span class="metric-label">Ваш контакт просмотрено</span>
    <span class="metric-value">{{ metricsVm().contacts | number }}</span>
  </div>
</div>
```

- [ ] **Step 6: Тесты + линт**

Run: `npm run test:file …/property-detail.component.spec.ts` → PASS
Run: `npm run checkFile src/app/mrsqm/types/database.ts` → passed
Run: `npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.ts` → passed

- [ ] **Step 7: Коммит**

```bash
git add src/app/mrsqm/types/database.ts \
        src/app/mrsqm/components/property-detail/property-detail.component.{ts,html} \
        src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "feat(property-detail): таб Metrics — показы/просмотры/уникальные/комментарии/контакт"
```

---

## Task 3: Кнопка «Добавить в избранное» под фото

**Files:**

- Modify: `…/property-detail.component.ts` (инъекция `SavedPropertiesService`, signal `isSaved`, `toggleSaved`, загрузка состояния в `loadProperty`)
- Modify: `…/property-detail.component.html` (кнопка после галереи)
- Modify: `…/property-detail.component.scss` (стиль `.fav-btn`)
- Test: `…/property-detail.component.spec.ts` (+ стаб `SavedPropertiesService`)

**Interfaces:**

- Consumes: `SavedPropertiesService.toggle(id): Promise<boolean>`, `SavedPropertiesService.getSavedIds(): Promise<Set<string>>`.
- Produces: `isSaved: WritableSignal<boolean>`, `toggleSaved(): Promise<void>`.

- [ ] **Step 1: Добавить стаб сервиса и провайдер в спеке**

В блоке заглушек (`:13-31`) добавить:

```typescript
class FakeSaved {
  saved = new Set<string>();
  async getSavedIds(): Promise<Set<string>> {
    return this.saved;
  }
  toggleResult = true;
  toggleCalls: string[] = [];
  async toggle(id: string): Promise<boolean> {
    this.toggleCalls.push(id);
    return this.toggleResult;
  }
}
```

В `makeComponent` (`:100-120`) расширить: импортировать `SavedPropertiesService` сверху и добавить в возвращаемый объект + провайдер:

```typescript
import { SavedPropertiesService } from '../../services/saved-properties.service';
```

```typescript
const saved = new FakeSaved();
TestBed.configureTestingModule({
  imports: [PropertyDetailComponent],
  providers: [
    { provide: MrsqmSupabaseService, useValue: supa },
    { provide: PropertyPhotoService, useValue: photos },
    { provide: PropertyCreateService, useValue: create },
    { provide: SavedPropertiesService, useValue: saved },
  ],
});
const fixture = TestBed.createComponent(PropertyDetailComponent);
fixture.componentRef.setInput('property', feedItem());
return { comp: fixture.componentInstance, supa, photos, create, saved };
```

(обновить тип возвращаемого значения `makeComponent`, добавив `saved: FakeSaved`.)

- [ ] **Step 2: Падающий тест**

```typescript
it('toggleSaved дёргает сервис и переключает isSaved', async () => {
  const { comp, supa, saved } = makeComponent();
  supa.rpcResult = detail();
  await comp.loadProperty();
  expect(comp.isSaved()).toBe(false);
  saved.toggleResult = true;
  await comp.toggleSaved();
  expect(saved.toggleCalls).toEqual(['p1']);
  expect(comp.isSaved()).toBe(true);
});

it('loadProperty подхватывает существующее избранное', async () => {
  const { comp, supa, saved } = makeComponent();
  saved.saved = new Set(['p1']);
  supa.rpcResult = detail();
  await comp.loadProperty();
  expect(comp.isSaved()).toBe(true);
});
```

- [ ] **Step 3: Запустить — падает**

Run: `npm run test:file …/property-detail.component.spec.ts`
Expected: FAIL — `comp.isSaved`/`comp.toggleSaved` не существуют.

- [ ] **Step 4: Реализация в .ts**

Импорт (рядом с другими, `:33`):

```typescript
import { SavedPropertiesService } from '../../services/saved-properties.service';
```

Инъекция (после `_ownerService`, `:56`):

```typescript
  private readonly _saved = inject(SavedPropertiesService);
```

Signal (рядом с `savedIds`-аналогами, после `:82`):

```typescript
  readonly isSaved = signal(false);
```

В `loadProperty` — добавить загрузку избранного в `Promise.allSettled` (`:181-187`) четвёртым промисом:

```typescript
const [detailRes, photosRes, optsRes, savedRes] = await Promise.allSettled([
  this._supabase.rpc<PropertyDetail>('get_property', {
    p_property_id: id,
  }),
  this._photoService.getPhotos(id),
  this._createService.getFilterOptions(),
  this._saved.getSavedIds(),
]);
```

После `this.isLoading.set(false);` (перед закрытием метода, `:201`) добавить:

```typescript
if (savedRes.status === 'fulfilled') {
  this.isSaved.set(savedRes.value.has(id));
}
```

Метод (после `prevPhoto`, `:214`):

```typescript
  // Добавить/убрать текущий объект из избранного (RPC save_property).
  async toggleSaved(): Promise<void> {
    const id = this.property().id;
    try {
      const saved = await this._saved.toggle(id);
      this.isSaved.set(saved);
    } catch {
      // молча: избранное не критично, состояние не меняем
    }
  }
```

- [ ] **Step 5: Кнопка в шаблоне**

После закрытия блока галереи (`:129`, перед `<div class="detail-body">` `:131`) вставить:

```html
<!-- Кнопка избранного под фото -->
<button
  type="button"
  class="fav-btn"
  [class.is-saved]="isSaved()"
  (click)="toggleSaved()"
>
  <mat-icon>{{ isSaved() ? 'bookmark' : 'bookmark_border' }}</mat-icon>
  {{ isSaved() ? 'В избранном' : 'Добавить в избранное' }}
</button>
```

- [ ] **Step 6: Стиль `.fav-btn`**

В `…/property-detail.component.scss` добавить:

```scss
.fav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 16px 0;
  padding: 6px 14px;
  border: 1px solid var(--separator-color, rgba(0, 0, 0, 0.12));
  border-radius: 999px;
  background: transparent;
  color: var(--text-color, inherit);
  font-size: 13px;
  cursor: pointer;

  mat-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }

  &.is-saved {
    color: var(--c-primary, #1976d2);
    border-color: var(--c-primary, #1976d2);
  }
}
```

- [ ] **Step 7: Тесты + линт**

Run: `npm run test:file …/property-detail.component.spec.ts` → PASS
Run: `npm run checkFile …/property-detail.component.ts` → passed
Run: `npm run checkFile …/property-detail.component.scss` → passed

- [ ] **Step 8: Коммит**

```bash
git add src/app/mrsqm/components/property-detail/property-detail.component.{ts,html,scss} \
        src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "feat(property-detail): кнопка избранного под фото (save_property)"
```

---

## Task 4: No-photo блок — серый, 1/3 высоты, «No Photo» без иконки

**Files:**

- Modify: `…/property-detail.component.html:125-129`
- Modify: `…/property-detail.component.scss` (классы `.gallery--placeholder`)
- Test: `…/property-detail.component.spec.ts`

**Interfaces:**

- Consumes: `currentPhotoUrl()` (null при отсутствии фото).
- Produces: нет (визуальный блок).

- [ ] **Step 1: Падающий тест (DOM)**

```typescript
it('без фото показывает «No Photo» без иконки', async () => {
  const { comp, supa, photos } = makeComponent();
  supa.rpcResult = detail();
  photos.photos = [];
  const fixture = TestBed.createComponent(PropertyDetailComponent);
  fixture.componentRef.setInput('property', feedItem());
  await fixture.componentInstance.loadProperty();
  fixture.detectChanges();
  const ph: HTMLElement | null = fixture.nativeElement.querySelector(
    '.gallery--placeholder',
  );
  expect(ph).not.toBeNull();
  expect(ph!.textContent).toContain('No Photo');
  expect(ph!.querySelector('mat-icon')).toBeNull();
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file …/property-detail.component.spec.ts`
Expected: FAIL — плейсхолдер содержит `<mat-icon>apartment</mat-icon>`, нет текста «No Photo».

- [ ] **Step 3: Заменить плейсхолдер в шаблоне**

`:125-129` заменить:

```html
} @else {
<div class="gallery gallery--placeholder">
  <span class="no-photo-text">No Photo</span>
</div>
}
```

- [ ] **Step 4: Стиль — серый, 1/3 высоты**

В SCSS найти существующий `.gallery` (высота — например `height: 240px` или аналог) и для `.gallery--placeholder` переопределить:

```scss
.gallery--placeholder {
  height: 80px; // ≈ 1/3 от обычной высоты галереи (~240px)
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-lighter, #f0f0f0);

  .no-photo-text {
    color: var(--text-color-muted, #9e9e9e);
    font-size: 13px;
    letter-spacing: 0.02em;
  }
}
```

(При планировании сверить фактическую высоту `.gallery` в SCSS и поставить `height` = треть от неё.)

- [ ] **Step 5: Тесты + линт**

Run: `npm run test:file …/property-detail.component.spec.ts` → PASS
Run: `npm run checkFile …/property-detail.component.scss` → passed

- [ ] **Step 6: Коммит**

```bash
git add src/app/mrsqm/components/property-detail/property-detail.component.{html,scss} \
        src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "feat(property-detail): no-photo блок — серый, 1/3 высоты, текст No Photo без иконки"
```

---

## Task 5: Блок Tech «Поле: Значение» + Type-композиция + Project/Additional (скрытые до слоя 2)

**Files:**

- Modify: `…/property-detail.component.ts` (vm: добавить `typeLabel`, `createdLabel`, `updatedLabelFull`; уже есть occupancy/floors/etc.)
- Modify: `…/property-detail.component.html` (заменить `.specs-grid` `:251-321` на Tech-блок «label:value»; перестроить порядок блоков; Project-блок `@if` по слою 2)
- Modify: `…/property-detail.component.scss` (`.kv-row`, `.kv-label`, `.kv-value`)
- Test: `…/property-detail.component.spec.ts`

**Interfaces:**

- Consumes: `detail()`, `filterOptions()`, существующие `_label`/`_labels`.
- Produces: `vm().typeLabel: string | null`, `vm().createdLabel: string | null`, `vm().updatedLabelFull: string | null`.

- [ ] **Step 1: Падающий тест — Type-композиция**

```typescript
it('typeLabel собирает категория + тип + подтип (+ hotel pool)', async () => {
  const { comp, supa, create } = makeComponent();
  supa.rpcResult = detail({
    category_id: 'c1',
    unit_type_id: 'u1',
    sub_type_id: 's1',
    is_hotel_pool: true,
  });
  create.options = {
    categories: [{ id: 'c1', value: 'residential', label_en: 'Residential' }],
    unit_types: [{ id: 'u1', value: 'apartment', label_en: 'Apartment' }],
    sub_types: [{ id: 's1', value: 'flat', label_en: 'Flat' }],
  };
  await comp.loadProperty();
  expect(comp.vm().typeLabel).toBe('Residential Apartment - Flat (hotel apartment)');
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file …/property-detail.component.spec.ts`
Expected: FAIL — `vm().typeLabel` не определён.

- [ ] **Step 3: Добавить поля в `vm` computed**

В объект, возвращаемый `vm` (`:111-161`), добавить поля (перед закрывающей `}`):

```typescript
      typeLabel: this._composeType(
        d?.category_id,
        d?.unit_type_id,
        d?.sub_type_id,
        d?.is_hotel_pool ?? false,
        opts,
      ),
      createdLabel: this._fmtDate(d?.created_at),
      updatedLabelFull: this._fmtDate(d?.updated_at ?? d?.last_actualized_at),
```

Добавить приватные методы (рядом с `_label`, после `:401`):

```typescript
  // «Residential Apartment - Flat (hotel apartment)» из справочников.
  private _composeType(
    categoryId: string | null | undefined,
    unitTypeId: string | null | undefined,
    subTypeId: string | null | undefined,
    isHotelPool: boolean,
    opts: FilterOptions | null,
  ): string | null {
    const cat = this._label(categoryId, opts?.categories);
    const unit = this._label(unitTypeId, opts?.unit_types);
    const sub = this._label(subTypeId, opts?.sub_types);
    const head = [cat, unit].filter(Boolean).join(' ');
    let out = sub ? `${head} - ${sub}` : head;
    if (!out) return null;
    if (isHotelPool) out += ' (hotel apartment)';
    return out;
  }

  // Дата в формате DD.MM.YYYY (для Created/Updated).
  private _fmtDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
  }
```

- [ ] **Step 4: Запустить — тест Type зелёный**

Run: `npm run test:file …/property-detail.component.spec.ts`
Expected: PASS (тест typeLabel).

- [ ] **Step 5: Заменить `.specs-grid` на Tech-блок «label:value»**

`:250-321` (`<!-- 3. Параметры объекта -->` … закрытие `.specs-grid`) заменить на:

```html
<!-- ── Tech: характеристики «Поле: Значение» ─────────────────────── -->
<div class="section">
  <div class="section-label"><mat-icon>tune</mat-icon>Характеристики</div>
  <div class="kv-list">
    <div class="kv-row">
      <span class="kv-label">Deal</span>
      <span class="kv-value">{{ vm().dealType === 'sale' ? 'Sale' : 'Rent' }}</span>
    </div>
    @if (vm().typeLabel) {
    <div class="kv-row">
      <span class="kv-label">Type</span>
      <span class="kv-value">{{ vm().typeLabel }}</span>
    </div>
    } @if (vm().bedrooms !== null) {
    <div class="kv-row">
      <span class="kv-label">Bedrooms</span>
      <span class="kv-value">
        {{ vm().bedrooms }}{{ vm().isMaid ? ' + maid' : '' }}
      </span>
    </div>
    } @if (vm().bathrooms !== null) {
    <div class="kv-row">
      <span class="kv-label">Bathrooms</span>
      <span class="kv-value">{{ vm().bathrooms }}</span>
    </div>
    } @if (vm().areaSqft !== null) {
    <div class="kv-row">
      <span class="kv-label">BUA</span>
      <span class="kv-value">{{ vm().areaSqft | number: '1.0-0' }} sqft</span>
    </div>
    } @if (vm().plotSqft) {
    <div class="kv-row">
      <span class="kv-label">Plot</span>
      <span class="kv-value">{{ vm().plotSqft | number: '1.0-0' }} sqft</span>
    </div>
    } @if (vm().floorLevel) {
    <div class="kv-row">
      <span class="kv-label">Floor</span>
      <span class="kv-value">{{ vm().floorLevel }}</span>
    </div>
    } @if (vm().floorsInUnit) {
    <div class="kv-row">
      <span class="kv-label">Floors</span>
      <span class="kv-value">{{ vm().floorsInUnit }}</span>
    </div>
    } @if (vm().furnishedLabel) {
    <div class="kv-row">
      <span class="kv-label">Furnished</span>
      <span class="kv-value">{{ vm().furnishedLabel }}</span>
    </div>
    } @if (vm().occupancyLabel) {
    <div class="kv-row">
      <span class="kv-label">Occupancy</span>
      <span class="kv-value"
        >{{ vm().occupancyLabel }}{{ vm().leaseLabel ? ' · ' + vm().leaseLabel : ''
        }}</span
      >
    </div>
    } @if (vm().createdLabel) {
    <div class="kv-row">
      <span class="kv-label">Created</span>
      <span class="kv-value">{{ vm().createdLabel }}</span>
    </div>
    } @if (vm().updatedLabelFull) {
    <div class="kv-row">
      <span class="kv-label">Updated</span>
      <span class="kv-value">{{ vm().updatedLabelFull }}</span>
    </div>
    }
  </div>
</div>
```

Примечание: строки `Layout` и `+ vastu` (в Bedrooms) НЕ добавляем — нужны данные слоя 2 (имя layout, `is_vastu`).

- [ ] **Step 6: Стиль `.kv-list`**

В SCSS добавить:

```scss
.kv-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  line-height: 1.4;
}

.kv-label {
  color: var(--text-color-muted, #9e9e9e);
  flex: 0 0 auto;
}

.kv-value {
  color: var(--text-color, inherit);
  text-align: right;
}
```

- [ ] **Step 7: Тесты + линт + полный прогон компонента**

Run: `npm run test:file …/property-detail.component.spec.ts` → PASS
Run: `npm run checkFile …/property-detail.component.ts` → passed
Run: `npm run checkFile …/property-detail.component.scss` → passed

- [ ] **Step 8: Коммит**

```bash
git add src/app/mrsqm/components/property-detail/property-detail.component.{ts,html,scss} \
        src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "feat(property-detail): Tech-блок Поле:Значение + композиция Type (категория/тип/подтип)"
```

---

## Task 6: Центрированные кнопки действий вне блоков

**Files:**

- Modify: `…/property-detail.component.html` (перенести `.owner-actions` `:165-248` из верха `.detail-body` вниз, после блока Описание/Additional)
- Modify: `…/property-detail.component.scss` (`.owner-buttons` — центрирование)
- Test: `…/property-detail.component.spec.ts` (DOM: кнопки присутствуют при is_owner)

**Interfaces:**

- Consumes: `isOwner()`, существующие `startEdit/actualize/archive` и edit-форма.
- Produces: нет (визуальная перестановка, логика без изменений).

- [ ] **Step 1: Падающий тест (DOM)**

```typescript
it('кнопки действий показываются владельцу', async () => {
  const { supa } = makeComponent();
  supa.rpcResult = detail({ is_owner: true });
  const fixture = TestBed.createComponent(PropertyDetailComponent);
  fixture.componentRef.setInput('property', feedItem());
  await fixture.componentInstance.loadProperty();
  fixture.detectChanges();
  const actions = fixture.nativeElement.querySelector('.owner-actions');
  expect(actions).not.toBeNull();
  expect(actions.textContent).toContain('Редактировать');
});
```

(Этот тест проходит и до перестановки — он страхует, что перенос блока не сломал рендер для владельца. Если у `makeComponent` уже есть `SavedPropertiesService`-провайдер из Task 3 — повторно создавать fixture можно тем же способом.)

- [ ] **Step 2: Запустить — должен пройти на текущей разметке**

Run: `npm run test:file …/property-detail.component.spec.ts`
Expected: PASS (страховочный тест). Если FAIL — разобраться до перестановки.

- [ ] **Step 3: Перенести `.owner-actions` вниз**

Вырезать блок `@if (isOwner()) { <div class="owner-actions">…</div> }` (`:165-248`) из текущего места (сразу после `.price-row`) и вставить в конец `.detail-body`, после блока статистики (`:471`) / перед закрытием `</div>` `.detail-body` `:472`.

- [ ] **Step 4: Центрирование в SCSS**

Найти существующий `.owner-buttons` и привести к центрированной строке вне «блока»:

```scss
.owner-actions {
  margin: 16px 0 8px;
}

.owner-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.owner-edit-buttons {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.owner-msg {
  text-align: center;
  margin-top: 8px;
}
```

(Если в SCSS уже есть `.owner-buttons` — заменить его правила на приведённые, не дублировать селектор.)

- [ ] **Step 5: Тесты + линт + полный прогон**

Run: `npm run test:file …/property-detail.component.spec.ts` → PASS
Run: `npm run checkFile …/property-detail.component.scss` → passed
Run: `npm test` (или хотя бы прогон спеки компонента) → зелёно

- [ ] **Step 6: Коммит**

```bash
git add src/app/mrsqm/components/property-detail/property-detail.component.{html,scss} \
        src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "refactor(property-detail): кнопки действий вынесены вниз и центрированы"
```

---

## Task 7: Слияние фото + Floor Plan (верификация + порядок)

**Files:**

- Verify: где живут floor-plan фото (см. открытый пункт спеки).
- Возможно Modify: `src/app/mrsqm/services/property-photo.service.ts` (сортировка), либо ничего.

**Interfaces:**

- Consumes: `PropertyPhotoService.getPhotos`.
- Produces: фото-лента включает floor-plan, упорядоченные после обычных.

- [ ] **Step 1: Проверить источник floor-plan**

Run (через supabase-db скилл / PostgREST, чтение разрешено):

- значения CHECK `property_photos_photo_type_check` (какие `photo_type` бывают);
- есть ли строки с `photo_type` ≠ `'gallery'` у реальных объектов;
- лежат ли floor-plan в `location_developers.media`.

- [ ] **Step 2: Решение по результату**

- **Если floor-plan уже в `property_photos`** (`getPhotos` тянет все типы): добавить вторичную сортировку — обычные фото (`photo_type='gallery'`) первыми, floor-plan после. В `property-photo.service.ts:getPhotos` после получения данных отсортировать стабильно:

```typescript
const list = (data as PropertyPhoto[]) ?? [];
return list.sort((a, b) => {
  const fa = a.photo_type === 'floor_plan' ? 1 : 0;
  const fb = b.photo_type === 'floor_plan' ? 1 : 0;
  return fa - fb || a.order_index - b.order_index;
});
```

(добавить тест в `property-photo.service.spec.ts`, если он есть, либо в спеку компонента: floor-plan уходит в конец массива.)

- **Если floor-plan в `location_developers.media`**: вынести в слой 2 (нужен JOIN/доп. источник в данных) — здесь только зафиксировать вывод в спеке, код не трогать.

- [ ] **Step 3: Коммит (если был код)**

```bash
git add src/app/mrsqm/services/property-photo.service.ts \
        src/app/mrsqm/services/property-photo.service.spec.ts
git commit -m "feat(property-detail): floor-plan фото в общей ленте, упорядочены после обычных"
```

---

## Финал слоя 1

- [ ] Полный прогон: `npm test` — зелёно.
- [ ] Сборка: `npm run buildFrontend:prodWeb` — без ошибок.
- [ ] Доки: обновить `docs/tabs.md` (карточка: 3 таба, блоки, no-photo, избранное), `docs/TODO.md` (WP-G слой 1 → прогресс), `docs/database.md` (если правился тип/контракт — здесь нет).
- [ ] Деплой — по скиллу `/deploy` (один пуш, TG-summary), с разрешения пользователя.

---

## Self-review (покрытие спеки слоем 1)

- 3 таба + Metrics owner-only → Task 1, 2 ✅
- Кнопка избранного под фото → Task 3 ✅
- No-photo блок (серый, 1/3, «No Photo», без иконки) → Task 4 ✅
- Tech «Поле: Значение» + Type-композиция → Task 5 ✅
- Кнопки действий центрированы вне блоков → Task 6 ✅
- Слияние фото + Floor Plan → Task 7 (верификация) ✅
- Блоки Project / slider-адрес / active-listings / `+vastu` / Layout-имя / контакт-метрика → **намеренно вне слоя 1** (скрыты `@if`), реализуются в слоях 2–4 ✅
- Блок Agent (фото/имя/агентство/WhatsApp) — уже есть в текущем шаблоне (`:396-455`), в слое 1 не ломаем; «активных листингов» добавится в слое 2.
