# Production Fix Checklist — API Auth + Telegram

> **Important:** Vercel deploys from repo **`CV.-Harapan-Maju`**, not `harapan-maju-poc`.
> Pushes to `harapan-maju-poc` do **not** update production.

## What production actually uses

From `GET /api/health`:

```json
{
  "bootstrap": {
    "authFromEnv": false,
    "authFromDb": true,
    "authEnabled": true
  }
}
```

The API key is stored in the **Postgres `app_config` table** (key: `API_SECRET_KEY`), **not** in a Vercel env var named `x_api_key`.

| What you set | What production reads |
|--------------|---------------------|
| ❌ Vercel env `x_api_key` | Nothing — wrong name |
| ❌ Vercel env `INTERNAL_API_KEY` | Only if `authFromEnv` is true (it's false) |
| ✅ DB `app_config.API_SECRET_KEY` | This is what MCP/OpenCLAW uses |

## Step 1 — Disable Vercel SSO (fixes Telegram)

Telegram webhooks come from outside Vercel. SSO blocks them before your app runs.

1. Open [Vercel → harapan-maju-poc → Settings → Authentication](https://vercel.com/filberts-projects-a78ae880/harapan-maju-poc/settings?target=authentication)
2. Turn **Deployment Protection / SSO** **OFF**
3. Test:
   ```bash
   curl -X POST https://harapan-maju-poc.vercel.app/api/telegram \
     -H "Content-Type: application/json" \
     -d '{"message":{"chat":{"id":1},"text":"test"}}'
   ```
   Expected: `{"ok":true,...}` (not `401`)

## Step 2 — Set API key in the database

Open **Vercel → Storage → Postgres → Query** (or Neon console) and run:

```sql
-- Check current key (shows if set, not the value)
SELECT key, length(value) AS value_length, updated_at
FROM app_config
WHERE key = 'API_SECRET_KEY';

-- Set the OpenCLAW key
INSERT INTO app_config (key, value, updated_at)
VALUES (
  'API_SECRET_KEY',
  '6e5cb24d75c5b7a773bc14129d69307b8ee26f44a06157ef2ae5c448fb3d5287',
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
```

> Replace the value with your actual secret if you rotate it.

## Step 3 — Verify MCP works

```bash
curl -X POST https://harapan-maju-poc.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: 6e5cb24d75c5b7a773bc14129d69307b8ee26f44a06157ef2ae5c448fb3d5287" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: HTTP 200 with a `result.tools` array.

Both headers work: `x-api-key` and `x_api_key`.

## Step 4 — Give OpenCLAW these values

```
Base URL:  https://harapan-maju-poc.vercel.app
Endpoint:  POST /api/mcp
Header:    x-api-key: <same value as API_SECRET_KEY in database>
```

Example call:
```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_summary","arguments":{}}}
```

## Telegram bot — no API key needed

`@DuringgAWSS_bot` calls `/api/telegram` directly inside Vercel. It does **not** use the MCP API key. Once SSO is off, Telegram works.

## Health check (always public)

```bash
curl https://harapan-maju-poc.vercel.app/api/health
```

Look for `"authFromDb": true` and `"webhookConfigured": true`.

## Common mistakes

| Mistake | Result |
|---------|--------|
| Created Vercel env var `x_api_key` | 401 — production ignores it |
| SSO still on | Telegram 401, external MCP blocked |
| Key in env but not in `app_config` | 401 on MCP POST |
| Editing `harapan-maju-poc` repo only | Production unchanged — deploys from `CV.-Harapan-Maju` |
