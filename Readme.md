# Telegram WhatsApp Helper

This is a Netlify webhook Telegram bot with Supabase-managed queue state; all users share the same dataset.

## Overview

- Telegram pushes updates to `/.netlify/functions/telegram-webhook`.
- Supabase stores users, contacts, claims, and sent status.
- Contacts can be handled in shared (team) or personal (solo) mode.
- Kitchen-sink state file (`bot_state.json`) is no longer used.

## Step-by-step deploy

1. **Supabase schema**
   - Create a Supabase project.
   - Open the SQL editor and run `supabase/schema.sql`.
   - This creates `bot_users`, `contacts`, the shared-claim RPC, and the necessary triggers.
2. **Populate contacts**
   - Clear every row from `contacts` (keep table empty if you want to start fresh).
-  - Ensure `queue_position` values are sequential and unique.
3. **Load the repo**
   - Push this folder to a GitHub repo if it is not already hosted.
4. **Deploy to Netlify**
   - Create a Netlify site from the repo.
   - Set environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `BOT_ADMIN_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEFAULT_MESSAGE`, `STALE_CLAIM_MINUTES`.
   - Deploy the site.
5. **Register the webhook**
   - After deployment, call the admin endpoint once:

```bash
curl -X POST \
  -H "x-admin-secret: YOUR_BOT_ADMIN_SECRET" \
  https://YOUR_SITE.netlify.app/.netlify/functions/set-telegram-webhook
```

   - This tells Telegram where to send updates.
6. **Use the bot**
   - Open your Telegram bot in a private chat and send `/start`.
   - Every user can now claim contacts via `/current`, `/mode`, `/done`, etc.

## Local development

```bash
npm install
npx netlify dev
```

## Commands

- `/start` or `/help`: instructions and claim first contact
- `/current`/`/next`: show or claim your current contact
- `/done`: mark the current contact as sent
- `/skip`: release current contact and skip forward
- `/release`: release without claiming another
- `/status`/`/count`: show queue and personal stats
- `/mode`: show current mode
- `/mode personal` / `/mode shared`: switch between solo and shared workflows
- `/message <text>`: override your default WhatsApp text
- `/resetmessage`: revert to `DEFAULT_MESSAGE`

## Notes

- Positive phone formats: `9876543210`, `919876543210`, or `+919876543210`.
- Supabase is the single source of truth.
- Keep the webhook secret private.
