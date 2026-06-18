# Spec 2026-06-18f — Полировка тулбара ленты + правой панели объекта

Заказ создателя (дословные требования переформулированы в проверяемые задачи).
База: `b74cb16e2`. Весь код — `src/app/mrsqm/` (+ один глобальный стиль снекбара).

## Global Constraints (обязательны для всех задач)

- UI-строки на русском, КРОМЕ явных английских литералов в спеке (напр. кнопка `Add to Favourites`).
- Дизайн = Super Productivity: переиспользуем токены/компоненты SP, новый визуальный язык не вводим.
- НЕ переопределять внутренности Angular Material (`.mat-*`, `.mdc-*`, `button[mat-*]`) для разовых нужд.
  Исключение — уже существующий в проекте паттерн: scoped-`::ng-deep` через кастомный класс панели
  (напр. `.tb-menu` на `<mat-menu>`), и стиль снекбара через `panelClass` (контейнер снекбара в overlay,
  поэтому стиль ОБЯЗАН быть глобальным, а не component-scoped).
- Строгий TS: без `any` (исп. `unknown`). Standalone-компоненты, `ChangeDetectionStrategy.OnPush`, сигналы.
- NgRx не мутировать (в этой работе NgRx не затрагивается).
- `property-card` — HOT PATH (рендерится на каждую строку длинного списка): в шаблоне НЕ вызывать
  функции/геттеры, только `computed`/пайпы; без неочищенных подписок.
- Переводы: новые строки-сообщения выводим с `isSkipTranslate: true` (русские литералы) — НЕ добавлять
  ключи в `en.json`.
- Гейты: `npm run checkFile <file>` на каждый изменённый `.ts`/`.scss`; прогон затронутых spec-файлов.
- Коммит: только файлы своей задачи (на общем `main` могут идти параллельные сессии). Формат
  `type(scope): описание` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

Размерные факты (из `src/styles/_css-variables.scss`):
`--s:8px · --s-half:4px · --s-quarter:2px · --s2:16px · --task-first-line-min-height:40px ·
--task-inner-padding-top-bottom:4px · --card-border-radius:var(--radius-md) ·
--task-border-radius:var(--radius-sm) · --z-hover-controls:6`.
Видимая высота строки объекта ≈ 44px (min-height 40px + паддинги inner-wrapper). Поэтому контролы
тулбара поднимаем до **44px**.

---

# Task 1 — Тулбар ленты: автокомплит адреса + меню-селекты + размеры

Файлы: `src/app/mrsqm/pages/feed/feed-page.component.html`, `.ts`, `.scss`.

## 1A. Автокомплит «Адрес или агент» — поведение (главное)

Текущее поведение сломано: стрелка разворота не показывается (детект переполнения через
ResizeObserver/scrollWidth не срабатывает), у первого чипа не видно крестика. Делаем по-новому:

1. **1 выбранный адрес**: показывается inline как чип с ВИДИМЫМ крестиком `×` (кнопка удаления).
2. **2+ адресов**: inline остаётся ТОЛЬКО ПЕРВЫЙ чип (с `×`). Остальные inline НЕ рендерятся. Рядом
   показывается кнопка-стрелка `keyboard_arrow_down` со счётчиком оставшихся (напр. «+2»). Кнопка
   ОБЯЗАНА появляться, когда `locationFilters().length >= 2` — driver = КОЛИЧЕСТВО, НЕ переполнение.
3. Клик по стрелке открывает дропдаун-панель (`.tb-loc-panel`) со ВСЕМИ выбранными адресами как чипами,
   у каждого `×` для удаления. Иконка стрелки при открытии меняется на `keyboard_arrow_up`.
4. Дропдаун НЕ открывается автоматически при добавлении 2-го адреса — только по клику.
5. Поле ввода для добавления новых адресов остаётся видимым, пока выбрано < `MAX_LOCATIONS` (=5).
   Placeholder: `Ещё адрес` когда уже есть ≥1 адрес, иначе `Адрес или агент`.
6. Кейс выбранного АГЕНТА (`filter.agentQuery()`) — без изменений (один чип с `×`).

Удалить ставший мёртвым код детекта переполнения (хирургически, только то, что стало неиспользуемым):
сигнал `locOverflow`, `ResizeObserver`/`afterNextRender`-блок для него, `viewChild('locRow')` и
`effect`, который считает `scrollWidth > clientWidth`. Стрелка теперь управляется условием
`locationFilters().length >= 2 || locExpanded()`. Сигнал `locExpanded` оставить (он управляет дропдауном).

## 1B. Меню-селекты (scope / segment / deal / sort) — «полное уебище» → аккуратно

Сейчас в каждом пункте меню рендерится пустой `<mat-icon>` или `radio_button_checked` — выглядит грубо.

- Выбранный пункт: иконка `check` цветом `--c-primary` + текст `--c-primary` + лёгкий фон
  `--state-selected`; невыбранные — без ведущей иконки, но текст ВЫРОВНЕН (зарезервировать колонку
  иконки или одинаковый left-padding у всех пунктов).
