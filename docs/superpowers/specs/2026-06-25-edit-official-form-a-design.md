# Дизайн: SP-C (срез 1) — редактирование Official + инвариант модерации Form A

> **Дата:** 2026-06-25 · **Статус:** дизайн утверждён к планированию · **Эпик:** A (мастер edit, задеплоен) → B (Official/Form A фундамент, задеплоен) → **C (движок публикации; это — первый срез)**.
> **Контекст:** В окне редактирования (`edit-property`) шаг «Листинг» под выбором «Official» не показывает никаких полей (в форме _добавления_ поля Form A появились в SP-B, а edit намеренно не трогали). Создатель хочет паритет: в edit под Official — те же поля Form A, что в add, с корректным роутингом «Сохранить vs Опубликовать».
> **Принцип:** модерация Official — это **инвариант состояния** в БД (единый источник правды), а не действие, которое клиент обязан не забыть вызвать. Минимум кода, без обхода через devtools, без дублирования правила.

## 0. Цель

В `edit-property` под типом «Official» показать поля Form A как в add (Contract №, срок, Exclusive, загрузка нового Form A PDF, пароль). Приложенный новый Form A или переход Pocket→Official уводят листинг на модерацию (`pending_review`); правка без нового Form A у уже одобренного объекта — просто «Сохранить» (остаётся `active`). Enforce — серверным триггером, не клиентом.

## 1. Закрытые решения

| #                     | Решение                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Объём                 | **Узкий срез:** только edit-Official поля + роутинг сохранения через инвариант. Остальной SP-C (кнопки по статусам, expiry, «Form A <30 дней», архив-флоу, «Add new» в карточке, общая модерация по видимости) — отдельно. |
| Form A в edit         | **Опционален.** У уже Official с валидным (одобренным свежим) Form A правка цены/описания/Exclusive → «Сохранить» (без модерации). Приложен **новый** Form A PDF (или Pocket→Official) → новая строка + на модерацию.      |
| Механизм статуса      | **Инвариант в БД-триггере** (не RPC, решающий на клиенте — отклонено как костыль с дырой обхода).                                                                                                                          |
| Инвариант             | **Official может быть `active` только если его САМЫЙ СВЕЖИЙ Form A одобрен (`approved_at IS NOT NULL`); иначе статус принудительно `pending_review`.**                                                                     |
| Form A insert-only    | Правка существующей строки невозможна. «Изменить контракт» = приложить новый Form A (новая строка, как SP-B).                                                                                                              |
| `is_exclusive` правка | Через `edit_property` (+параметр). Смена Exclusive — «Сохранить» (это флаг properties, не Form A; ре-модерацию не триггерит).                                                                                              |
| Кнопка финала         | **UX-подсказка** на клиенте («Опубликовать» если новый Form A / Pocket→Official / станет public из non-public; иначе «Сохранить»). Сервер авторитетен независимо от подписи.                                               |

## 2. БД (2 изменения, DDL-гейт «да» + ROLLBACK-смоук)

### 2.1 Триггер `BEFORE INSERT OR UPDATE` на `public.properties` — владелец инварианта

Псевдо-тело:

```sql
DECLARE v_latest_approved boolean;
BEGIN
  IF NEW.listing_type = 'official' AND NEW.status = 'active' THEN
    SELECT (fa.approved_at IS NOT NULL) INTO v_latest_approved
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
```

- **Только ужесточает** (`active`→`pending_review`), никогда не активирует → с логикой `edit_property` не конфликтует, композируется.
- **Покрывает add-INSERT** → закрывает отгруженную дыру SP-B (клиентский `status` для official становится неважен).
- **Модератор проходит без спец-логики** (триггер смотрит на факт одобрения Form A, а не на роль): одобрил свежую строку → перевёл в active → триггер пропускает.
- **Не-official и Pocket — не трогаются** (условие `listing_type='official'`).
- **Композиция с триггерами:** наш BEFORE-триггер ставит финальный `status`; AFTER-триггеры RT-2 (match-fan-out на `active`) видят уже финальный статус → при `pending_review` не сработают (корректно). Не зависит от `set_property_price_flags`/`update_updated_at`.

### 2.2 `edit_property` — добавить `p_is_exclusive`

- Смена сигнатуры (новый параметр) → **`CREATE OR REPLACE` не подходит, нужен DROP+CREATE** с переписыванием всего тела; **тело берём из ЖИВОЙ БД** (`pg_get_functiondef`), добавляем `;` после `$function$`, применяем транзакционно (gotcha смены сигнатуры).
- Добавить параметр `p_is_exclusive boolean DEFAULT false` и в `UPDATE properties SET ... is_exclusive = p_is_exclusive`.
- Статус-логику RPC **не меняем** (инвариант official держит триггер). Существующее поведение (active→active; rejected/withdrawn→public?pending_review:active; pending/expired/sold→exception) сохраняется.

### 2.3 `get_property` — без изменений

Уже возвращает `form_a` (массив строк) и `is_exclusive` (SP-B). Префилл edit берёт их оттуда.

