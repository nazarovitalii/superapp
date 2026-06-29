# BELL-1 — Live-уведомления (колокольчик) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Браузер держит WebSocket к notifier; на `bell.changed` (и на poll/focus/reconnect) superApp перечитывает истину по REST в один реактивный стор, и все счётчик-поверхности (колокол, дропдаун, сайдбар-бейджи) обновляются разом; на новое уведомление — toast + простой звук.

**Architecture:** Узкие роли, всё в `src/app/mrsqm/`. `NotifierSocketService` (только WS) → `NotifierStore` (единственный источник счётчиков + триггеры refresh + side-effects toast/звук) → `mrsqm-bell-button` (иконка в хедере) → `mrsqm-bell-dropdown` (top-layer `<dialog>`). Счётчики НИКОГДА не считаются на фронте — только из стора, наполняемого бэком.

**Tech Stack:** Angular standalone-компоненты, Angular signals, RxJS `Subject` (только для событий сокета), `@supabase/supabase-js` (RPC), нативный `WebSocket`, `WebAudio` (звук), `SnackService` (toast), нативный `<dialog>.showModal()` (top-layer).

## Global Constraints

Каждая задача неявно включает этот раздел. Значения скопированы из спеки/брифа (ред.5) дословно.

- **Инвариант №1:** счётчики никогда не считаются/не инкрементятся на фронте — только из стора, который наполняет бэк. ❌ Никакого `count++`.
- **Рамка №0 — два независимых сигнала:** 🔔 уведомления = `get_bell().bell_unseen` (бейдж колокола) + `get_bell().items[].unseen` (оранжевая полоса строки), гаснут при **закрытии** колокола (`mark_bell_seen`). 🏠 объекты = `get_saved_filters().unseen_count` (бейдж фильтра), гаснет при **открытии объекта** (`mark_filter_seen`). ❌ Не связывать: закрытие колокола НЕ трогает `unseen_count`; открытие объекта НЕ трогает `bell_unseen`/полосы.
- **Контракт полей `get_bell()`** (см. бриф §1B, прил. B): `bell_unseen:int` (cap «99+», LEAST 100), `items[]` дедуп по `property_id`, новые сверху, `LIMIT ~20`. Item: `property_id uuid`, `filter_id uuid`, `match_type 'new'|'price_drop'`, `matched_at timestamptz`, `unseen bool`, `price`, `previous_price`, `price_currency`, `deal_type`, `bedrooms int`, `unit_type_id uuid`, `location_label`, `community_label`, `thumb_url`. `title` бэк НЕ отдаёт — фронт собирает. `thumb_url` UI v1 НЕ рендерит.
- **`get_saved_filters` в нашем коде** возвращает `{ results: SavedFilter[] }` через `SavedFilterService.list()`. Поля: `id` (= контрактный `filter_id`), `auto_name` (= контрактный `name`), `unseen_count`, `filters` (payload). Используем существующий `SavedFilter` тип и `SavedFilterService.list()` — НЕ дублировать RPC.
- **WS-хендшейк (прил. A контракта):** `new WebSocket(url, [accessToken])` (JWT в `Sec-WebSocket-Protocol`). ❌ НЕ класть JWT в query `?token=`. На каждый (ре)коннект — свежий токен из `supabase.client.auth.getSession()`. Backoff + jitter. На каждый `open` → `refresh()`.
- **Сокет — подсказка, не данные:** payload не парсим в данные (`data:{}`), читаем только `type === 'bell.changed'`. UI всегда из REST.
- **Тумблер живости** (`localStorage` ключ `mrsqm.bellLive`, default ON): ON → сокет + toast + звук + poll + focus. OFF → нет сокета/тостов/звука, но счётчики живые через poll(60с) + focus.
- **Privacy:** показывать только `location_label`/`community_label`, ❌ никогда сырой `locations.name`.
- **Стиль:** темы/токены Super Productivity, UI-строки и комментарии на русском (но текст уведомлений по дизайну английский: `Notifications`, `New match`, `Mark all read` и т.д. — копируем дословно из спеки §5/§2B). Strict TS, без `any`. Сигналы вместо Observable (кроме событий сокета). `takeUntilDestroyed()`/async для подписок.
- **checkFile:** после КАЖДОГО изменённого `.ts`/`.scss`/`.html`/`.spec.ts` → `npm run checkFile <path>` (включая `.html` компонентов!).
- **Деплой:** все коммиты — ОДНИМ `git push` (CI `cancel-in-progress: true`). Перед пушем — локальный прод-билд `npm run buildFrontend:prodWeb`. После пуша — TG-summary.
- **top-layer `<dialog>`:** дропдаун — нативный `<dialog>.showModal()` (иначе `will-change:transform` правой панели запирает `position:fixed`). Паттерн — `property-detail` lightbox (`.lightbox-overlay` + `&::backdrop`).

---

## Файловая структура

**Создаём:**
- `src/app/mrsqm/types/notifier.ts` — `BellItem`, `BellResponse`, `BellRow`, `BellRowPreview`.
- `src/app/mrsqm/util/bell-live-pref.ts` (+ `.spec.ts`) — чтение/запись тумблера в `localStorage`.
- `src/app/mrsqm/util/property-title.ts` (+ `.spec.ts`) — чистая `buildPropertyTitle(bedrooms, typeLabel)`.
- `src/app/mrsqm/util/bell-price.ts` (+ `.spec.ts`) — форматирование цены строки (`AED 2,100,000` / `AED 2.1M (was 2.3M)`).
- `src/app/mrsqm/util/bell-rows.ts` (+ `.spec.ts`) — чистый `buildBellRows(filters, items, getTitle)` (гейт/сорт/превью-fallback/полоса).
- `src/app/mrsqm/util/notification-chime.ts` (+ `.spec.ts`) — простой WebAudio-«дзинь».
- `src/app/mrsqm/services/unit-type-label.service.ts` (+ `.spec.ts`) — резолв `unit_type_id`/`sub_type_id` → label (кэш поверх `getFilterOptions`).
- `src/app/mrsqm/services/notifier-socket.service.ts` (+ `.spec.ts`) — WS-клиент.
- `src/app/mrsqm/services/notifier-store.service.ts` (+ `.spec.ts`) — реактивный стор.
- `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.{ts,html,scss,spec.ts}`.
- `src/app/mrsqm/components/bell-button/bell-button.component.{ts,html,scss,spec.ts}`.

**Меняем:**
- `src/environments/environment.ts` (+ `environment.prod.ts` и др. варианты) — добавить `notifierWsUrl`.
- `src/app/core-ui/main-header/desktop-panel-buttons/desktop-panel-buttons.component.ts` — вставить `<mrsqm-bell-button>` справа от AI-кнопки.

**НЕ трогаем** (по решению — сохранить рабочее RT-4): `saved-filter.service.ts` (`reloadTick`/`bumpReload` остаются; стор их бампает), `feed-page.component.ts`, `feed-filter-panel.component.ts`. Сайдбар-бейджи живут как сейчас, стор делает их живее через `bumpReload()`.

---

## Task 1: Notifier-типы + тумблер живости

**Files:**
- Create: `src/app/mrsqm/types/notifier.ts`
- Create: `src/app/mrsqm/util/bell-live-pref.ts`
- Test: `src/app/mrsqm/util/bell-live-pref.spec.ts`

**Interfaces:**
- Produces: типы `BellItem`, `BellResponse`, `BellRow`, `BellRowPreview` (см. код). Функции `isBellLiveOn(): boolean`, `setBellLive(on: boolean): void`, константа `BELL_LIVE_KEY = 'mrsqm.bellLive'`.

- [ ] **Step 1: Создать типы**

`src/app/mrsqm/types/notifier.ts`:
```ts
// Контракт ответа RPC get_bell() — realtime отдаёт, фронт только рендерит.
// Поля сверены с brief §1B / прил. B. title бэк НЕ отдаёт (собираем хелпером);
// thumb_url есть, но UI v1 НЕ рендерит.
export type BellMatchType = 'new' | 'price_drop';

export interface BellItem {
  property_id: string;
  filter_id: string;
  match_type: BellMatchType;
  matched_at: string; // ISO-8601
  unseen: boolean; // 🟠 уведомление не просмотрено (bell-курсор)
  price: number | null;
  previous_price: number | null;
  price_currency: string | null;
  deal_type: string | null; // 'sale' | 'rent'
  bedrooms: number | null;
  unit_type_id: string | null;
  location_label: string | null;
  community_label: string | null;
  thumb_url: string | null;
}

export interface BellResponse {
  bell_unseen: number;
  items: BellItem[];
}

// Превью свежего объекта в строке дропдауна (null → fallback «{N} new — tap to view»).
export interface BellRowPreview {
  propertyId: string;
  matchType: BellMatchType;
  title: string; // «2BR Apartment»
  location: string; // location_label/community_label
  priceText: string; // «AED 2,100,000» | «AED 2.1M (was 2.3M)»
}

// Строка дропдауна = один сохранённый фильтр с непросмотренными объектами.
export interface BellRow {
  filterId: string;
  name: string; // SavedFilter.auto_name ?? 'Filter'
  unseenCount: number; // 🏠 объекты (бейдж справа)
  hasUnseenNotification: boolean; // 🟠 любой item фильтра с unseen=true → оранжевая полоса
  freshestMatchedAtMs: number; // для сортировки; 0 если превью нет
  preview: BellRowPreview | null;
}
```

- [ ] **Step 2: Написать падающий тест тумблера**

`src/app/mrsqm/util/bell-live-pref.spec.ts`:
```ts
import { BELL_LIVE_KEY, isBellLiveOn, setBellLive } from './bell-live-pref';

describe('bell-live-pref', () => {
  beforeEach(() => localStorage.removeItem(BELL_LIVE_KEY));

  it('default ON, когда ключа нет', () => {
    expect(isBellLiveOn()).toBe(true);
  });

  it('setBellLive(false) → isBellLiveOn() === false', () => {
    setBellLive(false);
    expect(isBellLiveOn()).toBe(false);
    expect(localStorage.getItem(BELL_LIVE_KEY)).toBe('off');
  });

  it('setBellLive(true) → isBellLiveOn() === true', () => {
    setBellLive(false);
    setBellLive(true);
    expect(isBellLiveOn()).toBe(true);
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `npm run test:file src/app/mrsqm/util/bell-live-pref.spec.ts`
Expected: FAIL — `bell-live-pref` not found.

- [ ] **Step 4: Реализовать тумблер**

`src/app/mrsqm/util/bell-live-pref.ts`:
```ts
// Тумблер живости (localStorage). default ON. OFF хранится как 'off'.
export const BELL_LIVE_KEY = 'mrsqm.bellLive';

