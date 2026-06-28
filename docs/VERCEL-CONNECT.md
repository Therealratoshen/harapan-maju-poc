# Connect Vercel to `harapan-maju-poc` (one-time)

Production currently deploys from **`CV.-Harapan-Maju`**. Our fixes are on **`harapan-maju-poc`**. Switch the Git connection once:

## Step 1 — Open project Git settings

https://vercel.com/filberts-projects-a78ae880/harapan-maju-poc/settings/git

1. Click **Disconnect** on the current repo (`CV.-Harapan-Maju`)
2. Click **Connect Git Repository**
3. Choose **GitHub** → **`Therealratoshen/harapan-maju-poc`**
4. Production branch: **`main`**

## Step 2 — Environment variables

https://vercel.com/filberts-projects-a78ae880/harapan-maju-poc/settings/environment-variables

Add or update (Production + Preview):

| Name | Value |
|------|-------|
| `INTERNAL_API_KEY` | `6e5cb24d75c5b7a773bc14129d69307b8ee26f44a06157ef2ae5c448fb3d5287` |
| `POSTGRES_URL` | *(keep existing — do not change)* |
| `TELEGRAM_BOT_TOKEN` | *(keep existing)* |
| `MINIMAX_API_KEY` | *(keep existing)* |
| `BLOB_READ_WRITE_TOKEN` | *(keep existing)* |
| `OWNER_CHAT_ID` | *(keep existing)* |
| `NEXT_PUBLIC_BASE_URL` | `https://harapan-maju-poc.vercel.app` |

`INTERNAL_API_KEY` auto-syncs to Postgres `app_config` on first request.

## Step 3 — Disable SSO (Telegram webhooks)

https://vercel.com/filberts-projects-a78ae880/harapan-maju-poc/settings/authentication

Turn **Deployment Protection / SSO** **OFF**.

## Step 4 — Redeploy

https://vercel.com/filberts-projects-a78ae880/harapan-maju-poc/deployments

Click **Redeploy** on latest deployment (or push to `main` triggers auto-deploy).

## Step 5 — Verify

```bash
curl https://harapan-maju-poc.vercel.app/api/health
# Expect version "1.1", auth.authFromEnv: true

curl -X POST https://harapan-maju-poc.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: 6e5cb24d75c5b7a773bc14129d69307b8ee26f44a06157ef2ae5c448fb3d5287" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# Expect HTTP 200

curl -X POST https://harapan-maju-poc.vercel.app/api/telegram \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":1},"text":"test"}}'
# Expect {"ok":true}
```

## CLI alternative (if you have `vercel login`)

```bash
cd harapan-maju-poc
vercel link --project harapan-maju-poc
vercel git disconnect
vercel git connect
# Select: Therealratoshen/harapan-maju-poc
vercel env add INTERNAL_API_KEY production
vercel --prod
```
