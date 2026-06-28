# CV. Harapan Maju — Setup Guide

## Environment Variables

Copy values from `.env.local` (ask the developer for actual values):

| Variable | Where to get it |
|---|---|
| `POSTGRES_URL` | Vercel → Storage → Neon Postgres |
| `INTERNAL_API_KEY` | Generate a random secret (e.g. `openssl rand -hex 32`) — give this to OpenCLAW |
| `TELEGRAM_BOT_TOKEN` | Telegram → @BotFather → `/newbot` |
| `OWNER_CHAT_ID` | Telegram → @userinfobot |
| `MINIMAX_API_KEY` | minimaxi.chat → API section |

Add these in **Vercel dashboard → Project → Settings → Environment Variables**.

### OpenCLAW (external agent)

OpenCLAW calls `/api/mcp` from outside Vercel and needs the API key:

```
Base URL:  https://harapan-maju-poc.vercel.app
Headers:   x-api-key: <same value as INTERNAL_API_KEY>
```

Also disable Vercel SSO: [Settings → Authentication](https://vercel.com/filberts-projects-a78ae880/harapan-maju-poc/settings?target=authentication)

The Telegram bot (`@DuringgAWSS_bot`) does **not** need the API key — it runs inside Vercel.

---

## Telegram Bot Setup

After deploying, set the webhook so the bot receives messages:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://harapan-maju-poc.vercel.app/api/telegram
```

Open this URL in your browser. It should return `{"ok":true}`.

---

## How to Use

**Staff:** Send receipt photo to the Telegram bot → immediately gets acknowledgement

**Owner:**
1. Open dashboard: `https://harapan-maju-poc.vercel.app/dashboard`
2. Review pending receipts
3. Click "Run OCR" to extract data
4. Approve or correct
5. Ask bot via Telegram: "receipt", "flags", "revenue"
