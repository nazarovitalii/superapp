# Continuation Prompt — Edit-Redo эпик (SP-A/B/C) + хвосты

Стартовый контекст для следующей сессии. Самодостаточно.

---

## Контекст проекта

**superapp** = форк Super Productivity (Angular/Electron/Capacitor), переосмыслен как **MrSQM** — CRM-клиент для дубайских риелторов. Код MrSQM — `src/app/mrsqm/`. Общая Supabase self-hosted (`ubuntu@51.83.197.222`, контейнер `supabase-db-*`, роль `supabase_admin`). Деплой: GitHub Actions → GHCR → Coolify (`cancel-in-progress: true`). Все ответы/комментарии/UI — **на русском**. Пользователь НЕ программист.

**Гейты (ОБЯЗАТЕЛЬНО):**
- DDL на прод — только явное «да» создателя, **с показом финального SQL** (классификатор требует «да» именно на этот SQL; повторно — если SQL менялся после «да»).
- Пуш/деплой — только явное «пушь»/«деплой» (отдельно от «да» на миграции).
- `npm run lint && npm run buildFrontend:prodWeb` перед КАЖДЫМ пушем.
- `npm run checkFile <file>` после каждого изменённого `.ts`/`.scss`/**`.html`**/`.spec.ts` (урок: checkFile на .ts/.scss НЕ покрывает .html → prettier-ошибки всплывают на репо-lint перед пушем; субагенты обязаны checkFile КАЖДЫЙ тронутый файл вкл. .html).
- Один `git push`. `git push --no-verify` разрешён (pre-push гоняет полный сьют; 4 падающих теста `TaskViewCustomizerService` — upstream Super Productivity, не наши).
- Реализация — **Subagent-Driven** (SDD): свежий субагент на задачу + per-task ревью + финальное опус-ревью. Контроллер оркеструет.

---

## Что сделано в этой сессии (2026-06-24)

### WP-M v1 (редактирование листинга) — ЗАДЕПЛОЕНО, но UI забракован создателем
- **БД (применено в прод, верифицировано):**
  - `edit_property(...)` — whitelist-RPC (SECURITY DEFINER, owner-check; неизменяемые поля физически не в сигнатуре). T-WPM1.
  - `get_property` патчи: `+public_location_id`, `+original_price` (аддитивно, staleness-proof `replace()`).
  - `property_photos` RLS: `+photos_update`, `+photos_delete` (owner-scoped) — иначе reorder/delete молча no-op.
  - Все в `docs/migrations/applied/2026-06-24-wp-m-*.sql`.
- **Фронт (задеплоен, коммиты `4ec8ba8a3..ce0318b26`):** standalone `pages/edit-property/`, роут `/mrsqm/edit/:id`, RPC-сервисы (`editProperty`, `deletePhoto`, `reorder`), owner-панель навигирует на edit, старый инлайн-редактор убран.
- ⚠️ **Создатель забраковал UI:** «ужасно, бегунок визуально сломан, испортил дизайн». Причина — своя вёрстка (`ep-*`, таб-бар) вместо копии мастера добавления. → переделываем (SP-A, см. ниже).

### Хвосты WP-M (НЕ закрыты)
1. **Фаза B — `DROP update_property` + `DROP republish_property`** — ПОСЛЕ подтверждения, что деплой live (иначе старый прод-фронт сломается). Файл: подготовить `docs/migrations/2026-06-24-wp-m-drop-legacy-rpcs.sql` (см. план WP-M Task 9). Гейт «да».
2. **Прод-смоук T-WPM2** — открыть свой active-объект → «Изменить» → правка цены/фото → проверить ленту; rejected → «Редактировать» → «Отправить на проверку». Запись в `docs/tests.md`.

### Realtime bell (live-уведомления) — контракт передан
- Бриф: `docs/superpowers/briefs/2026-06-24-bell-notifications-realtime-contract.md`. Решены 12 вопросов + B1/K2'/K4. Бэкенд — их репо `realtime`, мы только контракт + фронт-сторона.
- Ключевое: НЕ плодить второй «seen» (Рамка №0); `get_bell` джойнит display-поля как `get_feed`; теги New(`match_type='new'`)/Price Reduction(`match_type='price_drop'`); имя фильтра+`unseen_count` фронт берёт из `get_saved_filters`.
- Открыто у владельца: B2 (`GOTRUE_JWT_SECRET` в Coolify notifier), B3 (WSS-сабдомен, реком. `wss://notify.mrsqm.com`).

