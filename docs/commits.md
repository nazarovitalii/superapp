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
