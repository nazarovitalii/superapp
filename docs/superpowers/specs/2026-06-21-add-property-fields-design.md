# Дизайн: новые поля объекта (форма + деталка) — раунд 1

**Дата:** 2026-06-21
**Статус:** на вычитке у создателя
**Скоуп:** поля формы добавления объекта + отображение в деталке. **Фильтры — отдельный следующий таск** (создатель выдаст ТЗ).

---

## 1. Контекст и текущее состояние (что УЖЕ сделано в БД)

Сверено с живой БД 2026-06-21:

- **Все 5 новых колонок `properties` уже существуют:** `is_study` (bool), `original_price` (numeric), `is_below_op` (bool), `is_reduced` (bool), `cheques` (int). → DDL `ADD COLUMN` делать НЕ нужно.
- **3 новых вида уже в `property_type_values`** (`group_name='view'`): `sea_partial` (Partial Sea View), `burj_khalifa` (Burj Khalifa View), `open` (Open View), добавлены 2026-06-20. Форма рендерит виды напрямую из справочника → **они уже показываются**. Делать НЕ нужно.
- `floors_in_unit` сейчас — **text**-колонка (напр. «G+1»), фильтруется как `text[]` в `get_feed`/`get_location_path`/`get_property`.
- Цена правится владельцем через RPC `update_property(p_property_id, p_price, p_description)` (SECURITY DEFINER, только владелец). Историю цены (`previous_price`, `price_changed_at`) ведёт существующий триггер `trg_property_logs → log_property_changes()` (BEFORE UPDATE) — **его не трогаем**.
- `get_property` уже упирался в лимит аргументов `jsonb_build_object` (фикс 2026-06-17) → ключи добавляем экономно.
- В ленте (`get_feed` / `FeedParams` / `property-card`) фильтра по этажам нет, этажность в карточке не показывается → ленту в этом раунде НЕ трогаем.

---

## 2. Согласованные решения

| #   | Вопрос             | Решение                                                                                                            |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Этаж — апартаменты | Поле «Этажность», варианты Low/Middle/High Floor (`floor_level_id`, UUID — уже есть), **обязательное**             |
| 2   | Этаж — дома        | Поле «Levels», варианты G+0…G+3, **обязательное**; миграция хранения text → `floors_in_unit_id` UUID               |
| 3   | Хранение этажности | Мигрировать на UUID **сейчас** (`floors_in_unit_id` → `property_type_values`, `group_name='floors_in_unit_house'`) |
| 4   | `is_below_op`      | Авто-вычисление: `original_price IS NOT NULL AND price < original_price`                                           |
| 5   | `is_reduced`       | Системный sticky-флаг: ставится TRUE при первом снижении цены, не сбрасывается                                     |
| 6   | `cheques`          | Чипы 1 / 2 / 3 / 4 / 6 / 12, только аренда                                                                         |
| 7   | Бейджи             | Делаем в **деталке** сейчас: Reduced, Below OP; «Торг» убрать; «Снижение» → заменить на «Reduced»                  |
| 8   | Фильтры            | Следующий таск (вне этого раунда)                                                                                  |

---

## 3. Изменения по слоям

### 3.1. Форма «Добавить объект» (write-only, прямой INSERT — колонки есть)

Файлы: `pages/add-property/add-property-page.component.{ts,html}`, `property-type-fields.ts`, `types/database.ts`.

**Новые поля и сигналы:**

| Поле             | UI                                                                         | Условие показа                     | payload                          |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------- | -------------------------------- |
| `is_study`       | Чекбокс **«Study room»**, строкой под «Maid room»                          | apartment & house (как maid)       | `is_study: boolean`              |
| `original_price` | Таб «Цена», input **«What was the original price? (optional)»** (2-я цена) | `deal_type === 'sale'` (любой тип) | `original_price: number \| null` |
| `cheques`        | Таб «Цена», чипы 1/2/3/4/6/12                                              | `deal_type === 'rent'`             | `cheques: number \| null`        |

**Этажи (relabel + UUID):**

