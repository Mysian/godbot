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
const HISTORY_MAX = 10000;
const MAX_AUTO_COINS = 20;
const COLORS      = ['red','blue','green','orange','purple','cyan','magenta','brown','gray','teal'];
const EMOJIS      = ['🟥','🟦','🟩','🟧','🟪','🟨','🟫','⬜','⚫','🟣'];

// ==== 가격 벽 효과 함수 ====
const WALLS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 50, 100, 500,
  1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 40000, 50000,
  60000, 70000, 80000, 90000,
  100000, 200000, 300000, 400000, 500000,
  600000, 700000, 800000, 900000, 
  1000000, 1050000, 1100000, 1150000, 1200000, 1250000,
  1300000, 1350000, 1400000, 1450000, 1500000, 1550000,
  1600000, 1650000, 1700000, 1750000, 1800000, 1850000,
  1900000, 1950000, 2000000,
  3000000, 4000000, 5000000, 7500000, 10000000, 12000000
];

function applyWallEffect(price, delta, volume = 0) {
  let result = delta;
  for (const wall of WALLS) {
    const near = Math.abs(price - wall) < wall * 0.07;
    if (near) {
      let power = 0.45;
      if (volume > 1000) power = 1.0;
      else if (volume > 300) power = 0.75;
      else if (volume > 100) power = 0.6;
      result *= power;
    }
  }
  return result;
}

const CHART_FILTERS = [
  { label: "10분",   value: "10m",  points: 7,  interval: 10 },
  { label: "30분",   value: "30m",  points: 7,  interval: 30 },
  { label: "1시간",  value: "1h",   points: 7,  interval: 60 },
  { label: "3시간",  value: "3h",   points: 7,  interval: 180 },
  { label: "6시간",  value: "6h",   points: 7,  interval: 360 },
  { label: "12시간", value: "12h",  points: 7,  interval: 720 },
  { label: "1일",    value: "1d",   points: 7,  interval: 1440 },
  { label: "3일",    value: "3d",   points: 7,  interval: 1440*3 },
  { label: "일주일", value: "7d",   points: 7,  interval: 1440*7 },
  { label: "보름",   value: "15d",  points: 7,  interval: 1440*15 },
  { label: "30일",   value: "30d",  points: 7,  interval: 1440*30 },
  { label: "1년",    value: "1y",   points: 12, interval: 1440*30 },
];


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


const UPPER_DELIST = 10_000_000; 
const LOWER_DELIST = 0.001;  


async function enforceAutoDelist(coins, client = global.client) {
  let touched = false;
  for (const [name, info] of Object.entries(coins)) {
    if (!info || name.startsWith('_')) continue;
    if (info.delistedAt) continue;
    const p = Number(info.price) || 0;
    if (p >= UPPER_DELIST || p <= LOWER_DELIST) {
      info.delistedAt = new Date().toISOString();
      try { await postLogMsg('delist', name, client); } catch (e) {}
      touched = true;
    }
  }
  if (touched) await saveJson(coinsPath, coins);
}

function getSampledHistory(info, chartRange, chartInterval, chartValue) {
  if (!info.history || !info.historyT) return { data: [], labels: [] };

  // 1분 뷰는 그대로
  if (chartValue === '1m') {
    const start = info.history.length - chartRange;
    const data = (info.history || []).slice(start < 0 ? 0 : start);
    const labels = [];
    for (let i = 0; i < chartRange; i++) labels.push(i === chartRange - 1 ? '현재' : `${chartRange - 1 - i}분전`);
    while (data.length < chartRange) data.unshift(0);
    while (labels.length < chartRange) labels.unshift('-');
    return { data, labels };
  }

  // ✅ KST 전용 포맷터 (재파싱 금지, Date 그대로 포맷)
  const fmtTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const fmtDate = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit'
  });
  const fmtYear = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric'
  });

  const data = [];
  const labels = [];
  let prevKstMs = null;
  let n = 0;

  for (let i = info.history.length - 1; i >= 0; i--) {
    const t = new Date(info.historyT[i]);          // 저장된 ISO(UTC) 그대로 사용
    const kstMs = t.getTime() + 9*60*60*1000;      // 간격 비교는 ms로 (KST)
    if (prevKstMs === null || (prevKstMs - kstMs) >= chartInterval * 60 * 1000) {
      data.unshift(info.history[i]);

      // ⬇️ 라벨은 포맷터로 바로 KST 문자열 생성
      let label = '-';
      if (['10m','30m','1h','3h','6h','12h'].includes(chartValue)) {
        label = fmtTime.format(t);                  // 예: "09:38"
      } else if (['1d','3d','7d','15d','30d'].includes(chartValue)) {
        const md = fmtDate.format(t);               // 예: "09.18"
        label = md.replace(/\//g, '.');             // 환경차 예방
      } else if (chartValue === '1y') {
        label = fmtYear.format(t);                  // 예: "2025"
      }

      labels.unshift(label);
      prevKstMs = kstMs;
      n++;
      if (n >= chartRange) break;
    }
  }

  while (data.length < chartRange) { data.unshift(0); labels.unshift('-'); }
  return { data, labels };
}



async function ensureBaseCoin(coins) {
  const now = new Date().toISOString();
  const base = coins['까리코인'];

  if (!base) {
    // 없을 때만 최초 생성 (기본값은 이후 /타입변경으로 자유 변경 가능)
    coins['까리코인'] = {
      price: 1000,
      history: [1000],
      historyT: [now],
      listedAt: now,
      volatility: { min: -0.06, max: 0.07 },
      trend: 0.003,
      coinType: "base"
    };
    return;
  }

  // 이미 있을 경우: 값 "보존". 빠진 필드만 채워넣기 (타입/변동성/트렌드 절대 덮어쓰지 않음)
  base.price    ??= 1000;
  base.history  ??= [base.price];
  base.historyT ??= [base.listedAt || now];
  base.listedAt ??= now;
  // 아래 3개는 존재할 경우 유지됨 (타입변경 반영 보존)
  base.volatility ??= { min: -0.06, max: 0.07 };
  base.trend      ??= 0.003;
  base.coinType   ??= "base";
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

// ==== 이벤트 상폐/부활/상장/극복 멘트 ====
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
const SURVIVE_MSGS = [
  '⚡️ [극복] {coin}이(가) 상장폐지 위기를 극복했습니다! 투자자들 환호!',
  '⚡️ [극복] {coin} 상장폐지 직전에서 극적으로 살아났습니다!',
  '⚡️ [극복] {coin}, 이 정도면 살아있는 전설!',
  '⚡️ [극복] {coin} 상장폐지 위기를 멋지게 넘겼습니다!',
  '⚡️ [극복] {coin}, 절망 속에서도 버텼다!'
];
function pickRandom(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
async function postLogMsg(type, coinName, client) {
  let msg;
  if (type === 'delist') msg = pickRandom(DELIST_MSGS).replace('{coin}', coinName);
  if (type === 'revive') msg = pickRandom(REVIVE_MSGS).replace('{coin}', coinName);
  if (type === 'new')    msg = pickRandom(NEWCOIN_MSGS).replace('{coin}', coinName);
  if (type === 'survive') msg = pickRandom(SURVIVE_MSGS).replace('{coin}', coinName);
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch) ch.send(msg);
  } catch (e) {}
}
async function postEventMsg(type, coinName, percent, client) {
  let msg;
  if (type === 'crash') msg = `📉 [폭락!] ${coinName}이 ${percent.toFixed(1)}% 폭락 추이를 보입니다!`;
  if (type === 'soar')  msg = `📈 [폭등!] ${coinName}이 ${percent.toFixed(1)}% 폭등 추이를 보입니다!`;
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (ch) ch.send(msg);
  } catch (e) {}
}

