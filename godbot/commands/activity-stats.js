if (global._activity_stats_scheduled) return;
global._activity_stats_scheduled = true;

const cron = require('node-cron');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const activityTracker = require('../utils/activity-tracker');
const client = require('../index').client;

const TARGET_CHANNEL_ID = "1202425624061415464";

// 유저 정보 캐싱용
const userCache = new Map();
async function getUsername(userId) {
  if (userCache.has(userId)) return userCache.get(userId);
  try {
    const user = await client.users.fetch(userId);
    userCache.set(userId, user.username);
    return user.username;
  } catch {
    return "(알 수 없음)";
  }
}

function getYesterdayDateStr() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
}

function getKSTDate(date = new Date()) {
  // KST 변환
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  return new Date(utc + 9 * 60 * 60000);
}

// 매일 오전 9시
cron.schedule('0 9 * * *', async () => {
  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel) return;

  const yesterday = getYesterdayDateStr();
  const stats = activityTracker.getStats({ from: yesterday, to: yesterday });

  let maxMsg = 0, maxVoice = 0, topMsg = null, topVoice = null;
  for (const s of stats) {
    if (s.message > maxMsg) { maxMsg = s.message; topMsg = s; }
    if (s.voice > maxVoice) { maxVoice = s.voice; topVoice = s; }
  }
  const yDate = new Date(yesterday);
  const dayStr = `${yDate.getFullYear()}년 ${yDate.getMonth()+1}월 ${yDate.getDate()}일 (${["일","월","화","수","목","금","토"][yDate.getDay()]})`;
  let content = `어제 ${dayStr}\n`;
  if (topVoice && topVoice.voice > 0) {
    const name = await getUsername(topVoice.userId);
    content += `가장 음성채널을 활발하게 이용한 유저는 **${name}** (${(topVoice.voice/60).toFixed(0)}분) 입니다.\n`;
  } else {
    content += `음성채널 활발 유저 데이터 없음\n`;
  }
  if (topMsg && topMsg.message > 0) {
    const name = await getUsername(topMsg.userId);
    content += `가장 많은 채팅을 입력한 유저는 **${name}** (${topMsg.message}회) 입니다.`;
  } else {
    content += `채팅 활발 유저 데이터 없음`;
  }
  await channel.send(content);
});

// 매주 월요일 오후 9시
cron.schedule('0 21 * * 1', async () => {
  const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
  if (!channel) return;

  const now = getKSTDate();
  // 지난주 월~일
  let start = new Date(now);
  start.setDate(start.getDate() - ((now.getDay()+6)%7 + 7)); // 지난주 월요일
  let end = new Date(start);
  end.setDate(end.getDate() + 6); // 일요일

  const from = start.toISOString().slice(0,10);
  const to = end.toISOString().slice(0,10);

  const stats = activityTracker.getStats({ from, to });
  // 메시지 내림차순
  const msgRank = [...stats].sort((a,b)=>b.message-a.message).slice(0,3);
  // 음성 내림차순
  const voiceRank = [...stats].sort((a,b)=>b.voice-a.voice).slice(0,3);

  let weekStr = `${start.getFullYear()}년 ${start.getMonth()+1}월 ${start.getDate()}일 ~ ${end.getFullYear()}년 ${end.getMonth()+1}월 ${end.getDate()}일 (지난주)`;
  let content = `주간 활동 TOP3\n${weekStr}\n`;

  // 음성채널
  content += `\n음성채널 랭킹:\n`;
  if (voiceRank.length > 0 && voiceRank[0].voice > 0) {
    for (let i=0; i<voiceRank.length; ++i) {
      const u = voiceRank[i];
      const name = await getUsername(u.userId);
      content += `  ${i+1}위: **${name}** (${(u.voice/60).toFixed(0)}분)\n`;
    }
  } else content += '  데이터 없음\n';

  // 채팅
  content += `\n채팅 랭킹:\n`;
  if (msgRank.length > 0 && msgRank[0].message > 0) {
    for (let i=0; i<msgRank.length; ++i) {
      const u = msgRank[i];
      const name = await getUsername(u.userId);
      content += `  ${i+1}위: **${name}** (${u.message}회)\n`;
    }
  } else content += '  데이터 없음\n';

  await channel.send(content);
});

module.exports = {};
