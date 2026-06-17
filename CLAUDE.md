# CLAUDE.md

Guidance for Claude Code working in this repository. Super Productivity is a todo and time-tracking app on Angular + Electron + Capacitor.

<!-- GLOBAL:start — автоген из app-core/global-conventions.md; правь там + scripts/sync-global.sh -->
<!--
  КАНОН глобальных рамок поведения (А/Б/В) — единственный источник правды.
  Правь ТОЛЬКО этот файл, затем прогоняй: bash scripts/sync-global.sh
  Скрипт раздаёт этот текст в CLAUDE.md каждого репо (едет с git на Mac + VPS).
  Вставленные в репо копии руками не редактируй.
-->

# Как ты работаешь со мной — рамки поведения

Две обязательные рамки во всех проектах: **(А)** повторяющееся превращай в скиллы; **(Б)** меньше
типичных ошибок ИИ. Плюс **(В)** — архитектура агентных систем. **Tradeoff:** правила смещены в
сторону осторожности, а не скорости — для тривиальных задач включай здравый смысл.

---

## А. Скилл-инженерия — промть скиллы, а не меня

Ты работаешь не как чат, который отвечает и забывает. Ты работаешь как инженер Anthropic:
всё, что повторяется, ты превращаешь в **скилл** — переиспользуемый актив, который живёт в файле
и подключается сам. Каждая сессия делает следующую умнее. Цель — чтобы через 30 дней работы со мной
ты был кардинально полезнее, чем в первый день. Ниже 4 правила — они обязательны.

### Правило 1. Промть скиллы, а не меня

**80% задач повторяются.** Промт в чате — одноразовый: он умирает с закрытием сессии.
Скилл — нет: он живёт в файле и подтягивается автоматически.

Поэтому:

- Если ты замечаешь, что **я во второй раз объясняю одно и то же** (тон, формат, процесс, структуру
  вывода) — остановись и предложи оформить это в скилл.
- Не жди, пока я попрошу. Скажи прямо: _«Это уже третий раз. Давай оформим как скилл `<имя>`,
  чтобы больше не повторять?»_
- Скилл выбирается по полю **`description`**, а не по красивому имени. Когда пишешь description —
  формулируй точно: «когда брать этот скилл». Расплывчатое описание = скилл не подцепится автоматически.

**Триггер для тебя:** повторяющаяся инструкция от меня → кандидат в скилл.

### Правило 2. Скилл — это три слоя, а не один промт

Большинство пишут только Description + Instructions и думают, что готово. Реальная сила — на третьем
слое. Когда создаёшь или редактируешь скилл, держи все три:

| Слой                | Что это                                                     | Чего не делать                           |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| **1. Description**  | Короткая инструкция: _когда_ брать скилл                    | Не пиши размыто — иначе не активируется  |
| **2. Instructions** | Плейбук: _как_ выполнить задачу, по шагам                   | Не останавливайся здесь — это ещё не всё |
| **3. Tools**        | Скрипты, шаблоны, файлы-референсы, примеры: _чем_ выполнить | Не оставляй пустым — сюда не доходят 90% |

**Антипаттерн (так делают почти все):** красивый детальный промт + убогие инструменты без документации,
с параметрами «A» и «B».

**Как делают в Anthropic:** компактный `SKILL.md` + серьёзные инвестиции в `tools/`. Поэтому их скиллы
умеют то, чего обычные не умеют.

Структура папки скилла:

```
~/.claude/skills/<имя-скилла>/
├── SKILL.md            # description + instructions (слои 1 и 2)
├── tools/              # слой 3: скрипты, шаблоны, гайды
│   ├── *.py / *.sh     # детерминированный код
│   ├── template.md     # шаблоны вывода
│   └── *.json          # конфиги, справочники
└── examples/           # few-shot память: эталонные примеры
```

### Правило 3. Композиционные скиллы, а не монолит

Один гигантский скилл, который «делает всё», к третьей неделе становится неуправляемым: сломалось —
непонятно где; улучшил один кейс — поломал три.

Поэтому:

- Не строй монолит. Разбивай на **3–5 фокус-скиллов**, каждый делает **одно**.
- Оркестрацию между ними бери на себя — связывай их сам по ходу задачи.
- Если видишь, что скилл разросся и делает слишком много — предложи рефакторинг на несколько узких.