### Скиллы обновлены
- `CLAUDE.md` checkFile-правило: включает `.html`/`.spec.ts` + субагенты обязаны.
- `.claude/skills/migrate/SKILL.md`: пре-флайт покрытия (RLS под каждый cmd; RPC отдаёт все UI-поля).

---

## ЭПИК Edit-Redo — декомпозиция (утверждена создателем)

Порядок: **A-визуал первым**, потом B→C.

### SP-A — Пересборка окна редактирования (мастер 1:1 с добавлением) — **ТЕКУЩАЯ ЗАДАЧА**
- **Спека УТВЕРЖДЕНА:** `docs/superpowers/specs/2026-06-24-edit-redo-wizard-design.md` (создатель смотрит; если ок — сразу writing-plans).
- Суть: меняем презентацию, сохраняем логику. Существующий `edit-property.component.ts` (префилл, save, бегунок, фото) ОСТАЁТСЯ. Переписываем: шаблон → **линейный мастер** (`step()`/`next()`/`prev()`, индикатор `steps-row`, Назад/Далее, на последнем — Сохранить) 1:1 с add; SCSS → **общий партиал** `src/app/mrsqm/pages/property-form.scss` (и add, и edit `@use`); бегунок — **точный блок `.reveal`** из add (ticks/track/fill/dot/thumb).
- **5 шагов:** (1) Адрес-breadcrumb read-only + бегунок + Maid/Study/Hotel/Vastu + BUA/Plot + Этажность + Вид + Расположение + Удобства + Мебель; (2) Цена (original read-only если задана) + Занятость + Видимость; (3) Тип листинга; (4) Описание; (5) Фото+планировка.
- Сохранение — **текущее** (`edit_property`). Сценарий 6 (publish-роутинг) — SP-C.
- **Следующий шаг:** invoke `superpowers:writing-plans` по этой спеке → план `docs/superpowers/plans/2026-06-24-edit-redo-wizard.md` → SDD.

### SP-B — Official / Form A фундамент (ПОСЛЕ A)
Новые поля Official-листинга (в форме ДОБАВЛЕНИЯ + edit + схема + Storage):
- **Contract Number**
- **Start Date**, **End Date** (срок действия договора)
- **Is Exclusive** (yes/no)
- **Password to Form A PDF** (юзер вводит пароль к PDF, который приложит — чувствительно: продумать хранение/шифрование, не плейнтекст по возможности)
- **Attach Form A PDF** — присоединение файла, **ТОЛЬКО PDF**
- Нужно: новые колонки на `properties` (contract_number, contract_start, contract_end, is_exclusive, form_a_*), приватный Storage-бакет под Form A (PDF-only mime, RLS owner+moderator, НЕ public), RLS. Решить судьбу текущих `title_deed_*`/`plot_number`/`municipality_number` (оставляем/заменяем).
- DDL-гейт «да». Модерация реальна и кросс-репо (модератор в Админке пишет `rejection_reason`, ставит active/rejected).

### SP-C — Движок публикации/статусов (ПОСЛЕ B) — СЦЕНАРИИ VERBATIM

> Кнопки по статусу+типу+сроку договора, переходы publish/republish/renew, спец-флоу «Form A < 30 дней», save-vs-publish.

**Сценарий 1 — публикуется впервые:**
- Pocket + visibility Friends → модерация НЕ требуется.
- Official + (Friends|Public) → на модерацию.

**Сценарий 1.2 — Official впервые, не прошёл модерацию → Rejected:**
- Кнопки: **Редактировать**, **Удалить**.
- Редактировать → проходит все вкладки как будто создаёт с нуля, может править все поля.

**Сценарий 2 — был опубликован и истёк (expired):**
- Если был **Pocket** → кнопки **Опубликовать**, **Архивировать**. Опубликовать → сразу онлайн на 30 дней.

**Сценарий 2.1 — expired Official:**
- Если срок договора ещё НЕ истёк → **Опубликовать**, **Архивировать** (без модерации, сразу онлайн).
- Если срок договора **< 30 дней** → кнопки **Опубликовать**, **Архивировать**, но после «Опубликовать» → открыть **страницу 6 добавления** (только её), внизу добавить поле **Цена** (заполнить прежней, можно менять) — единственная редактируемая страница; **вверху** если Official — красивое сообщение: *«Срок вашего последнего Form A истекает менее чем через 30 дней, прикрепите обновленный Form A или смените статус объявления на Pocket Listing»*. Если переключил на **Pocket** → любая visibility (Friends|Public) → публикуется БЕЗ модерации.