## 3. Фронт `edit-property`

### Шаг «Листинг» (official)

- Под чипами типа листинга, при `listingType()==='official'` — блок Form A теми же классами/полями, что в add (партиал `_property-form.scss`): Contract № · срок (две даты) · **Exclusive** (тоггл) · загрузка нового Form A PDF (только PDF) · пароль. Все опциональны.
- (Опц., приятно) показать текущий Form A read-only сверху (последняя строка из `form_a`: `Form A {start}–{end} · {статус}`).

### Префилл

- `is_exclusive` ← `detail.is_exclusive`. Поля нового Form A — пустые (это «приложить новый», а не правка старого).

### Сабмит

1. Если official и приложен **новый** PDF: `uploadFormA` + `insertFormA` (сервис SP-B, `upsert:false`) **ДО** вызова `edit_property` → свежая неодобренная строка появится раньше, чтобы триггер её увидел.
2. Вызвать `edit_property(... p_is_exclusive=isExclusive())` (расширенная сигнатура).
3. Ошибка Form A — не уходить молча: как в add (флаг, показать ошибку, не навигировать) — переиспользовать тот же паттерн.

- `is_exclusive` сохраняется всегда (через RPC), независимо от Form A.

### Кнопка финала (UX-подсказка)

- «Опубликовать», если: приложен новый Form A, ИЛИ Pocket→Official, ИЛИ (на rejected/withdrawn) visibility станет `public` из non-public. Иначе «Сохранить». Логика подписи чисто клиентская; итоговый статус решает сервер (триггер + RPC).

## 4. Границы scope (НЕ здесь → SP-C)

- Общая модерация по видимости для **не-official** (Friends→Public) — отдельная история (нет Form A-флага).
- Кнопки по статусам в карточке, expiry/«Продлить», спец-флоу «Form A <30 дней», архив-флоу («Снят»/«Продан»), «Add new» в карточке/«Опубликовать вместо Сохранить»/Cancel — SP-C.
- Редактирование полей **существующей** строки Form A (insert-only).
- `edit_property` по-прежнему запрещает правку в статусах pending/expired/sold.

## 5. Контракт Админки (обновление)

В `docs/superpowers/briefs/2026-06-25-admin-form-a-moderation-contract.md` дописать: **порядок одобрения** — сначала `UPDATE property_form_a SET approved_at=now(), approved_by=...` (свежая строка), затем `UPDATE properties SET status='active'`; либо обе операции в ОДНОЙ транзакции. Иначе BEFORE-триггер вернёт листинг в `pending_review` (свежий Form A ещё не одобрен). Рекомендация: атомарный approve (одна транзакция / один RPC).

## 6. Безопасность / риски

- Обход модерации невозможен: даже сырой клиентский UPDATE/devtools не активирует Official без одобренного свежего Form A (триггер).
- `pdf_password` — как в SP-B: RLS таблицы, не в `get_property`, не логировать.
- **Высокий риск:** триггер срабатывает на КАЖДУЮ запись `properties`. Обязательно: ROLLBACK-смоук всех веток; проверка, что не-official и Pocket не затронуты; проверка композиции с RT-2 (AFTER видит финальный статус); проверка, что одобрение модератора (Form A→active) проходит.

## 7. Тестирование

- **БД (ROLLBACK-смоук):** триггер — (1) official+active без одобренного Form A → pending_review; (2) official+active со свежим одобренным → active; (3) official, свежая строка не одобрена (новый Form A) → pending_review; (4) не-official active → не тронут; (5) одобрение модератора (Form A approved → properties active) проходит. `edit_property` отдаёт/пишет `is_exclusive`; сигнатура сменилась корректно (DROP+CREATE транзакционно).
- **Фронт (юнит):** edit official рендерит поля Form A; приложен новый PDF → `uploadFormA`+`insertFormA` вызваны ДО `edit_property`; `is_exclusive` уходит в payload; сбой Form A не навигирует; подпись кнопки (Опубликовать/Сохранить) по условиям.
- `checkFile` каждый тронутый файл (вкл. `.html`/`.spec.ts`); `lint`+`buildFrontend:prodWeb` перед пушем.

## 8. Файлы

- Миграция `docs/migrations/2026-06-25-spc1-official-invariant.sql` (триггер + DROP/CREATE `edit_property` с `is_exclusive`).
- `edit-property.component.{ts,html,spec.ts}` (поля Official, префилл is_exclusive, сабмит с insert Form A до RPC, подпись кнопки).
- `services/property-owner.service.ts` (метод editProperty: +`isExclusive` в payload/сигнатуре RPC-вызова).
- `services/property-form-a.service.ts` — переиспользуем (SP-B), без изменений.
- `types/database.ts` — `EditPropertyPayload` +`is_exclusive: boolean` (RPC-сигнатура сменилась → клиент обязан слать поле).
- Обновить `docs/superpowers/briefs/2026-06-25-admin-form-a-moderation-contract.md` (порядок одобрения, §5).
