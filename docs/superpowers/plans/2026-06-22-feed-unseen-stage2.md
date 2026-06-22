# Unseen/seen-трекинг — Стадия 2: воронка владельца + seen_contact (план)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Владелец видит вложенную воронку своего объекта `seen_preview` ⊇ `seen_full` ⊇ `seen_contact`; нажатие WhatsApp/Telegram в карточке = сигнал `seen_contact`.

**Architecture:** Новая метка `user_seen_listings.contact_at` + новый RPC `mark_listing_contact` (bump contact_at+seen_at+shown_at) + новый read-RPC `get_listing_delivery_stats` (3 DISTINCT-COUNT). Фронт: `SeenTrackingService.recordContact` на клик WA/TG; ленивый дозагруз воронки при открытии таба Metrics владельцем.

**Tech Stack:** PostgreSQL (Supabase, RPC+RLS), Angular standalone+signals, Jasmine/Karma.

**Источник:** спека `docs/superpowers/specs/2026-06-22-feed-unseen-seen-tracking-design.md` (Стадия 2).

## Global Constraints
- Код в `src/app/mrsqm/`; комментарии/UI — **на русском**; strict TS, без `any`; сигналы; NgRx-стейт не мутировать.
- RPC: `p_user_id` из клиента не передавать (RLS `auth.uid()`).
- `npm run checkFile <path>` на каждом изменённом `.ts`/`.scss` перед коммитом.
- Коммиты `type(scope): описание` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; тестовые — `test:`.
- БД-изменения применяются ТОЛЬКО с явного согласия владельца (`/migrate`). SQL пишем в `docs/migrations/`.
- Коммитить только свои файлы (`git add <пути>`, не `-A`), `--no-verify` (чужой WIP в дереве).
- `MrsqmSupabaseService.rpc<T>(fn, params?)`.
- **Решение по контакту:** отдельный RPC `mark_listing_contact` (НЕ `p_action` в `track_view` — смена сигнатуры = рискованный DROP+CREATE только что зафиксированной функции).

---

### Task 1: SQL read-side (3 файла — пишем, НЕ применяем)

**Files:**
- Create: `docs/migrations/2026-06-22-user-seen-listings-add-contact-at.sql`
- Create: `docs/migrations/2026-06-22-mark-listing-contact.sql`
- Create: `docs/migrations/2026-06-22-get-listing-delivery-stats.sql`

**Interfaces produced:**
- RPC `mark_listing_contact(p_property_id uuid) → void` (bump contact_at+seen_at+shown_at, owner-skip)
- RPC `get_listing_delivery_stats(p_property_id uuid) → jsonb {seen_preview, seen_full, seen_contact}`

- [ ] **Step 1: contact_at колонка** — `docs/migrations/2026-06-22-user-seen-listings-add-contact-at.sql`:

```sql
-- Стадия 2: сильнейший сигнал воронки «нажал контакт WA/TG».
-- Аддитивно, идемпотентно. Драйвит seen_contact.
ALTER TABLE public.user_seen_listings
  ADD COLUMN IF NOT EXISTS contact_at timestamptz;
```

- [ ] **Step 2: mark_listing_contact** — `docs/migrations/2026-06-22-mark-listing-contact.sql`:

```sql
-- Стадия 2: нажатие кнопки контакта (WhatsApp/Telegram) в карточке.
-- Контакт ⟹ открыл ⟹ показан → бампаем все три метки. Owner-skip. Идемпотентно по PK.
CREATE OR REPLACE FUNCTION public.mark_listing_contact(p_property_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT owner_id INTO v_owner FROM properties WHERE id = p_property_id;
  IF v_owner IS NULL OR v_owner = v_uid THEN RETURN; END IF;  -- нет объекта / свой объект — пропуск
  INSERT INTO user_seen_listings (user_id, property_id, contact_at, seen_at, shown_at)
  VALUES (v_uid, p_property_id, now(), now(), now())
  ON CONFLICT (user_id, property_id) DO UPDATE
    SET contact_at = now(), seen_at = now(), shown_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_listing_contact(uuid) TO authenticated;
```

- [ ] **Step 3: get_listing_delivery_stats** — `docs/migrations/2026-06-22-get-listing-delivery-stats.sql`:

