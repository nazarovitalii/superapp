# Журнал коммитов — MrSQM (superapp)

Актуализируется после каждого деплоя.

---

## 2026-06-09

| Хэш         | Время | Описание                                                                                                                                                         |
| ----------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —           | —     | docs: M-1 — документация MrSQM (README, architecture, database, tabs, TODO, commits)                                                                             |
| `380321733` | 02:36 | docs: M-3 auth done — login/guard/logout, API-1 разблокирован                                                                                                    |
| `d2e9d0b8e` | 09:27 | docs: пометить парольный вход как временный dev-хак, добавить M-9 (Telegram auth)                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f3142c730` | 09:42 | feat(mrsqm): add property creation form (P-5, без фото)                                                                                                          |
| `bae4545d2` | 09:43 | docs: P-5 форма добавления готова (без фото), P-5b — фото отдельно                                                                                               |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `d7b3b06a3` | 09:48 | fix(mrsqm): align enum types with DB CHECK constraints (boevой INSERT)                                                                                           |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `0131d25b7` | 09:54 | feat(mrsqm): wire real get_feed in feed (API-1), drop mocks                                                                                                      |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `114847ecf` | 15:04 | feat(mrsqm): set property status by visibility (network→active, public→pending)                                                                                  |
| `ba9aef4fc` | 15:06 | ci: auto-trigger Coolify redeploy after image build                                                                                                              |
| `f73fa52ba` | 15:13 | ci: trigger build to verify Coolify autodeploy                                                                                                                   |
| `29f74d8c5` | 15:40 | fix(db): activate_user() trigger — use owner_id for properties                                                                                                   |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f0a68922b` | 15:48 | fix(mrsqm): resolve property type label in feed                                                                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `7fbfc5a76` | 15:51 | fix(db): add community_name to get_feed response                                                                                                                 |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `a94395ce0` | 15:58 | feat(mrsqm): profile page (P-6) — info, stats, referral, my listings                                                                                             |
| `624d19994` | 15:58 | docs: P-6 профиль готов; API-7 (get_agent_listings сломан), API-8 (нет self-UPDATE на users)                                                                     |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `763225b7d` | 16:20 | feat(mrsqm): rich tabbed profile + fix get_agent_listings                                                                                                        |
| `fede9e935` | 16:20 | docs: API-7 get_agent_listings починен; профиль с вкладками                                                                                                      |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `6fb9dc3a0` | 16:37 | feat(mrsqm): favorites in feed (P-7), drop separate /saved screen                                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `479e05f27` | 01:58 | feat(mrsqm): inbox-style UI — чекбокс-выбор и hover-кнопки в ленте, шапка и карточки-секции в sidebar                                                            |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `bd1acd419` | 02:02 | docs: переписка + резюме дня 2026-06-12                                                                                                                          |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `7ded259f3` | 02:26 | fix(mrsqm): фидбек по UI — меню выбора в хедере, чистая типографика ленты, форма блоками                                                                         |
| `f7b6d4409` | —     | feat(mrsqm): лента v3 — активная строка как в инбоксе, агентство+дата, сортировка и охват в хедере, фильтры 1:1 с get_feed                                       |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `18c8fbf68` | 12:54 | docs: документация + переписка + резюме 2026-06-12 (лента v3)                                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `bebc690a8` | 18:16 | feat(mrsqm): хедер v4 — тулбар в ленте (охват+счётчик одной пилюлей, тогглы/сортировка/фильтры), глобальный хедер очищен; TODO фидбек 2026-06-12 + матрица полей |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `53bbc95eb` | 18:20 | docs: переписка + резюме дня 2026-06-12 (хедер v4)                                                                                                               |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `0bac2182b` | 11:19 | feat(mrsqm): форма добавления v2 — 8 шагов, каскад адреса до leaf, поля по типам, building info                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `34bdd12ec` | 11:23 | docs: переписка + резюме дня 2026-06-15 (форма v2)                                                                                                               |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f9615b0af` | 17:52 | feat(mrsqm): слайдер приватности адреса (F-12b) + фото объекта (P-5b)                                                                                            |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `aa1f1af8f` | 18:09 | docs: переписка + резюме дня 2026-06-15 (слайдер + фото)                                                                                                         |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `670bc3c87` | 19:09 | fix(mrsqm): форма объекта — каскад адреса по всем уровням, фикс краша публикации                                                                                 |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `e79a91458` | 19:25 | docs: переписка + резюме дня 2026-06-15 (фиксы формы)                                                                                                            |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `d8f888625` | 07:43 | feat(mrsqm): карточка объекта на реальных данных — get_property + фото + все поля                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `241ff6080` | 07:49 | docs: переписка + резюме дня 2026-06-16 (карточка объекта)                                                                                                       |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `7be53c861` | 12:15 | feat(mrsqm): тулбар ленты в стиле Bayut + расширение таблицы (F-5)                                                                                               |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `72620de34` | 12:49 | docs: переписка + резюме дня 2026-06-16 (тулбар ленты)                                                                                                           |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `a3abdd958` | 17:25 | feat(mrsqm): полноэкранный лайтбокс галереи объекта                                                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `61bbe4f83` | 17:25 | feat(mrsqm): полноэкранный лайтбокс галереи объекта                                                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `105f1a396` | 17:36 | docs: переписка + резюме дня 2026-06-16 (лайтбокс галереи)                                                                                                       |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `3b01dfb34` | 01:24 | feat(mrsqm): действия владельца над своим объектом (редакт/актуализация/архив)                                                                                   |
| `33fd60713` | 01:26 | docs: переписка + резюме дня 2026-06-17 (действия владельца)                                                                                                     |
| `9aeee49bc` | 10:54 | ci: форс пересборки образа (предыдущие билды отменялись concurrency)                                                                                             |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `3d535399b` | 15:18 | feat(mrsqm): галерея карточки на ng-gallery (MIT) вместо самодельного лайтбокса                                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f27dddff6` | 15:26 | docs: переписка + резюме дня 2026-06-17 (ng-gallery)                                                                                                             |
| `681bf7f93` | 16:23 | docs: обновить tabs.md — галерея Swiper.js                                                                                                                       |
| `19d2449f8` | 16:26 | docs: переписка + резюме дня 2026-06-17 (Swiper.js галерея)                                                                                                      |
| `b11b36671` | 16:32 | ci: форс пересборки образа (предыдущий билд отменён повторным пушем)                                                                                             |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `3e8a93816` | 17:30 | fix(mrsqm): лайтбокс галереи на нативный <dialog> (top layer) — лента больше не наезжает                                                                         |
| `7c1ac0269` | 17:31 | build(web): отключить service worker в прод-вебе + self-unregister застрявших                                                                                    |
| `471f59296` | 17:31 | docs: лайтбокс на <dialog> (top layer) + отключение service worker в вебе                                                                                        |
| `674198fe0` | 17:33 | docs: переписка + резюме дня 2026-06-17 (фикс лайтбокса <dialog> + отключение SW)                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `dcbe6691b` | 17:58 | fix(mrsqm): перезагрузка детали при смене объекта + чёрный лайтбокс (Swiper sizing)                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `3b214e280` | 18:34 | fix(mrsqm): лайтбокс — фикс runaway-ширины главного слайдера (фото за экраном)                                                                                   |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `ea2e1dc81` | 18:54 | docs: TODO (API-10/11, W-4 онбординг, W-2 SW), резюме дня, экспорт переписки                                                                                     |
| `e00ecd396` | 18:54 | docs: TODO (API-10/11, W-4 онбординг, W-2 SW), резюме дня, экспорт переписки                                                                                     |
| `2934f4b20` | 19:28 | docs: get_feed (агент/фото/community_name) в database.md; TODO лента v5                                                                                          |
| `de3ed3d40` | 19:39 | docs: переписка + резюме дня 2026-06-17 (WP-B лента v5 + WP-C тулбар)                                                                                            |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `b30d20b01` | 20:13 | fix(mrsqm): WP-A серверные баги — get_property 500 + лента Public пустая                                                                                         |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `10643cae9` | 20:16 | docs: переписка + резюме дня 2026-06-17 (WP-A серверные баги)                                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `2a5ad27d3` | 20:43 | feat(feed): WP-D переименование охвата — All/Friends/My Inventory + Favourites                                                                                   |
| `2edfce16f` | 20:43 | chore: sync глобальных конвенций (А/Б/В) из app-core                                                                                                             |
| `07e64f692` | 20:49 | docs: переписка + резюме дня 2026-06-17 (WP-D переименование охвата)                                                                                             |
| `b02657d64` | 21:05 | docs(spec): дизайн карточки объекта — 4 слоя (фронт/get_property/метрика/layouts)                                                                                |
| `687a69fe8` | 21:12 | docs(plan): карточка слой 1 — план реализации (7 задач, TDD)                                                                                                     |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `eb79fe37e` | 21:16 | feat(property-detail): три таба details/comments/metrics, Metrics только владельцу                                                                               |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `496fb2e29` | 21:21 | feat(property-detail): таб Metrics — показы/просмотры/уникальные/комментарии/контакт + reset активного таба при смене объекта                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `c6255eaf1` | 21:23 | test(property-detail): типизировать fixture в makeComponent (убрать any)                                                                                         |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `154778e3f` | 21:27 | feat(property-detail): кнопка избранного под фото (save_property)                                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `c83ef4b6a` | 21:34 | feat(property-detail): no-photo блок — серый, 1/3 высоты, текст No Photo без иконки                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `420a226b9` | 21:38 | test(property-detail): детерминированное ожидание в no-photo тесте (убрать setInterval polling)                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f82f77487` | 21:42 | feat(property-detail): Tech-блок Поле:Значение + композиция Type (категория/тип/подтип)                                                                          |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `6db6eab94` | 21:45 | fix(property-detail): вернуть Handover/Completion в Tech-блок + guard \_composeType                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `1fbc40ca8` | 21:49 | refactor(property-detail): кнопки действий вынесены вниз и центрированы                                                                                          |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `bbce8aa2e` | 22:01 | style(property-detail): стили таба Metrics + чистка мёртвого specs-grid SCSS + reset isSaved                                                                     |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `0022ff26a` | 22:06 | docs: карточка слой 1 — tabs/TODO/spec (3 таба, Tech, no-photo, избранное)                                                                                       |
| `2b434408c` | 22:59 | migrate: is_vastu колонка применена (properties.is_vastu)                                                                                                        |
| `621b689bc` | 22:59 | migrate: is_vastu → applied/                                                                                                                                     |
| `cb79fe133` | 00:14 | migrate: get_feed +is_vastu применён → applied/; spec Project-блок уточнён                                                                                       |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `a60b4fc49` | 00:18 | feat(feed): беды в строке — число сверху, maid серым ниже (vastu в ленте не показываем)                                                                          |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `a08b0623f` | 00:23 | feat(add-property): чекбокс Vastu (is_vastu) в форме                                                                                                             |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `c9a29a27a` | 00:27 | fix(add-property): Vastu только для резидентных типов (убрать с commercial villa)                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `354cb7b09` | 00:29 | fix(add-property): Vastu только для apartment и house (резидентные)                                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `3a39ed8bb` | 00:31 | docs(spec): vastu — только apartment/house в форме, в ленте не показываем                                                                                        |
| `63d1b542b` | 00:33 | docs: commits.md журнал (слой 2a)                                                                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `dd2474c4c` | 00:39 | fix(types): is_vastu в PropertyInsert, убрать из PropertyFeedItem (чинит тест-бандл)                                                                             |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `60d5b6266` | 00:40 | docs: commits.md журнал                                                                                                                                          |
| `ab6f6c50b` | 00:58 | migrate: get_property M-2b применён → applied/ (active_listings/slider/is_vastu/project); database.md синхрон                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `6b7cc580c` | 01:04 | feat(property-detail): Project-блок + active-listings + slider-адрес + vastu (слой 2b)                                                                           |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `cd28688ae` | 01:11 | docs: карточка слой 2b — Project/slider/active-listings/+vastu (tabs, TODO)                                                                                      |
| `19b1e3839` | 01:19 | docs: founder-README + переписка + резюме дня 2026-06-18 (карточка слой 1-2)                                                                                     |
| `d763efba0` | 01:23 | chore: handoff remember.md (карточка слои 1-2b задеплоены)                                                                                                       |
| `220fe1875` | 02:00 | docs(form-card): record FC-1..FC-4 fix spec + TODO (lost requirements recovered)                                                                                 |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f12484533` | 02:02 | style(property-detail): Характеристики info-иконка + Вариант A раскладка (FC-1)                                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `a10355ea7` | 02:06 | style(add-property): maid/hotel/vastu — три строки, галочка рядом (FC-2)                                                                                         |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f4492864a` | 02:13 | feat(add-property): Off-Plan недоступен для готового проекта (FC-3)                                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `a87bc5b83` | 02:21 | feat(add-property): Сделка в Категорию + шаг «Фото и планировка», перенумерация (FC-4)                                                                           |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `5f6462726` | 02:22 | chore(add-property): убрать лишние eslint-disable из FC-4 тестов (предупреждения линтера)                                                                        |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `d6372edc2` | 02:33 | docs: tabs+TODO под FC-1..FC-4 (форма-реструктуризация + карточка Вариант A)                                                                                     |
| `3229d932d` | 02:39 | docs: переписка + резюме дня 2026-06-18 (FC-1..FC-4)                                                                                                             |
| `81f96b7ac` | 03:00 | docs: spec+TODO для формы v3 + бегунок + лента-центрирование (AP-\*, F-center)                                                                                   |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `9fe4af911` | 03:03 | feat(add-property): Sale/Rent наверх + чекбоксы колонкой + layout в Параметры (B1)                                                                               |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `040674955` | 03:10 | feat(add-property): спальни/санузлы обязательные + серые звёздочки required (B2)                                                                                 |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `fced24012` | 03:15 | feat(add-property): разбить последний шаг — Описание(7)/Фото(8) (B3)                                                                                             |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `863b5645f` | 03:22 | feat(add-property): фото reorder (DragDrop) + сделать главным + Floor Plan до 4 (B4)                                                                             |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `372099a3f` | 03:30 | feat(add-property): бегунок адреса — коллеги, центр, ширина адреса, точки по уровням (B5)                                                                        |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `9cf552241` | 03:35 | style(feed): центрировать колонки Тип/Beds/Площадь/Цена/иконки/Агент (F-center)                                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `da9feef1a` | 03:43 | feat(add-property): поиск адреса limit-fix (AP-2) + developer-автокомплит (AP-5)                                                                                 |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `522c75632` | 03:45 | style(add-property): размер лого девелопера в выпадашке (B7 fix)                                                                                                 |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `ac28efdb2` | 03:53 | fix(property-detail): не показывать floor_plan-фото в галерее карточки (getPhotos gallery-only)                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `6f5ec8a96` | 03:56 | docs: tabs+TODO под форму v3 (AP-2..AP-S2) + F-center                                                                                                            |
| `2d2d51151` | 04:01 | docs: переписка + резюме дня 2026-06-18 (форма v3 + бегунок + лента)                                                                                             |
| `ff9376079` | 04:16 | migrate: search_in_scope применён (серверный скоуп уточнения адреса, AP-2)                                                                                       |
| `115ed50c0` | 04:16 | migrate: search_in_scope → applied/                                                                                                                              |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `4c47155ed` | 04:19 | feat(add-property): уточнение адреса через search_in_scope (серверный скоуп, AP-2)                                                                               |
| `6722e5784` | 04:23 | docs: search_in_scope в database.md + AP-2 серверный скоуп (tabs/TODO)                                                                                           |
| `340b535c7` | 04:26 | docs: переписка + резюме (AP-2 серверный скоуп search_in_scope)                                                                                                  |
| `db00b17ad` | 04:38 | docs(chat): спека таба AI Chat (S-2) + TODO blocked-on GET /chat/history                                                                                         |
| `8d3fca320` | 04:51 | docs(chat): S-2 разблокирован — GET /chat/history живой; уточнён фолбэк-контракт                                                                                 |
| `934dcd011` | 04:55 | docs(chat): план реализации таба AI Chat (S-2)                                                                                                                   |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `b4f35e7a7` | 05:03 | feat(chat): gpt-stream сервис — SSE-парсер, история, фолбэк (S-2)                                                                                                |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `f79d826a8` | 05:14 | feat(chat): страница AI Chat — лента, стрим-пузыри, статус, история (S-2)                                                                                        |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `62d494cae` | 05:21 | fix(chat): textarea-сигнал binding + stop чистит курсор (S-2)                                                                                                    |
| `cc4562b46` | 13:14 | feat(chat): подключить ChatPageComponent к роуту mrsqm/chat (S-2)                                                                                                |
| `7cce2c19b` | 13:18 | docs(chat): S-2 готов — tabs/TODO/tests обновлены, S-2.1 follow-up                                                                                               |
| `22fc00d62` | 13:43 | docs: экспорт переписки 2026-06-18 (S-2 AI Chat, 1162 хода)                                                                                                      |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `0446192c9` | 14:17 | style(feed): тулбар — высота/охват/поиск/иконки, тип-дропдаун одна колонка, шапка (U-1,U-2,U-5,U-8,U-10,U-11)                                                    |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `33eb454e3` | 14:26 | feat(feed): строка — off-plan в адрес, перенос типа, plot-строка, формат даты (U-4,U-6,U-7,U-9)                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `333f430d0` | 14:31 | fix(feed): дата строки — локальная TZ для Today/Yesterday (U-4)                                                                                                  |
| ⚠️ docs?    | —     | Изменился src/app/mrsqm/ — проверь docs/README.md / architecture.md / tabs.md                                                                                    |
| `100f860bd` | 14:38 | feat(add-property): бегунок адреса — drag мышкой/пальцем (U-0a)                                                                                                  |