**Плохо:** `content-creation` (внутри: research + copy + hooks + SEO + форматирование).
**Хорошо:** `research` · `draft` · `headlines` — каждый тестируется и улучшается отдельно.

Выгода: баг находится мгновенно, улучшения копятся, ничего не строишь заново.

### Правило 4. Обновляй скиллы каждую сессию

Цель: **Claude в день 30 работы со мной должен быть заметно лучше, чем в день 1.** Скилл копит мои
edge-кейсы, голос и процесс. Промт — нет.

Поэтому в **конце каждой сессии**, где мы использовали или могли бы использовать скилл, сам задай вопрос:

> **«Что из этой сессии забрать в скилл навсегда, а что было разовой правкой?»**

Алгоритм:

1. Просмотри нашу переписку после применения скилла.
2. Найди, что я правил руками или объяснял повторно.
3. Предложи конкретные правки в `SKILL.md` или `tools/` — чтобы в следующий раз не пришлось чинить
   то же самое вручную.
4. Я принимаю нужное, отказываюсь от лишнего. Ты вносишь принятое.

30 секунд работы — и следующая сессия начинается умнее. Это и есть «эффект 30 дней».

### Сквозной принцип: можно сделать кодом — делай кодом

Если задачу можно выполнить детерминированным скриптом, а не «вычислением» модели — выноси скрипт
в `tools/` скилла и **запускай его**, а не переписывай каждый раз.

- AI генерирует код заново каждую сессию → ~тысячи токенов, нестабильный результат.
- Скрипт лежит в `tools/` → ты просто вызываешь его → стабильно, повторяемо, **0 токенов на сам код**.

Правило: повторяемая логика → код в `tools/`. Творческая/контекстная часть → модель.

### Чек-лист поведения (держи перед глазами)

- [ ] Заметил повторяющуюся инструкцию → предложил скилл (Правило 1)
- [ ] Создавая скилл, заполнил все 3 слоя, особенно `tools/` (Правило 2)
- [ ] Точный `description` — «когда брать скилл» (Правило 1 + 2)
- [ ] Не строю монолит — 3–5 фокус-скиллов, оркестрирую сам (Правило 3)
- [ ] В конце сессии спросил «что забрать в скилл навсегда?» (Правило 4)
- [ ] Повторяемую логику вынес в скрипт `tools/`, а не генерирую заново

---

## Б. Поведенческие правила — меньше типичных ошибок ИИ

### 1. Думай до кода

**Не предполагай. Не прячь непонимание. Показывай tradeoff'ы.**

Перед реализацией:

- Проговори допущения явно. Не уверен — спроси.
- Несколько трактовок — покажи их, не выбирай молча.
- Есть путь проще — скажи. Возражай, когда обоснованно.
- Что-то неясно — остановись. Назови, что именно непонятно. Спроси.

### 2. Сначала простота

**Минимум кода, решающий задачу. Ничего спекулятивного.**

- Никаких фич сверх запрошенного.
- Никаких абстракций для одноразового кода.
- Никакой «гибкости»/«конфигурируемости», которую не просили.
- Никакой обработки невозможных сценариев.
- Написал 200 строк, а можно 50 — перепиши.

Спроси себя: «Сеньор сказал бы, что это переусложнено?» Если да — упрости.

### 3. Хирургические правки

**Трогай только то, что обязан. Убирай только свой мусор.**

Редактируя существующий код:

- Не «улучшай» соседний код, комментарии, форматирование.
- Не рефактори то, что не сломано.
- Соблюдай существующий стиль, даже если сделал бы иначе.
- Заметил несвязанный мёртвый код — упомяни, не удаляй.

Когда твои правки создают сирот:

- Удали импорты/переменные/функции, которые **твои** изменения сделали неиспользуемыми.
- Не трогай ранее существовавший мёртвый код без запроса.

Тест: каждая изменённая строка должна прямо вытекать из запроса.

### 4. Исполнение от цели

**Определи критерий успеха. Крути цикл до верификации.**

Превращай задачи в проверяемые цели:

- «Добавь валидацию» → «Напиши тесты на невалидный ввод, затем сделай, чтобы прошли»
- «Почини баг» → «Напиши тест, воспроизводящий его, затем сделай, чтобы прошёл»
- «Отрефактори X» → «Тесты зелёные до и после»

Для многошаговых задач — короткий план:

```
1. [Шаг] → проверка: [как убедился]
2. [Шаг] → проверка: [как убедился]
3. [Шаг] → проверка: [как убедился]
```

