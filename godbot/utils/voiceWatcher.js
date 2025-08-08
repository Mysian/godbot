// voiceWatcher.js
const { joinVoiceChannel } = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const activityTracker = require("./activity-tracker");

const TARGET_CHANNEL_ID = '1403304289794785383';
const VOICE_CHANNEL_IDS = [
  '1222085152600096778',
  '1222085194706587730',
  '1230536383941050368',
  '1230536435526926356',
  '1207990601002389564',
  '1209157046432170015',
  '1209157237977911336',
  '1209157289555140658',
  '1209157326469210172',
  '1209157352771682304',
  '1209157451895672883',
  '1209157492207255572',
  '1209157524243091466',
  '1209157622662561813'
];

// 기존 실시간 음성 현황용 메시지
const EMBED_MSG_ID = '1403366474160017489';
// 신규: TOP3 랭킹 메시지
const TOP3_MSG_ID = '1403368538890309682';

// [시간 → "52시간 30분"] 변환 함수
function formatVoiceTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  let str = '';
  if (h > 0) str += `${h}시간 `;
  if (m > 0 || h === 0) str += `${m}분`;
  return str.trim();
}

module.exports = function(client) {
  async function joinAndWatch() {
    try {
      const guild = client.guilds.cache.find(g =>
        g.channels.cache.has(TARGET_CHANNEL_ID)
      );
      if (!guild) return;

      joinVoiceChannel({
        channelId: TARGET_CHANNEL_ID,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });

      const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) return;

      // === 기존 음성채널 현황 임베드 ===
      async function updateEmbed() {
        let total = 0;
        for (const id of VOICE_CHANNEL_IDS) {
          const ch = guild.channels.cache.get(id);
          if (!ch) continue;
          total += ch.members.filter(m => !m.user.bot).size;
        }
        const embed = new EmbedBuilder()
          .setTitle('🌹 음성채널 실시간 이용 현황')
          .setColor(0x2eccfa)
          .setDescription(`현재 **${total}명**이 이용 중입니다.\n\n${VOICE_CHANNEL_IDS.map((id, idx) => {
            const ch = guild.channels.cache.get(id);
            const cnt = ch ? ch.members.filter(m => !m.user.bot).size : 0;
            return `• ${ch ? ch.name : `채널${idx+1}`} : ${cnt}명`;
          }).join('\n')}`);
        try {
          const msg = await channel.messages.fetch(EMBED_MSG_ID).catch(() => null);
          if (msg) {
            await msg.edit({ content: '', embeds: [embed] });
          }
        } catch (e) {}
      }

      // === TOP3 랭킹 임베드 ===
      async function updateTop3Embed() {
        // 최근 7일
        const now = new Date();
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const toStr = now.toISOString().slice(0, 10);
        const fromStr = from.toISOString().slice(0, 10);

        // 활동 데이터 집계
        const stats = activityTracker.getStats({ from: fromStr, to: toStr });

        // 유저 정보 캐싱
        let userMap = {};
        for (const member of guild.members.cache.values()) {
          userMap[member.user.id] = member.displayName || member.user.username;
        }

        // 음성 TOP3 (시간 많은 순)
        const topVoice = stats
          .filter(s => s.voice > 0)
          .sort((a, b) => b.voice - a.voice)
          .slice(0, 3);

        // 채팅 TOP3 (횟수 많은 순)
        const topMsg = stats
          .filter(s => s.message > 0)
          .sort((a, b) => b.message - a.message)
          .slice(0, 3);

        const voiceStr = topVoice.length
          ? topVoice.map((s, i) => {
              const name = userMap[s.userId] || `Unknown(${s.userId})`;
              return `${i + 1}위. ${name} [${formatVoiceTime(s.voice)}]`;
            }).join('\n')
          : "데이터 없음";

        const msgStr = topMsg.length
          ? topMsg.map((s, i) => {
              const name = userMap[s.userId] || `Unknown(${s.userId})`;
              return `${i + 1}위. ${name} [${s.message.toLocaleString()}회]`;
            }).join('\n')
          : "데이터 없음";

        const embed = new EmbedBuilder()
          .setTitle('🏆 최근 7일간 활동 TOP 3')
          .setColor(0xfad131)
          .addFields(
            { name: '🎙️ 음성 이용 TOP 3', value: voiceStr },
            { name: '💬 채팅량 TOP 3', value: msgStr }
          )
          .setFooter({ text: "일정 주기에 맞춰 실시간 변동됩니다." });

        try {
          const msg = await channel.messages.fetch(TOP3_MSG_ID).catch(() => null);
          if (msg) {
            await msg.edit({ content: '', embeds: [embed] });
          }
        } catch (e) {}
      }

      // 최초 갱신
      await updateEmbed();
      await updateTop3Embed();
      setInterval(() => {
        updateEmbed();
        updateTop3Embed();
      }, 60000);

      client.on('voiceStateUpdate', (oldState, newState) => {
        const watchedChannels = [...VOICE_CHANNEL_IDS, TARGET_CHANNEL_ID];
        if (
          (oldState.channelId && watchedChannels.includes(oldState.channelId)) ||
          (newState.channelId && watchedChannels.includes(newState.channelId))
        ) {
          updateEmbed();
          updateTop3Embed();
        }
      });

    } catch (err) {
      console.error('[voiceWatcher 에러]', err);
    }
  }

  client.once('ready', joinAndWatch);

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (
      oldState.member.id === client.user.id &&
      oldState.channelId === TARGET_CHANNEL_ID &&
      !newState.channelId
    ) {
      setTimeout(joinAndWatch, 2000);
    }
  });
};
