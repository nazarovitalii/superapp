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
