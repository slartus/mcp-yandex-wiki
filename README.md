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

Токен от Яндекс Трекера подходит, если тому же приложению выданы и wiki-скоупы — механика авторизации общая (`OAuth` + заголовок организации). Подробнее — [Про скоупы токена](#про-скоупы-токена).

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
- **Readonly-страницы отдают HTTP 403** на запись — см. [Как читать HTTP 403](#как-читать-http-403).

## Статус проверок

| Инструмент | Статус |
|---|---|
| `myself`, `get_page`, `search`, `list_descendants`, `list_resources`, `list_attachments`, `list_grids` | проверены на живом API |
| `update_page` | проверен: round-trip заголовка на реальной странице, контент побайтово не изменился |
| `create_page`, `delete_page` | **не проверялись** — схема восстановлена из ошибок валидации API и заголовка `Allow` |

### Про скоупы токена

Доступ к Wiki API — это **пересечение двух независимых гейтов**:

1. **Скоуп токена.** Нужен `wiki:read` (только чтение) либо `wiki:write` (создание, редактирование, удаление). Выдаётся приложению на [oauth.yandex.ru](https://oauth.yandex.ru/).
2. **Права пользователя в Вики.** Из документации: «При работе с API запросы выполняются от имени пользователя. Чтобы выполнять те или иные действия через API, пользователь должен иметь соответствующие права в Вики». Скоуп `wiki:write` не даст записать страницу, на которую у пользователя нет прав.

Скоупы Яндекс действительно проверяет — на OAuth-уровне, до логики API. Проверено: тот же токен на Яндекс.Диск (`cloud_api:disk.read`, скоупа нет) отдаёт `HTTP 403 «Возможно, у приложения недостаточно прав»`, тогда как Вики и Трекер отвечают нормально.

**Токен Яндекс Трекера подходит для Вики, только если при создании приложения ему выдали и wiki-скоупы** — API общий, но скоуп на Трекер сам по себе Вики не открывает. Если сомневаетесь, какие скоупы у токена: `GET https://login.yandex.ru/info?format=json` вернёт `client_id`, а список прав смотрите на `https://oauth.yandex.ru/client/<client_id>`.

### Как читать HTTP 403

- **403 на все запросы, включая чтение** — нет wiki-скоупа у приложения.
- **403 на запись конкретной страницы, чтение работает** — либо у пользователя нет прав на неё, либо страница readonly (`get_page` с `fields: ["attributes"]` → `attributes.is_readonly`). Системные страницы (владелец `yandex360-wiki`) readonly.

### Побочный эффект записи

Любой `POST /pages/{id}` бампает `modified_at`, даже если в теле нет ни одного значимого поля. Страница отметится как изменённая.
