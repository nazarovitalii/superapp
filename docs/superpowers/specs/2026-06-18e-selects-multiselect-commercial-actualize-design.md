# Селекты · мультиселект локаций · Commercial · актуализация — design (2026-06-18e)

**Контекст.** Пятый батч правок создателя по ленте/форме. Захвачен вербатим в `docs/TODO.md`
(ID **W-1…W-7**) ([[feedback-record-requests-immediately]]). Реализация — Subagent-Driven
([[feedback-use-subagent-driven]]). **Без миграций.** Часть — повторный заход по стилям меню (V-4) и
кеглю селектов (U-1): создатель раздражён повтором, довести до конца.

---

## РЕШЕНИЯ (закрыто 2026-06-18e)

- **W-1 → выпадающая панель снизу с тоггл-стрелкой.** Поле локаций фикс-ширины; чипы в одну строку, лишнее
  обрезается; при переполнении справа кнопка **▾**, клик раскрывает панель со всеми локациями (крестики),
  **▴** сворачивает. Иконку-булавку у чипа убрать.
- **W-6 → литерал `14px`** (не `0.875rem`): кегль селектов должен совпасть с `.first-line` ленты (`14px`).

---

## Запросы → дизайн

### W-1 · Окно мультиселекта локаций · `pages/feed/feed-page.{html,scss,ts}`

- `.tb-search`: ограничить ширину (`flex: 1 1 280px; max-width: ~460px; min-width: 220px`) — не толкает правые
  селекты за край.
- Убрать `<mat-icon>place</mat-icon>` (булавку) внутри `.tb-chip` у каждой выбранной локации.
- Сигнал `locExpanded = signal(false)`; сигнал `locOverflow = signal(false)`.
- **Детект переполнения:** `viewChild` на ряд чипов; `ResizeObserver` (или `afterRender`) ставит
  `locOverflow.set(el.scrollWidth > el.clientWidth)` при изменении набора/размера.
- **Свёрнуто** (`!locExpanded()`): ряд чипов `flex-wrap: nowrap; overflow: hidden`; если
  `locOverflow()` — показать кнопку-тоггл **▾** (`keyboard_arrow_down`).
- **Развёрнуто** (`locExpanded()`): панель снизу (`position: absolute`, как `.tb-suggest`) со ВСЕМИ чипами
  (`flex-wrap: wrap`), крестик у каждой (`removeLocation(id)`), поле ввода + существующие подсказки; тоггл **▴**.
- Тоггл-кнопка: `(click)="locExpanded.set(!locExpanded())"`. При сбросе всех локаций — `locExpanded.set(false)`.

### W-2 · Кегль/radio выпадающих меню · `pages/feed/feed-page.scss`

Пункты `.tb-menu` (охват/сегмент/сделка) + меню сортировки: текст крупнее кнопки, огромный radio.

- Текст: на `.tb-menu` задать M3-токен `--mat-menu-item-label-text-size: 14px` (и продублировать таргетом
  текста `.mat-mdc-menu-item .mdc-list-item__primary-text`, если токен не подхватится).
- Radio-иконку (`radio_button_checked`) уменьшить: `.tb-menu .mat-mdc-menu-item .mat-icon { font-size:18px;
width:18px; height:18px; }`, ужать левый отступ/`margin`. Высота пункта `min-height: 36px`.
- Меню сортировки (`sortMenu`) тоже получает класс `.tb-menu` (или те же правила).

### W-6 · Кегль селектов = лента · `pages/feed/feed-page.scss`

Заменить `font-size: 0.875rem` → `14px` во ВСЕХ контролах тулбара (`.tb-select`, `.tb-search-input`,
`.tb-chip`, `.filter-chip`, и т.п.). После — проверить, что высоты остались `--task-first-line-min-height`
(40px) и контролы выровнены (W-2 меню — отдельно).

### W-5 · Линия под тулбаром · `pages/feed/feed-page.scss`

В `.table-header` убрать `border-bottom: 1px solid var(--extra-border-color)` (серая линия между тулбаром и
заголовками столбцов).

### W-3 · Селекты месяц/год (Occupied) · `pages/add-property/add-property-page.scss`

`.lease-row select` стилизовать как `.field input` (`padding`, `font-size:15px`, `background: var(--bg)`,
`border:1px solid var(--extra-border-color)`, `border-radius: var(--card-border-radius)`, `:focus` →
`border-color: var(--c-primary)`) + `appearance: none` + кастомная стрелка (SVG в `background`, справа) +
`cursor: pointer`. Совпадает по виду с текстовыми полями формы.

### W-4 · Commercial allowlist · `pages/feed/feed-page.ts`

В `typeTree` (computed) для `build('commercial')` отфильтровать `units` по allowlist (регистронезависимо по
`u.label_en`):

```ts
const COMMERCIAL_ALLOWLIST = [
  'office',
  'hotel apartment',
  'shop',
  'retail',
  'warehouse',
  'villa',
  'bulk unit',
  'land',
  'floor',
  'building',
  'factory',
];
// commercial: units.filter(u => COMMERCIAL_ALLOWLIST.includes(u.label.toLowerCase()))
```

Residential — без изменений. (Только лента/фильтр; форму добавления не трогаем в этом батче.)

### W-7 · 🐛 Актуализация → объект вверх ленты · `services/property-owner.service.ts` + `pages/feed/feed-page.ts` (+ `components/property-detail`)

Сейчас `actualize()` (property-detail) обновляет только сигнал панели; лента не перезагружается → дата/позиция
не меняются.

- В `PropertyOwnerService` добавить `readonly changedTick = signal(0)`; в конце успешных `actualizeProperty`,
  `archiveProperty`, `updateProperty` — `this.changedTick.update(n => n + 1)`.
- В `feed-page.component.ts` инжектить `PropertyOwnerService`; `effect`, читающий `changedTick()`, на изменении
  (кроме первого запуска) перезагружает ленту: `offset.set(0); properties.set([]); void _load()`.
- Результат: актуализированный объект пересортируется наверх (сорт по `last_actualized_at`, U-3), архивный
  исчезает. Открытая панель не закрывается.

---

## Гейты / зависимости

Без БД. Всё клиент. Деплоится сразу.

## Декомпозиция (SDD)

- **WE-A (тулбар-стили):** W-6 (14px) + W-2 (меню) + W-5 (линия). `feed-page.scss` (+ класс `.tb-menu` на
  sortMenu в html).
- **WE-B (окно локаций + commercial):** W-1 (панель/тоггл/булавка) + W-4 (allowlist). `feed-page.{ts,html,scss}`.
- **WE-C (форма-селекты):** W-3. `add-property.scss`.
- **WE-D (актуализация):** W-7. `property-owner.service.ts` + `feed-page.ts` + (по необходимости `property-detail`).

## Критерии успеха

Правые селекты не уезжают при мультиселекте; панель локаций сворачивается/разворачивается стрелкой; булавки
нет. Меню-пункты = 14px, radio маленький. Кегль всех селектов = ленты (14px), контролы выровнены. Линии под
тулбаром нет. Селекты месяц/год — в стиле формы. В Commercial только 11 типов. После «Актуализировать» объект
уезжает вверх (дата меняется). `checkFile` зелёный; юнит-тесты на новую логику (overflow/allowlist/changedTick);
полный сюит зелёный.