**Сценарий 3 — на модерации (pending_review):** кнопка **Архивировать** → по причине «Снят с рынка».

**Сценарий 4 — архивирован «Продан»:** кнопка **Удалить**.

**Сценарий 5 — архивирован «Снят с рынка»:** кнопки **Редактировать**, **Удалить**.

**Сценарий 6 — актуальный онлайн (active):** кнопки **Поднять**, **Редактировать**, **Архивировать**.
- Редактировать → в конце кнопка **Сохранить**, если НЕ изменён тип листинга или visibility.
- Был **Official → стал Pocket** → **Сохранить** (сразу изменение онлайн-объекта).
- Был **Pocket → стал Official** → **Опубликовать** (на модерацию).
- Visibility остаётся **Friends** или меняется **Public → Friends** → **Сохранить** (сразу онлайн).
- Visibility **Friends → Public** → **Опубликовать** (на модерацию).

---

## Что делать в следующей сессии (по шагам)

1. **Если создатель одобрил спеку SP-A** → invoke `superpowers:writing-plans` по `docs/superpowers/specs/2026-06-24-edit-redo-wizard-design.md` → сохранить план в `docs/superpowers/plans/2026-06-24-edit-redo-wizard.md`.
2. **SDD-реализация SP-A** субагентами: вынос SCSS-партиала → переписать шаблон edit на мастер → бегунок `.reveal` 1:1 → нав мастера в .ts → тесты → lint+prodWeb → деплой по «пушь».
3. **Хвосты WP-M:** Фаза B (DROP, после подтверждения live) + прод-смоук T-WPM2.
4. Дальше — SP-B (Official/Form A, DDL-гейт), затем SP-C (движок сценариев).

---

## Ключевые файлы и факты

- **add-property мастер (источник копирования):** `src/app/mrsqm/pages/add-property/add-property-page.component.{ts,html,scss}`. Карта шагов HTML (0-based): 0 Категория · 1 Адрес(+бегунок `.reveal` ≈стр.269–330) · 2 Параметры(≈423–677) · 3 Цена(≈678) · 4 Состояние(≈719) · 5 Листинг(≈824) · 6 Описание(≈921) · 7 Фото(≈934).
- **edit-property (переписываем презентацию):** `src/app/mrsqm/pages/edit-property/edit-property.component.{ts,html,scss,spec.ts}`.
- **`revealIndexFromFraction`** вынесён в `src/app/mrsqm/pages/add-property/reveal-slider.util.ts` (импортить оттуда, НЕ из компонента — иначе связь lazy-чанков).
- **edit_property RPC** — `applied/2026-06-24-wp-m-edit-property.sql`. **EditPropertyPayload** + методы — `services/property-owner.service.ts`. Фото — `services/property-photo.service.ts` (`deletePhoto`/`reorder(id,photoType,urls)`/`uploadAndAttach`/`getPhotos`).
- **property-type-fields.ts** — набор полей по unit_type (переиспользуем).
- **Статусы:** `pending_review, active, rejected, expired, archived_sold, archived_withdrawn`. `OWNER_ACTIONS_BY_STATUS` в `types/database.ts` (SP-C перепишет под сценарии).
- **Прод-объект для смоука:** `5f6a3c58-b3f9-433c-a51e-72bbbf502c8f`, owner `8db1f713-c88e-44d9-b99c-f9039438393c` (active, network).

## Гочи
- `psql.sh` выпивает stdin — многострочный SQL слать аргументом, не пайпом.
- `pg_get_functiondef` без `;` в конце — при DROP+CREATE добавлять вручную; для патча куска — `replace()`/regexp с guard «якорь не найден».
- `CREATE OR REPLACE VIEW` только дописывает колонки в конец (42P16).
- eslint `no-mixed-operators` vs prettier — дробить арифметику на промежуточные переменные.
- SDD: субагенту давать task-brief файлом (`scripts/task-brief PLAN N`), ревью через `scripts/review-package BASE HEAD`; ledger `.superpowers/sdd/progress.md`.

## Незапушенные локальные коммиты (на момент хэндофа)
- `0bdd4f1db` — спека SP-A + realtime bell K2'/B2/B3 (в брифе).
- (плюс возможные docs-правки этой сессии — включить ОДНИМ пушем при следующем деплое).