Сильные критерии успеха дают крутить цикл самостоятельно. Слабые («сделай, чтобы работало») требуют
постоянных уточнений.

**Правила работают, если:** меньше лишних изменений в диффах, меньше переписываний из-за
переусложнения, и уточняющие вопросы приходят **до** реализации, а не после ошибок.

---

## В. Архитектура агентных систем — скелет, держащий нагрузку

Когда проектируешь или строишь систему из нескольких агентов/сервисов (а не один монолитный агент) —
держи эти 8 правил. Модели и инструменты устареют, скелет переживёт их.

### 1. Дроби на роли — не один мозг

Один агент = одна узкая задача. Шесть простых узких агентов вывозят лучше одного универсала с 40
инструкциями: короче контекст, меньше галлюцинаций, ошибку видно на конкретном шаге. Не пихай всё в одного.

### 2. Единый источник правды — отдельно от инструкций

Все факты (цифры, даты, цены, имена) — в ОДНОМ источнике. Каждый агент читает его первым; факт правишь
только там → подтянется везде. ⛔ Не путай с `CLAUDE.md`: он = «как работать» (инструкции), файл фактов =
чистые данные. Смешаешь — помойка. Когда факты меняются — нужна обработка изменений (память + инвалидация),
а не копипаст в пять промптов.

### 3. Цепочки зависимостей — стадии, не каша

Следующий агент не стартует, пока не отработал предыдущий (нечего читать → мусор на выходе). Зависимости
«кто кого ждёт» прописаны прямо в инструкциях.

### 4. Контроль качества в два слоя

Автор себя не проверит — ему и так норм. Сначала самопроверка (агент сверяет факты перед сдачей), потом
отдельный ревьюер свежим взглядом. Второй слой ловит то, что первый пропустил.

### 5. Передавай первоисточник, не пересказ

По цепочке пересказов смысл уплывает. Агент передаёт дальше точные цифры/цитаты/конкретику, а не свои
выводы. Вывод без источника («клиенты хотят подешевле» — откуда?) — не верить; следующий должен суметь
перепроверить.

### 6. Память и лог решений — раздельно

Система помнит две разные вещи: **(а)** что уже выяснила (инсайты копятся в памяти, дописываются и
подтягиваются) и **(б)** что решил ты («это убрать, то добавить» — отдельный лог). Иначе каждый запуск
с нуля, и переспрашивает то, что ты проговорил 10 раз.

### 7. Карта связей — что перезапускать

Обратная сторона правила 3. Видь всю карту «кто на чьих результатах стоит». Поменял отчёт в начале →
сразу ясно, какие 5 агентов ниже перегнать, а какие 20 не трогать. Без карты любая правка = перезапуск
всего и сжигание токенов.

### 8. Человек в критических точках

Полная автономия — миф и способ огрести. Оставляй точки, где человек смотрит и подтверждает, прежде чем
идти дальше.

### Чек-лист

- [ ] Узкие роли, не монолит (1)
- [ ] Факты в одном источнике, отдельно от `CLAUDE.md` (2)
- [ ] Зависимости прописаны, стадии не стартуют рано (3)
- [ ] Самопроверка + отдельный ревьюер (4)
- [ ] Передаю первоисточник, не пересказ (5)
- [ ] Память и лог решений раздельно (6)
- [ ] Карта связей: знаю, что перезапускать (7)
- [ ] Человек подтверждает в критических точках (8)

**Скелет работает, если:** поломку видно на конкретном шаге; правка факта в одном месте расходится по
всей системе сама; мелкое изменение не требует перезапуска всего; на выходе — проверяемая конкретика,
а не уплывший пересказ.

<!-- GLOBAL:end -->

## Required reading per task

- Styling changes → [`docs/styling-guide.md`](docs/styling-guide.md)
- User-facing functionality changes → [`docs/documentation-guide.md`](docs/documentation-guide.md)
- Sync, op-log, vector clocks → [`docs/sync-and-op-log/`](docs/sync-and-op-log/)
- Effects/reducers/bulk-dispatch touching synced state → [`docs/sync-and-op-log/contributor-sync-model.md`](docs/sync-and-op-log/contributor-sync-model.md)
- E2E tests → [`e2e/CLAUDE.md`](e2e/CLAUDE.md)
- Load-bearing decisions → [`ARCHITECTURE-DECISIONS.md`](ARCHITECTURE-DECISIONS.md)

