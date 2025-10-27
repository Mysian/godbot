const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
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

const REQUIRED_ROLE_ID = '1403741005651513464';
const REDIRECT_CHANNEL_ID = '1202971727915651092';

const AGGREGATE_SCRIM_IDS = [
  '1357671992895213601',
  '1254784947403751484',
  '1254784851798659234',
  '1369008732939489381',
  '1369008766904959026',
  '1369008791047114762'
];

const PERSONAL_CATEGORY_ID = '1318529703480397954';

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
  let mentionBound = false;
  if (!mentionBound) {
    client.on('messageCreate', async (message) => {
      try {
        if (!message.guild) return;
        if (message.author.bot) return;
        if (!message.mentions.users.has(client.user.id)) return;
        const ch = message.channel;
        const isVoiceChat =
          (typeof ch.isVoiceBased === 'function' && ch.isVoiceBased()) ||
          ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice;
        if (!isVoiceChat) return;
        const vc = ch;
        const humans = vc.members.filter(m => !m.user.bot);
        const bots = vc.members.filter(m => m.user.bot);
        const humanNames = humans.map(m => m.displayName || m.user.username).slice(0, 25);
        const namesLine = humanNames.length ? humanNames.join(', ') : '없음';
        const bitrate = vc.bitrate ? `${Math.round(vc.bitrate / 1000)}kbps` : '기본';
        const limit = vc.userLimit && vc.userLimit > 0 ? `${vc.userLimit}명` : '무제한';
        const region = vc.rtcRegion || '자동';
        const typeLabel = (vc.type === ChannelType.GuildStageVoice) ? '스테이지 채널' : '보이스 채널';
        const embed = new EmbedBuilder()
          .setTitle(`🎙️ ${vc.name} 현황`)
          .setColor(0x5865F2)
          .setDescription(
            `접속 인원: **${humans.size}명** (봇 ${bots.size}명)\n` +
            `접속 중(일부): ${namesLine}`
          )
          .addFields(
            { name: '채널 타입', value: typeLabel, inline: true },
            { name: '인원 제한', value: limit, inline: true },
            { name: '비트레이트', value: bitrate, inline: true },
            { name: '지역', value: region, inline: true }
          )
          .setFooter({ text: '맨션 시점 기준 스냅샷' });
        await ch.send({ embeds: [embed] });
      } catch (_) {}
    });
    mentionBound = true;
  }

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
        selfMute: true
      });
      const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
      const statusChannel = guild.channels.cache.get(STATUS_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) return;
      if (!statusChannel || !statusChannel.isTextBased()) return;

      async function buildLiveEmbed() {
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
        let scrimTotal = 0;
        for (const id of AGGREGATE_SCRIM_IDS) {
          const ch2 = guild.channels.cache.get(id);
          if (ch2) {
            const c2 = ch2.members.filter(m => !m.user.bot).size;
            scrimTotal += c2;
          }
        }
        channelCounts.push({ id: 'AGG_SCRIM', name: '내전 채널', count: scrimTotal });
        let personalTotal = 0;
        for (const ch of guild.channels.cache.values()) {
          if ((ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) && ch.parentId === PERSONAL_CATEGORY_ID) {
            personalTotal += ch.members.filter(m => !m.user.bot).size;
          }
        }
        channelCounts.push({ id: 'AGG_PERSONAL', name: '개인 채널', count: personalTotal });
        total += scrimTotal + personalTotal;
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
        const { from, to } = getDateRange(period);
        let stats = [];
        try {
          stats = activityTracker.getStats({ from, to, filterType: "voice" }) || [];
        } catch (_) {
          stats = [];
        }
        stats = stats.filter(s => {
          const member = guild.members.cache.get(s.userId);
          if (member && member.user.bot) return false;
          if (EXCLUDED_USER_IDS.includes(s.userId)) return false;
          if (member && member.roles.cache.some(r => EXCLUDED_ROLE_IDS.includes(r.id))) return false;
          return s.voice > 0;
        });
        const topVoice = stats.sort((a, b) => b.voice - a.voice).slice(0, 10);
        const nameMap = new Map();
        for (const s of topVoice) {
          let name = guild.members.cache.get(s.userId)?.displayName || guild.members.cache.get(s.userId)?.user?.username || null;
          if (!name) {
            const m = await guild.members.fetch(s.userId).catch(() => null);
            name = m?.displayName || m?.user?.username || `Unknown(${s.userId})`;
          }
          nameMap.set(s.userId, name);
        }
        const voiceStr = topVoice.length
          ? topVoice.map((s, i) => `${i + 1}위. ${nameMap.get(s.userId)} [${formatVoiceTime(s.voice)}]`).join('\n')
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
    const rssMB = memory.rss / 1024 / 1024;
    const heapMB = memory.heapUsed / 1024 / 1024;

    const totalMemMB = os.totalmem() / 1024 / 1024;
    const memPct = Math.min(100, (rssMB / Math.max(1, totalMemMB)) * 100);

    const load1 = os.loadavg()[0];
    const cpuCount = os.cpus().length;

    const uptimeSec = Math.floor(process.uptime());
    const uptime = (() => {
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = uptimeSec % 60;
      return `${h}시간 ${m}분 ${s}초`;
    })();

    const t0 = Date.now();
    await new Promise(r => setTimeout(r, 100));
    const elLag = Math.max(0, Date.now() - t0 - 100);

    let memState = "🟢";
    if (memPct > 85 || rssMB > 1700) memState = "🔴";
    else if (memPct > 70 || rssMB > 1200) memState = "🟡";

    let cpuState = "🟢";
    if (load1 > cpuCount * 1.1) cpuState = "🔴";
    else if (load1 > cpuCount * 0.6) cpuState = "🟡";

    let loopState = "🟢";
    if (elLag >= 200) loopState = "🔴";
    else if (elLag >= 80) loopState = "🟡";

    let total = "🟢 안정적";
    if (memState === "🔴" || cpuState === "🔴" || loopState === "🔴") total = "🔴 불안정";
    else if (memState === "🟡" || cpuState === "🟡" || loopState === "🟡") total = "🟡 주의";

    let comment = "";
    if (total === "🟢 안정적") comment = "서버가 매우 쾌적하게 동작 중이에요!";
    else if (total === "🟡 주의") comment = "서버에 약간의 부하가 있으니 주의하세요.";
    else comment = "지금 서버가 상당히 무거워요! 재시작이나 최적화가 필요할 수 있음!";

    const embed = new EmbedBuilder()
      .setTitle(`${total} | 서버 상태 진단`)
      .setColor(total === "🔴 불안정" ? 0xff2222 : total === "🟡 주의" ? 0xffcc00 : 0x43e743)
      .setDescription(comment)
      .addFields(
        { name: `메모리 사용량 ${memState}`, value: `RSS: ${rssMB.toFixed(0)}MB / ${Math.round(totalMemMB)}MB (${memPct.toFixed(1)}%)\nheapUsed: ${heapMB.toFixed(0)}MB`, inline: true },
        { name: `CPU 부하율 ${cpuState}`, value: `1분 평균: ${load1.toFixed(2)} / ${cpuCount}코어`, inline: true },
        { name: `이벤트 루프 지연 ${loopState}`, value: `${elLag}ms`, inline: true },
        { name: `실행시간(Uptime)`, value: uptime, inline: true }
      )
      .setFooter({ text: "매 5분마다 자동 측정됩니다." });

    const msg = await statusChannel.messages.fetch(STATUS_MSG_ID).catch(() => null);
    if (msg) await msg.edit({ content: '', embeds: [embed] });
  } catch (e) {
    console.error("[Status 임베드 갱신 에러]", e);
  }
}


      async function ensureConnected() {
        try {
          const me = guild.members.me;
          const inTarget = me?.voice?.channelId === TARGET_CHANNEL_ID;
          if (!inTarget) {
            const conn = getVoiceConnection(guild.id);
            if (conn && conn.joinConfig?.channelId !== TARGET_CHANNEL_ID) {
              try { conn.destroy(); } catch {}
            }
            joinVoiceChannel({
              channelId: TARGET_CHANNEL_ID,
              guildId: guild.id,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: true,
              selfMute: true
            });
          }
        } catch (_) {}
      }

      await ensureConnected();
      await updateEmbed();
      await updateVoiceTop10Embed();
      await updateStatusEmbed(guild, statusChannel);

      setInterval(() => {
        ensureConnected();
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
          await shareMsg.edit({ content: '', embeds: [], components: [row] });
        }
      } catch (e) {}

      client.on('interactionCreate', async (interaction) => {
        try {
          if (!interaction.isButton()) return;
          if (interaction.customId !== 'share_live' && interaction.customId !== 'share_top10') return;
          const member = interaction.guild.members.cache.get(interaction.user.id);
          if (!member || !member.voice || !member.voice.channelId) {
            await interaction.reply({ content: '음성채널에 접속 중일 때만 공유할 수 있어요!', flags: MessageFlags.Ephemeral });
            return;
          }
          const vc = member.voice.channel;
          if (!vc || !vc.isTextBased || !vc.isTextBased()) {
            await interaction.reply({ content: '해당 음성채널은 텍스트 채팅을 지원하지 않아서 공유할 수 없어요.', flags: MessageFlags.Ephemeral });
            return;
          }
          if (interaction.customId === 'share_live') {
            const embed = await buildLiveEmbed();
            await vc.send({ embeds: [embed] });
            await interaction.reply({ content: '해당 음성채널 채팅방에 현황을 공유했어요!', flags: MessageFlags.Ephemeral });
          } else if (interaction.customId === 'share_top10') {
            const embed = await buildTop10Embed('7');
            await vc.send({ embeds: [embed] });
            await interaction.reply({ content: '해당 음성채널 채팅방에 TOP10을 공유했어요!', flags: MessageFlags.Ephemeral });
          }
        } catch (e) {
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: '처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', flags: MessageFlags.Ephemeral });
            }
          } catch {}
        }
      });

      client.on('voiceStateUpdate', (oldState, newState) => {
        const watchedChannels = [...VOICE_CHANNEL_IDS, TARGET_CHANNEL_ID, ...AGGREGATE_SCRIM_IDS];
        const oldIsPersonal = oldState.channelId ? (oldState.guild.channels.cache.get(oldState.channelId)?.parentId === PERSONAL_CATEGORY_ID) : false;
        const newIsPersonal = newState.channelId ? (newState.guild.channels.cache.get(newState.channelId)?.parentId === PERSONAL_CATEGORY_ID) : false;
        if (newState.channelId === TARGET_CHANNEL_ID) {
          const member = newState.member;
          if (member && !member.user.bot) {
            const hasRequired = member.roles.cache.has(REQUIRED_ROLE_ID);
            if (!hasRequired) {
              const redirect = newState.guild.channels.cache.get(REDIRECT_CHANNEL_ID);
              if (redirect && redirect.isVoiceBased()) {
                member.voice.setChannel(redirect).catch(() => {});
              } else {
                member.voice.disconnect().catch(() => {});
              }
            }
          }
        }
        if (
          (oldState.channelId && (watchedChannels.includes(oldState.channelId) || oldIsPersonal)) ||
          (newState.channelId && (watchedChannels.includes(newState.channelId) || newIsPersonal))
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
