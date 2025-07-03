// ==== commands/godbit.js ====

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE, getBE } = require('./be-util.js');

// 공지 채널 ID, 이벤트 로그 채널 ID
const NOTICE_CHANNEL_ID = '1389779555384037478';
const LOG_CHANNEL_ID = '1389821392618262631';

const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
const PAGE_SIZE   = 5;
const HISTORY_PAGE = 20;
const HISTORY_MAX = 100;
const MAX_AUTO_COINS = 20;
const COLORS      = ['red','blue','green','orange','purple','cyan','magenta','brown','gray','teal'];
const EMOJIS      = ['🟥','🟦','🟩','🟧','🟪','🟨','🟫','⬜','⚫','🟣'];

// 차트 기간 옵션 (label, value, points, interval(분))
const CHART_FILTERS = [
  { label: "1분",   value: "1m",   points: 20, interval: 1 },
  { label: "10분",  value: "10m",  points: 20, interval: 10 },
  { label: "30분",  value: "30m",  points: 24, interval: 30 },
  { label: "1시간", value: "1h",   points: 24, interval: 60 },
  { label: "3시간", value: "3h",   points: 24, interval: 180 },
  { label: "6시간", value: "6h",   points: 24, interval: 360 },
  { label: "12시간",value: "12h",  points: 24, interval: 720 },
  { label: "1일",   value: "1d",   points: 20, interval: 1440 },
  { label: "3일",   value: "3d",   points: 20, interval: 1440*3 },
  { label: "일주일",value: "7d",   points: 20, interval: 1440*7 },
  { label: "보름",  value: "15d",  points: 15, interval: 1440*15 },
  { label: "30일",  value: "30d",  points: 30, interval: 1440*30 },
  { label: "1년",   value: "1y",   points: 12, interval: 1440*30 },
];

// ==== 코인 상관관계 쌍 ====
const CORR_PAIRS = [
  ["까리코인", "영갓코인"],
  ["추경코인", "도롱코인"],
  ["팔복코인", "가또코인"],
  ["애옹코인", "호의코인"],
  ["수박코인", "호떡코인"],
  ["오레오렌찌코인", "강수덕코인"],
  ["마라탕좋아함코인", "후수니코인"],
];

let lastVolume = {};
let lastVolumeResetAt = 0;

function getTimePower() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  let power = 1.0;
  if (hour >= 21 && hour <= 23) power *= 1.4;
  if (day === 0 || day === 6) power *= 1.25;
  return power;
}

function toKSTString(utcOrDate) {
  if (!utcOrDate) return '-';
  if (typeof utcOrDate === 'string' && (utcOrDate.includes('오전') || utcOrDate.includes('오후'))) return utcOrDate;
  try {
    return new Date(utcOrDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return '-';
  }
}

async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  finally { await release(); }
  return data;
}

async function saveJson(file, data) {
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  finally { await release(); }
}

function getSampledHistory(info, chartRange, chartInterval, chartValue) {
  if (!info.history || !info.historyT) return { data: [], labels: [] };
  if (chartValue === '1m') {
    const start = info.history.length - chartRange;
    const data = (info.history || []).slice(start < 0 ? 0 : start);
    const labels = [];
    for (let i = 0; i < chartRange; i++) {
      if (i === chartRange - 1) labels.push('현재');
      else labels.push(`${chartRange - 1 - i}분전`);
    }
    while (data.length < chartRange) data.unshift(0);
    while (labels.length < chartRange) labels.unshift('-');
    return { data, labels };
  }
  const data = [];
  const labels = [];
  let prevTime = null;
  let n = 0;
  for (let i = info.history.length - 1; i >= 0; i--) {
    const t = new Date(info.historyT[i]);
    const kst = new Date(t.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    if (!prevTime || (prevTime - kst) >= chartInterval * 60 * 1000) {
      data.unshift(info.history[i]);
      let label = '-';
      if (['10m','30m','1h','3h','6h','12h'].includes(chartValue)) {
        label = kst.getHours().toString().padStart(2, '0') + ':' + kst.getMinutes().toString().padStart(2, '0');
      } else if (['1d','3d','7d','15d','30d'].includes(chartValue)) {
        label = (kst.getMonth()+1).toString().padStart(2,'0') + '.' + kst.getDate().toString().padStart(2,'0');
      } else if (chartValue === '1y') {
        label = kst.getFullYear().toString();
      }
      labels.unshift(label);
      prevTime = kst;
      n++;
      if (n >= chartRange) break;
    }
  }
  while (data.length < chartRange) {
    data.unshift(0);
    labels.unshift('-');
  }
  return { data, labels };
}

async function ensureBaseCoin(coins) {
  if (!coins['까리코인']) {
    const now = new Date().toISOString();
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      historyT: [now],
      listedAt: now,
      volatility: { min: -0.06, max: 0.07 },
      trend: 0.003,
      coinType: "base"
    };
  }
}