function getMinutesAgo(dateStr) {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  return Math.floor((now - date) / 60000);
}

let lastEventLogTime = {};

// ⭐️ 1분마다 시세/이벤트성 폐지/신규상장/부활/폭등폭락 알림!
async function autoMarketUpdate(members, client = global.client) {
  const coins = await loadJson(coinsPath, {});
  await ensureBaseCoin(coins);
  await enforceAutoDelist(coins, client);

  for (const [name, info] of Object.entries(coins)) {
    if (!info || name.startsWith('_')) continue;
    if (info.delistedAt) continue;

    if (typeof info._nextSetPrice === 'number' && isFinite(info._nextSetPrice) && info._nextSetPrice > 0) {
      const newP = Math.max(0.001, Number(info._nextSetPrice.toFixed(3)));

      // 가격/히스토리 반영
      info.price    = newP;
      info.history  = info.history  || [];
      info.historyT = info.historyT || [];
      info.history.push(newP);
      info.historyT.push(new Date().toISOString());
      while (info.history.length  > HISTORY_MAX) info.history.shift();
      while (info.historyT.length > HISTORY_MAX) info.historyT.shift();

      // 이번 틱의 일반 변동 루프는 건너뛰도록 플래그
      info._justApplied = true;

      // 1회성 필드 제거
      delete info._nextSetPrice;
      delete info._nextSetMode;
      delete info._nextSetAt;
    }
  }
await enforceAutoDelist(coins, client);
  // === 까리코인 시세 ===
const base = coins['까리코인'];
const deltaBase = (Math.random() * 0.2) - 0.1;

const deltaWithWall = applyWallEffect(base.price, deltaBase, lastVolume['까리코인'] || 0);

const minPrice = 100;
const maxPrice = 10000;

const newBase = Math.max(minPrice, Math.min(maxPrice, Number((base.price * (1 + deltaWithWall)).toFixed(3))));
base.price = newBase;
base.history.push(newBase);
base.historyT = base.historyT || [];
base.historyT.push(new Date().toISOString());
while (base.history.length > HISTORY_MAX) base.history.shift();
while (base.historyT.length > HISTORY_MAX) base.historyT.shift();

await enforceAutoDelist(coins, client);

  // === 폭등/폭락 감지 (최근 60분 내, 연속적 변화 필요) ===
for (const [name, info] of Object.entries(coins)) {
  if (name === '까리코인' || name.startsWith('_')) continue;
  if (!info.history || !info.historyT) continue;
  if (!info.listedAt || getMinutesAgo(info.listedAt) < 1440) continue;

  const h = info.history;
  const ht = info.historyT;
  const nowIdx = h.length - 1;

  // 최근 60분 내 데이터 구간 찾기
  let idx = -1;
  for (let i = nowIdx; i >= 0; i--) {
    if (getMinutesAgo(ht[i]) >= 60) { idx = i; break; }
  }
  if (idx >= 0 && idx < nowIdx) {
    // === 추가: 최근 5틱(혹은 5회) 연속 변동 체크 ===
    const recentTicks = 5;
    if (nowIdx - idx >= recentTicks) {
      let up = 0, down = 0;
      for (let i = nowIdx - recentTicks + 1; i < nowIdx; i++) {
        if (h[i + 1] > h[i]) up++;
        else if (h[i + 1] < h[i]) down++;
      }
      const old = h[nowIdx - recentTicks + 1]; // 5틱 전 가격
      const curr = h[nowIdx];
      if (!old || !curr) continue;
      const pct = ((curr - old) / old) * 100;

      let eventType = null;
      // 4회 이상 연속 상승 & +20% 이상 → 폭등
      if (up >= 4 && pct >= 20) eventType = 'soar';
      // 4회 이상 연속 하락 & -20% 이하 → 폭락
      else if (down >= 4 && pct <= -20) eventType = 'crash';

      if (eventType) {
        const key = `${name}_${eventType}`;
        const nowMin = Math.floor(Date.now() / 60000);
        const lastMin = lastEventLogTime[key] || 0;
        if (nowMin - lastMin >= 360) {
          postEventMsg(eventType, name, pct, client);
          lastEventLogTime[key] = nowMin;
        }
      }
    }
  }
}


  // === 이벤트 확률 상폐  (까리코인 예외, 상장 후 5일~만) ===
  const _opt = coins._delistOption || {};
for (const [name, info] of Object.entries(coins)) {
  if (name.startsWith('_')) continue;
  if (name === '까리코인') continue;
  if (!info || info.delistedAt) continue;

  // 상장 후 5일(7200분) 경과만 대상
  if (!info.listedAt || getMinutesAgo(info.listedAt) < 7200) continue;

  // 최근 5틱 전 대비 등락률(대략 5회 샘플링)
  const h = info.history || [];
  let pct = 0;
  if (h.length >= 6) {
    const prev = h.at(-6);
    const now  = h.at(-1);
    if (prev > 0) pct = ((now - prev) / prev) * 100;
  }

  // 기본 확률
  let delistProb = 0.002;
  if (pct >= 50 || pct <= -50) delistProb = 0.008;

  // 관리자 옵션 반영
  if (_opt.type === 'random') {
    // 확률(%)을 그대로 사용
    if (typeof _opt.prob === 'number' && _opt.prob > 0) {
      delistProb = Math.min(1, _opt.prob / 100);
    }
  } else if (_opt.type === 'profitlow') {
    // 하락 구간에서만 확률 가중 (기본 0.003, 하락폭 커질수록 ↑, 최대 3배)
    const base = (typeof _opt.prob === 'number' && _opt.prob > 0) ? (_opt.prob / 100) : 0.003;
    if (pct < 0) {
      const factor = Math.min(3, 1 + (Math.abs(pct) / 100));
      delistProb = base * factor;
    } else {
      delistProb = 0; // 상승/보합일 땐 상폐 안 함(원하면 여기 값 조정)
    }
  }

  if (Math.random() < delistProb) {
    // 50% 확률로 상장폐지 극복 이벤트
    if (Math.random() < 0.5) {
      await postLogMsg('survive', name, client);
    } else {
      info.delistedAt = new Date().toISOString();
      await postLogMsg('delist', name, client);
    }
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
    // ===== 확률적 신규상장/부활 =====
    // 1. 먼저 부활 기회(상폐 7일 경과 코인) 0.2% 확률 (부활 후보 있으면만!)
    if (delistedCoins.length > 0 && Math.random() < 0.002) { // 부활 상장 확률
  const reviveName = delistedCoins[Math.floor(Math.random() * delistedCoins.length)];
  const now = new Date().toISOString();
  const prevPrice =
    coins[reviveName].history?.length
      ? coins[reviveName].history[coins[reviveName].history.length - 1]
      : 1000;
  const randomRatio = 0.9 + Math.random() * 0.45; // 0.90 ~ 1.35
  const revivePrice = Number((prevPrice * randomRatio).toFixed(3));

  const types = [
    { coinType: 'verystable', volatility: { min: -0.01, max: 0.01 }, trend: 0.001 },
    { coinType: 'chaotic', volatility: { min: -0.35, max: 0.35 }, trend: 0.02 },
    { coinType: 'dead', volatility: { min: -0.01, max: 0.01 }, trend: -0.005 },
    { coinType: 'neutral', volatility: { min: -0.1, max: 0.1 }, trend: 0 },
    { coinType: 'long', volatility: { min: -0.04, max: 0.06 }, trend: 0.015 },
    { coinType: 'short', volatility: { min: -0.2, max: 0.22 }, trend: 0.01 },
    { coinType: 'downonly', volatility: { min: -0.2, max: 0.01 }, trend: -0.0005}
  ];
  const pick = pickRandom(types);

  coins[reviveName].coinType = pick.coinType;
  coins[reviveName].volatility = pick.volatility;
  coins[reviveName].trend = pick.trend;
  coins[reviveName].delistedAt = null;
  coins[reviveName]._alreadyRevived = true;
  coins[reviveName].listedAt = now;
  coins[reviveName].price = revivePrice;
  coins[reviveName].history = [revivePrice];
  coins[reviveName].historyT = [now];

  revivedListed = { name: reviveName, time: now };
  await postLogMsg('revive', reviveName, client);
  numListed++;
}


    // 2. 그 외엔 0.5% 확률로만 신규 상장 (후보가 있을 때만!)
    else if (candidateNames.length > 0 && numListed < totalAvailable && Math.random() < 0.005) { // 신규 상장 확률
      const newNick = candidateNames[Math.floor(Math.random() * candidateNames.length)];
      const newName = newNick + '코인';
      const now = new Date().toISOString();
      const types = [
        { coinType: 'verystable', volatility: { min: -0.00015, max: 0.00015 }, trend: 0.00003 },
        { coinType: 'chaotic',    volatility: { min: -0.004,   max: 0.004   }, trend: 0.00012 },
        { coinType: 'dead',       volatility: { min: -0.0002, max: 0.00015 }, trend: -0.00005 },
        { coinType: 'neutral',    volatility: { min: -0.0006,  max: 0.0007  }, trend: 0 },
        { coinType: 'long',       volatility: { min: -0.0002,  max: 0.002  }, trend: 0.00008 },
        { coinType: 'short',      volatility: { min: -0.001,  max: 0.002   }, trend: 0.00005 },
        { coinType: 'boxer',      volatility: { min: -0.0003,  max: 0.00025  }, trend: 0 },
        { coinType: 'slowbull',   volatility: { min: -0.0001, max: 0.0004 }, trend: 0.00007 },
        { coinType: 'explodebox', volatility: { min: -0.0003,  max: 0.003  }, trend: 0.00013 },
        { coinType: 'growth',     volatility: { min: -0.0004,  max: 0.0018  }, trend: 0.00023 },
        { coinType: 'roller',     volatility: { min: -0.0025,  max: 0.0025  }, trend: 0.00008 },
        { coinType: 'zombie',     volatility: { min: -0.0007,  max: 0.00015  }, trend: -0.00006 },
        { coinType: 'dailyboom',  volatility: { min: -0.0001,  max: 0.004  }, trend: 0 },
        { coinType: 'bubble',     volatility: { min: -0.004,   max: 0.006  }, trend: 0.00015 },
        { coinType: 'fear',       volatility: { min: -0.0022,  max: 0.0007  }, trend: -0.00011 },
        { coinType: 'downonly',   volatility: { min: -0.2,     max: 0.01 },    trend: -0.0005}
      ];
      const pick = pickRandom(types);

      let info = {
        price: Number((1000 + Math.random() * 49000).toFixed(3)),
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
      numListed++;
    }
    await saveJson(coinsPath, coins);
  }

  // 코인 가격 업데이트(기존대로)
  for (const [name, info] of Object.entries(coins)) {
    if (name.startsWith('_')) continue;
    if (name === '까리코인') continue;
    if (info && info._justApplied) { delete info._justApplied; continue; }
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
  if (name === a || name === b) {
    const A = coins[a], B = coins[b];
    if (A && B && !A.delistedAt && !B.delistedAt) {
      corrQueue.push([a, b, delta]);
    }
  }
}
      delta = Math.max(-0.5, Math.min(delta, 0.5));
      delta = applyWallEffect(info.price, delta, lastVolume[name] || 0);
      const p = Math.max(0.001, Number((info.price * (1 + delta)).toFixed(3)));
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
  const A = coins[a], B = coins[b];
  if (!A || !B) continue;
  if (A.delistedAt || B.delistedAt) continue;

  const newPrice = Math.max(0.001, Number((B.price * (1 + (lastDelta || 0))).toFixed(3)));
  B.price = newPrice;

  B.history = B.history || [];
  B.historyT = B.historyT || [];
  B.history.push(newPrice);
  B.historyT.push(new Date().toISOString());
  while (B.history.length > HISTORY_MAX) B.history.shift();
  while (B.historyT.length > HISTORY_MAX) B.historyT.shift();
}
  await enforceAutoDelist(coins, client);
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
        .setDescription('코인을 매수합니다. 수수료 없음')
        .addStringOption(opt => opt.setName('코인').setDescription('코인명').setRequired(true))
        .addIntegerOption(opt => opt.setName('수량').setDescription('매수 수량').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('매도')
        .setDescription('코인을 매도합니다. 수수료 30퍼센트 존재')
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
        const chartDataArr = slice.map((item) =>
  getSampledHistory(item.info, chartRange, filterConfig.interval, chartValue)
);

let latestIdx = 0;
let latestTs = 0;
for (let i = 0; i < slice.length; i++) {
  const arr = slice[i].info?.historyT;
  const ts = arr && arr.length ? new Date(arr[arr.length - 1]).getTime() : 0;
  if (ts > latestTs) { latestTs = ts; latestIdx = i; }
}
const labels = chartDataArr[latestIdx]?.labels || [];
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
            value: `${Number(item.now).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE ${arrowColor} (${item.change>=0?'+':''}${item.pct.toFixed(2)}%)\n🛒 최대 매수: ${maxBuy}개`,
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
                `**${c}**\n• 보유: ${q}개\n• 누적매수: ${Number(buyCost).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE\n• 평가액: ${Number(evalPrice).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE\n• 손익: ${profit>=0?`+${Number(profit).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})}`:Number(profit).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE (${yieldPct>=0?'+':''}${yieldPct.toFixed(2)}%)`
              );
            }
            const totalYield = totalBuy > 0 ? ((totalProfit/totalBuy)*100) : 0;
            e.setDescription(detailLines.join('\n\n'));
            e.addFields(
              { name: '총 매수', value: `${Number(totalBuy).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE`, inline: true },
              { name: '총 평가', value: `${Number(totalEval).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE`, inline: true },
              { name: '평가 손익', value: `${totalProfit>=0?`+${Number(totalProfit).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})}`:Number(totalProfit).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE (${totalYield>=0?'+':''}${totalYield.toFixed(2)}%)`, inline: true }
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
      let rawH = (info.history || []).slice(-HISTORY_MAX).reverse();
