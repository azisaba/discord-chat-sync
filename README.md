# Discord Chat Sync Bot

A Discord bot that synchronizes messages between two channels, preserving the original sender's username and avatar using webhooks.

## Features

- Real-time message synchronization between two Discord channels
- Preserves original sender's username and avatar
- Supports text messages, embeds, and file attachments
- Displays server nicknames when available
- Docker support for easy deployment

## Prerequisites

- Node.js 20+ (for local development)
- Discord Bot Token
- Two Discord channels with webhook access
- Docker (optional, for containerized deployment)

## Setup

### 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" section
4. Create a bot and copy the token
5. Enable the following bot intents:
   - Message Content Intent
   - Server Members Intent (if using nicknames)

### 2. Create Webhooks

1. In each channel you want to sync:
   - Go to Channel Settings → Integrations → Webhooks
   - Create a new webhook
   - Copy the webhook URL

### 3. Configure Environment

1. Copy `.env.example` to `.env`
2. Fill in the required values:
   ```env
   BOT_TOKEN=your_bot_token_here
   CHANNEL_1_ID=first_channel_id
   CHANNEL_2_ID=second_channel_id
   WEBHOOK_1_URL=webhook_url_for_channel_1
   WEBHOOK_2_URL=webhook_url_for_channel_2
   ```

### 4. Invite Bot to Server

1. In Discord Developer Portal, go to OAuth2 → URL Generator
2. Select scopes: `bot`
3. Select permissions: `View Channels`, `Read Message History`
4. Use the generated URL to invite the bot to your server

## Running the Bot

### Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the bot
npm start

# Or run in development mode
npm run dev
```

### Docker Deployment

```bash
# Build and start the container
docker compose up -d

# View logs
docker compose logs -f

# Stop the container
docker compose down
```

## How It Works

1. The bot monitors messages in both configured channels
2. When a message is sent in Channel 1, it's forwarded to Channel 2 via Webhook 2
3. When a message is sent in Channel 2, it's forwarded to Channel 1 via Webhook 1
4. Webhooks preserve the original sender's username and avatar
5. Messages from bots are ignored to prevent loops

## Troubleshooting

- **Bot not responding**: Check that the bot token is correct and the bot is online
- **Messages not syncing**: Verify channel IDs and webhook URLs are correct
- **Permission errors**: Ensure the bot has access to both channels
- **Webhook errors**: Check that webhooks are active and URLs are valid

## License

MIT