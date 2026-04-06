# 📱 WhatsApp Conductor

> **Orchestrate personalized WhatsApp outreach at scale with intelligent contact queue management**

A serverless Telegram bot that coordinates multiple operators to efficiently manage and distribute WhatsApp contacts. Built with Netlify Functions and Supabase for scalable, real-time collaboration.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/vishalk4743/WhatsApp-Conductor)

## ✨ Features

- 🔄 **Queue Management**: Intelligent contact distribution with automatic claim/release
- 👥 **Multi-operator Support**: Multiple team members can work simultaneously
- 🎯 **Dual Modes**: Switch between shared (team) and personal (solo) workflows  
- 💾 **Persistent State**: Supabase-backed database ensures no data loss
- ⚡ **Serverless**: Runs entirely on Netlify Edge Functions - no server maintenance
- 🔐 **Secure**: Webhook validation and admin-only configuration endpoints
- 📊 **Analytics**: Real-time stats on queue progress and personal contributions
- 🔗 **WhatsApp Deep Links**: Auto-generate click-to-chat URLs for each contact

## 🏗️ Architecture

```
Telegram Bot → Netlify Functions → Supabase Database
     ↓              ↓                    ↓
  Updates       Webhooks            Shared State
```

- **Telegram**: Sends user commands to webhook endpoint
- **Netlify Functions**: Processes commands and manages queue logic
- **Supabase**: Stores users, contacts, claims, and completion status

## 🚀 Quick Start

### Prerequisites

- [Telegram Bot Token](https://core.telegram.org/bots/tutorial#obtain-your-bot-token) from [@BotFather](https://t.me/botfather)
- [Supabase Account](https://supabase.com) (free tier works)
- [Netlify Account](https://netlify.com) (free tier works)
- GitHub repository (fork this repo)

### 1️⃣ Setup Supabase Database

1. Create a new Supabase project at [app.supabase.com](https://app.supabase.com)
2. Navigate to **SQL Editor** in your project dashboard
3. Open and execute `supabase/schema.sql` (creates tables, RPC functions, and triggers)
4. Copy your **Project URL** and **Service Role Key** from **Settings** → **API**

### 2️⃣ Prepare Contact List

Add your contacts to the database:

```sql
INSERT INTO contacts (queue_position, name, phone) VALUES
  (1, 'John Doe', '+919876543210'),
  (2, 'Jane Smith', '9876543211'),
  (3, 'Bob Wilson', '919876543212');
```

Or import from `contacts.csv` using Supabase table editor.

### 3️⃣ Deploy to Netlify

1. **Fork this repository** to your GitHub account
2. **Connect to Netlify**:
   - Go to [app.netlify.com](https://app.netlify.com)
   - Click "New site from Git"
   - Select your forked repository
   
3. **Configure Environment Variables**:

   | Variable | Description | Example |
   |----------|-------------|---------|
   | `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather | `123456:ABC-DEF1234ghIkl...` |
   | `TELEGRAM_WEBHOOK_SECRET` | Random secret string (generate one) | `my-secret-webhook-key-123` |
   | `BOT_ADMIN_SECRET` | Admin endpoint password | `admin-password-xyz` |
   | `SUPABASE_URL` | Your Supabase project URL | `https://xxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key from Supabase | `eyJhbGciOiJIUzI1...` |
   | `DEFAULT_MESSAGE` | Default WhatsApp message template | `Hi! Check this out...` |
   | `STALE_CLAIM_MINUTES` | Auto-release timeout (optional) | `30` |

4. **Deploy** the site

### 4️⃣ Register Telegram Webhook

After successful deployment, register your webhook endpoint:

```bash
curl -X POST \
  -H "x-admin-secret: YOUR_BOT_ADMIN_SECRET" \
  https://YOUR_SITE.netlify.app/.netlify/functions/set-telegram-webhook
```

✅ You should see a success message confirming webhook registration.

### 5️⃣ Start Using the Bot

1. Open your bot in Telegram (search for your bot username)
2. Send `/start` to initialize your user profile
3. Use `/current` to claim your first contact
4. Send messages via WhatsApp using the provided link
5. Mark complete with `/done` and move to next

## 📝 Bot Commands

### Queue Management
| Command | Description |
|---------|-------------|
| `/start` or `/help` | Show welcome message and claim first contact |
| `/current` | Display your currently claimed contact |
| `/next` | Claim next available contact from queue |
| `/done` | Mark current contact as completed and move forward |
| `/skip` | Release current contact and claim next one |
| `/release` | Release current contact without claiming another |

### Status & Configuration
| Command | Description |
|---------|-------------|
| `/status` or `/count` | Show queue statistics and personal progress |
| `/mode` | Display current workflow mode (shared/personal) |
| `/mode shared` | Switch to team mode (shared queue) |
| `/mode personal` | Switch to solo mode (personal queue) |
| `/message <text>` | Set custom WhatsApp message template |
| `/resetmessage` | Restore default message from environment variable |

## 💻 Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/WhatsApp-Conductor.git
cd WhatsApp-Conductor

# Install dependencies
npm install

# Create .env file with your environment variables
cp .env.example .env

# Start local Netlify dev server
npx netlify dev
```

The bot will be available at `http://localhost:8888`. Use a tool like [ngrok](https://ngrok.com) to create a public URL for webhook testing.

## 🔧 Configuration

### Phone Number Formats
The bot accepts multiple phone number formats:
- ✅ `9876543210` (10 digits)
- ✅ `919876543210` (country code + number)
- ✅ `+919876543210` (+ prefix optional)

### Workflow Modes

**Shared Mode** (default): All team members share the same queue. Best for collaborative outreach campaigns.

**Personal Mode**: Each user has their own isolated queue. Best for individual work or testing.

### Stale Claim Handling
Set `STALE_CLAIM_MINUTES` to automatically release contacts that have been claimed but not completed within the specified time. This prevents blocking when team members go offline.

## 🛡️ Security Best Practices

- 🔐 Never commit `.env` or expose environment variables
- 🔑 Use strong, random strings for `TELEGRAM_WEBHOOK_SECRET` and `BOT_ADMIN_SECRET`
- 👤 Keep `SUPABASE_SERVICE_ROLE_KEY` private (has admin access)
- 🌐 The `/set-telegram-webhook` endpoint is admin-protected
- ✅ Webhook requests are validated using Telegram's secret token

## 📊 Database Schema

### Tables
- **`bot_users`**: Stores Telegram user profiles and preferences
- **`contacts`**: Queue of contacts with phone numbers and status
- **`claims`**: Tracks which user has claimed which contact

### Key Features
- Atomic claim operations prevent double-assignment
- Triggers maintain data consistency
- RPC functions handle complex queue logic
- Indexed queries for fast performance

## 🐛 Troubleshooting

### Bot doesn't respond
- ✅ Check webhook is registered: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- ✅ Verify Netlify function logs for errors
- ✅ Ensure environment variables are set correctly

### Database connection errors
- ✅ Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- ✅ Check Supabase project is active (not paused)
- ✅ Confirm `schema.sql` was executed successfully

### Webhook registration fails
- ✅ Use correct `BOT_ADMIN_SECRET` in request header
- ✅ Ensure your Netlify site is deployed and accessible
- ✅ Check bot token is valid

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with [Netlify Functions](https://www.netlify.com/products/functions/)
- Database powered by [Supabase](https://supabase.com)
- Bot framework by [Telegram Bot API](https://core.telegram.org/bots/api)

---

**Made with ❤️ for efficient team collaboration**
