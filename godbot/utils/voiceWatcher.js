const { joinVoiceChannel } = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const os = require("os");
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
const EMBED_MSG_ID = '1403366474160017489';
const TOP3_MSG_ID = '1403368538890309682';
const STATUS_CHANNEL_ID = '1345775748526510201';
const STATUS_MSG_ID = '1403383641882755243';
const SHARE_MSG_ID = '1403677011737837590';

const EXCLUDED_USER_IDS = ["285645561582059520", "638742607861645372"];
const EXCLUDED_ROLE_IDS = ["1205052922296016906"];

function getDateRange(period) {
  if (period === 'all') return { from: null, to: null };
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  now.setDate(now.getDate() - (parseInt(period, 10) - 1));
  const from = now.toISOString().slice(0, 10);
  return { from, to };
}

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
      const statusChannel = guild.channels.cache.get(STATUS_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) return;
      if (!statusChannel || !statusChannel.isTextBased()) return;

      async function buildLiveEmbed() {
        await guild.members.fetch();
        let total = 0;
        let channelCounts = [];
        for (const id of VOICE_CHANNEL_IDS) {
          const ch = guild.channels.cache.get(id);
          if (!ch) {
            channelCounts.push({ id, name: `채널${channelCounts.length+1}`, count: 0 });
            continue;
          }
          const cnt = ch.members.filter(m => !m.user.bot).size;
          total += cnt;
          channelCounts.push({ id, name: ch.name, count: cnt });
        }
        let maxCount = 0;
        channelCounts.forEach(x => { if (x.count > maxCount) maxCount = x.count; });
        const bestCount = channelCounts.filter(x => x.count === maxCount && maxCount > 0).length;

        let headerMsg = "";
        if (total === 0) headerMsg = "😢: 이런! 아무도 이용하고 있지 않아요.";
        else if (total <= 9) headerMsg = `😉: 현재 ${total}명이 이용하고 있습니다.`;
        else if (total <= 19) headerMsg = `😘: 현재 ${total}명이 이용하고 있습니다!`;
        else if (total <= 29) headerMsg = `😍: 현재 ${total}명이 이용하고 있습니다!!`;
        else if (total <= 49) headerMsg = `😎: 현재 ${total}명이 이용하고 있습니다!!!`;
        else headerMsg = `🌹: 현재 ${total}명의 유저 여러분이 이용하고 있습니다!!!!!`;

        return new EmbedBuilder()
          .setTitle('🌹 음성채널 실시간 이용 현황')
          .setColor(0x2eccfa)
          .setDescription(
            `${headerMsg}\n\n` +
            channelCounts.map((ch, idx) => {
              let tag = '';
              if (bestCount === 1 && ch.count === maxCount && ch.count > 0) tag = ' [❤️‍🔥 BEST]';
              else if (ch.count >= 6) tag = ' [🔥 HOT]';
              return `• ${ch.name} : ${ch.count === 0 ? '-명' : ch.count + '명'}${tag}`;
            }).join('\n')
          );
      }

      async function updateEmbed() {
        const embed = await buildLiveEmbed();
        try {
          const msg = await channel.messages.fetch(EMBED_MSG_ID).catch(() => null);
          if (msg) {
            await msg.edit({ content: '', embeds: [embed] });
          }
        } catch (e) {}
      }

      async function buildTop10Embed(period = '7') {
        await guild.members.fetch();
        const { from, to } = getDateRange(period);
        let stats = activityTracker.getStats({ from, to, filterType: "voice" });
        stats = stats.filter(s => {
          const member = guild.members.cache.get(s.userId);
          if (!member || member.user.bot) return false;
          if (EXCLUDED_USER_IDS.includes(s.userId)) return false;
          if (member.roles.cache.some(r => EXCLUDED_ROLE_IDS.includes(r.id))) return false;
          return s.voice > 0;
        });
        const topVoice = stats.sort((a, b) => b.voice - a.voice).slice(0, 10);

        let userMap = {};
        for (const member of guild.members.cache.values()) {
          userMap[member.user.id] = member.displayName || member.user.username;
        }

        const voiceStr = topVoice.length
          ? topVoice.map((s, i) => {
              const name = userMap[s.userId] || `Unknown(${s.userId})`;
              return `${i + 1}위. ${name} [${formatVoiceTime(s.voice)}]`;
            }).join('\n')
          : "데이터 없음";

        return new EmbedBuilder()
          .setTitle('🏆 최근 7일간 음성채널 이용 TOP 10')
          .setColor(0xfad131)
          .setDescription(voiceStr)
          .setFooter({ text: "일정 주기에 맞춰 실시간 변동됩니다." });
      }

      async function updateVoiceTop10Embed() {
        const embed = await buildTop10Embed('7');
        try {
          const msg = await channel.messages.fetch(TOP3_MSG_ID).catch(() => null);
          if (msg) {
            await msg.edit({ content: '', embeds: [embed] });
          }
        } catch (e) {}
      }

      async function updateStatusEmbed(guild, statusChannel) {
        try {
          const memory = process.memoryUsage();
          const rssMB = (memory.rss / 1024 / 1024);
          const heapMB = (memory.heapUsed / 1024 / 1024);

          const load = os.loadavg()[0];
          const cpuCount = os.cpus().length;

          const uptimeSec = Math.floor(process.uptime());
          const uptime = (() => {
            const h = Math.floor(uptimeSec / 3600);
            const m = Math.floor((uptimeSec % 3600) / 60);
            const s = uptimeSec % 60;
            return `${h}시간 ${m}분 ${s}초`;
          })();

          let memState = "🟢";
          if (rssMB > 800) memState = "🔴";
          else if (rssMB > 400) memState = "🟡";

          let cpuState = "🟢";
          if (load > cpuCount) cpuState = "🔴";
          else if (load > cpuCount / 2) cpuState = "🟡";

          let total = "🟢 안정적";
          if (memState === "🔴" || cpuState === "🔴") total = "🔴 불안정";
          else if (memState === "🟡" || cpuState === "🟡") total = "🟡 주의";

          let comment = "";
          if (total === "🟢 안정적") comment = "서버가 매우 쾌적하게 동작 중이에요!";
          else if (total === "🟡 주의") comment = "서버에 약간의 부하가 있으니 주의하세요.";
          else comment = "지금 서버가 상당히 무거워요! 재시작이나 최적화가 필요할 수 있음!";

          const embed = new EmbedBuilder()
            .setTitle(`${total} | 서버 상태 진단`)
            .setColor(total === "🔴 불안정" ? 0xff2222 : total === "🟡 주의" ? 0xffcc00 : 0x43e743)
            .setDescription(comment)
            .addFields(
              { name: `메모리 사용량 ${memState}`, value: `RSS: ${rssMB.toFixed(2)}MB\nheapUsed: ${heapMB.toFixed(2)}MB`, inline: true },
              { name: `CPU 부하율 ${cpuState}`, value: `1분 평균: ${load.toFixed(2)} / ${cpuCount}코어`, inline: true },
              { name: `실행시간(Uptime)`, value: uptime, inline: true }
            )
            .setFooter({ text: "매 5분마다 자동 측정됩니다." });

          const msg = await statusChannel.messages.fetch(STATUS_MSG_ID).catch(() => null);
          if (msg) {
            await msg.edit({ content: '', embeds: [embed] });
          }
        } catch (e) {
          console.error("[Status 임베드 갱신 에러]", e);
        }
      }

      await updateEmbed();
      await updateVoiceTop10Embed();
      await updateStatusEmbed(guild, statusChannel);

      setInterval(() => {
        updateEmbed();
        updateVoiceTop10Embed();
      }, 60000);

      setInterval(() => {
        updateStatusEmbed(guild, statusChannel);
      }, 300000);

      try {
        const shareMsg = await channel.messages.fetch(SHARE_MSG_ID).catch(() => null);
        if (shareMsg) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('share_live').setStyle(ButtonStyle.Primary).setLabel('음성채널 이용 현황 공유'),
            new ButtonBuilder().setCustomId('share_top10').setStyle(ButtonStyle.Secondary).setLabel('음성채널 TOP10 공유')
          );
          await shareMsg.edit({ components: [row] });
        }
      } catch (e) {}

      client.on('interactionCreate', async (interaction) => {
        try {
          if (!interaction.isButton()) return;
          if (interaction.customId !== 'share_live' && interaction.customId !== 'share_top10') return;
          const member = interaction.guild.members.cache.get(interaction.user.id);
          if (!member || !member.voice || !member.voice.channelId) {
            await interaction.reply({ content: '음성채널에 접속 중일 때만 공유할 수 있어요!', ephemeral: true });
            return;
          }
          if (interaction.customId === 'share_live') {
            const embed = await buildLiveEmbed();
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '현재 음성채널 이용 현황을 공유했어요!', ephemeral: true });
          } else if (interaction.customId === 'share_top10') {
            const embed = await buildTop10Embed('7');
            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '최근 7일 음성채널 TOP10을 공유했어요!', ephemeral: true });
          }
        } catch (e) {
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: '처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', ephemeral: true });
            }
          } catch {}
        }
      });

      client.on('voiceStateUpdate', (oldState, newState) => {
        const watchedChannels = [...VOICE_CHANNEL_IDS, TARGET_CHANNEL_ID];
        if (
          (oldState.channelId && watchedChannels.includes(oldState.channelId)) ||
          (newState.channelId && watchedChannels.includes(newState.channelId))
        ) {
          updateEmbed();
          updateVoiceTop10Embed();
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
