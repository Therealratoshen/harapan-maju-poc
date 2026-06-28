# Production Setup — API Auth + Telegram + OpenCLAW

## One env var fixes everything

Set in **Vercel → Environment Variables**:

```
INTERNAL_API_KEY = <your-secret-hex-key>
```

On first request the app **auto-syncs** this value to Postgres `app_config.API_SECRET_KEY`.
You do not need a separate `x_api_key` env var.

## Who needs the API key?

| Client | API key header? | Why |
|--------|-----------------|-----|
| **Dashboard** (browser) | No | Same-origin bypass — works automatically |
| **Telegram bot** | No | `/api/telegram` has no auth |
| **OpenCLAW** (external) | **Yes** | `x-api-key: <same as INTERNAL_API_KEY>` |

## Disable Vercel SSO (required for Telegram)

Telegram webhooks are blocked by Vercel Deployment Protection.

[Settings → Authentication → OFF](https://vercel.com/filberts-projects-a78ae880/harapan-maju-poc/settings?target=authentication)

## Verify

```bash
# Health (public)
curl https://harapan-maju-poc.vercel.app/api/health

# MCP for OpenCLAW
curl -X POST https://harapan-maju-poc.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Telegram (after SSO off)
curl -X POST https://harapan-maju-poc.vercel.app/api/telegram \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":1},"text":"test"}}'
```

## Manual DB update (only if env var already set but MCP still 401)

```sql
INSERT INTO app_config (key, value, updated_at)
VALUES ('API_SECRET_KEY', 'YOUR_KEY', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

## Note on repos

Vercel may deploy from **`CV.-Harapan-Maju`**. Ensure this auth improvement is merged there too, or reconnect Vercel to **`harapan-maju-poc`**.
