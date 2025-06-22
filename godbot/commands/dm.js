const { SlashCommandBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const THREAD_PARENT_CHANNEL_ID = '1380874052855529605';
const ANON_NICK = '까리한 디스코드';
const RELAY_PATH = path.join(__dirname, '../data/relayMap.json');

function loadRelayMap() {
  if (!fs.existsSync(RELAY_PATH)) fs.writeFileSync(RELAY_PATH, '{}');
  const raw = fs.readFileSync(RELAY_PATH, 'utf8');
  return new Map(Object.entries(JSON.parse(raw)));
}
function saveRelayMap(map) {
  fs.writeFileSync(RELAY_PATH, JSON.stringify(Object.fromEntries(map), null, 2));
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
    // DM → 스레드 릴레이 (파일에서 매번 최신 relayMap 불러오기!)
    client.on('messageCreate', async msg => {
      if (!msg.guild && !msg.author.bot) {
        console.log('[익명DM-DM] DM도착:', msg.author.id, msg.content);
        const relayMap = loadRelayMap(); // 매번 최신상태로!
        const threadId = relayMap.get(msg.author.id);
        console.log('[익명DM-DM] relayMap:', relayMap);
        if (!threadId) {
          console.log('[익명DM-DM] relayMap에 해당 유저가 없음');
          return;
        }
        const guild = client.guilds.cache.find(g => g.channels.cache.has(THREAD_PARENT_CHANNEL_ID));
        if (!guild) return;
        const parentChannel = guild.channels.cache.get(THREAD_PARENT_CHANNEL_ID);
        if (!parentChannel) return;
        const thread = await parentChannel.threads.fetch(threadId).catch(() => null);
        if (!thread) {
          console.log('[익명DM-DM] 스레드를 못찾음');
          return;
        }
        await thread.send({ content: `**[${ANON_NICK}]**\n\n(From: <@${msg.author.id}> | ${msg.author.tag})\n${msg.content}` });
        console.log('[익명DM-DM] 메시지 스레드 전송 완료');
      }
    });

    // 스레드 → DM 릴레이 (운영진 → 유저)
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
