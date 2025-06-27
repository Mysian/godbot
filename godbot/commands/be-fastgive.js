// 📁 commands/be-fastgive.js
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const { addBE } = require('./be-util.js');

// 지급 대상 채널 ID
const CHANNEL_ID = '1381193562330370048';

// 키워드 풀(고정 + 부스터 닉네임은 런타임에 추가)
let keywordPool = ['!정수', '!까리', '!갓봇', '!영갓업'];

// 각 지급 라운드별 키워드와 지급여부 저장
let currentRound = {};

// 부스터 닉네임 추가 함수(서버에서 부스터 유저 닉네임 추출)
async function refreshKeywordPool(guild) {
  let boosters = guild.members.cache.filter(m => m.premiumSince);
  let boosterKeywords = boosters.map(m => '!' + m.displayName.replace(/\s/g, ''));
  keywordPool = [
    '!정수', '!까리', '!갓봇', '!영갓업',
    ...boosterKeywords
  ];
}

// 지급 시작 함수
async function startGiveaway(client) {
  const guild = client.guilds.cache.first();
  await refreshKeywordPool(guild);

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) return;

  // 키워드 무작위 추출
  const keyword = keywordPool[Math.floor(Math.random() * keywordPool.length)];
  const reward = Math.floor(Math.random() * (30000 - 10000 + 1)) + 10000;

  // 라운드 초기화
  currentRound[CHANNEL_ID] = { keyword, rewarded: false, reward };

  await channel.send(`가장 빠르게 ${keyword} 를 입력한 유저에게 랜덤 정수가 지급됩니다!`);
}

// 메시지 리스너 (가장 먼저 입력한 사람만 지급)
async function handleMessage(message) {
  if (message.channel.id !== CHANNEL_ID) return;
  const round = currentRound[CHANNEL_ID];
  if (!round || round.rewarded) return;
  if (message.content.trim() !== round.keyword) return;

  round.rewarded = true;

  await addBE(message.author.id, round.reward, '가장 빠른 정수 지급 이벤트');
  await message.channel.send(`🎉 <@${message.author.id}> 님께 ${round.reward.toLocaleString()} 파랑정수 지급 완료!`);
}

// main: 디스코드 클라이언트에 연결, 스케줄 등록
function setup(client) {
  // 3시간마다(00,03,06,09,12,15,18,21)마다 실행
  cron.schedule('0 0,3,6,9,12,15,18,21 * * *', () => startGiveaway(client), { timezone: 'Asia/Seoul' });

  client.on('messageCreate', handleMessage);
}

module.exports = { setup };
