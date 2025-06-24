import { Client, GatewayIntentBits, Message, WebhookClient, ThreadChannel, ChannelType, TextChannel } from 'discord.js';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

const CHANNEL_1_ID = process.env.CHANNEL_1_ID;
const CHANNEL_2_ID = process.env.CHANNEL_2_ID;
const WEBHOOK_1_URL = process.env.WEBHOOK_1_URL;
const WEBHOOK_2_URL = process.env.WEBHOOK_2_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

const THREADS_DIR = path.join(process.cwd(), 'threads');
const threadPairs = new Map<string, string>();
const processingThreads = new Set<string>();
const recentlyCreatedThreads = new Map<string, number>();

if (!CHANNEL_1_ID || !CHANNEL_2_ID || !WEBHOOK_1_URL || !WEBHOOK_2_URL || !BOT_TOKEN) {
  console.error('Error: Missing required environment variables');
  console.error('Please set CHANNEL_1_ID, CHANNEL_2_ID, WEBHOOK_1_URL, WEBHOOK_2_URL, and BOT_TOKEN in your .env file');
  process.exit(1);
}

const webhook1 = new WebhookClient({ url: WEBHOOK_1_URL });
const webhook2 = new WebhookClient({ url: WEBHOOK_2_URL });

client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user?.tag}`);
  console.log(`Syncing messages between channels: ${CHANNEL_1_ID} <-> ${CHANNEL_2_ID}`);
  
  await loadThreadPairs();
  
  // Clean up old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of recentlyCreatedThreads.entries()) {
      if (now - timestamp > 10000) {
        recentlyCreatedThreads.delete(key);
      }
    }
  }, 5000);
});

async function loadThreadPairs() {
  try {
    await fs.access(THREADS_DIR);
  } catch {
    await fs.mkdir(THREADS_DIR, { recursive: true });
    return;
  }

  const files = await fs.readdir(THREADS_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(THREADS_DIR, file);
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      threadPairs.set(data.thread1, data.thread2);
      threadPairs.set(data.thread2, data.thread1);
    }
  }
  console.log(`Loaded ${threadPairs.size / 2} thread pairs`);
}

async function saveThreadPair(thread1Id: string, thread2Id: string) {
  const fileName = `${thread1Id}-${thread2Id}.json`;
  const filePath = path.join(THREADS_DIR, fileName);
  const data = {
    thread1: thread1Id,
    thread2: thread2Id,
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  threadPairs.set(thread1Id, thread2Id);
  threadPairs.set(thread2Id, thread1Id);
}

function sanitizeMentions(content: string): string {
  return content
    .replace(/@everyone/g, '@\u200beveryone')
    .replace(/@here/g, '@\u200bhere')
    .replace(/<@!?(\d+)>/g, '@\u200buser')
    .replace(/<@&(\d+)>/g, '@\u200brole')
    .replace(/<#(\d+)>/g, '#\u200bchannel');
}

client.on('messageCreate', async (message: Message) => {
  // Skip bot messages and webhook messages
  if (message.author.bot || message.webhookId) {
    return;
  }

  if (message.channel.type === ChannelType.PublicThread || message.channel.type === ChannelType.PrivateThread) {
    const threadId = message.channel.id;
    const pairedThreadId = threadPairs.get(threadId);
    
    if (!pairedThreadId) {
      return;
    }

    try {
      const pairedThread = await client.channels.fetch(pairedThreadId) as ThreadChannel;
      if (!pairedThread) {
        console.error(`Could not find paired thread ${pairedThreadId}`);
        return;
      }

      const parentId = pairedThread.parentId;
      let targetWebhook: WebhookClient;
      
      if (parentId === CHANNEL_1_ID) {
        targetWebhook = new WebhookClient({ url: WEBHOOK_1_URL });
      } else if (parentId === CHANNEL_2_ID) {
        targetWebhook = new WebhookClient({ url: WEBHOOK_2_URL });
      } else {
        console.error(`Paired thread ${pairedThreadId} has unexpected parent ${parentId}`);
        return;
      }

      const sanitizedContent = message.content ? sanitizeMentions(message.content) : undefined;

      await targetWebhook.send({
        threadId: pairedThreadId,
        content: sanitizedContent,
        username: message.member?.nickname ? `${message.member.nickname} (${message.author.username})` : `${message.author.displayName} (${message.author.username})`,
        avatarURL: message.author.displayAvatarURL(),
        embeds: message.embeds,
        files: message.attachments.map(attachment => attachment.url),
        allowedMentions: { parse: [] }
      });

      console.log(`Synced thread message from ${threadId} to ${pairedThreadId}`);
    } catch (error) {
      console.error('Error syncing thread message:', error);
    }
    return;
  }

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

    const sanitizedContent = message.content ? sanitizeMentions(message.content) : undefined;

    await targetWebhook.send({
      content: sanitizedContent,
      username: message.member?.nickname ? `${message.member.nickname} (${message.author.username})` : `${message.author.displayName} (${message.author.username})`,
      avatarURL: message.author.displayAvatarURL(),
      embeds: message.embeds,
      files: message.attachments.map(attachment => attachment.url),
      allowedMentions: { parse: [] }
    });

    console.log(`Synced message from ${message.channel.id} to ${message.channel.id === CHANNEL_1_ID ? CHANNEL_2_ID : CHANNEL_1_ID}`);
    
  } catch (error) {
    console.error('Error syncing message:', error);
  }
});

client.on('threadCreate', async (thread: ThreadChannel) => {
  const parentId = thread.parentId;
  
  if (parentId !== CHANNEL_1_ID && parentId !== CHANNEL_2_ID) {
    return;
  }

  // Skip if this thread is already paired or being processed
  if (threadPairs.has(thread.id) || processingThreads.has(thread.id)) {
    return;
  }

  // Check if thread was created by the bot (check if any thread with same name was recently created)
  const createKey1 = `${thread.name}-${CHANNEL_1_ID}`;
  const createKey2 = `${thread.name}-${CHANNEL_2_ID}`;
  const recentlyCreated1 = recentlyCreatedThreads.get(createKey1);
  const recentlyCreated2 = recentlyCreatedThreads.get(createKey2);
  
  if ((recentlyCreated1 && Date.now() - recentlyCreated1 < 5000) || 
      (recentlyCreated2 && Date.now() - recentlyCreated2 < 5000)) {
    return;
  }

  // Mark this thread as being processed
  processingThreads.add(thread.id);
  
  let firstMessage = null;

  try {
    await thread.join();
    console.log(`Bot joined thread: ${thread.name} (${thread.id})`);
    
    // Wait a bit for the initial message to be available
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get the first message in the thread if it exists
    try {
      const messages = await thread.messages.fetch({ limit: 1 });
      firstMessage = messages.first();
    } catch (error) {
      console.log('Could not fetch first message from thread');
    }

    const targetChannelId = parentId === CHANNEL_1_ID ? CHANNEL_2_ID : CHANNEL_1_ID;
    const targetChannel = await client.channels.fetch(targetChannelId) as TextChannel | null;
    
    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
      console.error(`Target channel ${targetChannelId} not found or is not a text channel`);
      return;
    }

    const threadOptions: any = {
      name: thread.name,
      reason: `Synced from ${parentId}`
    };
    
    if (thread.autoArchiveDuration) {
      threadOptions.autoArchiveDuration = thread.autoArchiveDuration;
    }
    
    if (thread.type === ChannelType.PublicThread || thread.type === ChannelType.PrivateThread) {
      threadOptions.type = thread.type;
    }
    
    // Mark that we're creating this thread BEFORE creation
    const createKey = `${thread.name}-${targetChannelId}`;
    recentlyCreatedThreads.set(createKey, Date.now());
    
    const newThread = await targetChannel.threads.create(threadOptions);
    
    // Mark the new thread as being processed immediately after creation
    processingThreads.add(newThread.id);

    await newThread.join();
    console.log(`Created and joined paired thread: ${newThread.name} (${newThread.id})`);

    await saveThreadPair(thread.id, newThread.id);
    console.log(`Saved thread pair: ${thread.id} (parent: ${thread.parentId}) <-> ${newThread.id} (parent: ${newThread.parentId})`);
    
    // Send the first message if it exists
    if (firstMessage && !firstMessage.author.bot) {
      const targetWebhook = parentId === CHANNEL_1_ID ? webhook2 : webhook1;
      const sanitizedContent = firstMessage.content ? sanitizeMentions(firstMessage.content) : undefined;
      
      try {
        await targetWebhook.send({
          threadId: newThread.id,
          content: sanitizedContent,
          username: firstMessage.member?.nickname 
            ? `${firstMessage.member.nickname} (${firstMessage.author.username})` 
            : `${firstMessage.author.displayName} (${firstMessage.author.username})`,
          avatarURL: firstMessage.author.displayAvatarURL(),
          embeds: firstMessage.embeds,
          files: firstMessage.attachments.map(attachment => attachment.url),
          allowedMentions: { parse: [] }
        });
        console.log(`Synced initial thread message to new thread`);
      } catch (error) {
        console.error('Error syncing initial thread message:', error);
      }
    }

  } catch (error) {
    console.error('Error creating paired thread:', error);
  } finally {
    // Clean up processing markers
    processingThreads.delete(thread.id);
  }
});

client.on('error', console.error);

client.login(BOT_TOKEN).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});
