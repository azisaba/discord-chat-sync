import { Client, GatewayIntentBits, Message, WebhookClient } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_1_ID = process.env.CHANNEL_1_ID;
const CHANNEL_2_ID = process.env.CHANNEL_2_ID;
const WEBHOOK_1_URL = process.env.WEBHOOK_1_URL;
const WEBHOOK_2_URL = process.env.WEBHOOK_2_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!CHANNEL_1_ID || !CHANNEL_2_ID || !WEBHOOK_1_URL || !WEBHOOK_2_URL || !BOT_TOKEN) {
  console.error('Error: Missing required environment variables');
  console.error('Please set CHANNEL_1_ID, CHANNEL_2_ID, WEBHOOK_1_URL, WEBHOOK_2_URL, and BOT_TOKEN in your .env file');
  process.exit(1);
}

const webhook1 = new WebhookClient({ url: WEBHOOK_1_URL });
const webhook2 = new WebhookClient({ url: WEBHOOK_2_URL });

client.once('ready', () => {
  console.log(`Bot is ready! Logged in as ${client.user?.tag}`);
  console.log(`Syncing messages between channels: ${CHANNEL_1_ID} <-> ${CHANNEL_2_ID}`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  if (message.channel.id !== CHANNEL_1_ID && message.channel.id !== CHANNEL_2_ID) {
    return;
  }

  try {
    let targetWebhook: WebhookClient;
    
    if (message.channel.id === CHANNEL_1_ID) {
      targetWebhook = webhook2;
    } else {
      targetWebhook = webhook1;
    }

    await targetWebhook.send({
      content: message.content || undefined,
      username: message.member?.nickname ? `${message.member.nickname} (${message.author.username})` : `${message.author.displayName} (${message.author.username})`,
      avatarURL: message.author.displayAvatarURL(),
      embeds: message.embeds,
      files: message.attachments.map(attachment => attachment.url)
    });

    console.log(`Synced message from ${message.channel.id} to ${message.channel.id === CHANNEL_1_ID ? CHANNEL_2_ID : CHANNEL_1_ID}`);
    
  } catch (error) {
    console.error('Error syncing message:', error);
  }
});

client.on('error', console.error);

client.login(BOT_TOKEN).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});
