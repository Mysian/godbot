const cron = require('node-cron');
const activityTracker = require('../utils/activity-tracker');
const client = require('../index').client;

const TARGET_CHANNEL_ID = "1202425624061415464";

// 유저 정보 캐싱
const userCache = new Map();
// 닉네임 or 유저네임 가져오기 (디스코드 서버 닉 우선)
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
      // 혹시라도 DM 유저라면
      const user = await client.users.fetch(userId);
      name = user.username;
    }
    userCache.set(userId, name);
    return name || "(알 수 없음)";
  } catch {
    return "(알 수 없음)";
  }
}

// 초 → 시/분/초 변환
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
  // 한국시간 기준 어제 날짜 문자열(YYYY-MM-DD)
  const now = new Date();
  now.setHours(now.getHours() + 9); // KST
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0,10);
}

function getWeekRangeKST() {
  // 이번주 월요일 00:00 ~ 어제 23:59
  const now = new Date();
  now.setHours(now.getHours() + 9); // KST
  const end = new Date(now);
  end.setDate(end.getDate() - (now.getDay() === 0 ? 7 : now.getDay())); // 어제(한국시간) (일:0)
  const start = new Date(end);
  start.setDate(start.getDate() - 6); // 6일 전 = 월요일
  return {
    from: start.toISOString().slice(0,10),
    to: end.toISOString().slice(0,10)
  };
}

// 매일 오전 9시 (한국시간)
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

  let content = "";
  if (topVoice && topVoice.voice > 0) {
    const name = await getDisplayName(topVoice.userId);
    content += `어제 음성채널 이용 1위는 '${name}'님 입니다. [${secToHMS(topVoice.voice)}]\n`;
  } else {
    content += `어제 음성채널 이용 기록이 없습니다.\n`;
  }
  if (topMsg && topMsg.message > 0) {
    const name = await getDisplayName(topMsg.userId);
    content += `가장 많은 채팅을 한 유저는 '${name}'님 입니다. [총 ${topMsg.message} 회]`;
  } else {
    content += `어제 채팅 기록이 없습니다.`;
  }
  await channel.send(content);
}, { timezone: "Asia/Seoul" });

// 매주 월요일 오후 9시 (한국시간)
cron.schedule('0 21 * * 1', async () => {
  const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(()=>null);
  if (!channel) return;

  const {from, to} = getWeekRangeKST();
  const stats = activityTracker.getStats({ from, to });

  // 내림차순 정렬
  const msgRank = [...stats].sort((a,b)=>b.message-a.message).slice(0,3);
  const voiceRank = [...stats].sort((a,b)=>b.voice-a.voice).slice(0,3);

  let content = `지난주 활동 TOP3\n`;

  // 음성채널
  content += `\n음성채널 랭킹:\n`;
  if (voiceRank.length > 0 && voiceRank[0].voice > 0) {
    for (let i=0; i<voiceRank.length; ++i) {
      const u = voiceRank[i];
      const name = await getDisplayName(u.userId);
      content += ` ${i+1}위: '${name}'님 [${secToHMS(u.voice)}]\n`;
    }
  } else content += ' 데이터 없음\n';

  // 채팅
  content += `\n채팅 랭킹:\n`;
  if (msgRank.length > 0 && msgRank[0].message > 0) {
    for (let i=0; i<msgRank.length; ++i) {
      const u = msgRank[i];
      const name = await getDisplayName(u.userId);
      content += ` ${i+1}위: '${name}'님 [총 ${u.message} 회]\n`;
    }
  } else content += ' 데이터 없음\n';

  await channel.send(content.trim());
}, { timezone: "Asia/Seoul" });

module.exports = {};
