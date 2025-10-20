const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const THREAD_PARENT_CHANNEL_ID = '1380874052855529605';
const ANON_NICK = '까리한 디스코드';
const RELAY_PATH = path.join(__dirname, '../data/relayMap.json');
const FALLBACK_PATH = path.join(__dirname, '../data/relayFallbackMap.json');
const FALLBACK_CATEGORY_ID = '1354742687022186608';

function ensureFile(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, '{}');
}
function loadRelayMap() {
  ensureFile(RELAY_PATH);
  const raw = fs.readFileSync(RELAY_PATH, 'utf8');
  return new Map(Object.entries(JSON.parse(raw)));
}
function saveRelayMap(map) {
  fs.writeFileSync(RELAY_PATH, JSON.stringify(Object.fromEntries(map), null, 2));
}
function loadFallbackMap() {
  ensureFile(FALLBACK_PATH);
  const raw = fs.readFileSync(FALLBACK_PATH, 'utf8');
  return new Map(Object.entries(JSON.parse(raw)));
}
function saveFallbackMap(map) {
  fs.writeFileSync(FALLBACK_PATH, JSON.stringify(Object.fromEntries(map), null, 2));
}

async function sendToUserOrFallback(client, guild, user, payload) {
  try {
    await user.send(payload);
    return { via: 'dm' };
  } catch {
    const fbMap = loadFallbackMap();
    let channelId = fbMap.get(user.id);
    let channel = channelId ? guild.channels.cache.get(channelId) : null;
    if (channel && channel.deleted) channel = null;
    if (!channel) {
      const category = guild.channels.cache.get(FALLBACK_CATEGORY_ID);
      const name = `dm-${user.username}-${String(user.id).slice(-4)}`;
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category?.id || undefined,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] }
        ],
        topic: `DM 대체 채널 | 대상: ${user.tag} (${user.id})`
      });
      fbMap.set(user.id, channel.id);
      saveFallbackMap(fbMap);
      await channel.send({ content: `-# <@${user.id}> DM 수신이 불가하여 이 채널에서 이어집니다.` }).catch(() => {});
    }
    const files = payload.files && payload.files.length ? payload.files : undefined;
    const content = (payload.content || '').trim();
    const finalContent = content.length ? `**[${ANON_NICK}]**\n${content}\n\n<@${user.id}>` : `<@${user.id}>`;
    await channel.send({ content: finalContent, files });
    return { via: 'fallback', channelId: channel.id };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('디엠')
    .setDescription('익명 임시 DM 스레드를 생성/이어서 릴레이합니다.')
    .addUserOption(opt =>
      opt.setName('유저')
        .setDescription('익명 대화할 유저')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('이어서')
        .setDescription('기존 스레드를 이어서 진행')
        .addChoices(
          { name: '예', value: 'yes' },
          { name: '아니오', value: 'no' }
        )
        .setRequired(false)
    ),
  async execute(interaction) {
    const user = interaction.options.getUser('유저');
    const useExisting = (interaction.options.getString('이어서') || 'no') === 'yes';
    const parentChannel = await interaction.guild.channels.fetch(THREAD_PARENT_CHANNEL_ID).catch(() => null);
    if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: '지정 텍스트채널을 찾을 수 없음.', ephemeral: true });
    }

    let relayMap = loadRelayMap();
    let thread;
    if (useExisting && relayMap.has(user.id)) {
      const threadId = relayMap.get(user.id);
      thread = await parentChannel.threads.fetch(threadId).catch(() => null);
      if (!thread) relayMap.delete(user.id);
    }
    if (!thread) {
      const threadName = `익명DM-${user.username}-${Date.now().toString().slice(-5)}`;
      thread = await parentChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 1440,
        reason: '익명 임시 DM 스레드',
        invitable: false,
      });
      relayMap.set(user.id, thread.id);
      saveRelayMap(relayMap);
      await thread.send({
        content: `🔒 **${ANON_NICK}**에서 시작된 익명 1:1 스레드입니다. 24시간 후 자동 보관됩니다.`,
      });
    } else {
      saveRelayMap(relayMap);
    }

    await interaction.reply({
      content: `✅ 스레드 준비 완료. 이 스레드의 메시지는 <@${user.id}>에게 익명으로 전달돼.`,
      ephemeral: true,
    });
  },

  relayRegister(client) {
    client.on('messageCreate', async msg => {
      if (!msg.guild && !msg.author.bot) {
        const relayMap = loadRelayMap();
        const threadId = relayMap.get(msg.author.id);
        if (!threadId) return;
        const guild = client.guilds.cache.find(g => g.channels.cache.has(THREAD_PARENT_CHANNEL_ID));
        if (!guild) return;
        const parentChannel = guild.channels.cache.get(THREAD_PARENT_CHANNEL_ID);
        if (!parentChannel) return;
        const thread = await parentChannel.threads.fetch(threadId).catch(() => null);
        if (!thread) return;

        let files = [];
        if (msg.attachments?.size > 0) files = Array.from(msg.attachments.values()).map(a => a.url);
        const contentMsg = `**[상대]**\n(From: <@${msg.author.id}> | ${msg.author.tag})\n${msg.content || ''}`;
        await thread.send({ content: contentMsg, files: files.length ? files : undefined });
      }
    });

    client.on('messageCreate', async msg => {
      if (msg.author.bot) return;

      if (msg.channel.type === ChannelType.PublicThread) {
        const relayMap = loadRelayMap();
        for (const [userId, threadId] of relayMap.entries()) {
          if (threadId === msg.channel.id) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) return;
            let files = [];
            if (msg.attachments?.size > 0) files = Array.from(msg.attachments.values()).map(a => a.url);
            const contentMsg = `**[${ANON_NICK}]**\n${msg.content || ''}`;
            const result = await sendToUserOrFallback(client, msg.guild, user, { content: contentMsg, files });
            if (result.via === 'fallback') {
              await msg.channel.send(`-# DM 불가로 대체 채널 <#${result.channelId}> 에 전달했어.`).catch(() => {});
            }
            return;
          }
        }
      }

      if (msg.guild && msg.channel?.type === ChannelType.GuildText) {
        const fbMap = loadFallbackMap();
        const entry = Array.from(fbMap.entries()).find(([, chId]) => chId === msg.channel.id);
        if (!entry) return;
        const [userId] = entry;
        if (msg.author.id !== userId) return;

        const relayMap = loadRelayMap();
        const threadId = relayMap.get(userId);
        if (!threadId) return;
        const parentChannel = msg.guild.channels.cache.get(THREAD_PARENT_CHANNEL_ID);
        if (!parentChannel) return;
        const thread = await parentChannel.threads.fetch(threadId).catch(() => null);
        if (!thread) return;

        let files = [];
        if (msg.attachments?.size > 0) files = Array.from(msg.attachments.values()).map(a => a.url);
        const contentMsg = `**[상대]**\n(From: <@${msg.author.id}> | ${msg.author.tag})\n${msg.content || ''}`;
        await thread.send({ content: contentMsg, files: files.length ? files : undefined });
      }
    });
  }
};