async function addHistory(info, price) {
  if (!info.history) info.history = [];
  if (!info.historyT) info.historyT = [];
  const now = new Date().toISOString();
  info.history.push(price);
  info.historyT.push(now);
  while (info.history.length > HISTORY_MAX) info.history.shift();
  while (info.historyT.length > HISTORY_MAX) info.historyT.shift();
}

function recordVolume(coin, amount) {
  const now = Date.now();
  if (!lastVolumeResetAt || now - lastVolumeResetAt > 10*60*1000) {
    lastVolume = {};
    lastVolumeResetAt = now;
  }
  lastVolume[coin] = (lastVolume[coin] || 0) + amount;
}

function isKoreanName(str) {
  return /^[가-힣]+$/.test(str);
}

// ==== 이벤트 상폐/부활/상장 멘트 ====
const DELIST_MSGS = [
  '😱 [상폐] 이런! {coin}은(는) 스캠 코인으로 판명되었습니다!',
  '😱 [상폐] {coin}은(는) 사기였습니다! 사기!',
  '😱 [상폐] {coin} 관련 좋지 않은 소식입니다.. 그렇습니다.. 상장 폐지되었습니다.',
  '😱 [상폐] {coin}에 투자하신 분들! 큰일났습니다..! 해당 코인은 휴지 쪼가리가 되었어요!',
  '😱 [상폐] 충격! {coin}은(는) 좋지 않은 결말을 맞이합니다.',
  '😱 [상폐] {coin} 투자자 여러분, 안타까운 소식입니다.'
];
const REVIVE_MSGS = [
  '🐦‍🔥 [부활] {coin} 부활! 투자자들의 눈물 속에 다시 상장되었습니다!',
  '🐦‍🔥 [부활] 놀랍게도 {coin}이(가) 재상장! 다시 한 번 기회를 노려보세요!',
  '🐦‍🔥 [부활] 희소식! {coin}이(가) 시장에 복귀했습니다!',
  '🐦‍🔥 [부활] 죽지 않고 돌아왔다! {coin}이(가) 다시 거래소에 등장했습니다.',
];
const NEWCOIN_MSGS = [
  '🌟 [상장] 새로운 코인! {coin}이(가) 거래소에 등장했습니다. 모두 주목!',
  '🌟 [상장] {coin} 신규 상장! 이제부터 거래가 가능합니다!',
  '🌟 [상장] {coin}이(가) 오늘부로 공식 상장되었습니다. 첫 번째 투자자는 누구?',
  '🌟 [상장] {coin} 코인, 대망의 상장! 승부의 시작을 알립니다!',
];
function pickRandom(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
async function postLogMsg(type, coinName, client) {
  let msg;
  if (type === 'delist') msg = pickRandom(DELIST_MSGS).replace('{coin}', coinName);
  if (type === 'revive') msg = pickRandom(REVIVE_MSGS).replace('{coin}', coinName);
  if (type === 'new')    msg = pickRandom(NEWCOIN_MSGS).replace('{coin}', coinName);
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch) ch.send(msg);
  } catch (e) {}
}
async function postEventMsg(type, coinName, percent, client) {
  let msg;
  if (type === 'crash') msg = `📉 [폭락!] ${coinName}코인이 ${percent.toFixed(1)}% 폭락 추이를 보입니다!`;
  if (type === 'soar')  msg = `📈 [폭등!] ${coinName}코인이 ${percent.toFixed(1)}% 폭등 추이를 보입니다!`;
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch) ch.send(msg);
  } catch (e) {}
}

function getMinutesAgo(dateStr) {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  return Math.floor((now - date) / 60000); // 분 단위 반환
}