export function isBellLiveOn(): boolean {
  try {
    return localStorage.getItem(BELL_LIVE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setBellLive(on: boolean): void {
  try {
    localStorage.setItem(BELL_LIVE_KEY, on ? 'on' : 'off');
  } catch {
    // приватный режим / квота — тумблер просто не запомнится
  }
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm run test:file src/app/mrsqm/util/bell-live-pref.spec.ts`
Expected: PASS (3 теста).

- [ ] **Step 6: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/types/notifier.ts
npm run checkFile src/app/mrsqm/util/bell-live-pref.ts
npm run checkFile src/app/mrsqm/util/bell-live-pref.spec.ts
git add src/app/mrsqm/types/notifier.ts src/app/mrsqm/util/bell-live-pref.ts src/app/mrsqm/util/bell-live-pref.spec.ts
git commit -m "feat(mrsqm): BELL-1 notifier-типы + тумблер живости"
```

---

## Task 2: Заголовок объекта + резолв типа

**Files:**
- Create: `src/app/mrsqm/util/property-title.ts`
- Test: `src/app/mrsqm/util/property-title.spec.ts`
- Create: `src/app/mrsqm/services/unit-type-label.service.ts`
- Test: `src/app/mrsqm/services/unit-type-label.service.spec.ts`

**Interfaces:**
- Consumes: `PropertyCreateService.getFilterOptions(): Promise<FilterOptions>` (поля `unit_types`/`sub_types`: `FilterOptionId{ id, label_en, value }`).
- Produces: `buildPropertyTitle(bedrooms: number | null, typeLabel: string | null): string`; `UnitTypeLabelService.getLabel(unitTypeId: string | null, subTypeId?: string | null): Promise<string | null>`.

- [ ] **Step 1: Падающий тест заголовка**

`src/app/mrsqm/util/property-title.spec.ts`:
```ts
import { buildPropertyTitle } from './property-title';

describe('buildPropertyTitle', () => {
  it('беды + тип → «2BR Apartment»', () => {
    expect(buildPropertyTitle(2, 'Apartment')).toBe('2BR Apartment');
  });
  it('только тип (беды null) → «Villa»', () => {
    expect(buildPropertyTitle(null, 'Villa')).toBe('Villa');
  });
  it('0 беды (студия) + тип → «Studio Apartment»', () => {
    expect(buildPropertyTitle(0, 'Apartment')).toBe('Studio Apartment');
  });
  it('только беды (тип null) → «2BR»', () => {
    expect(buildPropertyTitle(2, null)).toBe('2BR');
  });
  it('ничего → пустая строка', () => {
    expect(buildPropertyTitle(null, null)).toBe('');
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/util/property-title.spec.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать заголовок**

`src/app/mrsqm/util/property-title.ts`:
```ts
// Сборка заголовка объекта для колокольчика: «{bedrooms}BR {тип}».
// title бэк НЕ отдаёт (brief §1B). 0 спален = Studio.
export function buildPropertyTitle(
  bedrooms: number | null,
  typeLabel: string | null,
): string {
  const bedPart =
    bedrooms === null || bedrooms === undefined
      ? ''
      : bedrooms === 0
        ? 'Studio'
        : `${bedrooms}BR`;
  const parts = [bedPart, (typeLabel ?? '').trim()].filter((p) => p.length > 0);
  return parts.join(' ');
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/util/property-title.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Падающий тест резолва типа**

`src/app/mrsqm/services/unit-type-label.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { UnitTypeLabelService } from './unit-type-label.service';
import { PropertyCreateService } from './property-create.service';

describe('UnitTypeLabelService', () => {
  let svc: UnitTypeLabelService;
  let getFilterOptions: jasmine.Spy;

  beforeEach(() => {
    getFilterOptions = jasmine.createSpy('getFilterOptions').and.resolveTo({
      unit_types: [{ id: 'ut-1', label_en: 'Apartment', value: 'apartment' }],
      sub_types: [{ id: 'st-1', label_en: 'Penthouse', value: 'penthouse' }],
    });
    TestBed.configureTestingModule({
      providers: [
        UnitTypeLabelService,
        { provide: PropertyCreateService, useValue: { getFilterOptions } },
      ],
    });
    svc = TestBed.inject(UnitTypeLabelService);
  });

  it('резолвит unit_type_id → label_en', async () => {
    expect(await svc.getLabel('ut-1')).toBe('Apartment');
  });

  it('sub_type_id приоритетнее unit_type_id', async () => {
    expect(await svc.getLabel('ut-1', 'st-1')).toBe('Penthouse');
  });

  it('неизвестный id → null', async () => {
    expect(await svc.getLabel('nope')).toBeNull();
  });

  it('кэширует — getFilterOptions зовётся один раз на два вызова', async () => {
    await svc.getLabel('ut-1');
    await svc.getLabel('ut-1');
    expect(getFilterOptions).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/services/unit-type-label.service.spec.ts`
Expected: FAIL — сервис не найден.

- [ ] **Step 7: Реализовать сервис**

`src/app/mrsqm/services/unit-type-label.service.ts`:
```ts
import { inject, Injectable } from '@angular/core';
import { PropertyCreateService } from './property-create.service';

// Резолв uuid типа/подтипа → человекочитаемый label из get_filter_options.
// Тот же справочник, что использует лента (property-card). Кэш-Map поверх уже
// кэшированного getFilterOptions — повторный RPC не дёргается.
@Injectable({ providedIn: 'root' })
export class UnitTypeLabelService {
  private readonly _createService = inject(PropertyCreateService);
  private _labels: Map<string, string> | null = null;

  async getLabel(
    unitTypeId: string | null,
    subTypeId?: string | null,
  ): Promise<string | null> {
    const map = await this._ensureLabels();
    return (
      (subTypeId && map.get(subTypeId)) || (unitTypeId && map.get(unitTypeId)) || null
    );
  }

  private async _ensureLabels(): Promise<Map<string, string>> {
    if (this._labels) {
      return this._labels;
    }
    const map = new Map<string, string>();
    try {
      const opts = await this._createService.getFilterOptions();
      for (const u of opts.unit_types) map.set(u.id, u.label_en);
      for (const s of opts.sub_types) map.set(s.id, s.label_en);
    } catch {
      // справочник недоступен — заголовок останется без типа, не критично
    }
    this._labels = map;
    return map;
  }
}
```

- [ ] **Step 8: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/services/unit-type-label.service.spec.ts`
Expected: PASS (4 теста).

- [ ] **Step 9: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/util/property-title.ts
npm run checkFile src/app/mrsqm/util/property-title.spec.ts
npm run checkFile src/app/mrsqm/services/unit-type-label.service.ts
npm run checkFile src/app/mrsqm/services/unit-type-label.service.spec.ts
git add src/app/mrsqm/util/property-title.ts src/app/mrsqm/util/property-title.spec.ts src/app/mrsqm/services/unit-type-label.service.ts src/app/mrsqm/services/unit-type-label.service.spec.ts
git commit -m "feat(mrsqm): BELL-1 заголовок объекта + резолв типа"
```

---

## Task 3: Форматирование цены + строки дропдауна (чистые билдеры)

**Files:**
- Create: `src/app/mrsqm/util/bell-price.ts`
- Test: `src/app/mrsqm/util/bell-price.spec.ts`
- Create: `src/app/mrsqm/util/bell-rows.ts`
- Test: `src/app/mrsqm/util/bell-rows.spec.ts`

**Interfaces:**
- Consumes: `BellItem`, `BellRow`, `BellRowPreview` (Task 1); `SavedFilter` из `feed-filter.service`.
- Produces: `formatBellPrice(item: BellItem): string`; `buildBellRows(filters: SavedFilter[], items: BellItem[], getTitle: (item: BellItem) => string): BellRow[]`.

- [ ] **Step 1: Падающий тест цены**

`src/app/mrsqm/util/bell-price.spec.ts`:
```ts
import { formatBellPrice } from './bell-price';
import { BellItem } from '../types/notifier';

const base: BellItem = {
  property_id: 'p1', filter_id: 'f1', match_type: 'new', matched_at: '2026-06-29T08:00:00Z',
  unseen: true, price: 2100000, previous_price: null, price_currency: 'AED',
  deal_type: 'sale', bedrooms: 2, unit_type_id: 'ut1',
  location_label: 'Dubai Marina', community_label: null, thumb_url: null,
};

describe('formatBellPrice', () => {
  it('new → полная цена с разделителями', () => {
    expect(formatBellPrice(base)).toBe('AED 2,100,000');
  });
  it('price_drop → компактно «(was …)»', () => {
    expect(
      formatBellPrice({ ...base, match_type: 'price_drop', price: 2100000, previous_price: 2300000 }),
    ).toBe('AED 2.1M (was 2.3M)');
  });
  it('price_drop без previous_price → как new', () => {
    expect(formatBellPrice({ ...base, match_type: 'price_drop', previous_price: null })).toBe(
      'AED 2,100,000',
    );
  });
  it('валюта по умолчанию AED, если null', () => {
    expect(formatBellPrice({ ...base, price_currency: null })).toBe('AED 2,100,000');
  });
  it('цена null → пустая строка', () => {
    expect(formatBellPrice({ ...base, price: null })).toBe('');
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/util/bell-price.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать цену**

`src/app/mrsqm/util/bell-price.ts`:
```ts
import { BellItem } from '../types/notifier';

// Компактная сумма: 2_100_000 → «2.1M», 950_000 → «950K», 2_000_000 → «2M».
function compact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(n);
}

// Цена строки дропдауна. new → полная «AED 2,100,000»;
// price_drop с previous → «AED 2.1M (was 2.3M)» (brief §2B(1)).
export function formatBellPrice(item: BellItem): string {
  if (item.price === null || item.price === undefined) {
    return '';
  }
  const cur = item.price_currency ?? 'AED';
  if (item.match_type === 'price_drop' && item.previous_price) {
    return `${cur} ${compact(item.price)} (was ${compact(item.previous_price)})`;
  }
  return `${cur} ${item.price.toLocaleString('en-US')}`;
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/util/bell-price.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Падающий тест строк дропдауна**

`src/app/mrsqm/util/bell-rows.spec.ts`:
```ts
import { buildBellRows } from './bell-rows';
import { BellItem } from '../types/notifier';
import { SavedFilter } from '../services/feed-filter.service';

function filter(id: string, name: string, unseen_count: number): SavedFilter {
  return {
    id, auto_name: name, unseen_count,
    filters: {} as SavedFilter['filters'], notification_type: null, created_at: '2026-01-01',
  };
}
function item(filter_id: string, matched_at: string, unseen: boolean): BellItem {
  return {
    property_id: 'p-' + matched_at, filter_id, match_type: 'new', matched_at, unseen,
    price: 2100000, previous_price: null, price_currency: 'AED', deal_type: 'sale',
    bedrooms: 2, unit_type_id: 'ut1', location_label: 'Marina', community_label: null, thumb_url: null,
  };
}
const title = (): string => '2BR Apartment';

describe('buildBellRows', () => {
  it('гейт: фильтры с unseen_count=0 не попадают в строки', () => {
    const rows = buildBellRows([filter('f1', 'A', 0), filter('f2', 'B', 3)], [], title);
    expect(rows.map((r) => r.filterId)).toEqual(['f2']);
  });

  it('превью = свежайший item фильтра (max matched_at)', () => {
    const rows = buildBellRows(
      [filter('f1', 'A', 2)],
      [item('f1', '2026-06-29T07:00:00Z', false), item('f1', '2026-06-29T09:00:00Z', true)],
      title,
    );
    expect(rows[0].preview?.propertyId).toBe('p-2026-06-29T09:00:00Z');
    expect(rows[0].preview?.title).toBe('2BR Apartment');
    expect(rows[0].preview?.priceText).toBe('AED 2,100,000');
  });

  it('hasUnseenNotification = любой item фильтра с unseen=true', () => {
    const rows = buildBellRows(
      [filter('f1', 'A', 2), filter('f2', 'B', 2)],
      [item('f1', '2026-06-29T07:00:00Z', false), item('f2', '2026-06-29T08:00:00Z', true)],
      title,
    );
    expect(rows.find((r) => r.filterId === 'f1')?.hasUnseenNotification).toBe(false);
    expect(rows.find((r) => r.filterId === 'f2')?.hasUnseenNotification).toBe(true);
  });

  it('бэклог без item в head → preview=null (fallback)', () => {
    const rows = buildBellRows([filter('f1', 'A', 5)], [], title);
    expect(rows[0].preview).toBeNull();
    expect(rows[0].unseenCount).toBe(5);
  });

  it('сортировка по свежему matched_at desc; строки без превью в конце', () => {
    const rows = buildBellRows(
      [filter('f1', 'A', 1), filter('f2', 'B', 1), filter('f3', 'C', 1)],
      [item('f1', '2026-06-29T07:00:00Z', true), item('f2', '2026-06-29T09:00:00Z', true)],
      title,
    );
    expect(rows.map((r) => r.filterId)).toEqual(['f2', 'f1', 'f3']);
  });

  it('имя = auto_name ?? «Filter»', () => {
    const rows = buildBellRows([{ ...filter('f1', '', 1), auto_name: null }], [], title);
    expect(rows[0].name).toBe('Filter');
  });
});
```

- [ ] **Step 6: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/util/bell-rows.spec.ts`
Expected: FAIL.

- [ ] **Step 7: Реализовать билдер строк**

`src/app/mrsqm/util/bell-rows.ts`:
```ts
import { BellItem, BellRow } from '../types/notifier';
import { SavedFilter } from '../services/feed-filter.service';
import { formatBellPrice } from './bell-price';

// Чистая сборка строк дропдауна (spec §5, brief §2B(1)).
// Гейт: только фильтры с unseen_count>0. Превью: свежайший item фильтра из head get_bell;
// нет → null (template покажет fallback «{N} new — tap to view»). Полоса: любой item.unseen.
// Сортировка: по свежему matched_at desc; строки без превью — в конце.
export function buildBellRows(
  filters: SavedFilter[],
  items: BellItem[],
  getTitle: (item: BellItem) => string,
): BellRow[] {
  const byFilter = new Map<string, BellItem[]>();
  for (const it of items) {
    const arr = byFilter.get(it.filter_id);
    if (arr) arr.push(it);
    else byFilter.set(it.filter_id, [it]);
  }

  const rows: BellRow[] = [];
  for (const f of filters) {
    if (!(f.unseen_count > 0)) continue;
    const fItems = byFilter.get(f.id) ?? [];
    const freshest = fItems.reduce<BellItem | null>(
      (best, it) =>
        !best || Date.parse(it.matched_at) > Date.parse(best.matched_at) ? it : best,
      null,
    );
    rows.push({
      filterId: f.id,
      name: f.auto_name && f.auto_name.trim() ? f.auto_name : 'Filter',
      unseenCount: f.unseen_count,
      hasUnseenNotification: fItems.some((it) => it.unseen),
      freshestMatchedAtMs: freshest ? Date.parse(freshest.matched_at) : 0,
      preview: freshest
        ? {
            propertyId: freshest.property_id,
            matchType: freshest.match_type,
            title: getTitle(freshest),
            location: freshest.location_label ?? freshest.community_label ?? '',
            priceText: formatBellPrice(freshest),
          }
        : null,
    });
  }

  return rows.sort((a, b) => b.freshestMatchedAtMs - a.freshestMatchedAtMs);
}
```

- [ ] **Step 8: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/util/bell-rows.spec.ts`
Expected: PASS (6 тестов).

- [ ] **Step 9: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/util/bell-price.ts
npm run checkFile src/app/mrsqm/util/bell-price.spec.ts
npm run checkFile src/app/mrsqm/util/bell-rows.ts
npm run checkFile src/app/mrsqm/util/bell-rows.spec.ts
git add src/app/mrsqm/util/bell-price.ts src/app/mrsqm/util/bell-price.spec.ts src/app/mrsqm/util/bell-rows.ts src/app/mrsqm/util/bell-rows.spec.ts
git commit -m "feat(mrsqm): BELL-1 формат цены + билдер строк дропдауна"
```

---

## Task 4: Звук уведомления (WebAudio-дзинь)

**Files:**
- Create: `src/app/mrsqm/util/notification-chime.ts`
- Test: `src/app/mrsqm/util/notification-chime.spec.ts`

**Interfaces:**
- Produces: `playNotificationChime(): void` — короткий двухтоновый «дзинь» через WebAudio, без ассетов. Тихо глотает ошибки (нет AudioContext / autoplay-политика до первого клика).

- [ ] **Step 1: Падающий тест**

`src/app/mrsqm/util/notification-chime.spec.ts`:
```ts
import { playNotificationChime } from './notification-chime';

describe('playNotificationChime', () => {
  it('создаёт осциллятор и стартует его', () => {
    const osc = {
      connect: jasmine.createSpy('connect'),
      start: jasmine.createSpy('start'),
      stop: jasmine.createSpy('stop'),
      frequency: { setValueAtTime: jasmine.createSpy() },
      type: '',
    };
    const gain = {
      connect: jasmine.createSpy('connect'),
      gain: {
        setValueAtTime: jasmine.createSpy(),
        exponentialRampToValueAtTime: jasmine.createSpy(),
      },
    };
    const ctx = {
      createOscillator: jasmine.createSpy().and.returnValue(osc),
      createGain: jasmine.createSpy().and.returnValue(gain),
      destination: {},
      currentTime: 0,
    };
    const spy = jasmine
      .createSpy('AudioContext')
      .and.returnValue(ctx) as unknown as typeof AudioContext;
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = spy;

    playNotificationChime();

    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalled();
  });

  it('не кидает, если AudioContext недоступен', () => {
    (window as unknown as { AudioContext: unknown }).AudioContext =
      undefined as unknown as typeof AudioContext;
    expect(() => playNotificationChime()).not.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/util/notification-chime.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать звук**

`src/app/mrsqm/util/notification-chime.ts`:
```ts
// Простой звук «пришло уведомление» — короткий двухтоновый дзинь через WebAudio.
// Без ассетов и сети. Молча глотает ошибки (нет AudioContext / autoplay-политика
// браузера до первого пользовательского взаимодействия).
export function playNotificationChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Два коротких тона (G5 → C6) — мягкий «динь-динь».
    const tone = (freq: number, start: number, dur: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };
    tone(784, 0, 0.18);
    tone(1047, 0.12, 0.22);
  } catch {
    // звук опционален — любая ошибка не должна влиять на уведомления
  }
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/util/notification-chime.spec.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/util/notification-chime.ts
npm run checkFile src/app/mrsqm/util/notification-chime.spec.ts
git add src/app/mrsqm/util/notification-chime.ts src/app/mrsqm/util/notification-chime.spec.ts
git commit -m "feat(mrsqm): BELL-1 звук уведомления (WebAudio-дзинь)"
```

---

## Task 5: NotifierSocketService (WS-клиент)

**Files:**
- Modify: `src/environments/environment.ts` + `src/environments/environment.prod.ts` (и прочие варианты — см. Step 1)
- Create: `src/app/mrsqm/services/notifier-socket.service.ts`
- Test: `src/app/mrsqm/services/notifier-socket.service.spec.ts`

**Interfaces:**
- Consumes: `environment.notifierWsUrl: string`.
- Produces: `NotifierSocketService` с публичными `opened$: Observable<void>`, `changed$: Observable<void>`, методами `connect(getToken: () => Promise<string | null>): void`, `disconnect(): void`. Backoff с jitter, свежий токен на каждый коннект, эмит `opened` на `onopen`, `changed` на `onmessage` c `type==='bell.changed'`.

- [ ] **Step 1: Добавить env-переменную**

В `src/environments/environment.ts` — рядом с `gptServiceUrl` добавить:
```ts
  notifierWsUrl: 'wss://notify.mrsqm.com',
```
То же значение добавить во ВСЕ файлы окружения, где есть `gptServiceUrl` (проверить: `git grep -l gptServiceUrl src/environments`). Для каждого найденного файла добавить строку `notifierWsUrl: 'wss://notify.mrsqm.com',`.

- [ ] **Step 2: Падающий тест сокета**

`src/app/mrsqm/services/notifier-socket.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { NotifierSocketService } from './notifier-socket.service';

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeWebSocket.last = this;
    FakeWebSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}

describe('NotifierSocketService', () => {
  let svc: NotifierSocketService;
  let realWs: typeof WebSocket;

  beforeEach(() => {
    realWs = window.WebSocket;
    FakeWebSocket.last = null;
    FakeWebSocket.instances = [];
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    TestBed.configureTestingModule({ providers: [NotifierSocketService] });
    svc = TestBed.inject(NotifierSocketService);
  });

  afterEach(() => {
    svc.disconnect();
    (window as unknown as { WebSocket: unknown }).WebSocket = realWs;
  });

  it('connect передаёт токен в subprotocol', async () => {
    svc.connect(() => Promise.resolve('jwt-123'));
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.last?.protocols).toEqual(['jwt-123']);
  });

  it('эмитит opened на onopen', async () => {
    const opened = jasmine.createSpy('opened');
    svc.opened$.subscribe(opened);
    svc.connect(() => Promise.resolve('jwt'));
    await Promise.resolve();
    await Promise.resolve();
    FakeWebSocket.last?.onopen?.();
    expect(opened).toHaveBeenCalled();
  });

  it('эмитит changed только на type=bell.changed', async () => {
    const changed = jasmine.createSpy('changed');
    svc.changed$.subscribe(changed);
    svc.connect(() => Promise.resolve('jwt'));
    await Promise.resolve();
    await Promise.resolve();
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify({ type: 'other' }) });
    expect(changed).not.toHaveBeenCalled();
    FakeWebSocket.last?.onmessage?.({ data: JSON.stringify({ type: 'bell.changed' }) });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('реконнект берёт свежий токен на каждый коннект', async () => {
    let n = 0;
    const getToken = (): Promise<string> => Promise.resolve(`jwt-${++n}`);
    svc.connect(getToken);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.last?.protocols).toEqual(['jwt-1']);
    FakeWebSocket.last?.onclose?.(); // обрыв → запланирован реконнект
    await svc.reconnectNowForTest();
    expect(FakeWebSocket.last?.protocols).toEqual(['jwt-2']);
  });

  it('disconnect закрывает сокет и не реконнектит', async () => {
    svc.connect(() => Promise.resolve('jwt'));
    await Promise.resolve();
    await Promise.resolve();
    const ws = FakeWebSocket.last;
    svc.disconnect();
    expect(ws?.closed).toBe(true);
    ws?.onclose?.();
    await Promise.resolve();
    expect(FakeWebSocket.instances.length).toBe(1);
  });
});
```

- [ ] **Step 3: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/services/notifier-socket.service.spec.ts`
Expected: FAIL — сервис не найден.

- [ ] **Step 4: Реализовать сокет**

`src/app/mrsqm/services/notifier-socket.service.ts`:
```ts
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

// Только WebSocket: коннект с JWT в subprotocol, авто-реконнект (backoff+jitter),
// свежий токен на каждый коннект. Без состояния/UI. Payload не парсим в данные —
// читаем только type==='bell.changed' (brief §3.1, прил. A).
@Injectable({ providedIn: 'root' })
export class NotifierSocketService {
  private readonly _opened$ = new Subject<void>();
  private readonly _changed$ = new Subject<void>();
  readonly opened$ = this._opened$.asObservable();
  readonly changed$ = this._changed$.asObservable();

  private _ws: WebSocket | null = null;
  private _getToken: (() => Promise<string | null>) | null = null;
  private _stopped = true;
  private _attempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(getToken: () => Promise<string | null>): void {
    this._getToken = getToken;
    this._stopped = false;
    void this._open();
  }

  disconnect(): void {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.onclose = null; // не триггерить реконнект на ручном закрытии
      this._ws.close();
      this._ws = null;
    }
  }

  private async _open(): Promise<void> {
    if (this._stopped || !this._getToken) return;
    const token = await this._getToken();
    if (this._stopped || !token) return;

    const ws = new WebSocket(environment.notifierWsUrl, [token]);
    this._ws = ws;
    ws.onopen = () => {
      this._attempt = 0;
      this._opened$.next();
    };
    ws.onmessage = (e: MessageEvent) => {
      try {
        if (JSON.parse(e.data as string)?.type === 'bell.changed') {
          this._changed$.next();
        }
      } catch {
        // не-JSON / без type — игнор
      }
    };
    ws.onclose = () => this._scheduleReconnect();
    ws.onerror = () => ws.close();
  }

  private _scheduleReconnect(): void {
    if (this._stopped) return;
    this._ws = null;
    this._attempt++;
    const base = Math.min(1000 * 2 ** this._attempt, 30000);
    const delay = base / 2 + Math.random() * (base / 2); // jitter
    this._reconnectTimer = setTimeout(() => void this._open(), delay);
  }

  // Хук для юнит-тестов: немедленно выполнить запланированный реконнект.
  async reconnectNowForTest(): Promise<void> {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    await this._open();
  }
}
```

- [ ] **Step 5: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/services/notifier-socket.service.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 6: checkFile + коммит**

```bash
npm run checkFile src/environments/environment.ts
npm run checkFile src/app/mrsqm/services/notifier-socket.service.ts
npm run checkFile src/app/mrsqm/services/notifier-socket.service.spec.ts
git add src/environments/ src/app/mrsqm/services/notifier-socket.service.ts src/app/mrsqm/services/notifier-socket.service.spec.ts
git commit -m "feat(mrsqm): BELL-1 NotifierSocketService (WS-клиент)"
```

---

## Task 6: NotifierStore — ядро (стор, refresh, триггеры, жизненный цикл)

**Files:**
- Create: `src/app/mrsqm/services/notifier-store.service.ts`
- Test: `src/app/mrsqm/services/notifier-store.service.spec.ts`

**Interfaces:**
- Consumes: `MrsqmSupabaseService.rpc`, `SavedFilterService.list()`/`bumpReload()`, `NotifierSocketService` (`opened$`/`changed$`/`connect`/`disconnect`), `MrsqmAuthService.isAuthenticated`, `MrsqmSupabaseService.client.auth.getSession()`, `isBellLiveOn()` (Task 1).
- Produces (этой задачей): сигналы `bell = signal<BellResponse>`, `filters = signal<SavedFilter[]>`, `bellUnseen = computed<number>`, `status = signal<'idle'|'loading'|'ready'|'error'>`; методы `start(): void`, `stop(): void`, `refresh(): Promise<void>`. (Методы `closeBell`/`openListing`/toast/звук/`openRequested` добавит Task 7 — НЕ ссылаться на них здесь.)

- [ ] **Step 1: Падающий тест ядра**

`src/app/mrsqm/services/notifier-store.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NotifierStoreService } from './notifier-store.service';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilterService } from './saved-filter.service';
import { NotifierSocketService } from './notifier-socket.service';
import { MrsqmAuthService } from './auth.service';

describe('NotifierStoreService (ядро)', () => {
  let store: NotifierStoreService;
  let rpc: jasmine.Spy;
  let list: jasmine.Spy;
  let bumpReload: jasmine.Spy;
  let opened$: Subject<void>;
  let changed$: Subject<void>;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.callFake((fn: string) =>
      fn === 'get_bell'
        ? Promise.resolve({ bell_unseen: 4, items: [] })
        : Promise.resolve(null),
    );
    list = jasmine.createSpy('list').and.resolveTo([
      { id: 'f1', auto_name: 'A', unseen_count: 2, filters: {}, notification_type: null, created_at: '' },
    ]);
    bumpReload = jasmine.createSpy('bumpReload');
    opened$ = new Subject();
    changed$ = new Subject();

    TestBed.configureTestingModule({
      providers: [
        NotifierStoreService,
        {
          provide: MrsqmSupabaseService,
          useValue: {
            rpc,
            client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt' } } }) } },
          },
        },
        { provide: SavedFilterService, useValue: { list, bumpReload } },
        {
          provide: NotifierSocketService,
          useValue: { opened$, changed$, connect: jasmine.createSpy(), disconnect: jasmine.createSpy() },
        },
        { provide: MrsqmAuthService, useValue: { isAuthenticated: () => true } },
      ],
    });
    store = TestBed.inject(NotifierStoreService);
  });

  it('refresh() сводит оба RPC в сигналы', async () => {
    await store.refresh();
    expect(store.bell().bell_unseen).toBe(4);
    expect(store.bellUnseen()).toBe(4);
    expect(store.filters().length).toBe(1);
  });

  it('refresh() бампает сайдбар (bumpReload)', async () => {
    await store.refresh();
    expect(bumpReload).toHaveBeenCalled();
  });

  it('get_bell reject (allSettled) НЕ ломает filters', async () => {
    rpc.and.callFake((fn: string) =>
      fn === 'get_bell' ? Promise.reject(new Error('no func')) : Promise.resolve(null),
    );
    await store.refresh();
    expect(store.bell().bell_unseen).toBe(0); // остаётся пустым
    expect(store.filters().length).toBe(1); // фильтры пришли
  });

  it('событие changed → один refresh()', async () => {
    store.start();
    await Promise.resolve();
    rpc.calls.reset();
    list.calls.reset();
    changed$.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('НЕТ инкремента на фронте: повторные changed не накручивают bell_unseen', async () => {
    store.start();
    await Promise.resolve();
    changed$.next();
    changed$.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.bell().bell_unseen).toBe(4); // всегда число из бэка
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/services/notifier-store.service.spec.ts`
Expected: FAIL — сервис не найден.

- [ ] **Step 3: Реализовать ядро стора**

`src/app/mrsqm/services/notifier-store.service.ts`:
```ts
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { MrsqmSupabaseService } from './supabase.service';
import { SavedFilterService } from './saved-filter.service';
import { NotifierSocketService } from './notifier-socket.service';
import { MrsqmAuthService } from './auth.service';
import { SavedFilter } from './feed-filter.service';
import { BellResponse } from '../types/notifier';
import { isBellLiveOn } from '../util/bell-live-pref';

const POLL_MS = 60_000;

// Единственный источник истины для всех счётчик-поверхностей (колокол, дропдаун,
// сайдбар). Счётчики НИКОГДА не считаются на фронте — только из бэка через refresh().
@Injectable({ providedIn: 'root' })
export class NotifierStoreService {
  private readonly _supabase = inject(MrsqmSupabaseService);
  private readonly _savedFilters = inject(SavedFilterService);
  private readonly _socket = inject(NotifierSocketService);
  private readonly _auth = inject(MrsqmAuthService);

  readonly bell = signal<BellResponse>({ bell_unseen: 0, items: [] });
  readonly filters = signal<SavedFilter[]>([]);
  readonly bellUnseen = computed(() => this.bell().bell_unseen);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  private _started = false;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _onVisible = (): void => {
    if (!document.hidden) void this.refresh();
  };

  constructor() {
    // Жизненный цикл от auth: вошёл → start(), вышел → stop()+сброс. Декаплинг от UI.
    effect(() => {
      if (this._auth.isAuthenticated()) {
        this.start();
      } else {
        this.stop();
        this.bell.set({ bell_unseen: 0, items: [] });
        this.filters.set([]);
      }
    });
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    const live = isBellLiveOn();

    if (live) {
      this._socket.connect(() => this._freshToken());
      this._socket.opened$.subscribe(() => void this.refresh()); // ре-синк на (ре)коннекте
      this._socket.changed$.subscribe(() => this._onChanged());
    }

    this._pollTimer = setInterval(() => void this.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', this._onVisible);
    window.addEventListener('focus', this._onVisible);

    void this.refresh();
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
    this._socket.disconnect();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    document.removeEventListener('visibilitychange', this._onVisible);
    window.removeEventListener('focus', this._onVisible);
  }

  // Единственный путь обновления истины. Один сигнал → один refresh (дебаунс на notifier).
  async refresh(): Promise<void> {
    this.status.set('loading');
    const [bellRes, filtersRes] = await Promise.allSettled([
      this._supabase.rpc<BellResponse>('get_bell'),
      this._savedFilters.list(),
    ]);

    // get_bell может отсутствовать в проде до применения 017 → при reject оставляем пустым.
    if (bellRes.status === 'fulfilled' && bellRes.value) {
      this.bell.set(bellRes.value);
    }
    if (filtersRes.status === 'fulfilled') {
      this.filters.set(filtersRes.value);
    }
    this.status.set(filtersRes.status === 'fulfilled' ? 'ready' : 'error');

    // Сайдбар-бейджи (RT-4) остаются живыми на тех же триггерах (см. план: не переписываем панель).
    this._savedFilters.bumpReload();
  }

  // На socket.changed Task 7 добавит toast+звук; ядро просто перечитывает истину.
  protected _onChanged(): void {
    void this.refresh();
  }

  private async _freshToken(): Promise<string | null> {
    const { data } = await this._supabase.client.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/services/notifier-store.service.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/services/notifier-store.service.ts
npm run checkFile src/app/mrsqm/services/notifier-store.service.spec.ts
git add src/app/mrsqm/services/notifier-store.service.ts src/app/mrsqm/services/notifier-store.service.spec.ts
git commit -m "feat(mrsqm): BELL-1 NotifierStore ядро (refresh, триггеры, lifecycle)"
```

---

## Task 7: NotifierStore — действия и side-effects (закрытие колокола, открытие объекта, toast, звук)

**Files:**
- Modify: `src/app/mrsqm/services/notifier-store.service.ts`
- Modify: `src/app/mrsqm/services/notifier-store.service.spec.ts`

**Interfaces:**
- Consumes: `PanelContentService.openProperty(property: PropertyFeedItem)`, `SeenTrackingService.recordView(id)`/`markFilterSeen(filterId, ids)`, `SnackService.open(params)`, `UnitTypeLabelService.getLabel`, `buildPropertyTitle`, `formatBellPrice`, `playNotificationChime`, `isBellLiveOn`.
- Produces: `closeBell(): Promise<void>`, `openListing(propertyId: string, filterId: string, item?: BellItem): Promise<void>`, `requestOpen(): void`, `openRequested = signal<number>` (тик — bell-button открывает дропдаун). Side-effect: на `changed` при фокусе+ON — toast + звук (звук даже без фокуса при ON).

- [ ] **Step 1: Добавить падающие тесты (дописать в существующий spec)**

⚠️ **Сначала почини существующий describe «ядро» (Task 6):** стор теперь инжектит `PanelContentService`, `SeenTrackingService`, `SnackService`, `UnitTypeLabelService` — без моков их TestBed из Task 6 упадёт (реальный `PanelContentService` тянет `Store` NgRx). Добавь в providers describe-блока «(ядро)» эти 4 мока:
```ts
        { provide: PanelContentService, useValue: { openProperty: () => {} } },
        { provide: SeenTrackingService, useValue: { recordView: () => Promise.resolve(), markFilterSeen: () => Promise.resolve() } },
        { provide: SnackService, useValue: { open: () => {} } },
        { provide: UnitTypeLabelService, useValue: { getLabel: () => Promise.resolve('Apartment') } },
```
(плюс соответствующие импорты, см. ниже).

Затем добавить НОВЫЙ describe-блок `NotifierStoreService (действия)` в `notifier-store.service.spec.ts`:
```ts
import { PanelContentService } from '../../features/panels/panel-content.service';
import { SeenTrackingService } from './seen-tracking.service';
import { SnackService } from '../../core/snack/snack.service';
import { UnitTypeLabelService } from './unit-type-label.service';

describe('NotifierStoreService (действия)', () => {
  let store: NotifierStoreService;
  let rpc: jasmine.Spy;
  let openProperty: jasmine.Spy;
  let recordView: jasmine.Spy;
  let markFilterSeen: jasmine.Spy;
  let snackOpen: jasmine.Spy;
  let changed$: Subject<void>;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.callFake((fn: string) =>
      fn === 'get_bell'
        ? Promise.resolve({ bell_unseen: 0, items: [] })
        : Promise.resolve(undefined),
    );
    openProperty = jasmine.createSpy('openProperty');
    recordView = jasmine.createSpy('recordView').and.resolveTo(undefined);
    markFilterSeen = jasmine.createSpy('markFilterSeen').and.resolveTo(undefined);
    snackOpen = jasmine.createSpy('open');
    changed$ = new Subject();

    TestBed.configureTestingModule({
      providers: [
        NotifierStoreService,
        {
          provide: MrsqmSupabaseService,
          useValue: { rpc, client: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } },
        },
        { provide: SavedFilterService, useValue: { list: () => Promise.resolve([]), bumpReload: () => {} } },
        { provide: NotifierSocketService, useValue: { opened$: new Subject(), changed$, connect: () => {}, disconnect: () => {} } },
        { provide: MrsqmAuthService, useValue: { isAuthenticated: () => false } },
        { provide: PanelContentService, useValue: { openProperty } },
        { provide: SeenTrackingService, useValue: { recordView, markFilterSeen } },
        { provide: SnackService, useValue: { open: snackOpen } },
        { provide: UnitTypeLabelService, useValue: { getLabel: () => Promise.resolve('Apartment') } },
      ],
    });
    store = TestBed.inject(NotifierStoreService);
  });

  it('closeBell() → mark_bell_seen затем refresh', async () => {
    const order: string[] = [];
    rpc.and.callFake((fn: string) => {
      order.push(fn);
      return fn === 'get_bell' ? Promise.resolve({ bell_unseen: 0, items: [] }) : Promise.resolve(undefined);
    });
    await store.closeBell();
    expect(order[0]).toBe('mark_bell_seen');
    expect(order).toContain('get_bell');
  });

  it('Рамка №0: closeBell НЕ зовёт mark_filter_seen (объекты не трогает)', async () => {
    await store.closeBell();
    expect(markFilterSeen).not.toHaveBeenCalled();
  });

  it('openListing → recordView + openProperty(stub с id)', async () => {
    await store.openListing('prop-1', 'f1');
    expect(recordView).toHaveBeenCalledWith('prop-1');
    expect(openProperty).toHaveBeenCalled();
    expect(openProperty.calls.mostRecent().args[0].id).toBe('prop-1');
  });

  it('openListing → markFilterSeen(filterId, [propertyId]) гасит объект', async () => {
    await store.openListing('prop-1', 'f1');
    expect(markFilterSeen).toHaveBeenCalledWith('f1', ['prop-1']);
  });

  it('requestOpen() бампает openRequested', () => {
    const before = store.openRequested();
    store.requestOpen();
    expect(store.openRequested()).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/services/notifier-store.service.spec.ts`
Expected: FAIL — `closeBell`/`openListing`/`requestOpen`/`openRequested` не существуют.

- [ ] **Step 3: Дополнить стор действиями и side-effects**

В `notifier-store.service.ts` добавить импорты и методы. Импорты (в шапку):
```ts
import { PanelContentService } from '../../features/panels/panel-content.service';
import { SeenTrackingService } from './seen-tracking.service';
import { SnackService } from '../../core/snack/snack.service';
import { UnitTypeLabelService } from './unit-type-label.service';
import { BellItem } from '../types/notifier';
import { PropertyFeedItem } from '../types/database';
import { buildPropertyTitle } from '../util/property-title';
import { formatBellPrice } from '../util/bell-price';
import { playNotificationChime } from '../util/notification-chime';
```
Инъекции (в класс, рядом с прочими):
```ts
  private readonly _panels = inject(PanelContentService);
  private readonly _seen = inject(SeenTrackingService);
  private readonly _snack = inject(SnackService);
  private readonly _labels = inject(UnitTypeLabelService);

  // Тик-запрос «открыть дропдаун» (toast/клик колокола); bell-button реагирует effect-ом.
  readonly openRequested = signal(0);
  // bell_unseen на момент прошлого refresh — для дельты toast/звука. НЕ источник счётчика.
  private _prevBellUnseen = 0;
```
Заменить `protected _onChanged()` на версию с side-effects:
```ts
  // socket.changed: перечитать истину, затем (если ON) toast + звук по дельте bell_unseen.
  protected _onChanged(): void {
    if (!isBellLiveOn()) {
      void this.refresh();
      return;
    }
    const before = this.bell().bell_unseen;
    void this.refresh().then(() => {
      const after = this.bell().bell_unseen;
      const delta = after - before;
      if (delta > 0) {
        playNotificationChime(); // звук — даже если вкладка не в фокусе
        if (!document.hidden) void this._showToast(delta);
      }
    });
  }
```
Добавить методы:
```ts
  // 🔔 Закрыл колокол → двигаем bell-курсор (гасит бейдж И все полосы), затем перечитываем.
  // Рамка №0: счётчики объектов (unseen_count) НЕ трогаем.
  async closeBell(): Promise<void> {
    try {
      await this._supabase.rpc('mark_bell_seen');
    } catch {
      // RPC может отсутствовать до go-live — не блокируем закрытие
    }
    await this.refresh();
  }

  // 🏠 Открыл объект из дропдауна → engagement + гасим объект в фильтре. Бейдж/полосы НЕ трогаем.
  async openListing(propertyId: string, filterId: string, item?: BellItem): Promise<void> {
    void this._seen.recordView(propertyId);
    void this._seen.markFilterSeen(filterId, [propertyId]).then(() => void this.refresh());
    this._panels.openProperty(this._toFeedStub(propertyId, item));
  }

  requestOpen(): void {
    this.openRequested.update((n) => n + 1);
  }

  // Минимальный stub PropertyFeedItem: property-detail сам догрузит полное через get_property
  // (реактивный effect по property().id). Заполняем что знаем из bell-item, остальное — дефолты.
  private _toFeedStub(propertyId: string, item?: BellItem): PropertyFeedItem {
    return {
      id: propertyId,
      owner_id: '',
      deal_type: (item?.deal_type as PropertyFeedItem['deal_type']) ?? 'sale',
      listing_type: 'sale',
      property_type: null,
      unit_type_id: item?.unit_type_id ?? null,
      price: item?.price ?? 0,
      price_currency: item?.price_currency ?? 'AED',
      price_period: null,
      bedrooms: item?.bedrooms ?? null,
      bathrooms: null,
      area_sqft: null,
      location_name: item?.location_label ?? null,
      community_name: item?.community_label ?? null,
      description: null,
      furnished: null,
      handover: null,
      photos: null,
      published_at: item?.matched_at ?? new Date().toISOString(),
      owner_full_name: null,
      owner_photo_url: null,
      owner_agency_name: null,
      is_network: false,
      developer_name: null,
    };
  }

  // Текстовый toast (brief §2B(2)): +1 → строка свежего объекта; >1 → агрегат «N new matches».
  private async _showToast(delta: number): Promise<void> {
    let msg: string;
    if (delta > 1) {
      msg = `${delta} new matches`;
    } else {
      const item = this.bell().items[0];
      if (item) {
        const fname =
          this.filters().find((f) => f.id === item.filter_id)?.auto_name ?? 'your filter';
        const label = await this._labels.getLabel(item.unit_type_id);
        const title = buildPropertyTitle(item.bedrooms, label);
        const loc = item.location_label ?? item.community_label ?? '';
        msg = `New match in «${fname}» · ${[title, loc, formatBellPrice(item)]
          .filter((p) => p)
          .join(' · ')}`;
      } else {
        msg = 'New match';
      }
    }
    this._snack.open({
      msg,
      type: 'SUCCESS',
      ico: 'notifications',
      isSkipTranslate: true,
      actionStr: 'View',
      actionFn: () => this.requestOpen(),
      config: {
        horizontalPosition: 'left',
        verticalPosition: 'bottom',
        panelClass: 'mrsqm-snack',
      },
    });
  }
```

- [ ] **Step 4: Запустить — проходит**

Run: `npm run test:file src/app/mrsqm/services/notifier-store.service.spec.ts`
Expected: PASS (все блоки).

- [ ] **Step 5: checkFile + коммит**

```bash
npm run checkFile src/app/mrsqm/services/notifier-store.service.ts
npm run checkFile src/app/mrsqm/services/notifier-store.service.spec.ts
git add src/app/mrsqm/services/notifier-store.service.ts src/app/mrsqm/services/notifier-store.service.spec.ts
git commit -m "feat(mrsqm): BELL-1 NotifierStore действия + toast + звук"
```

---

## Task 8: bell-dropdown (top-layer `<dialog>`)

**Files:**
- Create: `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.ts`
- Create: `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.html`
- Create: `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.scss`
- Test: `src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts`

**Interfaces:**
- Consumes: `NotifierStoreService` (`filters`, `bell`, `status`, `openListing`, `refresh`), `UnitTypeLabelService.getLabel`, `buildBellRows`, `BellRow`, `isBellLiveOn`/`setBellLive`.
- Produces: `BellDropdownComponent` (selector `mrsqm-bell-dropdown`) c input `open: boolean`, output `closed = output<void>()`. Сам управляет `<dialog>.showModal()/close()` по `open`.

- [ ] **Step 1: Падающий тест**

`src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts`:
```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BellDropdownComponent } from './bell-dropdown.component';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { UnitTypeLabelService } from '../../services/unit-type-label.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';

describe('BellDropdownComponent', () => {
  let fixture: ComponentFixture<BellDropdownComponent>;
  let comp: BellDropdownComponent;
  const filters = signal<unknown[]>([]);
  const bell = signal({ bell_unseen: 0, items: [] as unknown[] });
  const status = signal<'idle' | 'loading' | 'ready' | 'error'>('ready');
  const openListing = jasmine.createSpy('openListing');

  beforeEach(async () => {
    filters.set([
      { id: 'f1', auto_name: 'Marina', unseen_count: 3, filters: {}, notification_type: null, created_at: '' },
    ]);
    bell.set({ bell_unseen: 1, items: [] });
    await TestBed.configureTestingModule({
      imports: [BellDropdownComponent],
      providers: [
        { provide: NotifierStoreService, useValue: { filters, bell, status, openListing, refresh: () => Promise.resolve() } },
        { provide: UnitTypeLabelService, useValue: { getLabel: () => Promise.resolve('Apartment') } },
        { provide: PanelContentService, useValue: { openFilterPanel: () => {} } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BellDropdownComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('строит строки: фильтр с unseen_count>0 виден, имя = auto_name', () => {
    expect(comp.rows().length).toBe(1);
    expect(comp.rows()[0].name).toBe('Marina');
    expect(comp.rows()[0].unseenCount).toBe(3);
  });

  it('фильтр с unseen_count=0 в строки не попадает (гейт)', () => {
    filters.set([{ id: 'f0', auto_name: 'Z', unseen_count: 0, filters: {}, notification_type: null, created_at: '' }]);
    fixture.detectChanges();
    expect(comp.rows().length).toBe(0);
  });

  it('пусто (фильтры есть, новых нет) → состояние no-new', () => {
    filters.set([{ id: 'f0', auto_name: 'Z', unseen_count: 0, filters: {}, notification_type: null, created_at: '' }]);
    fixture.detectChanges();
    expect(comp.viewState()).toBe('no-new');
  });

  it('нет фильтров → состояние no-filters', () => {
    filters.set([]);
    fixture.detectChanges();
    expect(comp.viewState()).toBe('no-filters');
  });

  it('клик по строке с превью → openListing(propertyId, filterId)', () => {
    bell.set({
      bell_unseen: 1,
      items: [{ property_id: 'p1', filter_id: 'f1', match_type: 'new', matched_at: '2026-06-29T09:00:00Z', unseen: true, price: 2100000, previous_price: null, price_currency: 'AED', deal_type: 'sale', bedrooms: 2, unit_type_id: 'ut1', location_label: 'Marina', community_label: null, thumb_url: null }],
    });
    fixture.detectChanges();
    comp.onRowClick(comp.rows()[0]);
    expect(openListing).toHaveBeenCalledWith('p1', 'f1', jasmine.anything());
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts`
Expected: FAIL — компонент не найден.

- [ ] **Step 3: Реализовать компонент (.ts)**

`bell-dropdown.component.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { UnitTypeLabelService } from '../../services/unit-type-label.service';
import { buildBellRows } from '../../util/bell-rows';
import { BellItem, BellRow } from '../../types/notifier';
import { buildPropertyTitle } from '../../util/property-title';
import { isBellLiveOn, setBellLive } from '../../util/bell-live-pref';
import { PanelContentService } from '../../../features/panels/panel-content.service';

@Component({
  selector: 'mrsqm-bell-dropdown',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './bell-dropdown.component.html',
  styleUrl: './bell-dropdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BellDropdownComponent {
  private readonly _store = inject(NotifierStoreService);
  private readonly _labels = inject(UnitTypeLabelService);
  private readonly _panels = inject(PanelContentService);

  readonly open = input(false);
  readonly closed = output<void>();
  readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  readonly status = this._store.status;
  readonly liveOn = signal(isBellLiveOn());

  // Резолв заголовков синхронно: держим Map unit_type_id→label, пополняем асинхронно.
  private readonly _titleMap = signal<Map<string, string>>(new Map());

  readonly rows = computed<BellRow[]>(() => {
    const map = this._titleMap();
    const getTitle = (it: BellItem): string =>
      buildPropertyTitle(it.bedrooms, it.unit_type_id ? (map.get(it.unit_type_id) ?? null) : null);
    return buildBellRows(this._store.filters(), this._store.bell().items, getTitle);
  });

  readonly viewState = computed<'loading' | 'error' | 'no-filters' | 'no-new' | 'list'>(() => {
    if (this.status() === 'loading' && !this._store.filters().length) return 'loading';
    if (this.status() === 'error') return 'error';
    if (!this._store.filters().length) return 'no-filters';
    if (!this.rows().length) return 'no-new';
    return 'list';
  });

  constructor() {
    // Открытие/закрытие нативного <dialog> по input open (top-layer showModal).
    effect(() => {
      const dlg = this.dialogRef()?.nativeElement;
      if (!dlg) return;
      if (this.open() && !dlg.open) dlg.showModal();
      else if (!this.open() && dlg.open) dlg.close();
    });
    // Подгрузка label типов для заголовков (брифом title собирает фронт).
    effect(() => {
      const items = this._store.bell().items;
      void this._loadTitles(items);
    });
  }

  private async _loadTitles(items: BellItem[]): Promise<void> {
    const map = new Map(this._titleMap());
    let changed = false;
    for (const it of items) {
      if (it.unit_type_id && !map.has(it.unit_type_id)) {
        const label = await this._labels.getLabel(it.unit_type_id);
        if (label) {
          map.set(it.unit_type_id, label);
          changed = true;
        }
      }
    }
    if (changed) this._titleMap.set(map);
  }

  onRowClick(row: BellRow): void {
    if (row.preview) {
      const item = this._store
        .bell()
        .items.find((it) => it.property_id === row.preview?.propertyId);
      this._store.openListing(row.preview.propertyId, row.filterId, item);
      this.closed.emit(); // закрытие дропдауна → store.closeBell() в bell-button
    } else {
      // fallback (бэклог без превью): пока тоже открываем дропдаун-закрытие; объект клиент
      // выберет в ленте. v1: просто закрываем (углубление до «результаты фильтра» — отдельная задача).
      this.closed.emit();
    }
  }

  toggleLive(): void {
    const next = !this.liveOn();
    this.liveOn.set(next);
    setBellLive(next);
  }

  // Состояние «нет сохранённых фильтров» → открыть панель фильтров ленты (spec §5).
  onCreateFilter(): void {
    this._panels.openFilterPanel();
    this.closed.emit();
  }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === this.dialogRef()?.nativeElement) this.closed.emit();
  }

  onDialogClose(): void {
    if (this.open()) this.closed.emit(); // Esc / нативное закрытие
  }
}
```

- [ ] **Step 4: Реализовать шаблон (.html)**

`bell-dropdown.component.html`:
```html
<dialog
  #dlg
  class="bell-dropdown"
  aria-label="Notifications"
  (click)="onBackdropClick($event)"
  (close)="onDialogClose()"
>
  <div class="bell-panel" (click)="$event.stopPropagation()">
    <header class="bell-head">
      <span class="bell-title">Notifications</span>
      <button class="bell-markall" type="button" (click)="closed.emit()">
        Mark all read
      </button>
    </header>

    @switch (viewState()) {
      @case ('loading') {
        <div class="bell-skeletons">
          <div class="bell-skel"></div>
          <div class="bell-skel"></div>
          <div class="bell-skel"></div>
        </div>
      }
      @case ('error') {
        <div class="bell-empty">
          <p class="bell-empty-title">Couldn't load notifications</p>
          <button class="bell-retry" type="button" (click)="status.set('loading')">
            Retry
          </button>
        </div>
      }
      @case ('no-filters') {
        <div class="bell-empty">
          <mat-icon class="bell-empty-ico">notifications_none</mat-icon>
          <p class="bell-empty-title">No saved filters yet</p>
          <p class="bell-empty-sub">Create a filter to get match alerts.</p>
          <button class="bell-create" type="button" (click)="onCreateFilter()">
            Create filter
          </button>
        </div>
      }
      @case ('no-new') {
        <div class="bell-empty">
          <mat-icon class="bell-empty-ico">notifications_none</mat-icon>
          <p class="bell-empty-title">No new matches</p>
          <p class="bell-empty-sub">
            You'll see new listings for your saved filters here.
          </p>
        </div>
      }
      @default {
        <ul class="bell-rows">
          @for (row of rows(); track row.filterId) {
            <li
              class="bell-row"
              [class.is-unseen]="row.hasUnseenNotification"
              role="button"
              tabindex="0"
              [attr.aria-label]="row.name + ', ' + row.unseenCount + ' new'"
              (click)="onRowClick(row)"
              (keydown.enter)="onRowClick(row)"
              (keydown.space)="onRowClick(row); $event.preventDefault()"
            >
              <div class="bell-row-top">
                <span class="bell-row-name">{{ row.name }}</span>
                <span class="bell-row-badge"
                  >{{ row.unseenCount > 99 ? '99+' : row.unseenCount }}</span
                >
              </div>
              @if (row.preview) {
                <div class="bell-row-preview">
                  <span
                    class="bell-tag"
                    [class.is-drop]="row.preview.matchType === 'price_drop'"
                    >{{ row.preview.matchType === 'price_drop' ? 'Price ↓' : 'New' }}</span
                  >
                  <span class="bell-row-text"
                    >{{ row.preview.title }} · {{ row.preview.location }} ·
                    {{ row.preview.priceText }}</span
                  >
                </div>
              } @else {
                <div class="bell-row-preview bell-row-fallback">
                  {{ row.unseenCount }} new — tap to view
                </div>
              }
            </li>
          }
        </ul>
      }
    }

    <footer class="bell-foot">
      <button
        class="bell-live"
        type="button"
        [class.is-on]="liveOn()"
        (click)="toggleLive()"
      >
        <mat-icon class="bell-live-ico">bolt</mat-icon>
        <span>{{ liveOn() ? 'Live' : 'Live off' }}</span>
      </button>
      <button class="bell-viewall" type="button" (click)="closed.emit()">
        View all matches
      </button>
    </footer>
  </div>
</dialog>
```

- [ ] **Step 5: Реализовать стили (.scss)**

`bell-dropdown.component.scss` (top-layer `<dialog>` по образцу lightbox; токены SP):
```scss
// Top-layer <dialog>.showModal() — выше любого transform-контекста правой панели
// (will-change:transform запирает position:fixed). Паттерн — property-detail lightbox.
.bell-dropdown {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  max-width: 100vw;
  max-height: 100vh;

  &::backdrop {
    background: rgba(0, 0, 0, 0.18);
  }

  &[open] {
    // Привязка к верх-правому углу (под колоколом в хедере).
    position: fixed;
    top: 56px;
    right: 12px;
    left: auto;
  }
}

.bell-panel {
  width: 360px;
  max-width: calc(100vw - 24px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--card-bg, #fff);
  border: 1px solid var(--separator-alpha, rgba(0, 0, 0, 0.1));
  border-radius: 14px;
  box-shadow: var(--whiteframe-shadow-4dp, 0 8px 24px rgba(0, 0, 0, 0.18));
  // modal-motion: появляется из триггера (колокол вверху-справа) — scale+fade.
  transform-origin: top right;
  animation: bell-in 0.18s ease-out;
}

@keyframes bell-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.bell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--separator-alpha, rgba(0, 0, 0, 0.08));
}

.bell-title {
  font-weight: 600;
  color: var(--text-color);
}

.bell-markall,
.bell-retry,
.bell-viewall,
.bell-live {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-primary, #1976d2);
  font-size: 0.8125rem;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--hover-color, rgba(0, 0, 0, 0.04));
  }

  &:focus-visible {
    outline: 2px solid var(--c-primary, #1976d2);
    outline-offset: 1px;
  }
}

// Create filter (состояние «нет фильтров») — заметная вторичная кнопка на токенах SP.
.bell-create {
  margin-top: 12px;
  cursor: pointer;
  padding: 8px 16px;
  min-height: 36px;
  border: 1px solid var(--c-primary, #1976d2);
  border-radius: 8px;
  background: none;
  color: var(--c-primary, #1976d2);
  font-size: 0.8125rem;
  transition: background-color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--c-primary, #1976d2) 8%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--c-primary, #1976d2);
    outline-offset: 2px;
  }
}

.bell-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}

.bell-row {
  position: relative;
  min-height: 56px;
  padding: 10px 16px 10px 18px;
  cursor: pointer;
  border-bottom: 1px solid var(--separator-alpha, rgba(0, 0, 0, 0.06));
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--hover-color, rgba(0, 0, 0, 0.04));
  }

  &:focus-visible {
    outline: 2px solid var(--c-primary, #1976d2);
    outline-offset: -2px;
  }

  // 🟠 непросмотренное уведомление: акцент-полоса слева + лёгкий тон (Рамка №0).
  &.is-unseen {
    background: color-mix(in srgb, var(--color-warning, #ff9800) 8%, transparent);

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--color-warning, #ff9800);
    }

    .bell-row-name {
      font-weight: 600;
    }
  }
}

.bell-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bell-row-name {
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bell-row-badge {
  flex-shrink: 0;
  min-width: 22px;
  text-align: center;
  padding: 1px 7px;
  border-radius: 11px;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums; // ровные цифры — без дёрганья ширины
  background: var(--separator-alpha, rgba(0, 0, 0, 0.08));
  color: var(--text-color);
}

.bell-row-preview {
  margin-top: 3px;
  font-size: 0.8rem;
  color: var(--text-color-muted, rgba(0, 0, 0, 0.6));
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.bell-row-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bell-tag {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-success, #2e7d32);

  &.is-drop {
    color: var(--color-warning, #ff9800);
  }
}

.bell-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-color-muted, rgba(0, 0, 0, 0.6));
}

.bell-empty-ico {
  font-size: 32px;
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.bell-empty-title {
  margin: 8px 0 4px;
  color: var(--text-color);
  font-weight: 500;
}

.bell-empty-sub {
  margin: 0;
  font-size: 0.8rem;
}

.bell-skeletons {
  padding: 12px 16px;
}

.bell-skel {
  height: 40px;
  margin-bottom: 10px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    var(--separator-alpha, rgba(0, 0, 0, 0.06)) 25%,
    rgba(0, 0, 0, 0.03) 37%,
    var(--separator-alpha, rgba(0, 0, 0, 0.06)) 63%
  );
  background-size: 400% 100%;
  animation: bell-shimmer 1.4s ease infinite;
}

@keyframes bell-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

.bell-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--separator-alpha, rgba(0, 0, 0, 0.08));
}

.bell-live {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-color-muted, rgba(0, 0, 0, 0.6));

  &.is-on {
    color: var(--color-warning, #ff9800);
  }
}

.bell-live-ico {
  font-size: 16px;
  width: 16px;
  height: 16px;
}

// a11y: уважать prefers-reduced-motion — гасим вход и shimmer (ui-ux-pro-max §7).
@media (prefers-reduced-motion: reduce) {
  .bell-panel {
    animation: none;
  }
  .bell-skel {
    animation: none;
  }
}
```

- [ ] **Step 6: Запустить тест — проходит**

Run: `npm run test:file src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts`
Expected: PASS (6 тестов).

- [ ] **Step 7: checkFile (включая .html!) + коммит**

```bash
npm run checkFile src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.ts
npm run checkFile src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.html
npm run checkFile src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.scss
npm run checkFile src/app/mrsqm/components/bell-dropdown/bell-dropdown.component.spec.ts
git add src/app/mrsqm/components/bell-dropdown/
git commit -m "feat(mrsqm): BELL-1 дропдаун колокольчика (top-layer dialog)"
```

---

## Task 9: bell-button + вставка в хедер

**Files:**
- Create: `src/app/mrsqm/components/bell-button/bell-button.component.ts`
- Create: `src/app/mrsqm/components/bell-button/bell-button.component.html`
- Create: `src/app/mrsqm/components/bell-button/bell-button.component.scss`
- Test: `src/app/mrsqm/components/bell-button/bell-button.component.spec.ts`
- Modify: `src/app/core-ui/main-header/desktop-panel-buttons/desktop-panel-buttons.component.ts`

**Interfaces:**
- Consumes: `NotifierStoreService` (`bellUnseen`, `openRequested`, `closeBell`), `MrsqmAuthService.isAuthenticated`, `BellDropdownComponent`.
- Produces: `BellButtonComponent` (selector `mrsqm-bell-button`). Серая иконка при `bellUnseen()===0`, оранжевая + бейдж при `>0`. Клик → открыть дропдаун; закрытие → `closeBell()`. Видна только залогиненному.

- [ ] **Step 1: Падающий тест**

`src/app/mrsqm/components/bell-button/bell-button.component.spec.ts`:
```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BellButtonComponent } from './bell-button.component';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { MrsqmAuthService } from '../../services/auth.service';

describe('BellButtonComponent', () => {
  let fixture: ComponentFixture<BellButtonComponent>;
  let comp: BellButtonComponent;
  const bellUnseen = signal(0);
  const openRequested = signal(0);
  const closeBell = jasmine.createSpy('closeBell').and.resolveTo(undefined);

  beforeEach(async () => {
    bellUnseen.set(0);
    await TestBed.configureTestingModule({
      imports: [BellButtonComponent],
      providers: [
        { provide: NotifierStoreService, useValue: { bellUnseen, openRequested, closeBell } },
        { provide: MrsqmAuthService, useValue: { isAuthenticated: () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BellButtonComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('bellUnseen=0 → бейджа нет', () => {
    expect(comp.badgeText()).toBeNull();
  });

  it('bellUnseen=5 → оранжево + бейдж «5»', () => {
    bellUnseen.set(5);
    fixture.detectChanges();
    expect(comp.badgeText()).toBe('5');
  });

  it('bellUnseen=150 → «99+»', () => {
    bellUnseen.set(150);
    fixture.detectChanges();
    expect(comp.badgeText()).toBe('99+');
  });

  it('закрытие дропдауна → store.closeBell()', () => {
    comp.openDropdown();
    comp.onClosed();
    expect(closeBell).toHaveBeenCalled();
    expect(comp.isOpen()).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npm run test:file src/app/mrsqm/components/bell-button/bell-button.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать (.ts)**

`bell-button.component.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { NotifierStoreService } from '../../services/notifier-store.service';
import { MrsqmAuthService } from '../../services/auth.service';
import { BellDropdownComponent } from '../bell-dropdown/bell-dropdown.component';

@Component({
  selector: 'mrsqm-bell-button',
  standalone: true,
  imports: [MatIconButton, MatIcon, MatTooltip, BellDropdownComponent],
  templateUrl: './bell-button.component.html',
  styleUrl: './bell-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BellButtonComponent {
  private readonly _store = inject(NotifierStoreService);
  private readonly _auth = inject(MrsqmAuthService);

  readonly isAuthenticated = this._auth.isAuthenticated;
  readonly bellUnseen = this._store.bellUnseen;
  readonly isOpen = signal(false);

  readonly hasUnseen = computed(() => this.bellUnseen() > 0);
  readonly badgeText = computed<string | null>(() => {
    const n = this.bellUnseen();
    if (n <= 0) return null;
    return n > 99 ? '99+' : String(n);
  });

  constructor() {
    // Запрос «открыть дропдаун» из toast/клика по уведомлению (store.requestOpen()).
    let prev = 0;
    effect(() => {
      const tick = this._store.openRequested();
      if (tick > prev) {
        prev = tick;
        this.isOpen.set(true);
      }
    });
  }

  openDropdown(): void {
    this.isOpen.set(true);
  }

  // Закрытие дропдауна гасит сигнал уведомлений (Рамка №0): mark_bell_seen + refresh.
  onClosed(): void {
    this.isOpen.set(false);
    void this._store.closeBell();
  }
}
```

- [ ] **Step 4: Реализовать (.html)**

`bell-button.component.html`:
```html
@if (isAuthenticated()) {
  <button
    class="panel-btn bell-btn"
    [class.has-unseen]="hasUnseen()"
    (click)="openDropdown()"
    mat-icon-button
    matTooltip="Уведомления"
    aria-label="Уведомления"
  >
    <mat-icon>notifications</mat-icon>
    @if (badgeText(); as badge) {
      <span class="bell-badge" aria-live="polite">{{ badge }}</span>
    }
  </button>

  <mrsqm-bell-dropdown [open]="isOpen()" (closed)="onClosed()" />
}
```

- [ ] **Step 5: Реализовать (.scss)**

`bell-button.component.scss`:
```scss
:host {
  display: contents;
}

.bell-btn {
  position: relative;
  overflow: visible !important;

  .mat-icon {
    display: block;
    transition: color 0.2s ease;
  }

  // bell_unseen>0 → оранжевая иконка (Рамка №0, сигнал уведомлений).
  &.has-unseen .mat-icon {
    color: var(--color-warning, #ff9800);
  }

  &:hover:not(:disabled) {
    background-color: var(--hover-color, rgba(0, 0, 0, 0.04));
  }
}

.bell-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--color-warning, #ff9800);
  color: #fff;
  font-size: 0.625rem;
  line-height: 16px;
  text-align: center;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
```

- [ ] **Step 6: Запустить тест — проходит**

Run: `npm run test:file src/app/mrsqm/components/bell-button/bell-button.component.spec.ts`
Expected: PASS (4 теста).

- [ ] **Step 7: Вставить кнопку в хедер**

В `desktop-panel-buttons.component.ts`:
1. В `imports` массив добавить `BellButtonComponent`.
2. Импорт сверху: `import { BellButtonComponent } from '../../../mrsqm/components/bell-button/bell-button.component';`
3. В шаблоне — сразу ПОСЛЕ блока AI-кнопки (после закрывающего `</button>` с `smart_toy`, перед `@if (isIssuesPanelEnabled())`) добавить:
```html
    <!-- MrSQM: колокольчик live-уведомлений — справа от AI-кнопки -->
    <mrsqm-bell-button />
```

- [ ] **Step 8: checkFile (включая оба .html!) + коммит**

```bash
npm run checkFile src/app/mrsqm/components/bell-button/bell-button.component.ts
npm run checkFile src/app/mrsqm/components/bell-button/bell-button.component.html
npm run checkFile src/app/mrsqm/components/bell-button/bell-button.component.scss
npm run checkFile src/app/mrsqm/components/bell-button/bell-button.component.spec.ts
npm run checkFile src/app/core-ui/main-header/desktop-panel-buttons/desktop-panel-buttons.component.ts
git add src/app/mrsqm/components/bell-button/ src/app/core-ui/main-header/desktop-panel-buttons/desktop-panel-buttons.component.ts
git commit -m "feat(mrsqm): BELL-1 кнопка-колокольчик в хедере"
```

---

## Task 10: Полная проверка, документация, деплой

**Files:**
- Modify: `docs/superpowers/specs/2026-06-29-bell-notifications-live-ui-design.md` (зафиксировать звук)
- Modify: `docs/TODO.md` (BELL-1 → done, развязать хвосты)

- [ ] **Step 1: Прогнать весь юнит-набор MrSQM**

Run: `npm test`
Expected: PASS, без новых падений (включая обновлённые notifier-спеки). При падении — чинить до зелёного (systematic-debugging), НЕ переходить дальше.

- [ ] **Step 2: Репо-линт всех изменённых файлов**

Run: `npm run lint`
Expected: 0 errors. Особое внимание — prettier в `.html` (см. Global Constraints).

- [ ] **Step 3: Зафиксировать звук в спеке**

В `docs/superpowers/specs/2026-06-29-bell-notifications-live-ui-design.md`:
- В §3.5 (Toast) добавить абзац: `**Звук (BELL-1.1):** на socket.changed при тумблере ON и росте bell_unseen — простой WebAudio-дзинь (util/notification-chime.ts), без ассетов; звучит даже если вкладка не в фокусе. OFF → молчит.`
- В §10 (Тесты) добавить строку: `- notification-chime: создаёт осциллятор / молчит без AudioContext.`

- [ ] **Step 4: Обновить TODO**

В `docs/TODO.md` пометить BELL-1 выполненным и оставить хвосты на go-live владельца (016/017 + WSS) + хвосты LF-1/LF-2/LF-3/K как следующие.

- [ ] **Step 5: Прод-сборка (gate перед пушем)**

Run: `npm run buildFrontend:prodWeb`
Expected: успешная AOT-сборка без превышения бюджетов. При ошибке — чинить до зелёного (husky pre-push не ловит AOT/бюджет, CI поймает).

- [ ] **Step 6: Коммит доков + ОДИН push**

```bash
git add docs/superpowers/specs/2026-06-29-bell-notifications-live-ui-design.md docs/TODO.md
git commit -m "docs(mrsqm): BELL-1 — зафиксирован звук уведомления + TODO"
git push origin main
```

- [ ] **Step 7: TG-summary (после пуша, без переспроса)**

```bash
set -a; . ./.env.local; set +a
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" \
  --data-urlencode text="🚀 Деплой superapp: BELL-1 live-колокольчик — WS-стор, дропдаун, toast + звук (poll-режим до go-live владельца 016/017+WSS)"
```

---

## Риски и заметки для ревьюера

- **Phasing (spec §9):** до применения владельцем 016/017 + WSS `get_bell` может reject — `Promise.allSettled` в `refresh()` это держит: колокол=0, дропдаун живёт на `unseen_count` из `get_saved_filters`, toast/звук/полосы молчат. Это by design, НЕ баг.
- **Сайдбар-бейджи:** план НЕ переписывает `feed-filter-panel`/`feed-page` на `store.filters` (спека §3.6 предлагала), чтобы не ломать рабочий RT-4 и 3 зелёных спека. Вместо этого `store.refresh()` бампает `SavedFilterService.reloadTick` → сайдбар живёт на тех же триггерах, единый бэкенд-счётчик сохранён. **Отклонение от буквы спеки — флажок для ревью.**
- **Открытие объекта из колокола:** `_toFeedStub` отдаёт минимальный `PropertyFeedItem`, `property-detail` догружает полное через `get_property` (реактивный effect). Кратковременный «пустой» кадр до загрузки — приемлемо.
- **Рамка №0 (критично):** `closeBell()` НЕ вызывает `markFilterSeen`; `openListing()` НЕ вызывает `mark_bell_seen`. Покрыто тестами Task 7. При ревью — перепроверить, что эти два пути не пересекаются.
- **Hot-path:** `desktop-panel-buttons` рендерится в хедере (не на задачу). `bell-button` лёгкий (computed-сигналы, без getter-ов в шаблоне). Стор — root-синглтон, сокет коннектится лениво при auth+ON.
- **E2E** — после go-live владельца (нужен живой WS); в этот план не входит (spec §10).

---

## UI/UX-проход (ui-ux-pro-max)

Дизайн дропдауна/кнопки прогнан через skill **ui-ux-pro-max**. ⚠️ Рекомендации скилла по **палитре и типографике** (Cinzel/Josefin, teal-палитра, «Exaggerated Minimalism», лендинг-паттерн «Newsletter») **намеренно НЕ применены** — мандат проекта: сохранять токены/темы Super Productivity, не вводить новый визуальный язык (CLAUDE.md, rules/mrsqm.md). Применены только **UX-гайдлайны** (они на токенах SP, без нового визуального языка):

- **focus-states (CRITICAL):** `:focus-visible` кольца на строках, всех кнопках подвала/шапки, Create-filter — клавиатурная навигация по соцсеть-дропдауну.
- **keyboard-nav:** строки `role="button"` + `tabindex="0"` + Enter/Space; `[attr.aria-label]` «{имя}, {N} new»; `<dialog aria-label="Notifications">`; Esc закрывает (нативно).
- **loading-states:** skeleton с shimmer-анимацией (вместо статичного градиента).
- **empty-states:** добавлена кнопка **Create filter** (spec §5 требовала, была не разведена) → открывает панель фильтров.
- **modal-motion / state-transition:** вход дропдауна scale+fade из триггера (верх-право), 0.18s ease-out.
- **animation 150–300ms + transform/opacity-only:** hover-переходы 0.15s на строках/кнопках; анимации только opacity/transform/background.
- **reduced-motion (CRITICAL a11y):** `@media (prefers-reduced-motion: reduce)` гасит вход и shimmer.
- **color-not-only:** «непрочитано» дублируется не только цветом — оранжевая полоса + bold-имя; теги New/Price↓ несут текст, не только цвет.
- **number-tabular:** `tabular-nums` на бейдже строки и бейдже колокола — счётчики не дёргают ширину.
- **stacking-context / z-index:** решено top-layer `<dialog>.showModal()` (вне transform-ловушки правой панели).
- **touch-target:** строки min-height 56px; Create-filter min-height 36px (десктоп); бейдж колокола pointer-events:none.

Скриншот-валидация (375/1440 + reduced-motion + dark) — отдельным шагом после реализации компонентов (Task 8/9), до деплоя.

## Self-Review (выполнено при написании)

- **Покрытие спеки:** §3.1 socket → Task 5; §3.2 store/refresh/триггеры → Task 6; §3.3 bell-button → Task 9; §3.4 bell-dropdown → Task 8; §3.5 toast → Task 7; §3.6 сайдбар → Task 6 (bumpReload, с флажком отклонения); §3.7 title-хелпер → Task 2; §5 дизайн дропдауна → Task 8; §6 хедер → Task 9; §7 тумблер → Task 1+8; §10 тесты → каждый Task; **звук (новое требование)** → Task 4+7+10. Рамка №0 → Task 7 (тесты).
- **Плейсхолдеры:** нет — каждый шаг с кодом несёт полный код и команду с ожидаемым результатом.
- **Согласованность типов:** `BellResponse`/`BellItem`/`BellRow` (Task 1) едины во всех тасках; `SavedFilter` берётся из `feed-filter.service`; `buildBellRows`/`formatBellPrice`/`buildPropertyTitle`/`playNotificationChime` — сигнатуры совпадают между объявлением (Tasks 2–4) и потреблением (Tasks 7–8); `openRequested`/`requestOpen`/`closeBell`/`openListing` объявлены в Task 7 и потребляются в Tasks 8–9.