let rawT = (info.historyT || []).slice(-HISTORY_MAX).reverse();

let seenTimes = new Set();
let h = [];
let ht = [];

for (let i = 0; i < rawH.length; i++) {
  let timeKey = toKSTString(rawT[i]); // 같은 시간대인지 판별
  if (!seenTimes.has(timeKey)) {
    seenTimes.add(timeKey);
    h.push(rawH[i]);
    ht.push(rawT[i]);
  }
}
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
          return `${start+idx+1}. ${emoji} ${Number(p).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE  |  ${toKSTString(timeList[idx])}`;
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
  const rawInput = interaction.options.getString('코인');
  let coin = rawInput.trim();
  if (!coin.endsWith('코인')) coin += '코인';
  let amount = interaction.options.getInteger('수량');
  const coins = await loadJson(coinsPath, {});
  const wallets = await loadJson(walletsPath, {});
  if (!coins[coin] || coins[coin].delistedAt) return interaction.editReply({ content: `❌ 상장 중인 코인만 매수 가능: ${coin}` });
  if (!Number.isFinite(amount) || amount <= 0) return interaction.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

  const price = coins[coin].price;
  const bal = getBE(interaction.user.id);
  const maxBuy = Math.floor(bal / price);
  if (amount > maxBuy) amount = maxBuy;
  if (amount <= 0) return interaction.editReply({ content: `❌ 구매 가능 수량이 없습니다.` });

  const total = Number((price * amount).toFixed(3));
  const fee = 0;
  const needBE = total;
  const afterBal = bal - needBE;

  const userWallet = wallets[interaction.user.id]?.[coin] || 0;
  const afterAmount = userWallet + amount;

  // [1] 예/아니오 확인용 임베드+버튼
  const embed = new EmbedBuilder()
    .setTitle(`🛒 ${coin} ${amount}개 매수 확인`)
    .setDescription(
      `보유 BE: **${bal.toLocaleString()} BE** → **${afterBal.toLocaleString()} BE**
매수 수량: **${amount}개**
개당 가격: **${price.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE**
총 소모: **${total.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE**
매수 후 보유: **${afterAmount}개**
\n매수를 진행할까요?`
    )
    .setColor('#60be8e');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('yes_buy').setLabel('예').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('no_buy').setLabel('아니오').setStyle(ButtonStyle.Danger),
  );
  await interaction.editReply({ embeds: [embed], components: [row] });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 15000,
    filter: btn => btn.user.id === interaction.user.id
  });

  collector.on('collect', async btn => {
    if (btn.customId === 'yes_buy') {
      wallets[interaction.user.id] = wallets[interaction.user.id] || {};
      wallets[interaction.user.id][coin] = (wallets[interaction.user.id][coin] || 0) + amount;
      wallets[interaction.user.id + "_buys"] = wallets[interaction.user.id + "_buys"] || {};
      wallets[interaction.user.id + "_buys"][coin] = Number(((wallets[interaction.user.id + "_buys"][coin] || 0) + (price * amount)).toFixed(3));

      await addBE(interaction.user.id, -needBE, `매수 ${amount} ${coin} (수수료 ${fee} BE 포함)`);
      await saveJson(walletsPath, wallets);

      await addHistory(coins[coin], price);
      await saveJson(coinsPath, coins);

      recordVolume(coin, amount);

      await btn.update({
        embeds: [
          new EmbedBuilder()
            .setTitle(`✅ 매수 완료!`)
            .setDescription(
              `${coin} **${amount}개** 매수 (개당 ${price.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE)\n총 ${total.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE 소모\n잔액: ${afterBal.toLocaleString()} BE`
            )
            .setColor('#60be8e')
        ],
        components: []
      });
    } else {
      await btn.update({
        embeds: [
          new EmbedBuilder().setDescription(`❌ 매수를 취소했습니다.`).setColor('#f24a4a')
        ],
        components: []
      });
    }
  });

  collector.on('end', async () => {
    try { await interaction.editReply({ components: [] }); } catch {}
  });

  return;
}

