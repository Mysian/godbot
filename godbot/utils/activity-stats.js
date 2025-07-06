const cron = require('node-cron');
const activityTracker = require('../utils/activity-tracker');
const client = require('../index').client;
const { EmbedBuilder } = require('discord.js');
const { addBE } = require('./be-util.js'); // 추가

const TARGET_CHANNEL_ID = "1202425624061415464";
const SERVER_ICON_URL = "https://media.discordapp.net/attachments/1388728993787940914/1389194104424108223/2D.png?ex=6863bb54&is=686269d4&hm=59f7fbfb39d474b2577fbc87765daa533f636fa3e702285c24eda0fd51aebaa3&=&format=webp&quality=lossless";
const THUMBNAIL_URL = "https://media.discordapp.net/attachments/1388728993787940914/1389192042143551548/image.png?ex=6863b968&is=686267e8&hm=f5cd94557360f427a8a3bfca9b8c27290ce29d5e655871541c309133b0082e85&=&format=webp";

const userCache = new Map();
async function getDisplayName(userId) {
  try {
    if (userCache.has(userId)) return userCache.get(userId);
    let member = null;
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        member = await guild.members.fetch(userId);
        if (member) break;
      } catch {}
    }
    let name = member ? (member.nickname || member.user.username) : null;
    if (!name) {
      const user = await client.users.fetch(userId);
      name = user.username;
    }
    userCache.set(userId, name);
    return name || "(알 수 없음)";
  } catch {
    return "(알 수 없음)";
  }
}

function secToHMS(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec%60;
  let out = "";
  if (h) out += `${h}시간 `;
  if (m || h) out += `${m}분 `;
  out += `${s}초`;
  return out.trim();
}

function getYesterdayKST() {
  const now = new Date();
  now.setHours(now.getHours() + 9);
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0,10);
}