- Апартаменты: поле, что сейчас `floorLevel` → ярлык **«Этажность»**, варианты из `options.floor_levels` (Low/Middle/High Floor), **обязательное** (валидация шага «Параметры»).
- Дома: поле `floorsInUnit` → ярлык **«Levels»**, варианты из `options.floors_in_unit_house`, хранить **id** (UUID), **обязательное**.
  - Сигнал `floorsInUnit` теперь хранит `id` (а не `value`). payload: `floors_in_unit_id: this.floorsInUnit()`.
  - В `property-type-fields.ts` матрица не меняется (apartment → floorLevel, house → floorsInUnit), меняются только ярлыки в шаблоне и обязательность.

**Позиции (расположение) — два взаимоисключающих набора (ограничение фронтом):**

- Набор A (тип ряда): **Back to Back / Single Row** — выбрать ≤1.
- Набор B (позиция юнита): **Middle / Corner** — выбрать ≤1.
- Оба необязательны. Хранение прежнее — `position_ids[]` (0–2 значения).
- **House:** оба набора. **Apartment:** только набор B (Middle/Corner).
- Реализация: в шаблоне «Расположение» рендерить два под-блока по `group`-фильтру значений (`back_to_back`/`single_row` vs `middle`/`corner`); клик — radio-логика внутри набора (снять прочие того же набора, оставить чужой набор). Значения `position` берём из `options.positions` (там 4 значения с известными `value`).

**`PropertyInsert` (types/database.ts):** добавить `is_study`, `original_price`, `cheques`, `floors_in_unit_id`; пометить/убрать прежнюю `floors_in_unit` (форма перестаёт её писать).

### 3.2. Миграция БД: `floors_in_unit` text → `floors_in_unit_id` UUID

Файл: `docs/migrations/2026-06-21-floors-in-unit-uuid.sql` (обратимый, staleness-proof патчи RPC).

1. `ALTER TABLE properties ADD COLUMN IF NOT EXISTS floors_in_unit_id uuid REFERENCES property_type_values(id);` (старую `floors_in_unit` НЕ дропаем — для отката).
2. Бэкфилл: `UPDATE properties p SET floors_in_unit_id = ptv.id FROM property_type_values ptv WHERE ptv.group_name = 'floors_in_unit_house' AND ptv.value = p.floors_in_unit AND p.floors_in_unit IS NOT NULL;` (значения не пересекаются — `floors_in_unit` исторически заполняли только дома значениями G+x).
3. Патч `get_property`: **заменить** ключ `'floors_in_unit', p.floors_in_unit` на `'floors_in_unit_id', p.floors_in_unit_id` (нетто 0 новых ключей по этому пункту). Патчить через `pg_get_functiondef` + regexp в DO-блоке (не переписывать тело из доков).
4. `get_feed` / `get_location_path` — **не трогаем** в этом раунде (floors в ленте/фильтрах не задействованы). Зависимость для таска фильтров: при добавлении фильтра этажности `p_floors_in_unit text[]` → `p_floors_in_unit_id uuid[]`.

> ⚠️ Высокорисковая зона (синхронные read-RPC). Применяется только после явного «ок» создателя. SQL сначала показываю, жду подтверждения.

### 3.3. Триггер авто-флагов (отдельная функция, не трогаем `log_property_changes`)

Файл: `docs/migrations/2026-06-21-property-price-flags-trigger.sql` (обратимый).

```sql
CREATE OR REPLACE FUNCTION public.set_property_price_flags()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- ниже Original Price: производное, на каждый insert/update
  NEW.is_below_op := (NEW.original_price IS NOT NULL AND NEW.price < NEW.original_price);
  -- sticky «когда-либо снижали»: только на UPDATE, при снижении; не сбрасываем
  IF (TG_OP = 'UPDATE') AND (NEW.price < OLD.price) THEN
    NEW.is_reduced := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_property_price_flags
BEFORE INSERT OR UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.set_property_price_flags();
```

- Не зависит от `previous_price`/порядка BEFORE-триггеров (использует `OLD.price` напрямую).
- На INSERT `is_reduced` остаётся как пришло (по умолчанию false).
- `update_property()` НЕ меняем — триггер ловит UPDATE цены автоматически.

### 3.4. `get_property` — отдать новые поля для деталки