- `.tb-menu`: скруглённая панель (`--card-border-radius`), высота пункта 40px, текст 14px, удобные
  горизонтальные паддинги. Изменения — в существующем scoped-`::ng-deep .tb-menu` паттерне (не глобально).
- Применить ко всем четырём меню: `scopeMenu`, `segMenu`, `dealMenu`, `sortMenu` (в `.html` сейчас
  `radio_button_checked` в 4 местах).

## 1C. Размеры контролов

- Высота ВСЕХ контролов тулбара (`.tb-select`, `.tb-search`, `.tb-icon-btn`, `.filter-chip`): 40px → **44px**
  (= высота строки объекта).
- Больше отступа от края селекта до текста: левый padding селектов → `var(--s2)` (16px).
- Компенсировать за счёт поискового блока: `.tb-search` сузить — напр. `flex: 1 1 200px; min-width: 150px;
max-width: 340px` (было `1 1 280px / 220px / 460px`).
- Сохранить вертикальное выравнивание всех контролов в одну линию.

## Проверка Task 1

- `npm run checkFile` на html не нужен (html не линтуется этим), на `.ts` и `.scss` — обязателен.
- `npm run test:file src/app/mrsqm/pages/feed/feed-page.component.spec.ts` — зелёный.
- Визуальный критерий (описать в отчёте): 1 адрес = чип с ×; 2 адреса = первый чип + «▾ +1», клик
  открывает список всех; меню-селекты с галочкой у выбранного; контролы 44px, поиск уже.

---

# Task 2 — Форматы дат (лента + правая панель)

Файлы: `src/app/mrsqm/util/feed-date.util.ts`, `feed-date.util.spec.ts`,
`src/app/mrsqm/components/property-detail/property-detail.component.ts`.

## 2A. Строка ленты `formatFeedDate`

- Ветка «сегодня» теперь возвращает ВРЕМЯ дня в 24ч формате `HH:MM` (zero-padded, локальная TZ),
  напр. `15:34`, `08:00`, `23:59`. (Было `Today`.)
- Yesterday и старше — БЕЗ изменений (`Yesterday`, `16 June`, `16 June 2024`).
- Добавить локальный хелпер форматирования `HH:MM` из `Date`.
- Обновить spec: два теста «Today» → ожидают время входной даты (08:00 → `08:00`, 23:59 → `23:59`).
  Остальные тесты не трогать.

## 2B. Created/Updated в правой панели — новый `formatDetailDate` (экспорт + тесты)

Формат:

1. сегодня → `Today HH:MM` (напр. `Today 15:15`)
2. вчера → `Yesterday`
3. иначе → `D MonthLong YY` (2-значный год), напр. `15 June 26`

- Реализовать как экспортируемую `formatDetailDate(iso, now?)` в `feed-date.util.ts` + тесты в spec
  (today/yesterday/старая дата, null/невалид → `null` или `''` — выбрать и покрыть тестом).
- В `property-detail.component.ts` (`vm()`): `createdLabel = formatDetailDate(d?.created_at)`,
  `updatedLabelFull = formatDetailDate(d?.updated_at ?? d?.last_actualized_at)`.
- Удалить приватный `_fmtDate` (формат `DD.MM.YYYY`), если он больше нигде не используется.

## Проверка Task 2

- `npm run checkFile` на `feed-date.util.ts` и `property-detail.component.ts`.
- `npm run test:file src/app/mrsqm/util/feed-date.util.spec.ts` — зелёный.

---

# Task 3 — Правая панель объекта: тексты, кнопки, табы, локация, сообщения

Файлы: `src/app/mrsqm/components/property-detail/property-detail.component.html`, `.ts`, `.scss`,
и ГЛОБАЛЬНЫЙ стиль снекбара (`src/styles/components/_overwrite-material.scss` или подходящий
глобальный partial — стиль контейнера снекбара обязан быть глобальным).

## 3A. Размер текста блоков

- `.section-label` (заголовки блоков): 14px → **16px**.
- `.kv-row` / `.kv-label` / `.kv-value`: 13px → **14px**.
- `.metric-row`: 13px → **14px**.
- `.section-text` уже 14px — не трогать.

## 3B. Убрать плашку «Продажа»/«Аренда» у цены

- В `.price-row .type-chips` удалить ПЕРВЫЙ `type-chip` (`{{ dealType === 'sale' ? 'Продажа' : 'Аренда' }}`)
  — дублирует строку `Deal: Sale` в блоке «Характеристики». Остальные чипы (Снижение/Срочно/Торг/
  Комиссия включена) оставить.

## 3C. «Add to Favourites» + «Поднять вверх» — одна строка, один стиль

- Под галереей: ряд из кнопок одного стиля (стиль текущей `.fav-btn` — пилюля).
- Кнопка избранного: метка `Add to Favourites` (не сохранено) / `In Favourites` (сохранено), иконка
  bookmark / bookmark_border. Логика `toggleSaved()` без изменений.
- Кнопка `Поднять вверх` (иконка `arrow_upward`): показывается ТОЛЬКО владельцу (`isOwner()`),
  вызывает `actualize()`. Тот же пилюльный стиль, в той же flex-строке.