function getWeekRangeKST() {
  const now = new Date();
  now.setHours(now.getHours() + 9);
  const end = new Date(now);
  end.setDate(end.getDate() - (now.getDay() === 0 ? 7 : now.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    from: start.toISOString().slice(0,10),
    to: end.toISOString().slice(0,10)
  };
}

// [1] 매일 오전 9시 (한국시간)
cron.schedule('0 9 * * *', async () => {
  const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(()=>null);
  if (!channel) return;

  const yesterday = getYesterdayKST();
  const stats = activityTracker.getStats({ from: yesterday, to: yesterday });

  let topMsg = null, topVoice = null;
  for (const s of stats) {
    if (!topMsg || s.message > topMsg.message) topMsg = s;
    if (!topVoice || s.voice > topVoice.voice) topVoice = s;
  }

  const embed = new EmbedBuilder()
    .setColor(0x666666)
    .setTitle(`📊 어제의 활동 요약`)
    .setThumbnail(THUMBNAIL_URL)
    .setFooter({ text: '까리한 디스코드 | 자동 통계', iconURL: SERVER_ICON_URL })
    .setTimestamp()
    .addFields({
      name: '🎁 활동 1등 보상 안내',
      value: '🎤 음성채널 1등 2만 BE, 💬 채팅 1등 2만 BE 지급!',
      inline: false
    });

  // 음성 1등 지급
  if (topVoice && topVoice.voice > 0) {
    const name = await getDisplayName(topVoice.userId);
    embed.addFields({
      name: '🎤 음성채널 활동 1위',
      value: `🥇 ${name} 님 (${secToHMS(topVoice.voice)})\n🔷 2만 BE 지급!`,
      inline: false
    });
    await addBE(topVoice.userId, 20000, "일일 음성채널 1등 보상");
  } else {
    embed.addFields({
      name: '🎤 음성채널 활동',
      value: '기록된 활동이 없습니다.',
      inline: false
    });
  }

  // 채팅 1등 지급
  if (topMsg && topMsg.message > 0) {
    const name = await getDisplayName(topMsg.userId);
    embed.addFields({
      name: '💬 채팅 메시지 1위',
      value: `🥇 ${name} 님 (${topMsg.message}회)\n🔷 2만 BE 지급!`,
      inline: false
    });
    await addBE(topMsg.userId, 20000, "일일 채팅 1등 보상");
  } else {
    embed.addFields({
      name: '💬 채팅 메시지',
      value: '기록된 활동이 없습니다.',
      inline: false
    });
  }

  embed.addFields({
    name: '\u200b',
    value: `🙌 활동해주신 모든 유저분들께 감사드립니다.`,
    inline: false
  });

  await channel.send({ embeds: [embed] });
}, { timezone: "Asia/Seoul" });

// [2] 매주 월요일 오후 9시 (한국시간)
cron.schedule('0 21 * * 1', async () => {
  const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(()=>null);
  if (!channel) return;

  const {from, to} = getWeekRangeKST();
  const stats = activityTracker.getStats({ from, to });

  const msgRank = [...stats].sort((a,b)=>b.message-a.message);
  const voiceRank = [...stats].sort((a,b)=>b.voice-a.voice);

  const embed = new EmbedBuilder()
    .setColor(0x666666)
    .setTitle(`📅 주간 활동 TOP 3`)
    .setThumbnail(THUMBNAIL_URL)
    .setFooter({ text: '까리한 디스코드 | 자동 통계', iconURL: SERVER_ICON_URL })
    .setTimestamp()
    .addFields({
      name: '🎁 주간 1등 보상 안내',
      value: '🎤 음성 1등 10만 BE, 💬 채팅 1등 10만 BE 지급!',
      inline: false
    });

  // 주간 음성 TOP3 및 1등 지급
  let voiceStr = "";
  const vEmoji = ['🥇','🥈','🥉'];
  if (voiceRank.length > 0 && voiceRank[0].voice > 0) {
    for (let i=0; i<3 && i<voiceRank.length; ++i) {
      const u = voiceRank[i];
      const name = await getDisplayName(u.userId);
      voiceStr += `${vEmoji[i] || ''} ${name} (${secToHMS(u.voice)})\n`;
    }
    // 1등 보상 지급
    await addBE(voiceRank[0].userId, 100000, "주간 음성채널 1등 보상");
    voiceStr = voiceStr.replace(
      voiceRank[0] ? voiceRank[0].userId : "",
      `${vEmoji[0]} ${await getDisplayName(voiceRank[0].userId)} (${secToHMS(voiceRank[0].voice)})\n🔷 10만 BE 지급!`
    );
  } else voiceStr = "기록된 활동이 없습니다.";
  embed.addFields({ name: '🎤 음성채널 TOP 3', value: voiceStr, inline: false });

  // 주간 채팅 TOP3 및 1등 지급
  let chatStr = "";
  if (msgRank.length > 0 && msgRank[0].message > 0) {
    for (let i=0; i<3 && i<msgRank.length; ++i) {
      const u = msgRank[i];
      const name = await getDisplayName(u.userId);
      chatStr += `${vEmoji[i] || ''} ${name} (${u.message}회)\n`;
    }
    // 1등 보상 지급
    await addBE(msgRank[0].userId, 100000, "주간 채팅 1등 보상");
    chatStr = chatStr.replace(
      msgRank[0] ? msgRank[0].userId : "",
      `${vEmoji[0]} ${await getDisplayName(msgRank[0].userId)} (${msgRank[0].message}회)\n🔷 10만 BE 지급!`
    );
  } else chatStr = "기록된 활동이 없습니다.";
  embed.addFields({ name: '💬 채팅 메시지 TOP 3', value: chatStr, inline: false });

  embed.addFields({
    name: '\u200b',
    value: `🙌 한 주간 활동해주신 모든 분들께 감사드립니다.`,
    inline: false
  });

  await channel.send({ embeds: [embed] });
}, { timezone: "Asia/Seoul" });

module.exports = {};