// ⭐️ 1분마다 시세/이벤트성 폐지/신규상장/부활/폭등폭락 알림!
async function autoMarketUpdate(members, client = global.client) {
  const coins = await loadJson(coinsPath, {});
  await ensureBaseCoin(coins);

  // === 까리코인 시세 (최소 1000원 보장) ===
  const base = coins['까리코인'];
  const deltaBase = (Math.random() * 0.2) - 0.1;
  const newBase = Math.max(1000, Math.floor(base.price * (1 + deltaBase)));
  base.price = newBase;
  base.history.push(newBase);
  base.historyT = base.historyT || [];
  base.historyT.push(new Date().toISOString());
  while (base.history.length > HISTORY_MAX) base.history.shift();
  while (base.historyT.length > HISTORY_MAX) base.historyT.shift();

  // === 폭등/폭락 감지 (최근 1분, 10분, 30분, 1시간 내) ===
  for (const [name, info] of Object.entries(coins)) {
    if (name === '까리코인' || name.startsWith('_')) continue;
    if (!info.history || !info.historyT) continue;
    const h = info.history;
    const ht = info.historyT;
    const nowIdx = h.length - 1;

    // 폭락/폭등 체크 구간(분)
    const checkPeriods = [1, 10, 30, 60];
    checkPeriods.forEach(period => {
      // 해당 기간 전 인덱스 찾기
      let idx = -1;
      for (let i = nowIdx; i >= 0; i--) {
        if (getMinutesAgo(ht[i]) >= period) { idx = i; break; }
      }
      if (idx >= 0 && idx < nowIdx) {
        const old = h[idx];
        const curr = h[nowIdx];
        if (!old || !curr) return;
        const pct = ((curr - old) / old) * 100;
        // 30% 이상 폭락/폭등시 알림
        if (pct <= -30) postEventMsg('crash', name, pct, client);
        else if (pct >= 30) postEventMsg('soar', name, pct, client);
      }
    });
  }

  // === 이벤트 확률 상폐 (까리코인 예외, 상장 후 5일~만) ===
  for (const [name, info] of Object.entries(coins)) {
    if (name.startsWith('_')) continue;
    if (name === '까리코인') continue;
    if (info.delistedAt) continue;
    // 상장일 5일(7200분) 미만이면 상폐 불가
    const listedAt = info.listedAt;
    if (!listedAt || getMinutesAgo(listedAt) < 7200) continue;

    const h = info.history || [];
    let pct = 0;
    if (h.length >= 6) {
      const prev = h.at(-6);
      const now = h.at(-1);
      if (prev > 0) pct = ((now - prev) / prev) * 100;
    }
    let delistProb = 0.008;
    if (pct >= 50 || pct <= -50) delistProb = 0.02;
    if (Math.random() < delistProb) {
      info.delistedAt = new Date().toISOString();
      await postLogMsg('delist', name, client);
    }
  }

  let corrQueue = [];
  let newlyListed = null;
  let revivedListed = null;

  // 상장 후보
  const aliveCoins = Object.entries(coins)
    .filter(([name, info]) => !info.delistedAt && name !== '까리코인');
  const totalAvailable = MAX_AUTO_COINS - aliveCoins.length;

  const candidateNames = Array.from(
    new Set(
      [...members.values()]
        .filter(m => !m.user.bot)
        .map(m => m.nickname || m.user.username)
        .filter(nick =>
          !!nick &&
          isKoreanName(nick) &&
          !/^신규코인\d{1,3}$/.test(nick) &&
          !['테스트','운영자','관리자','봇'].includes(nick)
        )
        .filter(nick => !coins[nick + '코인'])
    )
  );

  // 부활은 상폐 7일(10080분) 이상 지난 코인만!
  const delistedCoins = Object.entries(coins)
    .filter(([name, info]) => {
      if (name === '까리코인') return false;
      if (!info.delistedAt || info._alreadyRevived) return false;
      if (getMinutesAgo(info.delistedAt) < 10080) return false;
      return true;
    })
    .map(([name]) => name);

  let numListed = 0;
  if (totalAvailable > 0) {
    // 부활(상폐 코인) 상장 확률: 50% (혹은 부활 후보 있으면 무조건)
    if (delistedCoins.length > 0 && (Math.random() < 0.5 || candidateNames.length === 0)) {
      const reviveName = delistedCoins[Math.floor(Math.random() * delistedCoins.length)];
      const now = new Date().toISOString();
      // 랜덤 타입 배정!
      const types = [
        { coinType: 'verystable', volatility: { min: -0.01, max: 0.01 }, trend: 0.001 },
        { coinType: 'chaotic', volatility: { min: -0.35, max: 0.35 }, trend: 0.02 },
        { coinType: 'dead', volatility: { min: -0.01, max: 0.01 }, trend: -0.005 },
        { coinType: 'neutral', volatility: { min: -0.1, max: 0.1 }, trend: 0 },
        { coinType: 'long', volatility: { min: -0.04, max: 0.06 }, trend: 0.015 },
        { coinType: 'short', volatility: { min: -0.2, max: 0.22 }, trend: 0.01 }
      ];
      const pick = pickRandom(types);
      coins[reviveName].coinType = pick.coinType;
      coins[reviveName].volatility = pick.volatility;
      coins[reviveName].trend = pick.trend;
      coins[reviveName].delistedAt = null;
      coins[reviveName]._alreadyRevived = true;
      coins[reviveName].listedAt = now;
      revivedListed = { name: reviveName, time: now };
      await postLogMsg('revive', reviveName, client);
      numListed++;
    }
    // 남은 슬롯 있으면 신규상장
    if (candidateNames.length > 0 && numListed < totalAvailable) {
      const newNick = candidateNames[Math.floor(Math.random() * candidateNames.length)];
      const newName = newNick + '코인';
      const now = new Date().toISOString();

      // 랜덤 타입 배정!
      const types = [
        { coinType: 'verystable', volatility: { min: -0.01, max: 0.01 }, trend: 0.001 },
        { coinType: 'chaotic', volatility: { min: -0.35, max: 0.35 }, trend: 0.02 },
        { coinType: 'dead', volatility: { min: -0.01, max: 0.01 }, trend: -0.005 },
        { coinType: 'neutral', volatility: { min: -0.1, max: 0.1 }, trend: 0 },
        { coinType: 'long', volatility: { min: -0.04, max: 0.06 }, trend: 0.015 },
        { coinType: 'short', volatility: { min: -0.2, max: 0.22 }, trend: 0.01 }
      ];
      const pick = pickRandom(types);

      let info = {
        price: Math.floor(1000 + Math.random() * 49000),
        history: [],
        historyT: [],
        listedAt: now,
        delistedAt: null,
        volatility: pick.volatility,
        trend: pick.trend,
        coinType: pick.coinType
      };
      info.history.push(info.price);
      info.historyT.push(now);
      coins[newName] = info;
      newlyListed = { name: newName, time: now };
      await postLogMsg('new', newName, client);
    }
    await saveJson(coinsPath, coins);
  }

  // 코인 가격 업데이트(기존대로)
  let corrQueue = [];
  for (const [name, info] of Object.entries(coins)) {
    if (name.startsWith('_')) continue;
    if (name === '까리코인') continue;
    const h = info.history || [];
    if (!info.delistedAt) {
      let minVar = -0.1, maxVar = 0.1;
      if (info.volatility) { minVar = info.volatility.min; maxVar = info.volatility.max; }
      let kImpact = deltaBase * (0.4 + Math.random()*0.2);
      const volume = lastVolume[name] || 0;
      let volumePower = 1.0;
      if (volume > 0) {
        if (volume > 30) volumePower += 0.5;
        if (volume > 100) volumePower += 0.7;
        if (volume > 300) volumePower += 1.0;
      }
      let trendPower = 0;
      if (Array.isArray(coins._uptrend) && coins._uptrend.includes(name)) trendPower += 0.02;
      if (Array.isArray(coins._downtrend) && coins._downtrend.includes(name)) trendPower -= 0.025;
      trendPower *= (0.8 + Math.random() * 0.4);
      if (trendPower > 0.04) trendPower = 0.04;
      if (trendPower < -0.05) trendPower = -0.05;
      let delta = (Math.random() * (maxVar-minVar)) + minVar + kImpact + trendPower;
      if (typeof info.trend === 'number') delta += info.trend;
      delta *= getTimePower();
      delta *= volumePower;
      for (const [a, b] of CORR_PAIRS) {
        if (name === a || name === b) corrQueue.push([a, b, delta]);
      }
      delta = Math.max(-0.5, Math.min(delta, 0.5));
      const p = Math.max(1, Math.floor(info.price * (1 + delta)));
      info.price = p;
      info.history = info.history || [];
      info.historyT = info.historyT || [];
      info.history.push(p);
      info.historyT.push(new Date().toISOString());
      while (info.history.length > HISTORY_MAX) info.history.shift();
      while (info.historyT.length > HISTORY_MAX) info.historyT.shift();
    }
  }

  // 코인 상관관계(같은 방향 적용)
  for (const [a, b, lastDelta] of corrQueue) {
    if (coins[a] && coins[b]) {
      coins[b].price = Math.max(1, Math.floor(coins[b].price * (1 + (lastDelta || 0))));
      coins[b].history = coins[b].history || [];
      coins[b].historyT = coins[b].historyT || [];
      coins[b].history.push(coins[b].price);
      coins[b].historyT.push(new Date().toISOString());
      while (coins[b].history.length > HISTORY_MAX) coins[b].history.shift();
      while (coins[b].historyT.length > HISTORY_MAX) coins[b].historyT.shift();
    }
  }

  await saveJson(coinsPath, coins);
}

