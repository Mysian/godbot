// voice-auto-move.js
const { SlashCommandBuilder, Events } = require('discord.js');

const TARGET_CATEGORY_IDS = [
  '1207980297854124032',
  '1273762376889532426',
  '1369008627045765173'
]; // 감시할 카테고리ID 배열
const AUTO_MOVE_CHANNEL_ID = '1202971727915651092'; // 이동할 음성채널 ID
const AUTO_MOVE_NOTICE_CHANNEL_ID = '1202971727915651092'; // 멘트 보낼 텍스트채널 ID
const ALONE_MINUTES = 60; // 기준 시간(분)

let isEnabled = false;
const aloneTimers = new Map();

function setupListener(client) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (!isEnabled) return;
    const member = newState.member || oldState.member;
    const channel = newState.channel || oldState.channel;
    if (!channel || !TARGET_CATEGORY_IDS.includes(channel.parentId)) {
      if (aloneTimers.has(member.id)) aloneTimers.delete(member.id);
      return;
    }

    // 실유저(봇 제외) 혼자만 남은 경우 체크
    const members = channel.members.filter(m => !m.user.bot);
    if (members.size === 1) {
      if (!aloneTimers.has(member.id)) {
        aloneTimers.set(member.id, setTimeout(async () => {
          if (channel.members.filter(m => !m.user.bot).size === 1) {
            try {
              await member.voice.setChannel(AUTO_MOVE_CHANNEL_ID, `장시간 혼자 대기 자동 이동`);
              // 안내 멘트
              const noticeChannel = member.guild.channels.cache.get(AUTO_MOVE_NOTICE_CHANNEL_ID)
                || member.guild.systemChannel;
              if (noticeChannel) {
                noticeChannel.send({
                  content: `\`${member.displayName}\`님, 음성채널에 장시간 혼자 머물러 계셔서 자동으로 이동되었습니다.`
                });
              }
            } catch (e) {}
          }
          aloneTimers.delete(member.id);
        }, ALONE_MINUTES * 60 * 1000));
      }
    } else {
      // 둘 이상 있으면 타이머 취소
      if (aloneTimers.has(member.id)) {
        clearTimeout(aloneTimers.get(member.id));
        aloneTimers.delete(member.id);
      }
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('음성채널자동')
    .setDescription('음성채널 1인 장시간 대기 자동 이동 기능 ON/OFF')
    .addStringOption(opt => opt
      .setName('설정')
      .setDescription('on/off')
      .addChoices(
        { name: 'ON', value: 'on' },
        { name: 'OFF', value: 'off' }
      )
      .setRequired(true)
    ),
  async execute(interaction) {
    const set = interaction.options.getString('설정');
    if (set === 'on') {
      isEnabled = true;
      await interaction.reply({ content: '✅ 자동이동 기능이 **활성화** 되었습니다.', ephemeral: true });
    } else {
      isEnabled = false;
      // 모든 예약된 타이머 정리
      for (const t of aloneTimers.values()) clearTimeout(t);
      aloneTimers.clear();
      await interaction.reply({ content: '⛔️ 자동이동 기능이 **비활성화** 되었습니다.', ephemeral: true });
    }
  },
  setupListener,
};
