// 📁 commands/be-fastgive.js
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const { addBE } = require('./be-util.js');

const CHANNEL_ID = '1381193562330370048';

// 키워드-유저ID 매핑
let keywordPool = [
  { keyword: '!정수', boosterId: null },
  { keyword: '!까리', boosterId: null },
  { keyword: '!갓봇', boosterId: null },
  { keyword: '!영갓업', boosterId: null },
];

// 각 지급 라운드별 키워드와 지급여부 저장
let currentRound = {};

// 부스터 닉네임과 ID 매핑 추가
async function refreshKeywordPool(guild) {
  let boosters = guild.members.cache.filter(m => m.premiumSince);
  let boosterKeywords = boosters.map(m => ({
    keyword: '!' + m.displayName.replace(/\s/g, ''),
    boosterId: m.id,
  }));
  keywordPool = [
    { keyword: '!정수', boosterId: null },
    { keyword: '!까리', boosterId: null },
    { keyword: '!갓봇', boosterId: null },
    { keyword: '!영갓업', boosterId: null },
    ...boosterKeywords,
  ];
}

// 지급 시작 함수
async function startGiveaway(client) {
  const guild = client.guilds.cache.first();
  await refreshKeywordPool(guild);

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) return;

  // 키워드 무작위 추출
  const picked = keywordPool[Math.floor(Math.random() * keywordPool.length)];
  const reward = Math.floor(Math.random() * (30000 - 10000 + 1)) + 10000;

  // 라운드 초기화
  currentRound[CHANNEL_ID] = { ...picked, rewarded: false, reward };

  await channel.send(`가장 빠르게 ${picked.keyword} 를 입력한 유저에게 랜덤 정수가 지급됩니다!`);
}

// 메시지 리스너 (가장 먼저 입력한 사람만 지급)
async function handleMessage(message) {
  if (message.channel.id !== CHANNEL_ID) return;
  const round = currentRound[CHANNEL_ID];
  if (!round || round.rewarded) return;
  if (message.content.trim() !== round.keyword) return;

  round.rewarded = true;

  // 일반 지급
  await addBE(message.author.id, round.reward, '가장 빠른 정수 지급 이벤트');
  let msg = `🎉 <@${message.author.id}> 님께 ${round.reward.toLocaleString()} 파랑정수 지급 완료!`;

  // 부스트 키워드인 경우 해당 부스터에게 5,000 지급
  if (round.boosterId) {
    await addBE(round.boosterId, 5000, '부스트 유저 호명 보상');
    msg += `\n-# 호명된 부스트 유저에게도 소정의 정수가 지급되었습니다.`;
  }

  await message.channel.send(msg);
}

// main: 디스코드 클라이언트에 연결, 스케줄 등록
function setup(client) {
  cron.schedule('0 0,3,6,9,12,15,18,21 * * *', () => startGiveaway(client), { timezone: 'Asia/Seoul' });

  client.on('messageCreate', handleMessage);
}

module.exports = { setup };
