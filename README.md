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

Read-инструменты и обе guard-проверки прогнаны на живом API — отвечают 200.

`create_page` / `update_page` / `delete_page` **вживую не проверялись** — схема тела восстановлена из ошибок валидации API и заголовка `Allow`, реальных записей в вики не делалось. Первый write-вызов стоит сделать на черновой странице.
