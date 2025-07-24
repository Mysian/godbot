// 📁 commands/be-fastgive.js
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const { addBE } = require('../commands/be-util.js');

const CHANNEL_ID = '1381193562330370048';
const DONOR_ROLE = '1397076919127900171';

let keywordPool = [
  { keyword: '!정수', boosterId: null, donorId: null },
  { keyword: '!까리', boosterId: null, donorId: null },
  { keyword: '!갓봇', boosterId: null, donorId: null },
  { keyword: '!영갓업', boosterId: null, donorId: null },
];
let currentRound = {};

async function refreshKeywordPool(guild) {
  let boosters = guild.members.cache.filter(m => m.premiumSince);
  let donors = guild.members.cache.filter(m => m.roles.cache.has(DONOR_ROLE));

  let boosterKeywords = boosters.map(m => ({
    keyword: '!' + m.displayName.replace(/\s/g, ''),
    boosterId: m.id,
    donorId: null
  }));

  let donorKeywords = donors.map(m => ({
    keyword: '!' + m.displayName.replace(/\s/g, ''),
    boosterId: null,
    donorId: m.id
  }));

  keywordPool = [
    { keyword: '!정수', boosterId: null, donorId: null },
    { keyword: '!까리', boosterId: null, donorId: null },
    { keyword: '!갓봇', boosterId: null, donorId: null },
    { keyword: '!영갓업', boosterId: null, donorId: null },
    ...boosterKeywords,
    ...donorKeywords
  ];
}

async function startGiveaway(client) {
  const guild = client.guilds.cache.first();
  await refreshKeywordPool(guild);

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) return;

  const picked = keywordPool[Math.floor(Math.random() * keywordPool.length)];
  const reward = Math.floor(Math.random() * (30000 - 10000 + 1)) + 10000;

  currentRound[CHANNEL_ID] = { ...picked, rewarded: false, reward };

  await channel.send(
    `가장 빠르게 ${picked.keyword} 를 입력한 유저에게 랜덤 정수가 지급됩니다!`
  );
}

async function handleMessage(message) {
  if (message.channel.id !== CHANNEL_ID) return;
  const round = currentRound[CHANNEL_ID];
  if (!round || round.rewarded) return;
  if (message.content.trim() !== round.keyword) return;

  round.rewarded = true;

  // 일반 지급
  await addBE(message.author.id, round.reward, '가장 빠른 정수 지급 이벤트');
  let msg = `🎉 <@${message.author.id}> 님께 ${round.reward.toLocaleString()} 파랑정수 지급 완료!`;

  // 부스터/도너 보상 분기
  if (round.boosterId) {
    await addBE(round.boosterId, 5000, '부스트 유저 호명 보상');
    msg += `\n-# 호명된 **부스트 유저**에게도 **5,000 BE** 지급!`;
  }
  if (round.donorId) {
    await addBE(round.donorId, 7777, '𝕯𝖔𝖓𝖔𝖗(서버 후원자) 호명 보상');
    msg += `\n-# 호명된 **𝕯𝖔𝖓𝖔𝖗(서버 후원자)**에게 **7,777 BE** 지급!`;
  }

  await message.channel.send(msg);
}

function setup(client) {
  cron.schedule('0 0,3,6,9,12,15,18,21 * * *', () => startGiveaway(client), { timezone: 'Asia/Seoul' });
  client.on('messageCreate', handleMessage);
}

module.exports = { setup };
