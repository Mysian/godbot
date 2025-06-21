// commands/dm.js
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const THREAD_PARENT_CHANNEL_ID = '1380874052855529605';
const ANON_NICK = '까리한 디스코드';

const RELAY_PATH = path.join(__dirname, '../data/relayMap.json');

// relayMap을 파일에서 로드 & 세이브
function loadRelayMap() {
  if (!fs.existsSync(RELAY_PATH)) fs.writeFileSync(RELAY_PATH, '{}');
  const raw = fs.readFileSync(RELAY_PATH, 'utf8');
  return new Map(Object.entries(JSON.parse(raw)));
}
function saveRelayMap(map) {
  fs.writeFileSync(RELAY_PATH, JSON.stringify(Object.fromEntries(map), null, 2));
}

// Map<userId, threadId>
const relayMap = loadRelayMap();

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

    let thread;
    if (useExisting && relayMap.has(user.id)) {
      // 기존 스레드 찾기
      const threadId = relayMap.get(user.id);
      thread = await parentChannel.threads.fetch(threadId).catch(() => null);
      if (!thread) relayMap.delete(user.id);
    }
    if (!thread) {
      // 새 스레드 생성
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
      saveRelayMap(relayMap); // 혹시나 업데이트
    }

    await interaction.reply({
      content: `✅ 익명 임시 DM이 시작되었습니다.\n\n*이제 <@${user.id}>님은 **봇에게 DM**을 보내면 이 스레드로 익명 메시지가 릴레이되고,\n운영진(명령어 입력자)은 이 스레드에 메시지 작성시 해당 유저에게 익명 DM이 전송됩니다.*`,
      ephemeral: true,
    });
  },

  relayRegister(client) {
    client.on('messageCreate', async msg => {
      // 유저가 봇 DM에 쓴 메시지
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
        await thread.send({ content: `**[${ANON_NICK}]**\n\n(From: <@${msg.author.id}> | ${msg.author.tag})\n${msg.content}` });
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
          await user.send(`**[${ANON_NICK}]**\n${msg.content}`);
        }
      }
    });
  }
};
