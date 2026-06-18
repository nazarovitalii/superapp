# GPT chat tab (S-2) — design (2026-06-18)

**Контекст.** Бэкенд ИИ-чата готов (S-1: `POST /chat/stream`, SSE-стриминг, дуал-авторизация по
Supabase JWT). Эта задача — **S-2**: веб-таб «AI Chat» в superApp, который ходит в gpt-сервис и
показывает ответ ИИ вживую (статус-шаги бота + печатающийся текст), как ChatGPT.

Прод-URL gpt-сервиса: **`https://ai.mrsqm.com`** (Traefik→:3100; порт наружу закрыт — в клиент не
зашивать). CORS уже `*`. Полный контракт стрима — во фронтенд-гайде gpt-стороны (architecture.md
§A-11): события `tool_start` / `tool_done` / `token` / `done` / `error`.

> ✅ **БЛОКЕР СНЯТ (2026-06-18).** Создатель выбрал **полную серверную историю** диалога (видна на
> любом устройстве, грузится при открытии). `GET /chat/history` **живой** на `https://ai.mrsqm.com`
> (контракт — раздел 4, совпал 1:1). Строим таб целиком: история при открытии + стрим + фолбэк.
> Источник правды по контракту — `~/projects/gpt/docs/frontend-streaming-guide.md` (§1·5, §6).

---

## Решения (приняты, можно вето)

- **Чат-UI — тонкий свой компонент** на уже встроенном `ngx-markdown` (@21) + тема Super Productivity.
  НЕ тащим стороннюю Shadow-DOM-либу (Deep Chat и пр.) — она вводит чужой визуальный язык, токены SP
  внутрь не проходят, а статус-строку всё равно пришлось бы кастомить. Markdown/код-блоки рендера
  ответа ИИ — бесплатно из `<markdown>` (с санитайзом).
- **Размещение — существующий нав-слот.** Роут `mrsqm/chat` и пункт меню `crm-chat` («AI Chat»,
  иконка `smart_toy`) уже есть. Меняем только `loadComponent` со stub на `ChatPageComponent` —
  навигацию и магик-нав не трогаем.
- **Авторизация — Supabase access-token** залогиненного юзера (`Authorization: Bearer …`).
  `user_id` клиент НЕ шлёт — сервер берёт из `sub` JWT. Никакого `API_SECRET` в клиенте.
- **История — полная серверная** (решение создателя): при открытии таба грузим прошлые сообщения
  через `GET /chat/history`.
- **Транспорт стрима — `fetch` + `ReadableStream`** (POST-SSE), НЕ `EventSource` (тот умеет только
  GET без заголовков → Bearer не передать). Подтверждено рабочим: Electron 41 / Chromium 136 /
  supabase-js 2.108; CSP `connect-src *` домен не блокирует.

---

## 1. Архитектура и файлы

Следуем паттерну существующих страниц (`pages/feed`, `pages/profile`): standalone, `OnPush`,
тема SP (`var(--ink-*)`), сигналы.

| Файл                                                   | Роль                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/mrsqm/pages/chat/chat-page.component.ts`      | Страница: лента сообщений + статус-строка + поле ввода. Сигнальный стейт, оркестрация.                                                                                                |
| `src/app/mrsqm/pages/chat/chat-page.component.html`    | Шаблон: лента (`@for` по сообщениям), пузырь ассистента через `<markdown>`, статус-строка, textarea + кнопки send/stop.                                                               |
| `src/app/mrsqm/pages/chat/chat-page.component.scss`    | Стили в теме SP (пузыри юзер/ассистент, статус серым).                                                                                                                                |
| `src/app/mrsqm/services/gpt-stream.service.ts`         | Клиент gpt-сервиса: `streamMessage()` (SSE), `loadHistory()` (GET /chat/history), `sendNonStreaming()` (фолбэк POST /chat). Токен из `MrsqmSupabaseService.client.auth.getSession()`. |
| `src/app/mrsqm/services/gpt-stream.service.spec.ts`    | Юнит-тесты SSE-парсера, маппинга истории, фолбэка.                                                                                                                                    |
| `src/app/mrsqm/pages/chat/chat-page.component.spec.ts` | Компонентные тесты (сервис замокан).                                                                                                                                                  |

Изменения вне новых файлов:

- `src/app/app.routes.ts` — у роута `mrsqm/chat` заменить `loadComponent` stub → `ChatPageComponent`.
- `src/environments/environment*.ts` — добавить `gptServiceUrl: 'https://ai.mrsqm.com'`
  (stage/prod одинаково сейчас; вынесено, чтобы не зашивать URL в сервис).
- `<markdown>` требует провайдер `provideMarkdown()` — проверить, что он уже зарегистрирован глобально
  (ngx-markdown используется в заметках/задачах); если да — ничего не добавляем.

**Границы.** `gpt-stream.service` — единственное место сетевых вызовов и парсинга SSE; компонент
не знает про fetch/SSE, только про колбэки/сигналы. Парсер тестируется без компонента.

## 2. Стейт компонента (сигналы)

```ts
interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
}