- Из блока owner-actions удалить отдельную кнопку «Актуализировать» (оставить «Редактировать» и
  «Архивировать»).

## 3D. Табы Details / Comments / Metrics → сегмент-переключатель

- Перестилить `.detail-tabs`/`.detail-tab` в сегмент-контрол как `.type-tabs` в дропдауне типа над лентой:
  контейнер `display:grid` с фоном `--bg-darker`, скруглением `--task-border-radius`, паддингом;
  каждый таб — сегмент; активный = фон `--task-c-bg` (белый) + `box-shadow: var(--task-shadow)` +
  текст `--c-primary`, weight 600. Убрать нижнюю подчёркивающую линию.
- Сохранить бейдж счётчика комментариев (`.tab-count`). Кол-во табов динамическое (Metrics — только
  владельцу): grid должен корректно работать на 2 и на 3 таба.

## 3E. Таб «Расположение»

- `.loc-scope-tag` («(что видишь ты)» / «(что видят все)»): размер 0.72rem → **14px** (как `.section-text`),
  цвет оставить серым (`--text-color-muted`).
- Между двумя строками адреса (владельца «что видишь ты» и публичной «что видят все») добавить
  короткую горизонтальную линию-разделитель (тонкий divider, напр. короткая `border-top`/элемент шириной
  ~40–64px цвета `--extra-border-color`).

## 3F. Убрать строку статистики

- Удалить блок `.stats-row` целиком (строки «Обновлено {updatedLabel}» и «{viewsCount} просм.»).
- Удалить ставшие неиспользуемыми `.stats-row`/`.stat-item` стили; в `vm()` поля `updatedLabel`/
  `viewsCount` убрать, если больше не используются (хирургически).

## 3G. Модуль сообщений (переиспользуем `SnackService`)

SP уже имеет `SnackService` (`src/app/core/snack/snack.service.ts`) поверх MatSnackBar — ИСПОЛЬЗУЕМ его,
новый модуль НЕ создаём.

- Инжектить `SnackService`. Заменить инлайновый серый `.owner-msg` на снек-сообщения:
  - actualize успех → `type:'SUCCESS', msg:'Объект актуализирован и поднят наверх', ico:'arrow_upward'`
  - actualize ошибка → `type:'ERROR', msg:'Не удалось актуализировать'`
  - saveEdit: успех → SUCCESS `'Сохранено'`; невалидная цена → `type:'ERROR', msg:'Укажите корректную цену'`;
    ошибка → ERROR `'Не удалось сохранить'`
  - archive: SUCCESS `'Отмечено: продан'` / `'Снято с публикации'`; ошибка → ERROR `'Не удалось изменить статус'`
  - Все — с `isSkipTranslate: true`.
- Каждый вызов с `config: { horizontalPosition: 'left', verticalPosition: 'bottom', panelClass: 'mrsqm-snack' }`
  — сообщение появляется ВНИЗУ СЛЕВА, плавающее (Google Material), в стиле строки ленты.
- Удалить сигнал `ownerMsg` и блок `@if (ownerMsg())` в шаблоне.
- ГЛОБАЛЬНЫЙ стиль `.mrsqm-snack` (контейнер `.mat-mdc-snack-bar-container` с этим panelClass):
  `border-radius` как карточка ленты (`--card-border-radius`), `box-shadow` как у строки
  (`--task-selected-shadow` или `--task-detail-shadow`) — чтобы визуально совпадало со строкой ленты.

## Проверка Task 3

- `npm run checkFile` на `.ts`, `.scss` и на затронутый глобальный `.scss`.
- `npm run test:file src/app/mrsqm/components/property-detail/property-detail.component.spec.ts` — зелёный
  (поправить тест, если он завязан на удалённый `ownerMsg`/`stats-row`).

---

# Task 4 — Фикс: плашка «в избранное» при ховере строки ленты

Файлы: `src/app/mrsqm/components/property-card/property-card.component.*` (при необходимости —
`feed-page`). Использовать systematic-debugging.

Симптом (со слов создателя): при наведении на строку ленты плашка добавления в избранное не работает.
Ожидаемо: при hover строки появляются `.hover-controls` (кнопки bookmark + развернуть), клик по bookmark
переключает избранное.

- Воспроизвести и найти корневую причину. Кандидаты: логика показа
  `@media (hover:hover){ .first-line:hover .hover-controls }`; стэкинг/`z-index` (`--z-hover-controls:6`)
  относительно `.box` и расширения активной строки (`right:-234px`); перекрытие sticky `.table-header`
  (`z-index:10`); обработчик `saveClick`/`stopPropagation`.
- HOT PATH: только `computed`/пайпы в шаблоне, без функций/геттеров, без неочищенных подписок.
- Починить причину и проверить. Если воспроизвести/проверить без живой авторизованной ленты нельзя —
  применить наиболее вероятный безопасный фикс и ЧЁТКО описать в отчёте, что именно не удалось проверить
  вживую (это поле создатель подтвердит визуально).

## Проверка Task 4

- `npm run checkFile` на изменённые `.ts`/`.scss`.
- `npm run test:file src/app/mrsqm/components/property-card/property-card.component.spec.ts` — зелёный.
