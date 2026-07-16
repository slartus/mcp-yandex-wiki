#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TOKEN = process.env.YW_OAUTH_TOKEN;
const ORG_ID = process.env.YW_ORG_ID;
const ORG_HEADER = process.env.YW_ORG_HEADER || "X-Org-Id";

if (!TOKEN) {
    console.error("[yandex-wiki-mcp] YW_OAUTH_TOKEN не задан");
    process.exit(1);
}
if (!ORG_ID) {
    console.error("[yandex-wiki-mcp] YW_ORG_ID не задан");
    process.exit(1);
}

const API_BASE = "https://api.wiki.yandex.net/v1";

const PAGE_FIELDS = [
    "redirect",
    "breadcrumbs",
    "attributes",
    "content",
    "access_policy",
    "access_lists",
    "owner",
];

async function api(method, path, body) {
    const headers = {
        Authorization: `OAuth ${TOKEN}`,
        [ORG_HEADER]: ORG_ID,
    };
    const opts = { method, headers };
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${path}`, opts);
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 1200)}`);
    }
    return text ? JSON.parse(text) : null;
}

function ok(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}

function fieldsQuery(fields) {
    if (!fields?.length) return "";
    return `fields=${fields.join(",")}`;
}

function pagePath({ slug, id }, fields) {
    const q = fieldsQuery(fields);
    if (id !== undefined) {
        return `/pages/${id}${q ? `?${q}` : ""}`;
    }
    const params = new URLSearchParams({ slug });
    if (q) params.set("fields", fields.join(","));
    return `/pages?${params.toString()}`;
}

const server = new McpServer({
    name: "yandex-wiki",
    version: "1.0.0",
});

server.tool(
    "myself",
    "Текущий пользователь Wiki: username, uid, организация, домашний кластер.",
    {},
    async () => ok(await api("GET", "/users/me")),
);

server.tool(
    "get_page",
    "Страница по slug или по числовому id. Укажи ровно одно из двух. " +
        "Без fields возвращает только id/slug/title/page_type — за телом страницы запрашивай fields: ['content'].",
    {
        slug: z
            .string()
            .optional()
            .describe("Путь страницы без ведущего слэша, напр. 'homepage' или 'skills/ccbackend/rnd-hub'"),
        id: z.number().int().optional().describe("Числовой id страницы"),
        fields: z
            .array(z.enum(PAGE_FIELDS))
            .optional()
            .describe(`Доп. поля: ${PAGE_FIELDS.join(", ")}`),
    },
    async ({ slug, id, fields }) => {
        if ((slug === undefined) === (id === undefined)) {
            throw new Error("Укажи ровно одно: slug или id");
        }
        return ok(await api("GET", pagePath({ slug, id }, fields)));
    },
);

server.tool(
    "search",
    "Полнотекстовый поиск по страницам организации. Возвращает до 10 результатов (url, slug, title, body-фрагмент, modified_at). " +
        "Пагинации у API нет — сужай запрос, если нужного нет в выдаче.",
    {
        query: z.string().describe("Поисковый запрос"),
    },
    async ({ query }) => ok(await api("POST", "/search", { query })),
);

server.tool(
    "list_descendants",
    "Подстраницы страницы по её id.",
    {
        id: z.number().int().describe("Числовой id родительской страницы"),
    },
    async ({ id }) => ok(await api("GET", `/pages/${id}/descendants`)),
);

server.tool(
    "list_resources",
    "Все ресурсы страницы: вложения и динамические таблицы одним списком.",
    {
        id: z.number().int().describe("Числовой id страницы"),
    },
    async ({ id }) => ok(await api("GET", `/pages/${id}/resources`)),
);

server.tool(
    "list_attachments",
    "Вложения (файлы) страницы.",
    {
        id: z.number().int().describe("Числовой id страницы"),
    },
    async ({ id }) => ok(await api("GET", `/pages/${id}/attachments`)),
);

server.tool(
    "list_grids",
    "Динамические таблицы (grids) страницы.",
    {
        id: z.number().int().describe("Числовой id страницы"),
    },
    async ({ id }) => ok(await api("GET", `/pages/${id}/grids`)),
);

server.tool(
    "create_page",
    "Создать страницу. slug задаёт положение в дереве: 'a/b/c' создаёт c внутри b. " +
        "page_type: 'wysiwyg' — визуальный редактор, 'markup' — вики-разметка.",
    {
        slug: z.string().describe("Полный путь новой страницы, напр. 'users/<username>/my-page'"),
        title: z.string().describe("Заголовок страницы"),
        content: z.string().optional().describe("Тело страницы"),
        page_type: z.enum(["wysiwyg", "markup"]).optional().describe("Тип страницы, по умолчанию решает API"),
    },
    async ({ slug, title, content, page_type }) => {
        const body = { slug, title };
        if (content !== undefined) body.content = content;
        if (page_type !== undefined) body.page_type = page_type;
        return ok(await api("POST", "/pages", body));
    },
);

server.tool(
    "update_page",
    "Изменить страницу по id. Передавай только те поля, которые надо поменять. " +
        "Системные и readonly-страницы (attributes.is_readonly = true) отдают HTTP 403.",
    {
        id: z.number().int().describe("Числовой id страницы"),
        title: z.string().optional().describe("Новый заголовок"),
        content: z.string().optional().describe("Новое тело страницы"),
        slug: z.string().optional().describe("Новый путь (перемещает страницу в дереве)"),
    },
    async ({ id, title, content, slug }) => {
        const body = {};
        if (title !== undefined) body.title = title;
        if (content !== undefined) body.content = content;
        if (slug !== undefined) body.slug = slug;
        if (Object.keys(body).length === 0) {
            throw new Error("Нечего менять: передай хотя бы одно из title/content/slug");
        }
        return ok(await api("POST", `/pages/${id}`, body));
    },
);

server.tool(
    "delete_page",
    "Удалить страницу по id. Операция необратима — сначала подтверди у пользователя.",
    {
        id: z.number().int().describe("Числовой id страницы"),
    },
    async ({ id }) => ok(await api("DELETE", `/pages/${id}`)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
