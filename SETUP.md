# CV. Harapan Maju — Setup Guide

## Environment Variables

Copy values from `.env.local` (ask the developer for actual values):

| Variable | Where to get it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram → @BotFather → `/newbot` |
| `OWNER_CHAT_ID` | Telegram → @userinfobot |
| `MINIMAX_API_KEY` | minimaxi.chat → API section |

Add these in **Vercel dashboard → Project → Settings → Environment Variables**.

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