// ================== 메인 명령어 ==================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('갓비트')
    .setDescription('가상 코인 시스템 통합 명령어')
    .addSubcommand(sub =>
      sub.setName('코인차트')
        .setDescription('시장 전체 또는 특정 코인 차트')
        .addStringOption(opt => 
          opt.setName('차트주기')
            .setDescription('차트 주기')
            .setRequired(true)
            .addChoices(
              { name: '1분', value: '1m' },
              { name: '10분', value: '10m' },
              { name: '30분', value: '30m' },
              { name: '1시간', value: '1h' },
              { name: '3시간', value: '3h' },
              { name: '6시간', value: '6h' },
              { name: '12시간', value: '12h' },
              { name: '1일', value: '1d' },
              { name: '3일', value: '3d' },
              { name: '일주일', value: '7d' },
              { name: '보름', value: '15d' },
              { name: '30일', value: '30d' },
              { name: '1년', value: '1y' }
            )
        )
        .addStringOption(opt =>
          opt.setName('코인')
            .setDescription('코인명(선택)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('히스토리')
        .setDescription('코인 가격 이력(페이지) 조회')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('매수')
        .setDescription('코인을 매수합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매수 수량').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('매도')
        .setDescription('코인을 매도합니다')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매도 수량').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('내코인')
        .setDescription('내 보유 코인/평가액/손익/수익률 조회')
    )
    .addSubcommand(sub =>
      sub.setName('순위')
        .setDescription('코인 실현 수익/자산 TOP20 순위')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // 1. 코인차트
    if (sub === '코인차트') {
      await interaction.deferReply({ ephemeral: true });
      const search = (interaction.options.getString('코인')||'').trim();
      const chartFilter = interaction.options.getString('차트주기') || '1m';
      const filterConfig = CHART_FILTERS.find(f => f.value === chartFilter) || CHART_FILTERS[0];
      const chartRange = filterConfig.points;
      const chartLabel = filterConfig.label;

      async function renderChartPage(pageIdx = 0) {
        const coins = await loadJson(coinsPath, {});
        await ensureBaseCoin(coins);
        const wallets = await loadJson(walletsPath, {});
        let allAlive = Object.entries(coins)
          .filter(([name, info]) => !name.startsWith('_') && !info.delistedAt);

        if (chartFilter === '1m' && !search) {
          await interaction.editReply({
            content: `❌ 1분 주기 시장 전체 차트는 데이터가 너무 많아 지원하지 않습니다.\n코인명을 입력해서 단일 코인 차트만 확인해 주세요!`
          });
          return 0;
        }

        if (search) {
          allAlive = allAlive.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));
          if (!allAlive.length) {
            await interaction.editReply({ content: `❌ [${search}] 코인 없음!` });
            return 0;
          }
        }

        allAlive = allAlive.map(([name, info]) => {
          const h = info.history || [];
          const prev = h.at(-2) ?? h.at(-1) ?? 0;
          const now = h.at(-1) ?? 0;
          const change = now - prev;
          const pct = prev ? (change / prev) * 100 : 0;
          return { name, info, now, prev, change, pct };
        })
        .sort((a, b) => b.now - a.now);

        const totalPages = Math.ceil(allAlive.length / PAGE_SIZE);

        let page = pageIdx;
        if (page < 0) page = 0;
        if (page >= totalPages) page = totalPages-1;

        const userBE = getBE(interaction.user.id);
        const slice = allAlive.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

        if (!slice.length) {
          await interaction.editReply({ content: "❌ 해당 페이지는 표시할 데이터가 없습니다." });
          return page;
        }

        const chartValue = filterConfig.value;
        const chartDataArr = slice.map((item, i) =>
          getSampledHistory(item.info, chartRange, filterConfig.interval, chartValue)
        );
        let labels = [];
        if (chartDataArr.length > 0) {
          labels = chartDataArr[0].labels;
        }
        const datasets = slice.map((item, i) => ({
          label: item.name,
          data: chartDataArr[i].data,
          borderColor: COLORS[i % COLORS.length],
          fill: false
        }));
        const chartConfig = {
          backgroundColor: "white",
          type: 'line',
          data: { labels, datasets },
          options: {
            plugins: { legend: { display: false } },
            scales: {
              x: { title: { display: true, text: `시간(${chartLabel})` } },
              y: { title: { display: true, text: '가격 (BE)' } }
            }
          }
        };
        const chartEmbed = new EmbedBuilder()
          .setTitle(`📊 코인 가격 차트 (${chartLabel})${search ? ` - [${search}]` : ''}`)
          .setImage(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=white`)
          .setColor('#FFFFFF')
          .setTimestamp();

        const listEmbed = new EmbedBuilder()
          .setTitle(`📈 갓비트 시장 현황${search ? ` - [${search}]` : ''} (페이지 ${page+1}/${totalPages})`)
          .setDescription(`💳 내 BE: ${userBE.toLocaleString()} BE\n\n**코인 가격 내림차순 정렬**`)
          .setColor('#FFFFFF');

        slice.forEach((item, i) => {
          const emoji = EMOJIS[i % EMOJIS.length];
          const arrowColor = item.change > 0 ? '🔺' : item.change < 0 ? '🔻' : '⏺';
          const maxBuy = Math.floor(userBE / (item.now||1));
          listEmbed.addFields({
            name: `${emoji} ${item.name}`,
            value: `${item.now.toLocaleString()} BE ${arrowColor} (${item.change>=0?'+':''}${item.pct.toFixed(2)}%)\n🛒 최대 매수: ${maxBuy}개`,
            inline: false
          });
        });

        listEmbed.setFooter({
          text: '/갓비트 매수 │ /갓비트 매도│ /갓비트 내코인 │ /갓비트 히스토리'
        });

        // 첫줄: 페이지 버튼
        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('first').setLabel('🏠 처음').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
          new ButtonBuilder().setCustomId('prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(page===0),
          new ButtonBuilder().setCustomId('refresh').setLabel('🔄 새로고침').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(page===totalPages-1),
          new ButtonBuilder().setCustomId('last').setLabel('🏁 끝').setStyle(ButtonStyle.Secondary).setDisabled(page===totalPages-1)
        );
        // 둘째줄: 매수/매도/내코인 버튼
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mycoin').setLabel('내 코인').setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({
          embeds: [chartEmbed, listEmbed],
          components: [navRow, actionRow]
        });

        return page;
      }

      let page = 0;
      page = await renderChartPage(page);

      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 600_000,
        filter: btn => btn.user.id === interaction.user.id
      });

      collector.on('collect', async btn => {
        await btn.deferUpdate();

        if (btn.customId === 'first') page = 0;
        else if (btn.customId === 'prev' && page > 0) page -= 1;
        else if (btn.customId === 'next') page += 1;
        else if (btn.customId === 'last') page = 9999;
        else if (btn.customId === 'mycoin') {
          const coins = await loadJson(coinsPath, {});
          const wallets = await loadJson(walletsPath, {});
          const userW = wallets[btn.user.id] || {};
          const userBuys = wallets[btn.user.id + "_buys"] || {};
          let totalEval = 0, totalBuy = 0, totalProfit = 0;
          const e = new EmbedBuilder()
            .setTitle('💼 내 코인 평가/수익 현황')
            .setColor('#2ecc71')
            .setTimestamp();
          if (!Object.keys(userW).length) {
            e.setDescription('보유 코인이 없습니다.');
          } else {
            let detailLines = [];
            for (const [c, q] of Object.entries(userW)) {
              if (!coins[c] || coins[c].delistedAt) continue;
              const nowPrice = coins[c]?.price || 0;
              const buyCost = userBuys[c] || 0;
              const evalPrice = nowPrice * q;
              const profit = evalPrice - buyCost;
              const yieldPct = buyCost > 0 ? ((profit / buyCost) * 100) : 0;
              totalEval += evalPrice;
              totalBuy += buyCost;
              totalProfit += profit;
              detailLines.push(
                `**${c}**\n• 보유: ${q}개\n• 누적매수: ${buyCost.toLocaleString()} BE\n• 평가액: ${evalPrice.toLocaleString()} BE\n• 손익: ${profit>=0?`+${profit.toLocaleString()}`:profit.toLocaleString()} BE (${yieldPct>=0?'+':''}${yieldPct.toFixed(2)}%)`
              );
            }
            const totalYield = totalBuy > 0 ? ((totalProfit/totalBuy)*100) : 0;
            e.setDescription(detailLines.join('\n\n'));
            e.addFields(
              { name: '총 매수', value: `${totalBuy.toLocaleString()} BE`, inline: true },
              { name: '총 평가', value: `${totalEval.toLocaleString()} BE`, inline: true },
              { name: '평가 손익', value: `${totalProfit>=0?`+${totalProfit.toLocaleString()}`:totalProfit.toLocaleString()} BE (${totalYield>=0?'+':''}${totalYield.toFixed(2)}%)`, inline: true }
            );
          }
          await btn.followUp({ embeds: [e], ephemeral: true });
          return;
        }

        page = await renderChartPage(page);
      });
    }

    // 2. 히스토리(버튼)
    if (sub === '히스토리') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.options.getString('코인');
      const coins = await loadJson(coinsPath, {});
      const info = coins[coin];
      if (!info) return interaction.editReply({ content: `❌ [${coin}] 상장 정보가 없는 코인입니다.` });

      let isDelisted = !!info.delistedAt;
      let delistMsg = '';
      if (isDelisted) {
        delistMsg = `⚠️ ${toKSTString(info.delistedAt)}에 상장폐지된 코인입니다.`;
      }
      const h = (info.history || []).slice(-HISTORY_MAX).reverse();
      const ht = (info.historyT || []).slice(-HISTORY_MAX).reverse();
      if (!h.length) {
        return interaction.editReply({ content: `📉 [${coin}] 가격 이력 데이터 없음${delistMsg ? `\n${delistMsg}` : ''}` });
      }

      const totalPages = Math.ceil(h.length / HISTORY_PAGE);
      let page = 0;

      async function renderHistoryPage(pageIdx = 0) {
        const start = pageIdx * HISTORY_PAGE;
        const end = start + HISTORY_PAGE;
        const list = h.slice(start, end);
        const timeList = ht.slice(start, end);

        const lines = list.map((p, idx) => {
          if (p == null) return `${start+idx+1}. (데이터없음)`;
          const prev = list[idx+1] ?? null;
          let diff = 0;
          if (prev != null) diff = p - prev;
          let emoji = '⏸️';
          if (diff > 0) emoji = '🔺';
          else if (diff < 0) emoji = '🔻';
          return `${start+idx+1}. ${emoji} ${p.toLocaleString()} BE  |  ${toKSTString(timeList[idx])}`;
        });

        const embed = new EmbedBuilder()
          .setTitle(`🕘 ${coin} 가격 이력 (페이지 ${pageIdx+1}/${totalPages})`)
          .setDescription(lines.length ? lines.join('\n') : '데이터 없음')
          .addFields(
            { name: '상장일', value: info.listedAt ? toKSTString(info.listedAt) : '-', inline: true },
            { name: '폐지일', value: info.delistedAt ? toKSTString(info.delistedAt) : '-', inline: true }
          )
          .setColor(isDelisted ? '#888888' : '#3498DB')
          .setTimestamp();
        if (delistMsg && isDelisted) embed.setFooter({ text: delistMsg });

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('first').setLabel('🏠 처음').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===0),
          new ButtonBuilder().setCustomId('next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(pageIdx===totalPages-1),
          new ButtonBuilder().setCustomId('last').setLabel('🏁 끝').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx===totalPages-1)
        );
        await interaction.editReply({ embeds: [embed], components: [navRow] });
      }

      await renderHistoryPage(0);
      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 600_000,
        filter: btn => btn.user.id === interaction.user.id
      });

      collector.on('collect', async btn => {
        await btn.deferUpdate();
        if (btn.customId === 'first') page = 0;
        else if (btn.customId === 'prev' && page > 0) page -= 1;
        else if (btn.customId === 'next' && page < totalPages-1) page += 1;
        else if (btn.customId === 'last') page = totalPages-1;
        await renderHistoryPage(page);
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch {}
      });

      return;
    }

    // 3. 매수
    if (sub === '매수') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.options.getString('코인');
      const amount = interaction.options.getInteger('수량');
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      if (!coins[coin] || coins[coin].delistedAt) return interaction.editReply({ content: `❌ 상장 중인 코인만 매수 가능: ${coin}` });
      if (!Number.isFinite(amount) || amount <= 0) return interaction.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

      const price = coins[coin].price;
      const total = price * amount;
      const fee = 0;
      const needBE = total;
      const bal = getBE(interaction.user.id);
      if (bal < needBE) return interaction.editReply({ content: `❌ BE 부족: 필요 ${needBE}` });

      wallets[interaction.user.id] = wallets[interaction.user.id] || {};
      wallets[interaction.user.id][coin] = (wallets[interaction.user.id][coin] || 0) + amount;
      wallets[interaction.user.id + "_buys"] = wallets[interaction.user.id + "_buys"] || {};
      wallets[interaction.user.id + "_buys"][coin] = (wallets[interaction.user.id + "_buys"][coin] || 0) + (price * amount);

      await addBE(interaction.user.id, -needBE, `매수 ${amount} ${coin} (수수료 ${fee} BE 포함)`);
      await saveJson(walletsPath, wallets);

      await addHistory(coins[coin], price);
      await saveJson(coinsPath, coins);

      recordVolume(coin, amount);

      return interaction.editReply({ content: `✅ ${coin} ${amount}개 매수 완료! (수수료 ${fee} BE)` });
    }

    // 4. 매도
    if (sub === '매도') {
      await interaction.deferReply({ ephemeral: true });
      const coin = interaction.options.getString('코인');
      const amount = interaction.options.getInteger('수량');
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      if (!coins[coin] || coins[coin].delistedAt) return interaction.editReply({ content: `❌ 상장 중인 코인만 매도 가능: ${coin}` });
      if (!Number.isFinite(amount) || amount <= 0) return interaction.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

      const have = wallets[interaction.user.id]?.[coin] || 0;
      if (have < amount) return interaction.editReply({ content: `❌ 보유 부족: ${have}` });
      const gross = coins[coin].price * amount;
      const fee = Math.floor(gross * 0.3);
      const net = gross - fee;
      wallets[interaction.user.id][coin] -= amount;
      if (wallets[interaction.user.id][coin] <= 0) delete wallets[interaction.user.id][coin];
      await addBE(interaction.user.id, net, `매도 ${amount} ${coin}`);
      wallets[interaction.user.id + "_realized"] = wallets[interaction.user.id + "_realized"] || {};
      wallets[interaction.user.id + "_realized"][coin] = (wallets[interaction.user.id + "_realized"][coin] || 0) + net;
      await saveJson(walletsPath, wallets);

      await addHistory(coins[coin], coins[coin].price);
      await saveJson(coinsPath, coins);

      recordVolume(coin, amount);

      return interaction.editReply({ content: `✅ ${coin} ${amount}개 매도 완료! (수수료 ${fee} BE)` });
    }

    // 5. 내코인
    if (sub === '내코인') {
      await interaction.deferReply({ ephemeral: true });
      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});
      const userW = wallets[interaction.user.id] || {};
      const userBuys = wallets[interaction.user.id + "_buys"] || {};
      let totalEval = 0, totalBuy = 0, totalProfit = 0;

      const e = new EmbedBuilder()
        .setTitle('💼 내 코인 평가/수익 현황')
        .setColor('#2ecc71')
        .setTimestamp();

      if (!Object.keys(userW).length) {
        e.setDescription('보유 코인이 없습니다.');
      } else {
        let detailLines = [];
        for (const [c, q] of Object.entries(userW)) {
          if (!coins[c] || coins[c].delistedAt) continue;
          const nowPrice = coins[c]?.price || 0;
          const buyCost = userBuys[c] || 0;
          const evalPrice = nowPrice * q;
          const profit = evalPrice - buyCost;
          const yieldPct = buyCost > 0 ? ((profit / buyCost) * 100) : 0;
          totalEval += evalPrice;
          totalBuy += buyCost;
          totalProfit += profit;
          detailLines.push(
            `**${c}**
• 보유: ${q}개
• 누적매수: ${buyCost.toLocaleString()} BE
• 평가액: ${evalPrice.toLocaleString()} BE
• 손익: ${profit>=0?`+${profit.toLocaleString()}`:profit.toLocaleString()} BE (${yieldPct>=0?'+':''}${yieldPct.toFixed(2)}%)`
          );
        }
        const totalYield = totalBuy > 0 ? ((totalProfit/totalBuy)*100) : 0;
        e.setDescription(detailLines.join('\n\n'));
        e.addFields(
          { name: '총 매수', value: `${totalBuy.toLocaleString()} BE`, inline: true },
          { name: '총 평가', value: `${totalEval.toLocaleString()} BE`, inline: true },
          { name: '평가 손익', value: `${totalProfit>=0?`+${totalProfit.toLocaleString()}`:totalProfit.toLocaleString()} BE (${totalYield>=0?'+':''}${totalYield.toFixed(2)}%)`, inline: true }
        );
      }
      return interaction.editReply({ embeds: [e] });
    }

    // 6. 순위
    if (sub === '순위') {
      await interaction.deferReply({ ephemeral: true });

      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});

      let realized = {};
      for (const uid in wallets) {
        if (!uid.endsWith("_realized")) continue;
        const sum = Object.values(wallets[uid] || {}).reduce((a, b) => a + b, 0);
        realized[uid.replace("_realized", "")] = sum;
      }
      const realizedRank = Object.entries(realized)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      let userHoldings = {};
      for (const uid in wallets) {
        if (uid.endsWith("_buys") || uid.endsWith("_realized")) continue;
        const userW = wallets[uid] || {};
        let evalSum = 0;
        for (const [coin, q] of Object.entries(userW)) {
          if (!coins[coin] || coins[coin].delistedAt) continue;
          evalSum += (coins[coin]?.price || 0) * q;
        }
        userHoldings[uid] = evalSum;
      }
      const holdingsRank = Object.entries(userHoldings)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      const realizedEmbed = new EmbedBuilder()
        .setTitle('💰 실현 수익(매도 차익) TOP 20')
        .setColor('#ffcc00')
        .setDescription(
          realizedRank.length
            ? realizedRank.map(([uid, val], i) =>
                `**${i+1}. <@${uid}>**  \`${val.toLocaleString()} 파랑 정수\``).join('\n')
            : '데이터 없음'
        )
        .setFooter({ text: '실현수익: 코인 매도를 통한 누적 손익 합산' });

      const holdingsEmbed = new EmbedBuilder()
        .setTitle('🏦 코인 평가자산 TOP 20')
        .setColor('#33ccff')
        .setDescription(
          holdingsRank.length
            ? holdingsRank.map(([uid, val], i) =>
                `**${i+1}. <@${uid}>**  \`${val.toLocaleString()} 파랑 정수\``).join('\n')
            : '데이터 없음'
        )
        .setFooter({ text: '자산평가: 현재 보유 코인의 시세 기준 합산' });

      let page = 0;
      const pages = [realizedEmbed, holdingsEmbed];

      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rank_prev').setLabel('◀️ 이전').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('rank_next').setLabel('▶️ 다음').setStyle(ButtonStyle.Primary).setDisabled(page === pages.length-1)
      );

      await interaction.editReply({ embeds: [pages[page]], components: [navRow] });
      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 600_000,
        filter: btn => btn.user.id === interaction.user.id
      });

      collector.on('collect', async btn => {
        await btn.deferUpdate();
        if (btn.customId === 'rank_prev' && page > 0) page -= 1;
        else if (btn.customId === 'rank_next' && page < pages.length-1) page += 1;
        navRow.components[0].setDisabled(page === 0);
        navRow.components[1].setDisabled(page === pages.length-1);
        await interaction.editReply({ embeds: [pages[page]], components: [navRow] });
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch {}
      });
      return;
    }
  },

  autoMarketUpdate
};