## Core commands

**ALWAYS run `npm run checkFile <filepath>` on every `.ts` or `.scss` file you modify** before reporting work as done.

```bash
npm run checkFile <filepath>   # prettier + lint a single file
npm run prettier               # multi-file format
npm run lint                   # multi-file lint
npm test                       # all unit tests (Jasmine/Karma, .spec.ts co-located)
npm run test:file <filepath>   # single spec
npm run e2e                    # all E2E (Playwright, slow)
npm run e2e:file <path> -- --retries=0   # single E2E (~20s/test); add --grep "name" for one test
npm start                      # Electron dev
ng serve                       # web dev (or npm run startFrontend)
npm run dist                   # production build (all platforms available locally)
```

For SuperSync E2E (docker-compose) and the full E2E reference, see [`e2e/CLAUDE.md`](e2e/CLAUDE.md).

## Project rules

- **Translations:** UI strings go through `T` / `TranslateService`. Edit only `en.json`; never other locales.
- **Privacy:** no analytics or tracking — user data stays local unless explicitly synced.
- **Electron:** check `IS_ELECTRON` before using Electron-specific APIs.
- **Templates:** plain HTML, minimal CSS/classes, Angular Material sparingly. See [`docs/styling-guide.md`](docs/styling-guide.md).
- **Styling review:** do not locally restyle Angular Material or shared `src/app/ui/` components for one-off context needs. This includes overriding button styles via `.mat-*`, `.mdc-*`, `button[mat-*]`, or component internals in local SCSS. Prefer existing inputs/classes/tokens; if a variant must exist, make it reusable or add it to the shared style layer.
- **Strict TypeScript:** no `any` (use `unknown` if truly unknown).
- **State:** never mutate NgRx state — return new objects in reducers. Prefer Signals to Observables.
- **Tests:** add unit tests for new services and state logic.
- **Task component is a hot path:** every change to `src/app/features/tasks/task/task.component.*` (rendered once per task in long, scrollable lists) must be double-checked for negative performance impact — avoid function/getter calls in the template, extra change-detection work, and uncleaned subscriptions; verify against a large task list.

## Sync-correctness rules

Touched on most state-related PRs. Read the linked source/doc for full reasoning before editing. Rules 1–3 and 6 are one invariant — _one user intent = one op; replayed/remote ops must not re-trigger effects_ — fully explained in [`docs/sync-and-op-log/contributor-sync-model.md`](docs/sync-and-op-log/contributor-sync-model.md).

**Every change to the sync system is high-risk:** a subtle bug can silently corrupt or lose user data across devices and is hard to recover from. Carefully check each change for correctness and possible failure modes (replay determinism, concurrent/remote edits, vector-clock conflicts) and call out the risks before reporting work as done.

1. **Effects inject `LOCAL_ACTIONS`**, never `Actions` (`ALL_ACTIONS` only for the op-log capture effect; remote archive side effects → `ArchiveOperationHandler`, not `ALL_ACTIONS`). Lint-enforced (`no-actions-in-effects`). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md), `src/app/util/local-actions.token.ts`.
2. **Prefer action-based effects**; a selector-based effect needs `skipDuringSyncWindow()`. Lint-enforced (`require-hydration-guard`). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md).
3. **Multi-entity change = meta-reducer**, not an effect fan-out (one reducer pass = one op). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md), `src/app/root-store/meta/task-shared-meta-reducers/`.
4. **Logical clock:** route "what day is this?" through `DateService` (`getLogicalTodayDate`, `isToday`, `todayStr`). Pure reducers/selectors take `startOfNextDayDiffMs` as an arg and call `isTodayWithOffset` for replay determinism. The raw `DateService.startOfNextDayDiff` is `private`; use `getStartOfNextDayDiffMs()` at service boundaries.
5. **`TODAY_TAG` (`'TODAY'`) is virtual** — never add to `task.tagIds`; membership comes from `task.dueWithTime` or `task.dueDay`. `TODAY_TAG.taskIds` only stores ordering. → `ARCHITECTURE-DECISIONS.md` Decision #2.
6. **Bulk dispatch loop:** `await new Promise(r => setTimeout(r, 0))` after the loop (else 50+ rapid dispatches lose state). → [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md), `OperationApplierService.applyOperations()`.
7. **`SYNC_IMPORT` / `BACKUP_IMPORT`** replace state and intentionally drop concurrent ops (CONCURRENT or LESS_THAN by vector clock) — by design, not a bug. → `SyncImportFilterService`.
8. **Vector clocks:** `MAX_VECTOR_CLOCK_SIZE = 20`. Server prunes after conflict detection, before storage. → `docs/sync-and-op-log/vector-clocks.md`.
9. **Logging:** `Log.log({ id: task.id })`, never `Log.log(task)` or `Log.log(title)` — log history is exportable, never log user content.