В том же патче 3.2: добавить ключи `'is_reduced', p.is_reduced` и `'is_below_op', p.is_below_op` (нетто +2 ключа). Следить за лимитом `jsonb_build_object` (при необходимости вынести в вложенный объект). `original_price`/`cheques`/`is_study` пока НЕ добавляем (не отображаются в этом раунде).

### 3.5. Деталка (`components/property-detail/property-detail.component.{ts,html}` + `types/database.ts`)

- `PropertyDetail`: добавить `floors_in_unit_id: string | null`, `is_reduced: boolean | null`, `is_below_op: boolean | null`; убрать использование `floors_in_unit` (text) из vm.
- VM:
  - `floorsInUnit: this._label(d?.floors_in_unit_id, opts?.floors_in_unit_house)` (резолв UUID → ярлык; справочник уже грузится).
  - добавить `isReduced: d?.is_reduced ?? false`, `isBelowOp: d?.is_below_op ?? false`.
- Характеристики: строку дома переименовать в **«Levels»** (значение из `floorsInUnit`). Апартаментная строка `Floor` (floor_level) остаётся.
- Блок цены (`price-row` → `type-chips`):
  - **убрать** бейдж «Торг» (`@if (vm().isNegotiable)`).
  - **заменить** бейдж «Снижение» (от `previousPrice`) на **«Reduced»** (`@if (vm().isReduced)`).
  - **добавить** бейдж **«Below OP»** (`@if (vm().isBelowOp)`) рядом с Reduced.
  - зачёркнутую `previousPrice` и бейджи «Срочно»/«Комиссия включена» оставить.

---

## 4. Вне скоупа (следующие таски)

- Фильтры по новым полям (`is_study`, `original_price`/below-OP, `cheques`, этажность UUID) + миграция `get_feed`/`get_location_path` на `floors_in_unit_id`.
- Бейджи/поля в карточке ленты (`property-card`).
- Отображение `original_price`/`cheques`/`is_study` в деталке (создатель просил только Levels + Reduced + Below OP).

---

## 5. Риски и верификация

- **Высокий риск — БД (3.2–3.4):** правки синхронных read-RPC и триггеров. SQL пишу в `docs/migrations/`, показываю создателю, **жду явного согласия** перед применением. Применение — через Studio/psql (не собирать/не применять на проде без подтверждения).
- Бэкфилл floors: проверить, что после `UPDATE` число заполненных `floors_in_unit_id` = числу непустых `floors_in_unit` (нет потерь из-за рассинхрона значений).
- Триггер флагов: юнит-проверка логикой — insert ниже OP → `is_below_op=true`; снижение цены → `is_reduced=true`; рост цены назад → `is_below_op=false`, `is_reduced` остаётся true.
- Форма: юнит-тесты — payload содержит новые поля по deal_type/unit_type; positions взаимоисключение внутри набора; обязательность этажа (apartment и house) блокирует шаг.
- `npm run checkFile` на каждом изменённом `.ts`/`.scss`; `npm test` зелёный.

---

## 6. Карта файлов

| Файл                                                          | Изменение                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pages/add-property/add-property-page.component.ts`           | сигналы is_study/original_price/cheques; floorsInUnit→id; positions radio-логика; валидация обязательного этажа; payload |
| `pages/add-property/add-property-page.component.html`         | чекбокс Study; 2-я цена; чипы чеков; ярлыки «Этажность»/«Levels»; два набора позиций                                     |
| `pages/add-property/property-type-fields.ts`                  | (ярлыки/обязательность — при необходимости)                                                                              |
| `types/database.ts`                                           | `PropertyInsert` + `PropertyDetail`: новые поля                                                                          |
| `components/property-detail/property-detail.component.ts`     | vm: floorsInUnit по id, isReduced, isBelowOp                                                                             |
| `components/property-detail/property-detail.component.html`   | «Levels»; бейджи Reduced/Below OP; убрать «Торг»                                                                         |
| `docs/migrations/2026-06-21-floors-in-unit-uuid.sql`          | колонка + бэкфилл + патч get_property (floors_in_unit_id, is_reduced, is_below_op)                                       |
| `docs/migrations/2026-06-21-property-price-flags-trigger.sql` | триггер авто-флагов                                                                                                      |