```sql
-- Стадия 2: воронка владельца по объекту (вложенная: preview ⊇ full ⊇ contact).
-- Только владелец объекта видит цифры (гейт по owner_id = auth.uid()).
CREATE OR REPLACE FUNCTION public.get_listing_delivery_stats(p_property_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = p_property_id AND p.owner_id = auth.uid()
    ) THEN jsonb_build_object('error', 'forbidden')
    ELSE jsonb_build_object(
      'seen_preview', (SELECT count(DISTINCT user_id) FROM user_seen_listings
                        WHERE property_id = p_property_id AND shown_at IS NOT NULL),
      'seen_full',    (SELECT count(DISTINCT user_id) FROM user_seen_listings
                        WHERE property_id = p_property_id AND seen_at IS NOT NULL),
      'seen_contact', (SELECT count(DISTINCT user_id) FROM user_seen_listings
                        WHERE property_id = p_property_id AND contact_at IS NOT NULL)
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_listing_delivery_stats(uuid) TO authenticated;
```

- [ ] **Step 4: commit** (3 файла, `--no-verify`):

```bash
git add docs/migrations/2026-06-22-user-seen-listings-add-contact-at.sql docs/migrations/2026-06-22-mark-listing-contact.sql docs/migrations/2026-06-22-get-listing-delivery-stats.sql
git commit -m "feat(feed): read-side SQL Стадии 2 — contact_at, mark_listing_contact, get_listing_delivery_stats" --no-verify
```

---

### Task 2: `SeenTrackingService.recordContact` + хук на WA/TG

**Files:**
- Modify: `src/app/mrsqm/services/seen-tracking.service.ts` (+ метод)
- Modify: `src/app/mrsqm/services/seen-tracking.service.spec.ts` (+ тест)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts:440-445` (хук в openWhatsApp/openTelegram)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts` (+ тест)

**Interfaces:**
- Consumes: RPC `mark_listing_contact`.
- Produces: `SeenTrackingService.recordContact(propertyId: string): Promise<void>` (fire-and-forget, глушит ошибки).

- [ ] **Step 1: тест сервиса (RED)** — в `seen-tracking.service.spec.ts` добавить:

```ts
it('recordContact шлёт id в mark_listing_contact', async () => {
  await service.recordContact('c1');
  expect(rpc).toHaveBeenCalledWith('mark_listing_contact', { p_property_id: 'c1' });
});
```

- [ ] **Step 2: запустить → RED**: `npm run test:file src/app/mrsqm/services/seen-tracking.service.spec.ts` (FAIL: recordContact не существует).

- [ ] **Step 3: реализация в `seen-tracking.service.ts`** — добавить метод (рядом с recordView):

```ts
  // Стадия 2: нажатие кнопки контакта (WA/TG) — сильнейший сигнал воронки (seen_contact).
  // Бэк бампает contact_at + seen_at + shown_at. Fire-and-forget.
  async recordContact(propertyId: string): Promise<void> {
    try {
      await this._supabase.rpc('mark_listing_contact', { p_property_id: propertyId });
    } catch (e) {
      console.error('[SeenTrackingService] recordContact ошибка:', e);
    }
  }
```

- [ ] **Step 4: запустить → GREEN** (5 spec).

- [ ] **Step 5: хук в property-detail.** Прочитать `property-detail.component.ts` — найти id объекта (через `detail()?.id`/`vm().id`; использовать существующий доступ). Инжектнуть `SeenTrackingService` (`private readonly _seen = inject(SeenTrackingService);`). В `openWhatsApp(phone)` и `openTelegram(username)` первой строкой добавить:

```ts
    const id = this.detail()?.id;
    if (id) void this._seen.recordContact(id);
```
(подставить фактический способ получения id, подтверждённый чтением компонента).

- [ ] **Step 6: тест компонента** — в `property-detail.component.spec.ts` (следовать существующему setup; добавить spy `SeenTrackingService`): `openWhatsApp('+9715...')` и `openTelegram('@x')` зовут `recordContact` с id объекта. Запустить spec → GREEN.

- [ ] **Step 7: checkFile + commit** (4 файла, `--no-verify`):

```bash
npm run checkFile src/app/mrsqm/services/seen-tracking.service.ts
npm run checkFile src/app/mrsqm/components/property-detail/property-detail.component.ts
git add src/app/mrsqm/services/seen-tracking.service.ts src/app/mrsqm/services/seen-tracking.service.spec.ts src/app/mrsqm/components/property-detail/property-detail.component.ts src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "feat(feed): seen_contact — recordContact на клик WhatsApp/Telegram" --no-verify
```

---

### Task 3: Воронка владельца в табе Metrics

