const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const THREAD_PARENT_CHANNEL_ID = '1380874052855529605';
const ANON_NICK = '까리한 디스코드';
const RELAY_PATH = path.join(__dirname, '../data/relayMap.json');
const FALLBACK_PATH = path.join(__dirname, '../data/relayFallbackMap.json');
const FALLBACK_CATEGORY_ID = '1354742687022186608';

function loadRelayMap() {
  if (!fs.existsSync(RELAY_PATH)) fs.writeFileSync(RELAY_PATH, '{}');
  const raw = fs.readFileSync(RELAY_PATH, 'utf8');
  return new Map(Object.entries(JSON.parse(raw)));
}
function saveRelayMap(map) {
  fs.writeFileSync(RELAY_PATH, JSON.stringify(Object.fromEntries(map), null, 2));
}

function loadFallbackMap() {
  if (!fs.existsSync(FALLBACK_PATH)) fs.writeFileSync(FALLBACK_PATH, '{}');
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
  } catch (e) {
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
      try {
        await channel.send({ content: `-# <@${user.id}> 이 채널은 DM을 받을 수 없는 설정이어서 임시로 개설된 대체 채널입니다.` });
      } catch {}
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
        .setDescription('기존 DM 이어서 진행')
        .addChoices(
          { name: '예', value: 'yes' },
          { name: '아니오', value: 'no' }
        )
        .setRequired(false)
    ),
  async execute(interaction) {
    const user = interaction.options.getUser('유저');
    const useExisting = (interaction.options.getString('이어서') || 'no') === 'yes';
    const parentChannel = await interaction.guild.channels.fetch(THREAD_PARENT_CHANNEL_ID);

    if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: '❗️지정된 채널을 찾을 수 없거나 텍스트채널이 아닙니다.', ephemeral: true });
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
        content: `🔒 이 스레드는 **${ANON_NICK}**에서 익명으로 시작된 1:1 임시 DM입니다.\n서로 자유롭게 익명으로 대화하세요.\n(24시간 후 자동 종료/삭제)\n※ 운영진이 직접 관여하지 않습니다.`,
      });
    } else {
      saveRelayMap(relayMap);
    }

    await interaction.reply({
      content: `✅ 익명 임시 DM이 시작되었습니다.\n\n*이제 스레드에서 보내는 모든 메시지는 <@${user.id}> 님에게 모두 [까리한 디스코드]라는 익명으로 전송됩니다.`,
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
        if (msg.attachments && msg.attachments.size > 0) {
          files = Array.from(msg.attachments.values()).map(a => a.url);
        }

        const contentMsg = `**[${ANON_NICK}]**\n\n(From: <@${msg.author.id}> | ${msg.author.tag})\n${msg.content ? msg.content : ''}`;
        await thread.send({ content: contentMsg, files: files.length > 0 ? files : undefined });
      }
    });

    client.on('messageCreate', async msg => {
      if (msg.channel.type !== ChannelType.PublicThread) return;
      if (msg.author.bot) return;
      const relayMap = loadRelayMap();
      for (const [userId, threadId] of relayMap.entries()) {
        if (threadId === msg.channel.id) {
          const user = await client.users.fetch(userId).catch(() => null);
          if (!user) return;

          let files = [];
          if (msg.attachments && msg.attachments.size > 0) {
            files = Array.from(msg.attachments.values()).map(a => a.url);
          }
          const contentMsg = `**[${ANON_NICK}]**\n${msg.content ? msg.content : ''}`;

          const guild = msg.guild;
          const result = await sendToUserOrFallback(client, guild, user, { content: contentMsg, files: files.length > 0 ? files : [] });

          if (result.via === 'fallback') {
            const notice = `DM 전송이 불가하여 대체 채널 <#${result.channelId}> 로 전달했습니다.`;
            try { await msg.channel.send(`-# ${notice}`); } catch {}
          }
        }
      }
    });
  }
};