messages = signal<ChatMessage[]>([]);
status = signal<string | null>(null); // строка tool_start, серым
streaming = signal<boolean>(false); // идёт стрим → блок ввода + кнопка стоп
loadingHistory = signal<boolean>(true); // спиннер при открытии
error = signal<string | null>(null);
```

## 3. Поток стрима (UX)

- **Отправка `send(text)`:** добавить пузырь юзера; добавить пустой пузырь ассистента
  (`streaming:true`); `streaming.set(true)`; вызвать `streamMessage(text, handlers)`.
- **События:** `token` → дописать `text` в конец последнего (ассистентского) пузыря;
  `tool_start` → `status.set(TOOL_LABELS[tool] ?? 'Работаю…')`; `tool_done` → `status.set(null)`;
  `done` → снять `streaming` с пузыря, `streaming.set(false)`, `status.set(null)`, разблок ввода;
  `error` → показать ошибку, разблок.
- **Ввод:** Enter — отправить, Shift+Enter — перенос; textarea autosize; на время стрима поле
  заблокировано, видна кнопка «стоп» → `abort()`. Автоскролл вниз по приходу токенов.
- **Отмена:** `ngOnDestroy` → `abort()` (не оставлять висящий стрим при уходе со страницы).

Человекочитаемые подписи шагов (`TOOL_LABELS`) — из гайда gpt-стороны (`search_properties` →
«Ищу объявления на платформе…» и т.д.); дефолт «Работаю…».

## 4. История + контракт `GET /chat/history` (запрос к gpt-стороне — БЛОКЕР)

- **При входе в таб:** `loadingHistory=true` → `loadHistory()` → отрисовать прошлые сообщения →
  `loadingHistory=false`. Пусто → приветственный empty-state.
- **Новый эндпоинт, которого сейчас нет** (нужно от gpt-стороны):

```
GET https://ai.mrsqm.com/chat/history?limit=50
Authorization: Bearer <supabase access_token>     # user_id из sub JWT; клиент user_id НЕ шлёт

200 → { "messages": [ { "role": "user"|"assistant", "text": "...", "created_at": "<ISO>" }, ... ] }
      порядок oldest→newest; пустая история → { "messages": [] }
401 → невалидный/просроченный токен (как и у /chat/stream)
```

Маппинг ответа в `ChatMessage[]` (роль/текст; `created_at` — для будущей группировки, в MVP не
показываем). `limit=50` (дефолт; макс 100) — последние N; пагинация (курсор `before`) — вне MVP.
Текст уже очищен от служебных префиксов — рендерим как есть через `<markdown>`. Возвращается только
**web-тред** (сообщения из веб-таба; TG/WA не подмешиваются).

## 5. Ошибки / 401 / фолбэк

- **401 до стрима** (обычный HTTP-статус): `supabase.auth.refreshSession()` → один повтор; не
  вышло → на логин.
- **`error`-событие внутри стрима** (HTTP всё равно 200): показать текст ошибки в ленте, разблок ввода.
- **Обрыв сети во время стрима:** фолбэк на нестримовый `POST /chat` (тот же Bearer, body
  `{text, channel:'web'}`) → `200 application/json { response, tool_calls, tokens, cost_usd, ... }`.
  Берём поле **`response`** (готовый текст), дорисовываем пузырь; остальные поля — телеметрия, игнор.
- **`:3100` в URL — запрещено** (connection refused): только `https://ai.mrsqm.com`.

## 6. Вне MVP (YAGNI)

- «Новый диалог» / сброс контекста — нужен ещё серверный reset-эндпоинт.
- Рендер карточек объектов inline — контракт стрима это **markdown-текст**; ассистент сам вставляет
  markdown-ссылки, их рендерит `<markdown>`. Структурных карточек в потоке нет.
- Heartbeat стрима при долгих tool-фазах — бэклог S-1.1 на gpt-стороне.
- Список тредов / мультисессии.
- Показ стоимости/токенов — пишутся на сервере (`ai_usage_log`), клиенту не нужны.

## 7. Тесты

- **`gpt-stream.service.spec`:** SSE-парсер — кормить `ReadableStream` произвольными кусками, в т.ч.
  с разрывом события между `read()` (буфер по `\n\n`), проверить диспатч `tool_start/token/done/error`;
  битый `data:` — пропускается. `loadHistory` — маппинг ответа. Фолбэк-путь.
- **`chat-page.component.spec`:** `send()` добавляет пузырь юзера + ассистента; `token` дописывает;
  `tool_start` ставит статус, `done` снимает; `error` показывает ошибку; `loadHistory` рисует прошлое.
  Сервис замокан — без сети.

## 8. Кросс-репо зависимость / порядок

1. **gpt-сторона:** реализовать `GET /chat/history` (раздел 4). ← разблокирует всё ниже.
2. **superApp (этот спек):** `gpt-stream.service` → `chat-page` → роут+environment → тесты.
   Реализация по правилам — Subagent-Driven (имплементер+ревьюер на задачу).
3. Прод-тест T-S2 (история грузится, стрим идёт, статус-строка, фолбэк) → `docs/tests.md`.
