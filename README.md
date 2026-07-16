# mcp-yandex-wiki

Минимальный MCP-сервер для [Яндекс Вики](https://wiki.yandex.ru/) (read + write).

## Установка

```bash
cd ~/.claude/mcp/yandex-wiki
npm install
```

Регистрация в `~/.claude.json`:

```json
{
  "mcpServers": {
    "yandex-wiki": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/<user>/.claude/mcp/yandex-wiki/index.mjs"],
      "env": {
        "YW_OAUTH_TOKEN": "y0__...",
        "YW_ORG_ID": "1234567",
        "YW_ORG_HEADER": "X-Org-Id"
      }
    }
  }
}
```

## Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `YW_OAUTH_TOKEN` | да | OAuth-токен Яндекса со скоупом `wiki:read` / `wiki:write` |
| `YW_ORG_ID` | да | ID организации |
| `YW_ORG_HEADER` | нет | `X-Org-Id` для Яндекс 360 (по умолчанию), `X-Cloud-Org-Id` для Yandex Cloud Organization |

Токен от Яндекс Трекера подходит, если у него есть wiki-скоуп — API общий (`OAuth` + заголовок организации).

Сервисный аккаунт Yandex Cloud для Wiki API не годится — только пользовательский.

## Инструменты

| Инструмент | API | Описание |
|---|---|---|
| `myself` | `GET /users/me` | Текущий пользователь, организация, домашний кластер |
| `get_page` | `GET /pages?slug=` / `GET /pages/{id}` | Страница по slug или id. Тело — только при `fields: ["content"]` |
| `search` | `POST /search` | Полнотекстовый поиск, до 10 результатов |
| `list_descendants` | `GET /pages/{id}/descendants` | Подстраницы |
| `list_resources` | `GET /pages/{id}/resources` | Вложения + таблицы одним списком |
| `list_attachments` | `GET /pages/{id}/attachments` | Вложения |
| `list_grids` | `GET /pages/{id}/grids` | Динамические таблицы |
| `create_page` | `POST /pages` | Создать страницу (`slug`, `title` обязательны) |
| `update_page` | `POST /pages/{id}` | Изменить `title` / `content` / `slug` |
| `delete_page` | `DELETE /pages/{id}` | Удалить страницу (необратимо) |

### `fields` у `get_page`

`redirect`, `breadcrumbs`, `attributes`, `content`, `access_policy`, `access_lists`, `owner`.

Без `fields` возвращаются только `id`, `slug`, `title`, `page_type`.

## Особенности API

- **Поиск не пагинируется.** `total_pages` всегда `1`, отдаётся максимум 10 результатов; параметры `page` / `offset` игнорируются. Сужай запрос.
- **`PATCH` и `PUT` не поддерживаются.** Обновление — это `POST /pages/{id}`. Разрешённые методы: `/pages` → `POST, GET`; `/pages/{id}` → `POST, GET, DELETE`.
- **Readonly-страницы отдают HTTP 403** на запись. Проверяется через `get_page` с `fields: ["attributes"]` → `attributes.is_readonly`. Системные страницы (владелец `yandex360-wiki`) readonly.

## Статус проверок

| Инструмент | Статус |
|---|---|
| `myself`, `get_page`, `search`, `list_descendants`, `list_resources`, `list_attachments`, `list_grids` | проверены на живом API |
| `update_page` | проверен: round-trip заголовка на реальной странице, контент побайтово не изменился |
| `create_page`, `delete_page` | **не проверялись** — схема восстановлена из ошибок валидации API и заголовка `Allow` |

### Про скоупы токена

Wiki API **не отбивает запросы по OAuth-скоупу** — токен, выданный под Яндекс Трекер, читает и пишет в Вики без wiki-скоупов. Права определяются доступами пользователя в Вики, а не скоупами токена.

Практический вывод: HTTP 403 на запись означает readonly-страницу или отсутствие прав у пользователя, а не нехватку скоупа. Обратная сторона — отдельный «wiki-only» токен не изолирует Вики от остальных ключей того же пользователя.

### Побочный эффект записи

Любой `POST /pages/{id}` бампает `modified_at`, даже если в теле нет ни одного значимого поля. Страница отметится как изменённая.
