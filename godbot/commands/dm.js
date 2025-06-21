// commands/dm.js
const { SlashCommandBuilder, ChannelType } = require('discord.js');

const GUILD_ID = '785841387396005948';
const THREAD_PARENT_CHANNEL_ID = '1380874052855529605';
const ANON_NICK = '까리한 디스코드';

const relayMap = new Map();

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

    const guild = interaction.client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      return interaction.reply({ content: '❗️봇이 있는 서버를 찾을 수 없습니다.', ephemeral: true });
    }

    const parentChannel = await guild.channels.fetch(THREAD_PARENT_CHANNEL_ID).catch(() => null);

    if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: '❗️지정된 채널을 찾을 수 없거나 텍스트채널이 아닙니다.', ephemeral: true });
    }

    let thread;
    if (useExisting && relayMap.has(user.id)) {
      // 기존 스레드 찾기
      const threadId = relayMap.get(user.id);
      thread = await parentChannel.threads.fetch(threadId).catch(() => null);
      if (!thread) relayMap.delete(user.id); // 없으면 다시 생성
    }
    if (!thread) {
      // 새 스레드 생성
      const threadName = `익명DM-${user.username}-${Date.now().toString().slice(-5)}`;
      thread = await parentChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 1440, // 24시간
        reason: '익명 임시 DM 스레드',
        invitable: false,
      });
      relayMap.set(user.id, thread.id);

      // 안내
      await thread.send({
        content: `🔒 이 스레드는 **${ANON_NICK}**에서 익명으로 시작된 1:1 임시 DM입니다.\n서로 자유롭게 익명으로 대화하세요.\n(24시간 후 자동 종료/삭제)\n※ 운영진이 직접 관여하지 않습니다.`,
      });
    }

    await interaction.reply({
      content: `✅ 익명 임시 DM이 시작되었습니다.\n\n*이제 <@${user.id}>님은 **봇에게 DM**을 보내면 이 스레드로 익명 메시지가 릴레이되고,\n운영진(명령어 입력자)은 이 스레드에 메시지 작성시 해당 유저에게 익명 DM이 전송됩니다.*`,
      ephemeral: true,
    });

    // 디버그
    console.log('[DEBUG] relayMap set:', user.id, thread.id);
  },

  relayRegister(client) {
    // 유저가 봇 DM에 쓴 메시지 → 스레드로 릴레이
    client.on('messageCreate', async msg => {
      if (!msg.guild && !msg.author.bot) {
        console.log('[DEBUG] 유저가 봇 DM에 메시지 보냄:', msg.author.tag, msg.content);

        const threadId = relayMap.get(msg.author.id);
        console.log('[DEBUG] relayMap에 등록된 threadId:', threadId);

        if (!threadId) {
          console.log('[DEBUG] threadId 없음 - /디엠 명령어 실행 필요');
          return;
        }
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
          console.log('[DEBUG] guild 못찾음');
          return;
        }
        const parentChannel = await guild.channels.fetch(THREAD_PARENT_CHANNEL_ID).catch(e => {
          console.log('[DEBUG] parentChannel 못찾음', e);
          return null;
        });
        if (!parentChannel) {
          console.log('[DEBUG] parentChannel null');
          return;
        }
        const thread = await parentChannel.threads.fetch(threadId).catch(e => {
          console.log('[DEBUG] thread 못찾음', e);
          return null;
        });
        if (!thread) {
          console.log('[DEBUG] thread null');
          return;
        }
        await thread.send({
          content: `**[${ANON_NICK}]**\n\n(From: <@${msg.author.id}> | ${msg.author.tag})\n${msg.content}`
        });
        console.log('[DEBUG] 스레드에 정상 전송 완료!');
      }
    });

    // 운영진이 스레드에 메시지 작성 → 대상 유저 DM 릴레이
    client.on('messageCreate', async msg => {
      if (msg.channel.type !== ChannelType.PublicThread) return;
      if (msg.author.bot) return;
      for (const [userId, threadId] of relayMap.entries()) {
        if (threadId === msg.channel.id) {
          try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) return;
            await user.send(`**[${ANON_NICK}]**\n${msg.content}`);
            console.log(`[DEBUG] 운영진 스레드→유저 DM 릴레이: ${user.tag} 에게 ${msg.content}`);
          } catch (err) {
            console.error('[스레드→DM 릴레이 오류]', err);
          }
        }
      }
    });
  }
};