## Commit messages

Angular format `type(scope): description`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Examples: `feat(tasks): add recurring task support`, `fix(sync): handle network timeout`. **Never** `fix(test):` or `fix(e2e):` — test changes use `test:`.

## Anti-patterns

| Avoid                                                                      | Do instead                                |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| `any` type                                                                 | proper types, `unknown` if truly unknown  |
| Direct DOM access                                                          | Angular bindings, `viewChild()`           |
| Side effects in constructors                                               | `async` pipe or `toSignal`                |
| Subscribing without cleanup                                                | `takeUntilDestroyed()` or async pipe      |
| `NgModules` for new code                                                   | standalone components                     |
| Re-declaring Material theme styles                                         | existing theme variables                  |
| One-off `.mat-*`, `.mdc-*`, `button[mat-*]`, or shared component overrides | reusable inputs, tokens, or shared styles |

---

# MrSQM (форк-переосмысление)

Этот репозиторий — форк Super Productivity, переделываемый в **MrSQM**: desktop/mobile-клиент
B2B-платформы обмена недвижимостью для дубайских риелторов. Дизайн/UX/темы Super Productivity
сохраняются, функциональность — MrSQM. Весь продуктовый код — в `src/app/mrsqm/`.

**Связанные проекты группы:** admin `~/Projects/admin` · mainapp `~/Projects/mainapp` (web-клиент того же продукта) · parser4 · parser5. Общая Supabase self-hosted.

> ⚠️ **Пользователь НЕ программист.** Инфраструктурные задачи, которые нельзя выполнить из чата (Coolify-деплой, DNS, серверные настройки), оформлять как пошаговую инструкцию «что нажать/вставить», не как технические заметки. Не предполагать знание git/CLI/Angular/SQL. Рутину (коммиты, пуши, линт, формат) брать на себя.

## git

- `origin` — твой репо (github.com/nazarovitalii/superapp), ветка **main**. Сюда пушим, отсюда деплоит Coolify.
- `upstream` — Super Productivity (johannesjo). Только `pull` обновлений, не пушить.

## Система документирования MrSQM

Контент-доки MrSQM — в `docs/` (отдельно от upstream-доков Super Productivity):

| Документ               | Что внутри                                             |
| ---------------------- | ------------------------------------------------------ |
| `docs/README.md`       | Бизнес-логика, продукт                                 |
| `docs/architecture.md` | Стратегические решения (auth, роли, подписки, AI, A2A) |
| `docs/database.md`     | Схема БД (таблицы/VIEW/RPC/RLS)                        |
| `docs/tabs.md`         | Экраны UI                                              |
| `docs/tests.md`        | Прод-тесты (T-N)                                       |
| `docs/TODO.md`         | Беклог                                                 |
| `docs/commits.md`      | История коммитов (хук дописывает)                      |

**При каждом деплое** пройти чеклист 7 файлов (см. `/deploy` skill) → `/export-convo` → `/daily-summary`.

## Рутины (`.claude/skills/`)

`/deploy` · `/export-convo` · `/daily-summary` · `/migrate` · `/test-prod`.
Hooks: `.claude/settings.json` (PreCommit-блок секретов + PostCommit-автодопись `docs/commits.md`/`docs/database.md`).
Rules: `src/app/mrsqm/**` (Angular/Supabase) + `docs/migrations/**` (SQL/RLS).
⚠️ `.claude/` в `.gitignore` (от upstream) — skills/hooks работают локально, в репо не уходят.

## Безопасность (MrSQM)

- ⛔ Изменения БД — только с явного согласия (объяснить → спросить → ждать). SQL писать в `docs/migrations/`, читать БД (SELECT) — можно.
- RLS обязателен для пользовательских данных (клиент на anon-ключе).
- Общая БД — не трогать чужие таблицы (`bayut_*` = admin/парсеры).
- После пуша — TG-summary (тот же бот/чат, что admin), не переспрашивать.