// 4. 매도
if (sub === '매도') {
  await interaction.deferReply({ ephemeral: true });
  const rawInput = interaction.options.getString('코인');
  let coin = rawInput.trim();
  if (!coin.endsWith('코인')) coin += '코인';
  let amount = interaction.options.getInteger('수량');
  const coins = await loadJson(coinsPath, {});
  const wallets = await loadJson(walletsPath, {});
  if (!coins[coin] || coins[coin].delistedAt) return interaction.editReply({ content: `❌ 상장 중인 코인만 매도 가능: ${coin}` });
  if (!Number.isFinite(amount) || amount <= 0) return interaction.editReply({ content: `❌ 올바른 수량을 입력하세요.` });

  const have = wallets[interaction.user.id]?.[coin] || 0;
  if (amount > have) amount = have;
  if (amount <= 0) return interaction.editReply({ content: `❌ 매도할 보유 코인이 없습니다.` });

  const price = coins[coin].price;
  const gross = Number((price * amount).toFixed(3));
  const fee = Number((gross * 0.3).toFixed(3));
  const net = Number((gross - fee).toFixed(3));
  const afterCoin = have - amount;
  const bal = getBE(interaction.user.id);
  const afterBal = bal + net;

  // 평균 매입가 및 손익 계산
  const userBuys = wallets[interaction.user.id + "_buys"] || {};
  const avgBuyPrice = (userBuys[coin] && have) ? userBuys[coin] / have : price;
  const realizedProfit = net - (avgBuyPrice * amount);

  const embed = new EmbedBuilder()
    .setTitle(`💸 ${coin} ${amount}개 매도 확인`)
    .setDescription(
      `보유: **${have}개** → **${afterCoin}개**
개당 시세: **${price.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE**
총 매도: **${gross.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE**
수수료(30%): **${fee.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE**
실수령: **${net.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE**
매도 후 BE 잔액: **${afterBal.toLocaleString()} BE**
\n매도 실현손익: **${realizedProfit>=0?'+':''}${realizedProfit.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE**
(내 평균 매입가: ${avgBuyPrice.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE)
\n매도를 진행할까요?`
    )
    .setColor('#f2a96a');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('yes_sell').setLabel('예').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('no_sell').setLabel('아니오').setStyle(ButtonStyle.Danger),
  );
  await interaction.editReply({ embeds: [embed], components: [row] });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 15000,
    filter: btn => btn.user.id === interaction.user.id
  });

  collector.on('collect', async btn => {
  if (btn.customId === 'yes_sell') {
    wallets[interaction.user.id][coin] -= amount;
    if (wallets[interaction.user.id][coin] <= 0) delete wallets[interaction.user.id][coin];
    wallets[interaction.user.id + "_buys"] = wallets[interaction.user.id + "_buys"] || {};
    const userBuysMap = wallets[interaction.user.id + "_buys"];
    const currentHaveBeforeSell = have;
    const avgBuyPriceForSell = (userBuysMap[coin] && currentHaveBeforeSell)
      ? Number((userBuysMap[coin] / currentHaveBeforeSell).toFixed(6))
      : price;
    
    const reduceCost = Number((avgBuyPriceForSell * amount).toFixed(3));
    userBuysMap[coin] = Number(((userBuysMap[coin] || 0) - reduceCost).toFixed(3));
    if (userBuysMap[coin] <= 0.0005) delete userBuysMap[coin];
    
    await addBE(interaction.user.id, net, `매도 ${amount} ${coin}`);
    wallets[interaction.user.id + "_realized"] = wallets[interaction.user.id + "_realized"] || {};
    wallets[interaction.user.id + "_realized"][coin] = Number(((wallets[interaction.user.id + "_realized"][coin] || 0) + net).toFixed(3));
    wallets[interaction.user.id + "_realized_profit"] = wallets[interaction.user.id + "_realized_profit"] || {};
    wallets[interaction.user.id + "_realized_profit"][coin] = Number(((wallets[interaction.user.id + "_realized_profit"][coin] || 0) + (net - reduceCost)).toFixed(3));

    await saveJson(walletsPath, wallets);
    await addHistory(coins[coin], coins[coin].price);
    await saveJson(coinsPath, coins);
    recordVolume(coin, amount);

    await btn.update({
      embeds: [
        new EmbedBuilder()
          .setTitle(`✅ 매도 완료!`)
          .setDescription(
            `${coin} **${amount}개** 매도 (개당 ${price.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE)
실수령: ${net.toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE
잔액: ${afterBal.toLocaleString()} BE`
          )
          .setColor('#f2a96a')
      ],
      components: []
    });
  } else {
      await btn.update({
        embeds: [
          new EmbedBuilder().setDescription(`❌ 매도를 취소했습니다.`).setColor('#f24a4a')
        ],
        components: []
      });
    }
  });

  collector.on('end', async () => {
    try { await interaction.editReply({ components: [] }); } catch {}
  });

  return;
}

    // 5. 갓비트 내코인
   if (sub === '내코인') {
  await interaction.deferReply({ ephemeral: true });
  const coins = await loadJson(coinsPath, {});
  const wallets = await loadJson(walletsPath, {});
  const userW = wallets[interaction.user.id] || {};
  const userBuys = wallets[interaction.user.id + "_buys"] || {};

  function getSortedMyCoins(_coins = coins, _userW = userW, _userBuys = userBuys, showDelisted = false) {
    return Object.entries(_userW)
      .map(([c, q]) => {
        if (!_coins[c]) return null;
        if (!showDelisted && _coins[c].delistedAt) return null;
        if (showDelisted && !_coins[c].delistedAt) return null;
        const nowPrice = _coins[c]?.price || 0;
        const buyCost = _userBuys[c] || 0;
        const evalPrice = nowPrice * q;
        const profit = evalPrice - buyCost;
        const yieldPct = buyCost > 0 ? ((profit / buyCost) * 100) : 0;
        return {
          name: c, q, nowPrice, buyCost, evalPrice, profit, yieldPct,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.yieldPct - a.yieldPct);
  }

  // 투자 규모
function getAmountLabel(val) {
  if (val < 1) return " [투자 규모: 극소량]";
  if (val < 10) return " [투자 규모: 소량]";
  if (val < 100) return " [투자 규모: 적은편]";
  if (val < 1_000) return " [투자 규모: 보통 이하]";
  if (val < 10_000) return " [투자 규모: 보통]";
  if (val < 100_000) return " [투자 규모: 조금 많은 편]";
  if (val < 1_000_000) return " [투자 규모: 많은 편]";
  if (val < 10_000_000) return " [투자 규모: 상당히 많은 편]";
  if (val < 100_000_000) return " [투자 규모: 매우 많은 편]";
  if (val < 1_000_000_000) return " [투자 규모: 거대 규모]";
  if (val < 10_000_000_000) return " [투자 규모: 초거대 규모]";
  return " [투자 규모: 천문학적 규모]";
}

     // 한줄평 생성
  function getOneLineReview(totalYield, totalEval) {
  let scale = getAmountLabel(totalEval);
     // 초마이너스 구간 (10~50% 단위, -2000%까지)
  if (totalYield <= -2000) return `🕳️ "이쯤 되면… 코인판 흑역사. 지갑도 마음도 비워짐"${scale}`;
  if (totalYield <= -1950) return `🌑 내 인생이 여기서 끝날 줄은 몰랐다${scale}`;
  if (totalYield <= -1900) return `🪦 이 정도면 계좌장례식 가능${scale}`;
  if (totalYield <= -1850) return `⚰️ 존버하다가 계좌 소멸됨${scale}`;
  if (totalYield <= -1800) return `🫥 사람 구실이 힘들다${scale}`;
  if (totalYield <= -1750) return `😶‍🌫️ 감정 없는 상태, 그냥 텅빈 느낌${scale}`;
  if (totalYield <= -1700) return `💀 남은 건 통장 캡처뿐${scale}`;
  if (totalYield <= -1650) return `🫗 돈도 정신도 다 증발${scale}`;
  if (totalYield <= -1600) return `🌊 실화냐 이 손실, 바닥이 어딘지 모름${scale}`;
  if (totalYield <= -1550) return `🥀 친구한테 말도 못함${scale}`;
  if (totalYield <= -1500) return `🧟 "살아있는 좀비" 상태${scale}`;
  if (totalYield <= -1450) return `😩 그냥 웃음만 남음${scale}`;
  if (totalYield <= -1400) return `🙃 계좌 들여다보는 게 무섭다${scale}`;
  if (totalYield <= -1350) return `😭 현실 부정, 근데 현실${scale}`;
  if (totalYield <= -1300) return `😫 반등? 포기함${scale}`;
  if (totalYield <= -1250) return `😖 코인판 입문 추천 못함${scale}`;
  if (totalYield <= -1200) return `🫠 마음 비우고 새출발 준비${scale}`;
  if (totalYield <= -1150) return `🥶 하루에도 한숨이 백 번${scale}`;
  if (totalYield <= -1100) return `🥵 회복 불가. 계좌 인증 박제감${scale}`;
  if (totalYield <= -1050) return `💸 원금은커녕 생활비까지 날아감${scale}`;
  if (totalYield <= -1000) return `💀 "이쯤이면 코인판의 바이블" 계좌 상태${scale}`;
  if (totalYield <= -950) return `🪦 내가 뭘 잘못했는지 생각 중${scale}`;
  if (totalYield <= -900) return `⚰️ 존버는 전설이 아니라 전설의 희생양${scale}`;
  if (totalYield <= -850) return `🌚 계좌를 끊임없이 내려다보는 중${scale}`;
  if (totalYield <= -800) return `🥀 매수·매도 버튼 눌러도 의미 없음${scale}`;
  if (totalYield <= -750) return `😔 웃긴 건 익숙해지고 있다는 것${scale}`;
  if (totalYield <= -700) return `🧟 이미 무감각${scale}`;
  if (totalYield <= -650) return `😮‍💨 "반등? 그런 건 없었다" 체감 중${scale}`;
  if (totalYield <= -600) return `🫥 단념 끝에 체념${scale}`;
  if (totalYield <= -550) return `🥲 친구들, 내게 코인 묻지 마${scale}`;
  if (totalYield <= -500) return `💀 계좌가 사망했습니다. 이건 거의 도박의 신.${scale}`;
  if (totalYield <= -490) return `🪦 "이쯤이면 손절도 못함, 남은 건 스크린샷 뿐" ${scale}`;
  if (totalYield <= -480) return `🧊 계좌 냉동보관 중. 가족에겐 비밀로 하세요.${scale}`;
  if (totalYield <= -470) return `😵‍💫 이 구간엔 설명이 필요 없다...${scale}`;
  if (totalYield <= -460) return `🥀 "손실의 늪에서 허우적" 인증 가능${scale}`;
  if (totalYield <= -450) return `🫥 반등? 그런 거 없음. 그냥 남탓이라도 하자${scale}`;
  if (totalYield <= -440) return `🥵 포기하면 편해진다${scale}`;
  if (totalYield <= -430) return `💸 마이너스, 다음 생에 만나요${scale}`;
  if (totalYield <= -420) return `🧟‍♂️ 이 구간엔 살아있는 유저가 드뭄${scale}`;
  if (totalYield <= -410) return `🌊 바닥이 어딘지 알 수 없다${scale}`;
  if (totalYield <= -400) return `🔪 반성문 각, 인생은 실전이다${scale}`;
  if (totalYield <= -390) return `🥶 계좌를 잠시 꺼두셔도 좋습니다${scale}`;
  if (totalYield <= -380) return `😨 "내가 이럴려고 코인했나" 실감 중${scale}`;
  if (totalYield <= -370) return `😵 흔들리지 않는 편안함, 계좌는 이미 바닥${scale}`;
  if (totalYield <= -360) return `😖 계속 내려가도 실감이 안 남${scale}`;
  if (totalYield <= -350) return `😭 반등 희망 소멸, 단념의 미학${scale}`;
  if (totalYield <= -340) return `🥲 코인=복불복 체감 중${scale}`;
  if (totalYield <= -330) return `😑 존버는 이제 무의미${scale}`;
  if (totalYield <= -320) return `😫 물렸다는 말로도 부족${scale}`;
  if (totalYield <= -310) return `😣 손실=일상, 반전은 없다${scale}`;
  if (totalYield <= -300) return `😔 마이너스가 내 친구, 이쯤이면 멘탈도 갔음${scale}`;
  if (totalYield <= -290) return `🥺 오늘도 출금 버튼만 바라본다${scale}`;
  if (totalYield <= -280) return `🥶 계좌 보며 심호흡 중${scale}`;
  if (totalYield <= -270) return `😩 남 일 같지 않은 패배감${scale}`;
  if (totalYield <= -260) return `🥴 돈 잃고 경험 얻음${scale}`;
  if (totalYield <= -250) return `🫠 그래도 안 접는다. 코인판의 끈질김${scale}`;
  if (totalYield <= -240) return `🥲 복구? 일단 희망은 놓지 말자${scale}`;
  if (totalYield <= -230) return `😑 현실 도피가 필요함${scale}`;
  if (totalYield <= -220) return `🫥 애써 웃고 있지만 속은 타들어감${scale}`;
  if (totalYield <= -210) return `🥹 계좌가 울고 있다${scale}`;
  if (totalYield <= -200) return `😱 "계좌 인증 박제감" 여기 있습니다${scale}`;
  if (totalYield <= -190) return `😨 마이너스가 익숙해지는 구간${scale}`;
  if (totalYield <= -180) return `😭 아직도 덜 빠졌다${scale}`;
  if (totalYield <= -170) return `😓 체념했지만 미련이 남음${scale}`;
  if (totalYield <= -160) return `😩 이제 뭐라도 오르면 팔 듯${scale}`;
  if (totalYield <= -150) return `🌊 물려도 너무 물렸습니다${scale}`;
  if (totalYield <= -140) return `😑 주변에서 "이제 팔지" 소리 들림${scale}`;
  if (totalYield <= -130) return `🥺 잠시만 기다려달라 빌고 있음${scale}`;
  if (totalYield <= -120) return `🧟‍♂️ 계좌 좀비 모드, 아무 감정도 없음${scale}`;
  if (totalYield <= -110) return `☠️ 손절각? 이미 타이밍 놓침${scale}`;
  if (totalYield <= -100) return `☠️ 마이너스 100%. 계좌 RIP${scale}`;
  if (totalYield <= -90)  return `🥶 내일은 오를까? 소소한 희망${scale}`;
  if (totalYield <= -80)  return `💸 "이쯤이면 충분히 배웠다" 각성 중${scale}`;
  if (totalYield <= -70)  return `🥶 입금력만 믿고 또 버티는 중${scale}`;
  if (totalYield <= -60)  return `😨 희망고문, 현실 부정${scale}`;
  if (totalYield <= -50)  return `😭 존버 끝에 눈물. 다음부턴 다르게${scale}`;
  if (totalYield <= -40)  return `😣 살짝만 오르면 팔아야지 생각 중${scale}`;
  if (totalYield <= -30)  return `🥲 손실 익숙, 담엔 잘해보자${scale}`;
  if (totalYield <= -20)  return `😬 반등 나오면 바로 손절${scale}`;
  if (totalYield <= -10)  return `😑 미세한 손실도 은근 거슬림${scale}`;
  if (totalYield < 0)     return `😶 아직 끝나진 않았다, 혹시 모름${scale}`;

   // 0~20%
  if (totalYield === 0)    return `⚪️ 이게 바로 제로의 마법${scale}`;
  if (totalYield < 2)      return `🥱 평온함 그 자체. 시간만 씀${scale}`;
  if (totalYield < 5)      return `🪙 실익 미미, 교통비 커버?${scale}`;
  if (totalYield < 10)     return `🍞 잔잔한 이득, 빵 한 개${scale}`;
  if (totalYield < 15)     return `🥨 차라리 예금 넣지… 싶은 수익${scale}`;
  if (totalYield < 20)     return `🧃 이 정도면 그냥 쥬스값${scale}`;

  // 20~100%
  if (totalYield < 30)     return `😏 슬슬 본전 회복, 입꼬리 올라감${scale}`;
  if (totalYield < 40)     return `😀 티 안 나게 플러스, 남 모르게 웃음${scale}`;
  if (totalYield < 50)     return `😋 "이게 코인이지" 체감 시작${scale}`;
  if (totalYield < 60)     return `😎 약간 여유생긴 느낌${scale}`;
  if (totalYield < 70)     return `😁 수익률 보고 깜짝, 기분 좋음${scale}`;
  if (totalYield < 80)     return `🤑 친구한테 카톡 박제 가능${scale}`;
  if (totalYield < 90)     return `😗 이제는 퇴근길이 가볍다${scale}`;
  if (totalYield < 100)    return `🦾 "내가 바로 존버러" 라고 혼잣말${scale}`;

  // 100~200%
  if (totalYield < 120)    return `🚗 "중고차 한 대" 구간. 돈 맛봄${scale}`;
  if (totalYield < 140)    return `🏅 이제 남한테 보여줄만함${scale}`;
  if (totalYield < 160)    return `🥳 술자리에서 꺼내는 내역${scale}`;
  if (totalYield < 180)    return `🥂 오늘 저녁 메뉴는 소고기${scale}`;
  if (totalYield < 200)    return `🎉 이쯤되면 진짜 감 잡은 듯${scale}`;

  // 200~500%
  if (totalYield < 250)    return `🦁 코인계에서 "형" 소리 듣는 구간${scale}`;
  if (totalYield < 300)    return `🏆 이제야 진짜 수익 체감${scale}`;
  if (totalYield < 350)    return `💸 월급 부럽지 않은 캐시플로우${scale}`;
  if (totalYield < 400)    return `🥇 투자 밈 직접 만듦${scale}`;
  if (totalYield < 450)    return `🌈 무슨 코인만 골라도 상승${scale}`;
  if (totalYield < 500)    return `🔥 서버에서 "이분 계좌 뭐냐" 듣는 구간${scale}`;

  // 500~1000%
  if (totalYield < 600)    return `💰 친구들 코인 상담하러 옴${scale}`;
  if (totalYield < 700)    return `🎩 코인판 매니저급 포스${scale}`;
  if (totalYield < 800)    return `👑 서버에서 "한수 가르쳐주세요" 듣는 구간${scale}`;
  if (totalYield < 900)    return `🦄 인생 역전의 길목${scale}`;
  if (totalYield < 1000)   return `🛸 "나 이정도인데" 인증 가능${scale}`;

  // 1000~2000%
  if (totalYield < 1100)   return `🚀 천프로 실화냐${scale}`;
  if (totalYield < 1200)   return `🦾 이 구간은 아무나 못 옴${scale}`;
  if (totalYield < 1300)   return `🌌 계좌만 보면 미소가 절로${scale}`;
  if (totalYield < 1400)   return `💎 손절이 뭔가요? 모름${scale}`;
  if (totalYield < 1500)   return `👽 돈 들어오는 소리 들림${scale}`;
  if (totalYield < 1600)   return `💵 이제 일 그만두고 싶음${scale}`;
  if (totalYield < 1700)   return `🏖️ 해변에서 한량처럼 살고 싶다${scale}`;
  if (totalYield < 1800)   return `👑 서버계좌 지존 인증${scale}`;
  if (totalYield < 1900)   return `🏆 람보르기니 실구매 가능?${scale}`;
  if (totalYield < 2000)   return `🎲 코인판 신급으로 승격${scale}`;

  // 2000% 이상
  if (totalYield < 5000)   return `🌋 이쯤되면… 서버의 신화${scale}`;
  if (totalYield < 10000)  return `🪐 코인계의 금수저, 우주에서 통하는 계좌${scale}`;
  return `🌌 우주의 끝, 인간의 영역을 벗어남${scale}`;
}
    

  function renderEmbed(page, showDelisted) {
    let allMyCoins = getSortedMyCoins(coins, userW, userBuys, showDelisted);
    const PAGE_SIZE = 5;
    let totalPages = Math.max(1, Math.ceil(allMyCoins.length / PAGE_SIZE));
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;
    const slice = allMyCoins.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const embed = new EmbedBuilder()
      .setTitle(showDelisted ? '🚫 폐지된 내 코인 목록' : '💼 내 코인 평가/수익 현황')
      .setColor(showDelisted ? '#888888' : '#2ecc71')
      .setTimestamp()
      .setImage(showDelisted
        ? undefined
        : 'https://media.discordapp.net/attachments/1388728993787940914/1392703440240513075/Image_fx_1.jpg?ex=68707fa7&is=686f2e27&hm=735553683e768da9e622d19ac6398acd797aa1386bff306b6a0af94f37557601&=&format=webp'
      );

    if (!slice.length) {
      embed.setDescription(showDelisted ? '폐지된 코인이 없습니다.' : '보유 코인이 없습니다.');
    } else {
      let detailLines = [];
      let totalEval = 0, totalBuy = 0, totalProfit = 0;
      slice.forEach((c) => {
        totalEval += c.evalPrice;
        totalBuy += c.buyCost;
        totalProfit += c.profit;
        // 손익 이모지
        let profitEmoji = '⏺️';
        if (c.profit > 0) profitEmoji = '🔺';
        else if (c.profit < 0) profitEmoji = '🔻';
        // 수익률 컬러 이모지
        let yieldColor = '⚪️';
        if (c.yieldPct >= 10) yieldColor = '🟢';
        else if (c.yieldPct <= -10) yieldColor = '🔴';

        detailLines.push(
          `${profitEmoji} **${c.name}** (${yieldColor}${c.yieldPct>=0?'+':''}${c.yieldPct.toFixed(2)}%)
보유: \`${c.q}\`개 ｜ 누적매수: \`${Number(c.buyCost).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE\`
${showDelisted
  ? `폐지 시세: \`${Number(c.nowPrice).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE\`\n손익: \`${c.profit>=0?'+':''}${Number(c.profit).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE\`\n폐지일: ${coins[c.name]?.delistedAt ? toKSTString(coins[c.name].delistedAt) : '-'}`
  : `평가액: \`${Number(c.evalPrice).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE\`\n손익: \`${c.profit>=0?'+':''}${Number(c.profit).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE\``
}`
        );
      });
      // 전체 합산
      const totalYield = totalBuy > 0 ? ((totalProfit/totalBuy)*100) : 0;
      embed.setDescription(detailLines.join('\n\n'));
      embed.addFields(
        { name: '💸 총 매수', value: `${Number(totalBuy).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE`, inline: true },
        { name: showDelisted ? '폐지 시 평가' : '🏦 총 평가', value: `${Number(totalEval).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE`, inline: true },
        { 
          name: `${totalProfit > 0 ? '📈' : totalProfit < 0 ? '📉' : '🎯'} 손익`, 
          value: `${totalProfit>=0?'+':''}${Number(totalProfit).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} BE (${totalYield>=0?'+':''}${totalYield.toFixed(2)}%)`, 
          inline: true 
        }
      );
      if (!showDelisted) {
        // 하단에 한줄평(폐지모드에선 X)
        embed.addFields({
          name: '💬 투자 한줄평',
          value: getOneLineReview(totalYield, totalEval),
          inline: false
        });
      }
    }
    embed.setFooter({ text: `페이지 ${page+1}/${Math.max(1, Math.ceil(getSortedMyCoins(coins, userW, userBuys, showDelisted).length / 5))}` });
    return embed;
  }

  let page = 0;
  let showDelisted = false;

  function getTotalPages() {
    return Math.max(1, Math.ceil(getSortedMyCoins(coins, userW, userBuys, showDelisted).length / 5));
  }

  function makeNavRow() {
    const totalPages = getTotalPages();
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('◀️ 이전')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('next')
        .setLabel('▶️ 다음')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId('refresh_mycoin')
        .setLabel('🔄 새로고침')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('toggle_delisted')
        .setLabel(showDelisted ? '보유 코인 보기' : '폐지된 코인 보기')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  await interaction.editReply({
    embeds: [await renderEmbed(page, showDelisted)],
    components: [makeNavRow()]
  });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 600_000,
    filter: btn => btn.user.id === interaction.user.id && ['prev', 'next', 'refresh_mycoin', 'toggle_delisted'].includes(btn.customId)
  });

  collector.on('collect', async btn => {
    await btn.deferUpdate();
    if (btn.customId === 'refresh_mycoin') {
      // 그냥 다시 렌더 (최신 데이터 로드 원하면 이 부분에서 재로딩)
    }
    if (btn.customId === 'prev') page = Math.max(0, page - 1);
    if (btn.customId === 'next') page = Math.min(getTotalPages() - 1, page + 1);
    if (btn.customId === 'toggle_delisted') {
      showDelisted = !showDelisted;
      page = 0;
    }
    await interaction.editReply({
      embeds: [await renderEmbed(page, showDelisted)],
      components: [makeNavRow()]
    });
  });

  collector.on('end', async () => {
    try { await interaction.editReply({ components: [] }); } catch {}
  });

  return;
}



    // 6. 순위
    if (sub === '순위') {
      await interaction.deferReply({ ephemeral: true });

      const coins = await loadJson(coinsPath, {});
      const wallets = await loadJson(walletsPath, {});

      let realized = {};
      let profitMap = {};
      let revenueMap = {};
      for (const uid in wallets) {
      if (uid.endsWith("_realized_profit")) {
      profitMap[uid.replace("_realized_profit", "")] = Object.values(wallets[uid] || {}).reduce((a, b) => a + b, 0);
      } else if (uid.endsWith("_realized")) {
      revenueMap[uid.replace("_realized", "")] = Object.values(wallets[uid] || {}).reduce((a, b) => a + b, 0);
    }
  }
realized = Object.keys(profitMap).length ? profitMap : revenueMap;

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
        .setTitle(Object.keys(profitMap).length ? '💰 실현 수익(매도 차익) TOP 20' : '💰 실현 매출(입금액) TOP 20')
        .setColor('#ffcc00')
        .setDescription(
          realizedRank.length
            ? realizedRank.map(([uid, val], i) =>
                `**${i+1}. <@${uid}>**  \`${Number(val).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} 파랑 정수\``).join('\n')
            : '데이터 없음'
        )
        .setFooter({ text: '실현수익: 코인 매도를 통한 누적 손익 합산' });

      const holdingsEmbed = new EmbedBuilder()
        .setTitle('🏦 코인 평가자산 TOP 20')
        .setColor('#33ccff')
        .setDescription(
          holdingsRank.length
            ? holdingsRank.map(([uid, val], i) =>
                `**${i+1}. <@${uid}>**  \`${Number(val).toLocaleString(undefined, {minimumFractionDigits:3, maximumFractionDigits:3})} 파랑 정수\``).join('\n')
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