**Files:**
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.ts` (загрузка delivery-stats, vm воронки)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.html` (3 цифры воронки в табе metrics)
- Modify: `src/app/mrsqm/components/property-detail/property-detail.component.spec.ts` (тест)

**Interfaces:**
- Consumes: RPC `get_listing_delivery_stats(p_property_id)` → `{ seen_preview, seen_full, seen_contact }`.

- [ ] **Step 1: тест (RED)** — в `property-detail.component.spec.ts`: при открытии таба `metrics` владельцем (`is_owner=true`) вызывается `rpc('get_listing_delivery_stats', { p_property_id: <id> })`, и `funnelVm()` отдаёт `{ preview, full, contact }` из ответа. (Замокать `rpc` так, чтобы вернуть `{ seen_preview: 10, seen_full: 4, seen_contact: 1 }`.)

- [ ] **Step 2: запустить → RED**.

- [ ] **Step 3: реализация (ts).** Добавить сигнал `readonly funnel = signal<{ seen_preview: number; seen_full: number; seen_contact: number } | null>(null);` и ленивую загрузку при `setTab('metrics')` если `isOwner()` и `funnel()===null`:

```ts
  private async _loadFunnel(): Promise<void> {
    const id = this.detail()?.id;
    if (!id || !this.isOwner()) return;
    try {
      const r = await this._supabase.rpc<{
        seen_preview?: number; seen_full?: number; seen_contact?: number;
      }>('get_listing_delivery_stats', { p_property_id: id });
      this.funnel.set({
        seen_preview: r?.seen_preview ?? 0,
        seen_full: r?.seen_full ?? 0,
        seen_contact: r?.seen_contact ?? 0,
      });
    } catch {
      // воронка недоступна — просто не показываем
    }
  }
```
В `setTab(tab)`: если `tab==='metrics'` → `void this._loadFunnel();`. (Инжект `MrsqmSupabaseService` если ещё не инжектнут — проверить.)

- [ ] **Step 4: реализация (html).** В табе metrics (рядом с views/impressions/contacts) добавить блок воронки, когда `funnel()` не null:

```html
      @if (funnel(); as fn) {
        <div class="funnel">
          <div class="funnel-row"><span>Мелькнул в ленте</span><span class="metric-value">{{ fn.seen_preview | number }}</span></div>
          <div class="funnel-row"><span>Открыли карточку</span><span class="metric-value">{{ fn.seen_full | number }}</span></div>
          <div class="funnel-row"><span>Нажали контакт</span><span class="metric-value">{{ fn.seen_contact | number }}</span></div>
        </div>
      }
```
(подстроить классы под существующую разметку метрик; не вводить новый визуальный язык.)

- [ ] **Step 5: запустить → GREEN**; `npm run checkFile` ts.

- [ ] **Step 6: commit** (3 файла, `--no-verify`):

```bash
git add src/app/mrsqm/components/property-detail/property-detail.component.ts src/app/mrsqm/components/property-detail/property-detail.component.html src/app/mrsqm/components/property-detail/property-detail.component.spec.ts
git commit -m "feat(feed): воронка владельца seen_preview/full/contact в табе Metrics" --no-verify
```

---

### Task 4: Применение SQL + верификация (человек-чекпойнт)

- [ ] **Step 1:** применить 3 миграции через `/migrate` (с согласия): contact_at → mark_listing_contact → get_listing_delivery_stats.
- [ ] **Step 2: верификация SELECT:** `contact_at` есть; `mark_listing_contact`/`get_listing_delivery_stats` существуют; `get_listing_delivery_stats(<свой объект>)` под авторизованным юзером возвращает 3 числа, под чужим — `{error: forbidden}`.
- [ ] **Step 3:** переместить файлы в `applied/`, обновить `docs/database.md` журнал, `/test-prod` T-N.

---

## Самопроверка плана
- **Покрытие Стадии 2:** contact_at (T1.1), mark_listing_contact (T1.2), get_listing_delivery_stats 3 цифры (T1.3), recordContact (T2), хук WA/TG (T2.5), воронка в Metrics (T3), применение (T4). ✓
- **Типы/имена:** `recordContact`/`mark_listing_contact`/`get_listing_delivery_stats`/`funnel` согласованы сквозь задачи.
- **Решение:** отдельный RPC контакта (не p_action) — зафиксировано в Global Constraints.
- **Плейсхолдеры:** «подтвердить id-доступ чтением компонента» — обязательная сверка в существующем коде, не заглушка.
