const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextInputBuilder,
  ModalBuilder,
  TextInputStyle
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const {
  RODS, FLOATS, BAITS, TIMES, SCENES,
  getSceneURL, getIconURL
} = require("../embeds/fishing-images.js");
const { addBE, getBE } = require("./be-util.js");

const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const FISH_DB = path.join(dataDir, "fishing.json");

const QUEST_IMAGE_URL = "https://media.discordapp.net/attachments/1407939188548042762/1411520802121056296/44024f6e8e13d438.png?ex=68b4f4b0&is=68b3a330&hm=6646099a323e2d994233e758789f0736bab596ad22f68bdaf0786b87c608f990&=&format=webp&quality=lossless&width=1829&height=1029";
const AQUARIUM_BANNER_URL = "https://media.discordapp.net/attachments/1407939188548042762/1411629100828856384/-_.png?ex=68b5598c&is=68b4080c&hm=9bd3b3ec49553e5635605aff5fc2de5671926662af9655bb107e5a8b999fbd69&=&format=webp&quality=lossless&width=1829&height=1029";

const FISHING_LIMIT_SECONDS = 120;
const FIGHT_IDLE_TIMEOUT = 20;
const FIGHT_TOTAL_TIMEOUT = 90;
const SAFE_TENSION_MIN = 30;
const SAFE_TENSION_MAX = 70;
const SELL_PRICE_MULT = 0.35;
const QUEST_REWARD_MULT = 0.5;

const RARITY = ["노말","레어","유니크","레전드","에픽","언노운"];
const TIER_ORDER = ["브론즈","실버","골드","플래티넘","다이아","마스터","그랜드마스터","챌린저"];
const TIER_CUTOFF = {
  "브론즈": 0, "실버": 500, "골드": 1500, "플래티넘": 4000,
  "다이아": 10000, "마스터": 25000, "그랜드마스터": 75000, "챌린저": 145000
};

const RARITY_COLOR = {
  "노말":   0xFFFFFF, // ⚪
  "레어":   0x3B82F6, // 🔵
  "유니크": 0xF59E0B, // 🟡
  "레전드": 0xA855F7, // 🟣
  "에픽":   0xEF4444, // 🔴
  "언노운": 0x000000  // ⚫
};
const colorOf = (rar) => RARITY_COLOR[rar] ?? 0x66ccff;

const GEAR_COLOR = {
  "나무 낚싯대":   RARITY_COLOR["노말"],
  "강철 낚싯대":   RARITY_COLOR["레어"],
  "금 낚싯대":     RARITY_COLOR["유니크"],
  "다이아 낚싯대": RARITY_COLOR["레전드"],
  "전설의 낚싯대": RARITY_COLOR["에픽"],
  "동 찌":  RARITY_COLOR["노말"],
  "은 찌":    RARITY_COLOR["레어"],
  "금 찌":    RARITY_COLOR["유니크"],
  "다이아 찌": RARITY_COLOR["레전드"],
  "지렁이 미끼":       RARITY_COLOR["노말"],
  "새우 미끼":         RARITY_COLOR["레어"],
  "빛나는 젤리 미끼": RARITY_COLOR["유니크"],
};
const gearColorOf = (name) => GEAR_COLOR[name] ?? 0x88ddff;

// === 등급 예측 메시지 ===
const RARITY_HINT_LINES = {
  "노말":   ["흔한", "익숙한"],
  "레어":   ["엥간한", "쓸만한"],
  "유니크": ["제법 괜찮은", "적당한"],
  "레전드": ["야무진", "범상치 않은"],
  "에픽":   ["까리한", "상당한"],
  "언노운": ["이건 말이 안됩니다.", "이건 잡기 어려울 것 같습니다."]
};

function rarityCountsOf(u){
  const counts = Object.fromEntries(RARITY.map(r=>[r,0]));
  const sc = u?.stats?.speciesCount || {};
  for (const [name, c] of Object.entries(sc)) {
    const rar = RARITY_OF?.[name];
    if (rar) counts[rar] = (counts[rar]||0) + (c||0);
  }
  return counts;
}

function pickAdjacentRarity(r){
  const i = RARITY.indexOf(r);
  if (i <= 0) return RARITY[1] || r;
  if (i >= RARITY.length-1) return RARITY[RARITY.length-2] || r;
  return Math.random() < 0.5 ? RARITY[i-1] : RARITY[i+1];
}

/**
 * 입질 시 등급 어림짐작 (가끔만 뜸)
 * - 발동확률: floor(해당 등급 누적/10) * 0.5% (최대 80%)
 * - 오차율: 브론즈 50%에서 티어 단계당 -5% (챌린저 15%)
 * - 틀리면 인접 등급으로 빗나감
 */
function maybeRarityHint(u, target){
  try {
    if (!u || !target || target.kind !== "fish") return null;

    const counts = rarityCountsOf(u);
    const caughtCnt = counts[target.rarity] || 0;

    const pPredict = Math.min(0.8, 0.005 * Math.floor(caughtCnt / 10)); // 0~0.8
    if (Math.random() >= pPredict) return null;

    const tierIdx = Math.max(0, TIER_ORDER.indexOf(u.tier || "브론즈")); // 0~7
    const errorRate = Math.max(0, 0.50 - 0.05 * tierIdx); // 50% → 15%

    const correct = Math.random() >= errorRate;
    const guess = correct ? target.rarity : pickAdjacentRarity(target.rarity);

    const pool = RARITY_HINT_LINES[guess] || [];
    if (guess === "언노운") {
      const line = pool[Math.floor(Math.random()*pool.length)] || "이건 잡기 어려울 것 같습니다.";
      return `${line} 릴을 감거나 풀며 상황을 살펴보세요.`;
    } else {
      const adj  = pool[Math.floor(Math.random()*pool.length)] || "정체를 알 수 없는";
      return `${adj} 무언가가 걸린 듯한 기분입니다. 릴을 감거나 풀며 상황을 살펴보세요.`;
    }
  } catch {
    return null;
  }
}


// --- 시간대 보정 ---
const TIME_BUFFS = {
  "낮":   { biteSpeed: -2, dmg: 0, resistReduce: 0, rarityBias: 0 },
  "노을": { biteSpeed: -1, dmg: 0, resistReduce: 0, rarityBias: 1 },
  "밤":   { biteSpeed:  0, dmg: 0, resistReduce: 0, rarityBias: 2 },
};
function getTimeBuff(band){ return TIME_BUFFS[band] || { biteSpeed:0, dmg:0, resistReduce:0, rarityBias:0 }; }
function timeBuffField(band){
  const b = getTimeBuff(band);
  if (!b.biteSpeed && !b.dmg && !b.resistReduce && !b.rarityBias) return null;
  return { name:"시간대 보정", value:`(${band}) ${formatBuff(b)}`, inline:false };
}


// --- 티어 보정(소폭 상향) ---
const TIER_BUFFS = {
  "브론즈":       { biteSpeed:  0, dmg: 0, resistReduce: 0, rarityBias: 0 },
  "실버":         { biteSpeed: -1, dmg: 1, resistReduce: 1, rarityBias: 1 },
  "골드":         { biteSpeed: -2, dmg: 1, resistReduce: 1, rarityBias: 2 },
  "플래티넘":     { biteSpeed: -3, dmg: 2, resistReduce: 2, rarityBias: 3 },
  "다이아":       { biteSpeed: -4, dmg: 3, resistReduce: 3, rarityBias: 4 },
  "마스터":       { biteSpeed: -5, dmg: 4, resistReduce: 4, rarityBias: 5 },
  "그랜드마스터": { biteSpeed: -6, dmg: 5, resistReduce: 5, rarityBias: 6 },
  "챌린저":       { biteSpeed: -8, dmg: 6, resistReduce: 6, rarityBias: 8 },
};
function getTierBuff(tier){ return TIER_BUFFS[tier] || TIER_BUFFS["브론즈"]; }
function formatBuff(b){
  const parts=[];
  if (b.biteSpeed)     parts.push(`입질시간 ${b.biteSpeed}s`);
  if (b.dmg)           parts.push(`제압력 +${b.dmg}`);
  if (b.resistReduce)  parts.push(`저항 감소 +${b.resistReduce}`);
  if (b.rarityBias)    parts.push(`희귀도 +${b.rarityBias}`);
  return parts.join(", ");
}
function buffField(u){
  const b=getTierBuff(u.tier);
  if (!b.biteSpeed && !b.dmg && !b.resistReduce && !b.rarityBias) return null;
  return { name:"티어 보정", value:`(${u.tier}) ${formatBuff(b)}`, inline:false };
}
function signed(n){ return (n>=0?`+${n}`:`${n}`); }
function statLine(label, base, buff, unit='', basePrefix=''){
  return `${label} ${basePrefix}${base}${unit} (${signed(buff||0)}${unit})`;
}
function sumBiteSpeed(u){
  const r  = ROD_SPECS[u.equip.rod]?.biteSpeed    || 0;
  const f  = FLOAT_SPECS[u.equip.float]?.biteSpeed || 0;
  const b  = BAIT_SPECS[u.equip.bait]?.biteSpeed   || 0;
  const t  = getTierBuff(u.tier).biteSpeed         || 0;
  const tm = getTimeBuff(currentTimeBand()).biteSpeed || 0;
  return r + f + b + t + tm; // ← 시간대 버프 포함
}
function effectiveDmg(u){
  return (ROD_SPECS[u.equip.rod]?.dmg || 6) + (getTierBuff(u.tier).dmg||0);
}
function effectiveResistReduce(u){
  return (ROD_SPECS[u.equip.rod]?.resistReduce||0)
        + (FLOAT_SPECS[u.equip.float]?.resistReduce||0)
        + (getTierBuff(u.tier).resistReduce||0);
}
function effectiveRarityBias(u){
  const r=(ROD_SPECS[u.equip.rod]?.rarityBias||0);
  const f=(FLOAT_SPECS[u.equip.float]?.rarityBias||0);
  const b=(BAIT_SPECS[u.equip.bait]?.rarityBias||0);
  const t=(getTierBuff(u.tier).rarityBias||0);
  return r+f+b+t;
}

const REWARDS_TIER = {
  "실버":   [{type:"rod",name:"강철 낚싯대"}, {type:"coin",amt:1000}],
  "골드":   [{type:"rod",name:"금 낚싯대"}, {type:"coin",amt:50000}, {type:"be",amt:100000}],
  "플래티넘":[{type:"bait",name:"빛나는 젤리 미끼",qty:20},{type:"coin",amt:100000},{type:"be",amt:500000}],
  "다이아": [{type:"float",name:"다이아 찌"}, {type:"coin",amt:300000}, {type:"be",amt:1000000}],
  "마스터": [{type:"rod",name:"다이아 낚싯대"}, {type:"coin",amt:500000}, {type:"be",amt:3000000}],
  "그랜드마스터":[{type:"coin",amt:1000000},{type:"be",amt:5000000}],
  "챌린저":[{type:"rod",name:"다이아 낚싯대"},{type:"float",name:"다이아 찌"},{type:"coin",amt:3000000},{type:"be",amt:10000000}]
};
const REWARDS_CAUGHT = {
  100:[{type:"bait",name:"새우 미끼",qty:20},{type:"coin",amt:1000}],
  200:[{type:"bait",name:"빛나는 젤리 미끼",qty:20},{type:"coin",amt:10000}],
  500:[{type:"float",name:"금 찌"},{type:"coin",amt:50000}],
  1000:[{type:"rod",name:"금 낚싯대"},{type:"coin",amt:100000}],
  2000:[{type:"float",name:"금 찌"},{type:"coin",amt:200000},{type:"be",amt:2000000}],
  5000:[{type:"float",name:"다이아 찌"},{type:"coin",amt:500000}],
  10000:[{type:"coin",amt:1000000},{type:"be",amt:5000000}]
};
const REWARDS_SIZE = {
  100:[{type:"bait",name:"지렁이 미끼",qty:20},{type:"coin",amt:100}],
  200:[{type:"bait",name:"새우 미끼",qty:20},{type:"coin",amt:500},{type:"be",amt:50000}],
  500:[{type:"float",name:"은 찌"},{type:"coin",amt:50000},{type:"be",amt:100000}],
  1000:[{type:"float",name:"다이아 찌"},{type:"coin",amt:100000},{type:"be",amt:1000000}]
};
const SPECIES_MILESTONES = {
  "노말": {
    1:   [{ type:"coin", amt:100 }],
    5:   [{ type:"be",   amt:50000 }],
    10:  [{ type:"bait", name:"지렁이 미끼" }],
    20:  [{ type:"coin", amt:5000 }],
    30:  [{ type:"coin", amt:10000 }],
    40:  [{ type:"coin", amt:20000 }],
    50:  [{ type:"rod",  name:"금 낚싯대" }, { type:"chest", qty:5, name:"까리한 보물상자" }],
    60:  [{ type:"coin", amt:50000 }],
    70:  [{ type:"coin", amt:60000 }],
    80:  [{ type:"coin", amt:70000 }],
    90:  [{ type:"coin", amt:80000 }],
    100: [{ type:"float",name:"은 찌" }, { type:"key", qty:5, name:"까리한 열쇠" }]
  },
  "레어": {
    1:   [{ type:"coin", amt:500 }],
    5:   [{ type:"be",   amt:100000 }],
    10:  [{ type:"bait", name:"지렁이 미끼" }],
    20:  [{ type:"coin", amt:10000 }],
    30:  [{ type:"coin", amt:30000 }],
    40:  [{ type:"coin", amt:50000 }],
    50:  [{ type:"rod",  name:"금 낚싯대" }, { type:"chest", qty:10, name:"까리한 보물상자" }],
    60:  [{ type:"coin", amt:60000 }],
    70:  [{ type:"coin", amt:70000 }],
    80:  [{ type:"coin", amt:80000 }],
    90:  [{ type:"coin", amt:90000 }],
    100: [{ type:"float",name:"금 찌" }, { type:"key", qty:10, name:"까리한 열쇠" }]
  },
  "유니크": {
    1:   [{ type:"coin", amt:5000 }],
    5:   [{ type:"be",   amt:300000 }],
    10:  [{ type:"bait", name:"새우 미끼" }],
    20:  [{ type:"coin", amt:100000 }],
    30:  [{ type:"coin", amt:300000 }],
    40:  [{ type:"be", amt:400000 }],
    50:  [{ type:"rod",  name:"다이아 낚싯대" }],
    100: [{ type:"float",name:"다이아 찌" }]
  },
  "레전드": {
    1:   [{ type:"coin", amt:50000 }],
    5:   [{ type:"be",   amt:500000 }],
    10:  [{ type:"bait", name:"빛나는 젤리 미끼" }],
    30:  [{ type:"coin", amt:500000 }],
    50:  [{ type:"rod",  name:"다이아 낚싯대" }],
    100: [{ type:"float",name:"금 찌" }, { type:"float", name:"다이아 찌" }]
  },
  "에픽": {
    1:   [{ type:"coin", amt:200000 }],
    5:   [{ type:"be",   amt:2000000 }],
    10:  [
      { type:"bait", name:"지렁이 미끼" },
      { type:"bait", name:"새우 미끼" },
      { type:"bait", name:"빛나는 젤리 미끼" }
    ],
    30:  [{ type:"coin", amt:1000000 }],
    50:  [{ type:"rod",  name:"금 낚싯대" }, { type:"rod", name:"다이아 낚싯대" }],
    100: [{ type:"rod",  name:"전설의 낚싯대" }]
  },
  "언노운": {
    1:   [{ type:"coin", amt:500000 }],
    5:   [{ type:"be",   amt:500000 }],
    10:   [{ type:"be",   amt:1000000 }],
    30:  [{ type:"coin", amt:500000 }],
    50:  [{ type:"be",   amt:500000 }],
    100: [{ type:"coin",   amt:1000000 }]
  }
};

const RARITY_EMOJIS = {
  "노말": "⚪",
  "레어": "🔵",
  "유니크": "🟡",
  "레전드": "🟣",
  "에픽": "🔴",
  "언노운": "⚫",
  "잡동사니": "🪣"
};

const ROD_SPECS = {
  "나무 낚싯대":   { maxDur: 50,  biteSpeed: -4,  dmg: 6,  resistReduce: 0,  rarityBias: 0 },
  "강철 낚싯대":   { maxDur: 120,  biteSpeed: -8,  dmg: 9,  resistReduce: 3,  rarityBias: 2 },
  "금 낚싯대":     { maxDur: 250, biteSpeed: -12, dmg: 12, resistReduce: 5,  rarityBias: 5 },
  "다이아 낚싯대": { maxDur: 490, biteSpeed: -18, dmg: 15, resistReduce: 8,  rarityBias: 10 },
  "전설의 낚싯대": { maxDur: 880, biteSpeed: -25, dmg: 20, resistReduce: 12, rarityBias: 18 }
};
const FLOAT_SPECS = {
  "동 찌":    { maxDur: 30,  biteSpeed: -3,  resistReduce: 2,  rarityBias: 0 },
  "은 찌":    { maxDur: 60, biteSpeed: -6,  resistReduce: 4,  rarityBias: 2 },
  "금 찌":    { maxDur: 90, biteSpeed: -9,  resistReduce: 7,  rarityBias: 4 },
  "다이아 찌": { maxDur: 200, biteSpeed: -12, resistReduce: 10, rarityBias: 7 }
};
const BAIT_SPECS = {
  "지렁이 미끼":        { pack: 20, biteSpeed: -2, rarityBias: 0  },
  "새우 미끼":          { pack: 20, biteSpeed: -4, rarityBias: 2  },
  "빛나는 젤리 미끼":  { pack: 20, biteSpeed: -7, rarityBias: 6  }
};

const PRICES = {
  rods: {
    "나무 낚싯대":   { coin: 500,    be: 50000 },
    "강철 낚싯대":   { coin: 10000,   be: 500000 },
    "금 낚싯대":     { coin: 150000,  be: 5000000 },
    "다이아 낚싯대": { coin: 500000, be: null },
    "전설의 낚싯대": { coin: 4130000, be: null }
  },
  floats: {
    "동 찌":    { coin: 200,    be: 30000 },
    "은 찌":    { coin: 1000,   be: 300000 },
    "금 찌":    { coin: 50000,  be: null },
    "다이아 찌": { coin: 200000, be: null }
  },
  baits: {
    "지렁이 미끼":       { coin: 100,   be: 20000  },
    "새우 미끼":         { coin: 5000,  be: 200000 },
    "빛나는 젤리 미끼": { coin: 100000, be: null   }
  }
};

// === [수족관 시스템] 기본 정의 ===
const AQUARIUM_MAX = 5;
// lv i -> i+1 요구치 (lv10은 만렙이라 사용 안함)
const AQUA_XP_TABLE = [0, 120, 220, 400, 700, 1200, 2000, 3300, 5500, 9000]; 

function aquaValueMult(lv=1){ 
  return Math.pow(1.1, Math.max(0, lv-1)); 
}

function ensureAquarium(u){
  u.aquarium ??= [];
  if (!Array.isArray(u.aquarium)) u.aquarium = [];
  for (const f of u.aquarium) {
    f.lv = Math.min(Math.max(f.lv ?? 1, 1), 10);
    f.xp ??= 0;
    f.base ??= (f.price || 0); // 인벤에서 옮겨올 때의 원가 저장
    f.feedKey ??= dailyKeyKST();
    f.feedCount ??= 0;
    f.lastPraiseAt ??= 0;
  }
}

// 먹이 경험치 계산: 레어도/별/크기근접도 가중
function feedXpGain(target, feed) {
  const rMulMap = { "노말":0.9, "레어":1.0, "유니크":1.3, "레전드":1.7, "에픽":2.2, "언노운":3.0 };
  const rMul = rMulMap[feed.r] ?? 1.0;

  // 원본 파일의 별 계산 규칙과 일치하게 LENGTH_TABLE과 withStarName 기반:contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
  function starCount(name, length){
    const range = LENGTH_TABLE[name]; 
    if (!range) return 1;
    const [min, max] = range; 
    if (max <= min) return 1;
    const ratio = (length - min) / (max - min);
    return Math.max(1, Math.min(5, Math.round(ratio * 5)));
  }
  const sMul = 1 + 0.12 * (starCount(feed.n, feed.l) - 1);

  // 크기 근접도: 자기보다 작은 것만 허용. 가까울수록 ↑
  const closeness = Math.max(0.25, Math.min(1, feed.l / Math.max(1, target.l)));
  const cMul = 0.6 + 0.4 * closeness;

  const base = 30; // 기준치
  return Math.round(base * rMul * sMul * cMul);
}

function xpNeed(lv){
  if (lv >= 10) return Infinity; 
  return AQUA_XP_TABLE[lv] || 999999;
}

function tryLevelUp(a){ 
  while (a.lv < 10 && a.xp >= xpNeed(a.lv)) {
    a.xp -= xpNeed(a.lv);
    a.lv++;
  }
}

function valueWithLevel(base, lv){ return Math.round((base||0) * aquaValueMult(lv||1)); }

function canPraise(a){
  return (Date.now() - (a.lastPraiseAt||0)) >= 60*60*1000; // 1h
}

function resetFeedIfNewDay(a){
  const key = dailyKeyKST(); // 원본 KST 일일키 사용
  if (a.feedKey !== key) { a.feedKey = key; a.feedCount = 0; }
}


// === [퀘스트 시스템] 전 서버 공통 세트 ===
function ensureQuests(db){
  db.quests ??= {};
  db.quests.daily ??= { key:null, list:[] };  // key: "YYYY-MM-DD" (리셋 단위)
  db.quests.weekly??= { key:null, list:[] };  // key: "YYYY-MM-DD" (주간 시작 월요일)

  const needDaily = db.quests.daily.key !== dailyKeyKST();
  const needWeekly= db.quests.weekly.key !== weeklyKeyKST();
  if (needDaily)  {
  const key = dailyKeyKST();
  const list = genDailyQuests().map(q => ({ ...q, id: `d:${key}|${q.id}` }));
  db.quests.daily = { key, list };
}
if (needWeekly) {
  const key = weeklyKeyKST();
  const list = genWeeklyQuests().map(q => ({ ...q, id: `w:${key}|${q.id}` }));
  db.quests.weekly = { key, list };
}
  return { daily: db.quests.daily, weekly: db.quests.weekly };
}

// === [퀘스트 시스템] KST/리셋/유틸 ===
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function nowKST() { return new Date(Date.now() + KST_OFFSET_MS); }
function lastDailyResetKST() {
  const n = nowKST(); const d = new Date(n);
  d.setHours(9,0,0,0);
  if (n < d) d.setDate(d.getDate() - 1);
  return d;
}
function nextDailyResetKST() { const d = lastDailyResetKST(); d.setDate(d.getDate()+1); return d; }
function dailyKeyKST() { return lastDailyResetKST().toISOString().slice(0,10); }

function lastWeeklyResetKST() {
  const n = nowKST();
  const d = new Date(n);
  // 이번 주 월요일 09:00
  const day = n.getDay(); // 0=일 ... 1=월
  const monday = new Date(n);
  const diff = (day + 6) % 7; // 월요일로 되돌아갈 일수
  monday.setDate(n.getDate() - diff);
  monday.setHours(9,0,0,0);
  if (n < monday) monday.setDate(monday.getDate() - 7);
  return monday;
}
function nextWeeklyResetKST() { const d = lastWeeklyResetKST(); d.setDate(d.getDate()+7); return d; }
function weeklyKeyKST() { return lastWeeklyResetKST().toISOString().slice(0,10); }

function randPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

function fmtProgress(cur, tgt){ return `${Math.min(cur,tgt).toLocaleString()} / ${tgt.toLocaleString()}`; }
const RARITY_IDX = { "노말":0,"레어":1,"유니크":2,"레전드":3,"에픽":4,"언노운":5 };

// 진행 막대: ■=진행, □=남음
function progressBar(cur, tgt, width = 12) {
  const c = Math.max(0, Math.min(tgt, cur||0));
  const filled = Math.round((c / Math.max(1, tgt)) * width);
  const empty = width - filled;
  const pct = Math.floor((c / Math.max(1, tgt)) * 100);
  return `【${"■".repeat(filled)}${"□".repeat(empty)}】 ${pct}%`;
}

// 시간대 전용 막대(낮/노을/밤 각각)
function bandBar(cur, tgt, width = 8) {
  return progressBar(cur||0, tgt||0, width);
}

// 퀘스트 보상 텍스트
function questRewardText(reward) {
  if (!reward) return "보상: (없음)";
  const M = typeof QUEST_REWARD_MULT === "number" ? QUEST_REWARD_MULT : 1;
  const parts = [];
  
  if (reward.coin) {
    const disp = Math.floor((reward.coin || 0) * M);
    if (disp > 0) parts.push(`🪙 ${disp.toLocaleString()} 코인`);
  }
  if (reward.be) {
    const disp = Math.floor((reward.be || 0) * M);
    if (disp > 0) parts.push(`💎 ${disp.toLocaleString()} BE`);
  }
  if (reward.bait) {
    const [name, baseCnt] = Array.isArray(reward.bait) ? reward.bait : [reward.bait, 20];
    const qty = Math.max(1, Math.floor((baseCnt || 20) * M));
    parts.push(`🪱 ${name} x${qty.toLocaleString()}`);
  }
  return `보상: ${parts.join(" + ") || "(없음)"}`;
}

// 퀘스트 타입별 이모지
const QUEST_TYPE_EMOJI = {
  coin_spend:"💸", coin_gain:"💰", timeband:"🕒", junk_collect:"🪣",
  rarity_seq:"🔀", catch_specific:"🎯", durability:"🛠️", bait:"🪱",
  gear_unique:"🧪", junk_streak3:"3️⃣🪣", same_rarity3:"3️⃣⭐",
  rarity_atleast:"⭐", chest_open:"📦", new_species:"🧬", aqua_feed:"🍽️",
  aqua_praise:"👏", aqua_levelup:"⬆️",
};

// 완료·미수령 퀘스트 보상 합산
function aggregatePendingRewards(u, db){
  const res = { coin:0, be:0, baits:{}, count:0, ids:[] };
  for (const q of getActiveQuests(db)) {
    if (isComplete(u, q) && !u.quests.claimed[q.id]) {
      res.count++; res.ids.push(q.id);
      const M = QUEST_REWARD_MULT || 1;
      const r = q.reward || {};
      if (r.coin) res.coin += Math.floor(r.coin * M);
      if (r.be)   res.be   += Math.floor(r.be   * M);
      if (r.bait) {
        const [name, baseCnt] = Array.isArray(r.bait) ? r.bait : [r.bait, 20];
        const qty = Math.max(1, Math.floor((baseCnt || 20) * M));
        res.baits[name] = (res.baits[name] || 0) + qty;
      }
    }
  }
  return res;
}
function summaryLabelOf(agg){
  const parts = [];
  if (agg.coin > 0) parts.push(`낚시코인:${agg.coin.toLocaleString()}`);
  if (agg.be   > 0) parts.push(`파랑 정수:${agg.be.toLocaleString()}`);
  const baitKinds = Object.keys(agg.baits);
  if (baitKinds.length) parts.push(`미끼 x${baitKinds.length}`);
  return parts.length
    ? `보상받기 [${parts.join(" & ")}]`
    : `보상받기 [완료한 퀘스트가 없습니다.]`;
}

// 퀘스트 임베드/버튼 생성 (단일 수령 버튼)
function buildQuestEmbed(db, u){
  ensureQuests(db);
  const daily = db.quests.daily.list || [];
  const weekly = db.quests.weekly.list || [];

  const eb = new EmbedBuilder()
    .setTitle("🎯 낚시 퀘스트")
    .setDescription([
      `🗓️ 일일: ${db.quests.daily.key} (리셋 ${nextDailyResetKST().toLocaleString("ko-KR",{ timeZone:"Asia/Seoul" })})`,
      `📅 주간: ${db.quests.weekly.key} (리셋 ${nextWeeklyResetKST().toLocaleString("ko-KR",{ timeZone:"Asia/Seoul" })})`
    ].join("\n"))
    .setColor(0x33c3ff)
    .setImage(QUEST_IMAGE_URL);

  // 임베드 구분선 유틸
const DIV = "────────────────────────";

const addSection = (title, list) => {
  eb.addFields({
    name: `**${title}**`,
    value: DIV,
    inline: false
  });

  // 2) 내용
  if (!list.length) {
    eb.addFields({ name: "_없음_", value: "\u200b", inline: false });
    return;
  }

  for (const q of list) {
    const p = u.quests.progress?.[q.id];
    const emoji = QUEST_TYPE_EMOJI[q.type] || "•";
    const status = u.quests.claimed[q.id] ? "수령완료"
                 : isComplete(u, q)        ? "완료"
                 : "진행중";

    let value;
    if (q.type === "timeband") {
      const cur = p || {};
      const tgt = q.target || {};
      value = [
        `낮 ${bandBar(cur["낮"], tgt["낮"])} / 노을 ${bandBar(cur["노을"], tgt["노을"])} / 밤 ${bandBar(cur["밤"], tgt["밤"])}`,
        questRewardText(q.reward)
      ].join("\n");
    } else {
      const tgt = (q.target ?? q.times ?? 1);
      const curNum = (typeof p === "number" ? p : 0);
      value = [
        `${progressBar(curNum, tgt)} (${fmtProgress(curNum, tgt)})`,
        questRewardText(q.reward)
      ].join("\n");
    }

    eb.addFields({
      name: `${emoji} ${q.title} — ${status}`,
      value,
      inline: false
    });
  }
};


  addSection("🗓️ 일일 퀘스트", daily);
  addSection("📅 주간 퀘스트", weekly);

  const agg = aggregatePendingRewards(u, db);
  const claimBtn = new ButtonBuilder()
    .setCustomId("quest:claimAll")
    .setLabel(summaryLabelOf(agg))
    .setStyle(agg.count ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(!agg.count);

  const refreshBtn = new ButtonBuilder()
    .setCustomId("quest:refresh")
    .setLabel("🔄 새로고침")
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [eb],
    components: [ new ActionRowBuilder().addComponents(claimBtn, refreshBtn) ]
  };
}


function readDB() {
  if (!fs.existsSync(FISH_DB)) return { users:{} };
  try { return JSON.parse(fs.readFileSync(FISH_DB, "utf8")); } catch { return { users:{} }; }
}
function writeDB(d) { fs.writeFileSync(FISH_DB, JSON.stringify(d, null, 2)); }
async function withDB(fn) {
  if (!fs.existsSync(FISH_DB)) fs.writeFileSync(FISH_DB, JSON.stringify({ users:{} }, null, 2));
  const rel = await lockfile.lock(FISH_DB, { retries: { retries: 10, factor: 1.2, minTimeout: 50, maxTimeout: 250 } });
  try {
    const d = readDB();
    const r = await fn(d);
    writeDB(d);
    return r;
  } finally {
    await rel();
  }
}
async function updateUser(userId, updater) {
  return await withDB(async db=>{
    const u = (db.users[userId] ||= {}); ensureUser(u); u._uid = userId;
    const r = await updater(u, db);
    delete u._uid; 
    return r;
  });
}

async function updateOrEdit(interaction, payload) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      try { return await interaction.update(payload); } catch {}
    }
    try { return await interaction.editReply(payload); } catch {}
    try { return await interaction.update(payload); } catch {}
  } catch (err) {
    console.error('[fishing] updateOrEdit error:', err);
    try { await interaction.editReply({ content: '⚠️ 결과 처리 중 오류가 발생했어요.', embeds: [], components: [] }); } catch {}
  }
}
function mkSafeEditor(interaction) {
  const msg = interaction.message || null;
  return async (payload) => {
    if (msg && typeof msg.edit === "function") {
      try { return await msg.edit(payload); } catch {}
    }
    return updateOrEdit(interaction, payload);
  };
}

function ensureFirsts(db){ db.firsts ??= {}; return db.firsts; }
function recordFirst(db, key, userId){
  try {
    ensureFirsts(db);
    if (!db.firsts[key]) db.firsts[key] = { userId, at: Date.now() };
  } catch {}
}


function ensureUser(u) {
  // 최상위
  u.coins ??= 0;
  u.tier ??= "브론즈";

  // 장비/인벤
  u.equip ??= { rod:null, float:null, bait:null };
  u.inv   ??= {};
  u.inv.rods   ??= {};
  u.inv.floats ??= {};
  u.inv.baits  ??= {};
  u.inv.fishes ??= [];
  u.inv.keys   ??= 0;
  u.inv.chests ??= 0;

  // 수족관
  u.aquarium ??= [];

  // 통계
  u.stats ??= {};
  u.stats.caught ??= 0;
  u.stats.points ??= 0;
  u.stats.best   ??= {};
  u.stats.max    ??= { name:null, length:0 };
  u.stats.speciesCount ??= {};

  // 보상 플래그
  u.rewards ??= {};
  u.rewards.tier   ??= {};
  u.rewards.caught ??= {};
  u.rewards.size   ??= {};
  u.rewards.species??= {};

  // 퀘스트 진행/클레임/임시 상태
  u.quests ??= {};
  u.quests.progress ??= {};   // { [questId]: number | {낮:..,노을:..,밤:..} }
  u.quests.claimed  ??= {};   // { [questId]: true }
  u.quests.temp ??= {         // 연속형 판단용
    recentRarities: [],       // 최근 3회 등급
    junkStreak: 0,            // 연속 잡동사니
    lastRarity: null,         // 동일 등급 연속 체크
    sameRarityStreak: 0
  };
  
  // 설정 키
  u.settings ??= {};
  u.settings.autoBuy ??= false;

  // 수족관 보정(레거시 사용자 포함)
  ensureAquarium(u);
}
function addRod(u, name)   { u.inv.rods[name]   = ROD_SPECS[name]?.maxDur || 0; }
function addFloat(u, name) { u.inv.floats[name] = FLOAT_SPECS[name]?.maxDur || 0; }
function addBait(u, name, qty=0) { u.inv.baits[name] = (u.inv.baits[name]||0) + qty; }
function useDurability(u, slot) {
  if (slot === "rod"   && u.equip.rod)   u.inv.rods[u.equip.rod]   = Math.max(0, (u.inv.rods[u.equip.rod]||0)-1);
  if (slot === "float" && u.equip.float) u.inv.floats[u.equip.float] = Math.max(0, (u.inv.floats[u.equip.float]||0)-1);
}
function hasAllGear(u) {
  return u.equip.rod && u.equip.float && u.equip.bait &&
    (u.inv.rods[u.equip.rod]||0) > 0 && (u.inv.floats[u.equip.float]||0) > 0 && (u.inv.baits[u.equip.bait]||0) > 0;
}
function missingGearKey(u){
  const needRod = !u.equip.rod || (u.inv.rods[u.equip.rod]||0)<=0;
  const needFlo = !u.equip.float || (u.inv.floats[u.equip.float]||0)<=0;
  const needBait= !u.equip.bait || (u.inv.baits[u.equip.bait]||0)<=0;
  if (!needRod && !needFlo && !needBait) return null;
  if (needRod && needFlo && needBait) return "장비없음_전부";
  if (needRod && needFlo) return "장비없음_낚싯대+찌";
  if (needFlo && needBait) return "장비없음_찌+미끼";
  if (needRod && needBait) return "장비없음_낚싯대+미끼";
  if (needRod) return "장비없음_낚싯대";
  if (needFlo) return "장비없음_찌";
  if (needBait) return "장비없음_미끼";
  return "장비없음_전부";
}
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function pickWeighted(obj){ const sum = Object.values(obj).reduce((s,v)=>s+v,0); let r=Math.random()*sum; for(const [k,v] of Object.entries(obj)){ if((r-=v)<=0) return k; } return Object.keys(obj)[0]; }
function currentTimeBand() {
  const nowKST = new Date(Date.now()+9*3600*1000);
  const h = nowKST.getUTCHours();
  if (h>=7 && h<=15) return "낮";
  if (h>=16 && h<=19) return "노을";
  return "밤";
}

function withStarName(name, length) {
  const range = LENGTH_TABLE[name];
  if (!range || !length) return name;
  const [min, max] = range;
  if (max <= min) return name; 
  const ratio = (length - min) / (max - min);
  const starCount = Math.max(1, Math.min(5, Math.round(ratio * 5)));
  return `${name} [${"★".repeat(starCount)}]`;
}

const RARITY_PRICE_MULT = { "노말":0.8, "레어":2, "유니크":5, "레전드":10, "에픽":20, "언노운":90 };
const RARITY_HP_MULT = { "노말":1, "레어":1.7, "유니크":2.5, "레전드":3.5, "에픽":5.0, "언노운":20.0 };

const LENGTH_TABLE = {
  "멸치":[5,15],
  "피라냐":[15,40],
  "금붕어":[5,25],
  "전갱이":[20,50],
  "고등어":[25,60],
  "두꺼비":[10,30],
  "망둑어":[15,60],
  "해파리":[30,80],
  "숭어":[,],
  "가재":[8,20],
  "연어":[60,120],
  "다랑어":[80,200],
  "가자미":[25,50],
  "오징어":[20,60],
  "잉어":[30,100],
  "삼치":[40,100],
  "복어":[15,45],
  "황어":[30,60],
  "도미":[30,80],
  "참돔":[40,90],
  "붕어":[20,50],
  "비단 잉어":[40,100],
  "빙어":[8,15],
  "갈치":[80,200],
  "참치":[150,300],
  "장어":[50,200],
  "개복치":[100,300],
  "문어":[50,200],
  "거북이":[30,100],
  "곰치":[100,300],
  "고래상어":[300,1200],
  "빨판상어":[40,110],
  "청새치":[200,450],
  "철갑상어":[150,600],
  "대왕고래":[1000,3000],
  "작은입배스":[20,40], 
  "홍어":[50,150],     
  "가오리":[40,200],     
  "우럭":[20,60],         
  "민어":[50,100],        
  "병어":[15,40],        
  "방어":[50,100],     
  "전어":[15,30],     
  "은어":[15,25],    
  "송어":[30,70],     
  "넙치":[40,100],  
  "청어":[20,40],   
  "꽁치":[25,40],      
  "쏘가리":[25,50],   
  "농어":[40,100],   
  "큰입배스":[30,80],   
  "참다랑어":[150,300], 
  "황다랑어":[100,200],  
  "메기":[60,200],     
  "블롭피쉬":[20,40],    
  "그림자 장어":[100,250], 
  "별빛 잉어":[50,120], 
  "심연의 복어":[80,180], 
  "아귀":[50,150],   
  "에테르 피쉬":[120,250],
  "루미나 샤크":[300,600],
  "해룡 까리오스":[800,3500],
  "샤이닝 해파리":[25,200],
  "덤보 문어":[30,180],
  "황금 잉어":[40,150],
  "꼴뚜기":[10,50],
  "뼈 생선":[30,150],
  "피라미": [5, 15],     
  "쏠배감펭": [20, 40],         
  "개구리": [6, 15],       
  "해마": [5, 35],           
  "톱상어": [150, 500],     
  "야광어": [20, 60],     
  "실러캔스": [150, 200],    
  "앵무조개": [15, 25],
  "홍게": [40,70],
  "유령고래": [100,200],
  "클리오네의 정령": [10,50],
  "클리오네 성체": [200,1000],
  "해룡 레비아탄": [900,4000],
  "용신 까리오스": [1250,5000],
  "새끼 크라켄": [700,1400],
  "엔젤 고래": [1000,3000],
  "안개 고래": [900,2700],
  "구름 잉어": [50,160],
  "메기 잉어": [30,120],
  "잿빛 멸치": [10,30],
  "밤의 잉어": [30,90],
  "붉은 바다뱀": [50,180],
  "마블 고등어": [20,100],
  "달무늬 고래": [300,900],
  "알콩이와 달콩이": [50,150],
  "별점어": [20,100],
  "돌꼬치": [40,160],
  "붉은점 돌돔": [30,90],
  "파도 송사리": [25,95],
  "푸른 바다뱀": [40,100],
  "푸른 복어": [25,75],
  "따분한 멸치": [4,18],
  "등푸른 생선": [8,25],
  "모래 송사리": [3,20]
};
   

const JUNK_SET = new Set(["빈 페트병","해초","작은 새우","뚱이의 바지","갓봇의 안경"]);

function drawLength(name){
  const r = LENGTH_TABLE[name];
  if (!r) return 0;
  return Math.max(r[0], Math.min(r[1], randInt(r[0]*10, r[1]*10) / 10));
}
function computeSellPrice(name, length, rarity) {
  const base = RARITY_PRICE_MULT[rarity] || 1;
  const speciesBias = (name.charCodeAt(0)%13)+1;
  const L = Math.max(1, length||1);
  return Math.max(1, Math.round(SELL_PRICE_MULT * (base * Math.pow(L, 1.25) + speciesBias*5)));
}
function computePoints(rarity, price, length) {
  const base = { "노말":1, "레어":4, "유니크":9, "레전드":20, "에픽":45, "언노운":120 }[rarity] || 1;
  return Math.round(base * Math.sqrt(Math.max(1, price)) + Math.sqrt(Math.max(1,length)));
}
function updateTier(u) {
  const p = u.stats.points || 0;
  let best = "브론즈";
  for (const t of TIER_ORDER) { if (p >= TIER_CUTOFF[t]) best = t; else break; }
  u.tier = best;
}
function fishToInv(u, fish) {
  u.stats.speciesCount ??= {};
  u.inv.fishes.push({ n: fish.name, r: fish.rarity, l: fish.length, price: fish.sell, lock: false });
  u.stats.caught += 1;
  const gained = computePoints(fish.rarity, fish.sell, fish.length);
  u.stats.points += gained;
  u.stats.speciesCount[fish.name] = (u.stats.speciesCount[fish.name] || 0) + 1;
  const prevBest = u.stats.best[fish.name] || { length:0, price:0 };
  if ((fish.length||0) > (prevBest.length||0)) u.stats.best[fish.name] = { length: fish.length, price: Math.max(prevBest.price||0, fish.sell) };
  if ((fish.sell||0) > (prevBest.price||0)) u.stats.best[fish.name] = { length: Math.max(prevBest.length||0, fish.length), price: fish.sell };
  if (!u.stats.max || (fish.length||0) > (u.stats.max.length||0)) u.stats.max = { name: fish.name, length: fish.length };
}

// === 자동구매 유틸
function priceFor(kind, name) {
  const map = kind==="rod" ? "rods" : kind==="float" ? "floats" : "baits";
  return PRICES[map]?.[name] || null;
}

async function autoBuyOne(u, db, kind, name) {
  const price = priceFor(kind, name);
  if (!price) return null;

  if (kind === "bait") {
    const pack = BAIT_SPECS[name]?.pack ?? 20;
    const cur  = u.inv.baits[name] || 0;
    const need = Math.max(0, pack - cur);
    if (need <= 0) return null;

    const coinCost = price.coin != null ? Math.ceil(price.coin * (need/pack)) : null;
    const beCost   = price.be   != null ? Math.ceil(price.be   * (need/pack)) : null;

    if (coinCost != null && (u.coins||0) >= coinCost) {
      spendCoins(u, db, coinCost);
      addBait(u, name, need);
      return `• ${name} 보충 완료 (코인 ${coinCost.toLocaleString()})`;
    } else if (beCost != null && (getBE(u._uid)||0) >= beCost) {
      await addBE(u._uid, -beCost, `[낚시] 자동구매 ${name} 보충(${need})`);
      addBait(u, name, need);
      return `• ${name} 보충 완료 (정수 ${beCost.toLocaleString()}원)`;
    } else {
      return `• ${name} — 잔액 부족(코인/정수)`;
    }
  } else {
    const coinCost = price.coin;
    const beCost   = price.be;
    let paidText = null;

    if (coinCost != null && (u.coins||0) >= coinCost) {
      spendCoins(u, db, coinCost);
      paidText = `코인 ${coinCost.toLocaleString()}`;
    } else if (beCost != null && (getBE(u._uid)||0) >= beCost) {
      await addBE(u._uid, -beCost, `[낚시] 자동구매 ${name}`);
      paidText = `정수 ${beCost.toLocaleString()}원`;
    } else {
      return `• ${name} — 잔액 부족(코인/정수)`;
    }

    if (kind === "rod") addRod(u, name);
    else addFloat(u, name);

    return `• ${name} 구매 완료 (${paidText})`;
  }
}

// ★ 장착한 낚싯대/찌 내구도 == 1 && 미끼 == 1일 때 자동구매
async function autoBuyIfAllOne(u, db) {
  if (!u?.settings?.autoBuy) return null;
  if (!u.equip.rod || !u.equip.float || !u.equip.bait) return null;

  const r = u.inv.rods[u.equip.rod]   ?? 0;
  const f = u.inv.floats[u.equip.float] ?? 0;
  const b = u.inv.baits[u.equip.bait] ?? 0;

  if (r <= 1 || f <= 1 || b <= 1) {
  const msgs = [];
  if (r <= 1) msgs.push(await autoBuyOne(u, db, "rod",   u.equip.rod));
if (f <= 1) msgs.push(await autoBuyOne(u, db, "float", u.equip.float));
if (b <= 1) msgs.push(await autoBuyOne(u, db, "bait",  u.equip.bait));

  const note = msgs.filter(Boolean).length ? `🧰 자동구매 실행됨\n${msgs.filter(Boolean).join("\n")}` : null;
  if (note) return note;
}
  return null;
}

// === [퀘스트 시스템] 생성기 ===
const ALL_SPECIES = Object.keys(LENGTH_TABLE)
  .filter(n => !JUNK_SET.has(n)); // 길이 테이블에 있고 잡동사니 제외

function q_coin_spend(min, max, tier){ // 낚시 코인 소비 누적
  const target = randInt(min, max);
  return {
    id: `coin_spend|${target}|${tier}`,
    type: "coin_spend", target,
    title: `낚시 코인 ${target.toLocaleString()}개 소비`,
    reward: tier==="daily" ? { coin: 15000 } : { coin: 150000, be: 100000 }
  };
}
function q_timeband(each, tier){
  const t = { "낮":each, "노을":each, "밤":each };
  return {
    id: `timeband|${each}|${tier}`,
    type: "timeband", target: t,
    title: `시간대별(낮/노을/밤) 각 ${each}회 낚시 성공`,
    reward: tier==="daily" ? { coin: 12000 } : { coin: 100000, bait: ["새우 미끼",20] }
  };
}
function q_junk(n, tier){
  return {
    id:`junk_collect|${n}|${tier}`, type:"junk_collect", target:n,
    title:`잡동사니 ${n}개 획득`,
    reward: tier==="daily" ? { coin: 8000 } : { coin: 100000 }
  };
}
function q_seq(seq, times, tier){
  const key = seq.join(">");
  return {
    id:`seq|${key}|${times}|${tier}`, type:"rarity_seq", seq, times,
    title:`${seq.join(" → ")} 순서로 획득 ${times}회`,
    reward: tier==="daily" ? { coin: 15000 } : { coin: 150000, be: 100000 }
  };
}
function q_specific(species, n, tier){
  return {
    id:`catch_specific|${species}|${n}|${tier}`, type:"catch_specific", species, target:n,
    title:`'${species}' ${n}마리 잡기`,
    reward: tier==="daily" ? { coin: 14000 } : { coin: 100000, be: 90000 }
  };
}
function q_dur(n, tier){
  return {
    id:`dur_use|${n}|${tier}`, type:"durability", target:n,
    title:`아이템 내구도 ${n}회 소모시키기`,
    reward: tier==="daily" ? { coin: 10000 } : { coin: 100000 }
  };
}
function q_bait(n, tier){
  return {
    id:`bait_use|${n}|${tier}`, type:"bait", target:n,
    title:`미끼 ${n}개 소비`,
    reward: tier==="daily" ? { bait:["지렁이 미끼",20] } : { bait:["빛나는 젤리 미끼",20], coin: 60000 }
  };
}
function q_woodCopperUnique(n, tier){ // 주간 전용
  return {
    id:`wood_copper_unique|${n}|${tier}`, type:"gear_unique", target:n,
    title:`나무 낚싯대 + 동 찌로 유니크 물고기 ${n}마리`,
    reward: { coin: 150000, be: 100000 }
  };
}
function q_junkStreak(times, tier){
  return {
    id:`junk_streak3|${times}|${tier}`, type:"junk_streak3", target:times,
    title:`잡동사니 연속 3회 획득 ${times}회`,
    reward: tier==="daily" ? { coin: 12000 } : { coin: 90000 }
  };
}
function q_sameRarityStreak(times, tier){
  return {
    id:`same_rarity3|${times}|${tier}`, type:"same_rarity3", target:times,
    title:`동일 등급 물고기 연속 3회 획득 ${times}회`,
    reward: tier==="daily" ? { coin: 15000 } : { coin: 100000 }
  };
}
function q_rarityAtLeast(minRarity, n, tier){
  return {
    id:`rarity_atleast|${minRarity}|${n}|${tier}`, type:"rarity_atleast", min:minRarity, target:n,
    title:`${minRarity} 이상 물고기 ${n}마리`,
    reward: tier==="daily" ? { coin: 14000 } : { coin: 140000 }
  };
}
function q_chestOpen(n, tier){
  return {
    id:`chest_open|${n}|${tier}`, type:"chest_open", target:n,
    title:`까리한 보물상자 ${n}회 열기`,
    reward: tier==="daily" ? { coin: 10000 } : { coin: 50000 }
  };
}
function q_coinGain(min,max,tier){
  const target = randInt(min,max);
  return {
    id:`coin_gain|${target}|${tier}`, type:"coin_gain", target,
    title:`낚시 코인 ${target.toLocaleString()}개 획득`,
    reward: tier==="daily" ? { coin: 9000 } : { coin: 40000 }
  };
}
function q_newSpecies(n,tier){
  return {
    id:`new_species|${n}|${tier}`, type:"new_species", target:n,
    title:`도감에 신규 종 ${n}종 추가(첫 포획)`,
    reward: tier==="daily" ? { coin: 15000 } : { coin: 200000 }
  };
}
function q_aqua_feed(n, tier){
  return {
    id:`aqua_feed|${n}|${tier}`, type:"aqua_feed", target:n,
    title:`수족관 먹이 ${n}회 주기`,
    reward: tier==="daily" ? { coin: 10000 } : { coin: 100000 }
  };
}
function q_aqua_praise(n, tier){
  return {
    id:`aqua_praise|${n}|${tier}`, type:"aqua_praise", target:n,
    title:`수족관 물고기 칭찬 ${n}회 하기`,
    reward: tier==="daily" ? { coin: 8000 } : { coin: 120000 }
  };
}
function q_aqua_levelup(n, tier){
  return {
    id:`aqua_levelup|${n}|${tier}`, type:"aqua_levelup", target:n,
    title:`수족관 물고기 레벨업 ${n}회`,
    reward: tier==="daily" ? { coin: 15000 } : { coin: 150000 }
  };
}

function genDailyQuests(){
  const seqA = q_seq(["노말","레어","유니크"], 1, "daily");
  const seqB = q_seq(["유니크","레어","노말"], 1, "daily");
  const species = randPick(ALL_SPECIES);
  const list = [
    q_coin_spend(5000, 25000, "daily"),
    q_timeband(1, "daily"),
    q_junk(randInt(3,5), "daily"),
    randPick([seqA, seqB]),
    q_specific(species, 1, "daily"),
    q_dur(randInt(10,30), "daily"),
    q_bait(randInt(10,30), "daily"),
    q_junkStreak(1, "daily"),
    q_sameRarityStreak(1, "daily"),
    q_rarityAtLeast("레어", randInt(2,4), "daily"),
    q_chestOpen(1, "daily"),
    q_coinGain(30000, 80000, "daily"),
    q_newSpecies(1, "daily"),
    q_aqua_feed(5, "daily"),
    q_aqua_praise(randInt(3,5), "daily"),
    q_aqua_levelup(1, "daily"),
  ];
  // 무작위 3개 추출
  return shufflePick(list, 5);
}
function genWeeklyQuests(){
  const seqA = q_seq(["노말","레어","유니크"], 3, "weekly");
  const seqB = q_seq(["유니크","레어","노말"], 3, "weekly");
  const species = randPick(ALL_SPECIES);
  const base = [
    q_coin_spend(100000, 500000, "weekly"),
    q_timeband(3, "weekly"),
    q_junk(randInt(15,25), "weekly"),
    randPick([seqA, seqB]),
    q_specific(species, randInt(5,10), "weekly"),
    q_dur(randInt(100,300), "weekly"),
    q_bait(randInt(100,300), "weekly"),
    q_woodCopperUnique(3, "weekly"),
    q_junkStreak(2, "weekly"),
    q_sameRarityStreak(3, "weekly"),
    q_rarityAtLeast("레어", randInt(15,25), "weekly"),
    q_chestOpen(5, "weekly"),
    q_coinGain(300000, 800000, "weekly"),
    q_newSpecies(3, "weekly"),
    q_aqua_feed(30, "weekly"),
    q_aqua_praise(50, "weekly"),
    q_aqua_levelup(5, "weekly"),
  ];
  return shufflePick(base, 3);
}
function shufflePick(arr, k){
  const a = [...arr];
  for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a.slice(0,k);
}

// === [퀘스트 시스템] 진행 반영 ===
function getActiveQuests(db){ return [...(db?.quests?.daily?.list||[]), ...(db?.quests?.weekly?.list||[])]; }

function inc(u, qid, by=1){
  u.quests.progress ??= {};
  const cur = u.quests.progress[qid];
  if (typeof cur === "number" || cur == null) {
    u.quests.progress[qid] = (cur||0) + by;
  }
}

// timeband는 형태가 객체라 별도
function incBand(u, qid, band){
  u.quests.progress ??= {};
  const cur = u.quests.progress[qid] ||= { "낮":0,"노을":0,"밤":0 };
  cur[band] = (cur[band]||0) + 1;
}

function isComplete(u, q){
  const p = u.quests.progress?.[q.id];
  if (q.type === "timeband") {
    const need = q.target; const cur = p||{};
    return (cur["낮"]||0) >= need["낮"] && (cur["노을"]||0) >= need["노을"] && (cur["밤"]||0) >= need["밤"];
  }
  if (q.type === "junk_streak3" || q.type === "same_rarity3" || q.type === "rarity_seq") {
    return (p||0) >= (q.times||q.target||1);
  }
  return (p||0) >= (q.target||q.times||1);
}

async function grantQuestReward(u, db, reward){
  if (!reward) return;
  const M = QUEST_REWARD_MULT;

  if (reward.coin) {
    const amt = Math.floor((reward.coin||0) * M);
    if (amt > 0) gainCoins(u, db, amt);
  }
  if (reward.be) {
    const beAmt = Math.floor((reward.be||0) * M);
    if (beAmt > 0) await addBE(u._uid, beAmt, "[퀘스트 보상]");
  }
  if (reward.bait) {
    const name = reward.bait[0];
    const base = reward.bait[1] || 20;
    const qty  = Math.max(1, Math.floor(base * M));
    addBait(u, name, qty);
  }
}


function applyQuestEvent(u, db, event, data={}){
  if (event === "fish_caught") {
  try {
    if (data?.name === "클리오네 성체") recordFirst(db, "clioneAdult", u._uid);
    if (data?.name === "해룡 레비아탄") recordFirst(db, "leviathan", u._uid);
  } catch {}
}
  const qs = getActiveQuests(db);
  const band = data.band;
  for (const q of qs) {
    switch(q.type){
      case "coin_spend":
        if (event==="coin_spent") inc(u, q.id, data.amount||0);
        break;
      case "coin_gain":
        if (event==="coin_gained") inc(u, q.id, data.amount||0);
        break;
      case "timeband":
        if (event==="fish_caught" && band) incBand(u, q.id, band);
        break;
      case "junk_collect":
        if (event==="junk_caught") inc(u, q.id, 1);
        break;
      case "catch_specific":
        if (event==="fish_caught" && data.name===q.species) inc(u, q.id, 1);
        break;
      case "durability":
        if (event==="durability_used") inc(u, q.id, data.count||1);
        break;
      case "bait":
        if (event==="bait_used") inc(u, q.id, data.count||1);
        break;
      case "gear_unique":
        if (event==="fish_caught" && data.rarity==="유니크" && data.rod==="나무 낚싯대" && data.float==="동 찌") inc(u,q.id,1);
        break;
      case "junk_streak3":
        if (event==="junk_streak3_done") inc(u, q.id, 1);
        break;
      case "same_rarity3":
        if (event==="same_rarity3_done") inc(u, q.id, 1);
        break;
      case "rarity_atleast":
        if (event==="fish_caught" && RARITY_IDX[data.rarity] >= RARITY_IDX[q.min]) inc(u, q.id, 1);
        break;
      case "new_species":
        if (event==="first_species") inc(u, q.id, 1);
        break;
      case "rarity_seq":
        if (event==="rarity_seq_hit" && data.key === q.seq.join(">")) inc(u, q.id, 1);
        break;
      case "aqua_feed":
        if (event === "aqua_feed") inc(u, q.id, 1);
        break;
      case "aqua_praise":
        if (event === "aqua_praise") inc(u, q.id, 1);
        break;
     case "aqua_levelup":
       if (event === "aqua_levelup") inc(u, q.id, Math.max(1, data.levels||1));
       break;
    }
  }
}

// 코인 증감 래퍼 (퀘스트: coin_spent / coin_gained 이벤트 발생)
function spendCoins(u, db, amt){
  amt = Math.max(0, amt|0);
  if ((u.coins||0) < amt) return false;
  u.coins -= amt;
  try { applyQuestEvent(u, db, "coin_spent", { amount: amt }); } catch {}
  return true;
}
function gainCoins(u, db, amt){
  amt = Math.max(0, amt|0);
  u.coins = (u.coins||0) + amt;
  try { applyQuestEvent(u, db, "coin_gained", { amount: amt }); } catch {}
}



const sessions = new Map();
const shopSessions = new Map();
const invSessions  = new Map();
const sellSessions = new Map();
const dexSessions  = new Map();
const lastCatch = new Map();

function clearSession(userId) {
  const s = sessions.get(userId);
  if (s) {
    if (s.biteTimer) clearTimeout(s.biteTimer);
    if (s.expireTimer) clearTimeout(s.expireTimer);
    if (s.fightIdleTimer) clearTimeout(s.fightIdleTimer);
    if (s.fightTotalTimer) clearTimeout(s.fightTotalTimer);
  }
  sessions.delete(userId);
}
function sceneEmbed(user, title, desc, imageURL, extraFields = [], color) {
  const eb = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc || "")
    .setColor(color ?? 0x3aa0ff);
  if (imageURL) eb.setImage(imageURL);
  if (Array.isArray(extraFields) && extraFields.length) eb.addFields(extraFields);
  const bf = buffField(user); if (bf) eb.addFields(bf);
  const band = currentTimeBand();
  const tf = timeBuffField(band); if (tf) eb.addFields(tf);
  eb.setFooter({ text: `낚시 코인: ${user.coins.toLocaleString()} | 티어: ${user.tier} [${(user.stats.points||0).toLocaleString()}점]` });
  return eb;
}

function equipLine(u) {
  const rDur = u.equip.rod ? (u.inv.rods[u.equip.rod] ?? 0) : 0;
  const fDur = u.equip.float ? (u.inv.floats[u.equip.float] ?? 0) : 0;
  return [
    `🎣 낚싯대: ${u.equip.rod || "없음"}${rDur?` (${rDur} 내구도)`:''}`,
    `🟠 찌: ${u.equip.float || "없음"}${fDur?` (${fDur} 내구도)`:''}`,
    `🪱 미끼: ${u.equip.bait || "없음"}${u.equip.bait?` (잔여 ${u.inv.baits[u.equip.bait]||0})`:''}`
  ].join("\n");
}
function buttonsStart(u) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fish:cast").setLabel("🎯 찌 던지기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fish:cancel").setLabel("🛑 중단하기").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("fish:equip").setLabel("🧰 아이템 교체하기").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("auto:toggle")
      .setLabel(u?.settings?.autoBuy ? "자동구매: ON" : "자동구매: OFF")
      .setStyle(u?.settings?.autoBuy ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
}
function buttonsWaiting() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fish:abort").setLabel("🏳️ 낚시 중단하기").setStyle(ButtonStyle.Secondary),
  );
}
function buttonsFight() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fish:reel").setLabel("↪ 릴 감기").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("fish:loosen").setLabel("↩ 릴 풀기").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fish:giveup").setLabel("🏳️ 포기").setStyle(ButtonStyle.Danger),
  );
}
function buttonsAfterCatch(allowShare = true) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fish:recast").setLabel("🎯 다시 찌 던지기").setStyle(ButtonStyle.Primary),
  );
  if (allowShare) {
    row.addComponents(new ButtonBuilder().setCustomId("fish:share").setLabel("📣 잡은 물고기 공유하기").setStyle(ButtonStyle.Secondary));
  }
  return row;
}
function computeRarityWeight(u){
  const base = { "노말": 110, "레어": 30, "유니크": 5, "레전드": 1.5, "에픽": 0.5, "언노운": 0.1 };
  const r = ROD_SPECS[u.equip.rod] || {};
  const f = FLOAT_SPECS[u.equip.float] || {};
  const b = BAIT_SPECS[u.equip.bait] || {};
  const tb = getTierBuff(u.tier);
  const timeBias = getTimeBuff(currentTimeBand()).rarityBias || 0;
  const bias = (r.rarityBias||0)+(f.rarityBias||0)+(b.rarityBias||0)+(tb.rarityBias||0)+timeBias;
  const m = { ...base };
  m["레어"]    += bias*0.8;
  m["유니크"]  += bias*0.35;
  m["레전드"]  += bias*0.12;
  m["에픽"]    += bias*0.04;
  m["언노운"]  += bias*0.01;
  return m;
}

function startFight(u) {
  const rarityWeights = computeRarityWeight(u);
  const rar = pickWeighted(rarityWeights);
  const pool = DROP_TABLE[rar];
  const name = pool[randInt(0, pool.length-1)];

  if (JUNK_SET.has(name)) {
    const st = baseItemFight(u, rar);
    return { type:"fight", kind:"junk", name, rarity:"노말", hp: st.hp, maxHP: st.maxHP, dmgBase: st.dmgBase, resist: st.resist };
  }

  if (name === "낚시 코인") {
    const amt = randInt(COIN_DROP_RANGE[0], COIN_DROP_RANGE[1]);
    const st = baseItemFight(u, rar);
    return { ...st, type:"fightItem", itemType:"coin", name, rarity:"노말", amount: amt };
  }
  if (name === "파랑 정수") {
    const amt = randInt(BE_DROP_RANGE[0], BE_DROP_RANGE[1]);
    const st = baseItemFight(u, rar);
    return { ...st, type:"fightItem", itemType:"be", name, rarity:"레어", amount: amt };
  }
  if (name === "까리한 열쇠") {
    const st = baseItemFight(u, rar);
    return { ...st, type:"fightItem", itemType:"key", name, rarity:"유니크", qty: 1 };
  }
  if (name === "까리한 보물상자") {
    const st = baseItemFight(u, rar);
    return { ...st, type:"fightItem", itemType:"chest", name, rarity:"유니크", qty: 1 };
  }

  const length = drawLength(name);
  const hpBase = Math.round((length/2) * (RARITY_HP_MULT[rar]||1));
  const hp = Math.max(30, Math.min(8000, hpBase));
  const maxHP = hp;
  const dmgBase = effectiveDmg(u);
  const resist  = Math.max(5, Math.round((10 + (RARITY.indexOf(rar)*5)) - effectiveResistReduce(u)));
  return { type:"fight", kind:"fish", name, rarity:rar, hp, maxHP, dmgBase, resist, length };
}
function baseItemFight(u, rar) {
  const dmgBase = effectiveDmg(u);
  const baseHP = Math.round(60 * (RARITY_HP_MULT[rar]||1));
  const hp = Math.max(25, Math.min(600, baseHP + randInt(-10,10)));
  const maxHP = hp;
  const resist = Math.max(5, Math.round(12 - effectiveResistReduce(u)));
  return { kind:"item", hp, maxHP, dmgBase, resist };
}

function applyReel(u, st, s, act){
  const pressAggressive = act==="reel";
  const base = pressAggressive ? (st.dmgBase + randInt(2,7)) : (-randInt(1,5));
  const resist = Math.max(0, st.resist + randInt(-3,2));
  const take = Math.max(0, base - Math.floor(resist/4));
  st.hp = Math.max(0, st.hp - (pressAggressive ? take : 0));
  const change = pressAggressive ? +randInt(6,12) : -randInt(5,10);
  s.tension = Math.max(0, Math.min(100, (s.tension||50)+change));
  let escapeChance = 0;
  if (s.tension >= 90) escapeChance += 0.45;
  else if (s.tension >= 80) escapeChance += 0.22;
  if (!pressAggressive && s.tension <= 10) escapeChance += 0.15;
  if (pressAggressive && st.hp < Math.floor(st.maxHP*0.25) && s.tension >= 85) escapeChance += 0.15;
  if (Math.random() < escapeChance) st.escape = true;
  return st;
}

function buildInventoryHome(u){
  const eb = new EmbedBuilder().setTitle("🎒 낚시 인벤토리")
    .setDescription([
      equipLine(u), "",
      "종류를 골라 한 개씩 확인하고 장착 또는 사용하실 수 있어요.",
      `• 열쇠: ${u.inv.keys||0}개 | 상자: ${u.inv.chests||0}개`,
      `• 물고기: ${u.inv.fishes.length}마리`
    ].join("\n"))
    .setColor(0x8888ff)
    .setFooter({ text: `낚시 코인: ${u.coins.toLocaleString()} | 티어: ${u.tier}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv:start|rod").setLabel("🎣 낚싯대").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("inv:start|float").setLabel("🟠 찌").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("inv:start|bait").setLabel("🪱 미끼").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("inv:start|fish").setLabel("🐟 물고기").setStyle(ButtonStyle.Secondary),
    
  );
  const extra = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("open:chest").setLabel(`📦 상자 열기 (${u.inv.chests||0})`).setStyle(ButtonStyle.Primary).setDisabled((u.inv.chests||0)<=0 || (u.inv.keys||0)<=0),
    new ButtonBuilder().setCustomId("info:key").setLabel(`🗝️ 열쇠 (${u.inv.keys||0})`).setStyle(ButtonStyle.Secondary)
  );
  return { embeds:[eb], components:[row, extra] };
}

const data = new SlashCommandBuilder().setName("낚시").setDescription("낚시 통합 명령")
  .addSubcommand(s=>s.setName("낚시터").setDescription("낚시 시작"))
  .addSubcommand(s=>s.setName("구매").setDescription("장비/미끼 구매"))
  .addSubcommand(s=>s.setName("판매").setDescription("보유 물고기 판매"))
  .addSubcommand(s=>s.setName("인벤토리").setDescription("인벤토리 확인/장착/상자"))
  .addSubcommand(s=>s.setName("수족관").setDescription("수족관 관리 / 성장"))
  .addSubcommand(s=>s.setName("도감").setDescription("잡은 물고기 도감 보기"))
  .addSubcommand(s=>s.setName("기록").setDescription("개인 낚시 기록 확인").addUserOption(o=>o.setName("유저").setDescription("조회 대상")))
  .addSubcommand(s=>s.setName("기록순위").setDescription("티어/포인트/최대길이 순위 TOP20"))
  .addSubcommand(s=>s.setName("도움말").setDescription("낚시 시스템 도움말"))
  .addSubcommand(s=>s.setName("퀘스트").setDescription("일일/주간 퀘스트 진행 및 보상 확인")) 
  .addSubcommand(s=>s.setName("스타터패키지").setDescription("신규 유저 스타터 패키지 수령 (1회 한정)"));


function hintLine(tension, hpRatio) {
  const H_NEUT = [
    "물속에서 잔잔한 파동이 느껴지지만, 큰 움직임은 느껴지지 않습니다.",
    "작은 떨림이 전해지지만, 어디로 튈지 알 수 없는 애매한 기류가 이어집니다.",
    "고요 속에 작은 흔들림이 섞여 들어옵니다. 뭔가를 감추고 있는 듯 모호합니다.",
    "은은한 파문이 번지지만, 확실한 방향은 잡히지 않습니다.",
    "잔잔한 움직임 속에 불규칙한 떨림이 스며 있습니다.",
    "잠시 멈춘 듯하다가도 미세한 기척이 스쳐 지나갑니다.",
    "심연 속에서 정체 모를 흐름이 올라옵니다.",
    "물결과 함께 규칙 없는 리듬이 감돌고 있습니다.",
    "일렁임이 보이는 듯 하지만 잘 드러나지 않습니다.",
    "낯선 긴장감이 얕게 깔려 있습니다.",
    "기척이 느껴집니다... 숨은 의도를 알 수 없습니다.",
    "불분명한 떨림이 간헐적으로 느껴집니다.",
    "물결이 아지랑이처럼 스물스물 느껴집니다.",
    "머뭇거리는 듯한 움직임이 낚싯대에 스며듭니다.",
    "확실치 않은 기류가 흘러 지나갑니다.",
    "숨 죽이며 호흡하듯 가볍게 일렁입니다.",
    "속내를 알 수 없는 흔들림이 이어집니다.",
    "작게 이어지는 떨림이 교차합니다.",
    "맑은 물결 속에 미약한 흔들림이 섞여 있습니다.",
    "얕은 긴장감이 불규칙적으로 느껴집니다.",
    "깊은 곳에서부터 작은 울림이 전해집니다.",
    "고요합니다... 느껴지는 것이 없습니다.",
    "느낄 수 없을 정도의 작은 진동이 전해지는 듯 합니다.",
    "가벼운 꿈틀거림이 퍼지는 듯 합니다.",
    "의도를 알 수 없는 저항이 느껴지는 듯 합니다.",
    "고요 속, 알 수 없는 긴장감이 맴돕니다.",
    "평온 속에 낯선 떨림이 느껴집니다.",
    "규칙 없는 흔들림이 간간이 치고 들어옵니다.",
    "스쳐가듯 미묘한 기류가 낚싯대에 전해집니다.",
    "확신하기 힘든 파문이 맴돌고 있습니다."
  ];

  const H_HIGH = [
  "줄이 한껏 팽팽해져 손끝이 저릿합니다. 마치 터질 듯한 긴장감이 감돕니다.",
  "거센 힘이 몰아치며 줄을 사납게 당겨옵니다. 위험한 기세가 이어집니다.",
  "묵직한 압박이 전해져 옵니다. 언제 끊어질지 모르는 불안이 스며듭니다.",
  "팽팽한 기운이 물결처럼 번집니다. 단 한순간의 틈도 없습니다.",
  "사납게 치받는 힘에 온몸이 긴장됩니다. 벼랑 끝에 선 듯 아슬아슬합니다.",
  "거대한 저항이 버티며 밀려옵니다. 신경이 곤두서는 순간입니다.",
  "칼날 같은 긴장감이 줄을 타고 전해집니다. 손끝이 얼어붙습니다.",
  "강렬한 저항이 멈추지 않습니다. 물살마저 흔들리는 듯합니다.",
  "숨조차 막히는 팽팽함이 이어집니다. 줄이 날카롭게 떨립니다.",
  "모든 힘이 한곳으로 쏠리듯 압박이 몰려듭니다.",
  "사납게 당겨지는 힘이 팔을 무겁게 짓누릅니다.",
  "끝을 알 수 없는 저항이 질긴 기세로 이어집니다.",
  "굉음을 내듯 줄이 휘청입니다. 공기가 떨려옵니다.",
  "매섭게 몰아치는 긴장감이 손끝을 마비시킵니다.",
  "위태로운 기세가 칼날 위를 걷는 듯 이어집니다.",
  "무자비한 압박이 거세게 밀려옵니다. 버티기조차 힘듭니다.",
  "줄이 끊어질 듯 떨리며 위태롭게 팽팽합니다.",
  "위협적인 긴장감이 감싸옵니다. 방심은 허락되지 않습니다.",
  "버거운 무게가 줄을 타고 연이어 끌어옵니다.",
  "질식할 듯 강렬한 압박이 사방에서 스며듭니다.",
  "끝없는 저항이 매섭게 이어집니다. 숨 돌릴 틈이 없습니다.",
  "사납게 요동치는 줄이 손을 짓누릅니다.",
  "불안이 고조됩니다. 긴장이 절정에 달했습니다.",
  "팽팽히 휘어진 줄이 위태롭게 흔들립니다.",
  "극도의 긴장감이 파도처럼 밀려듭니다.",
  "압박이 사방에서 죄어옵니다. 공포가 스며듭니다.",
  "숨이 막힐 정도로 강렬하게 당겨집니다.",
  "휘청거릴 만큼 무거운 힘이 이어집니다.",
  "온몸을 옥죄는 듯한 압박이 감돕니다.",
  "폭발 직전 같은 긴장감이 손끝을 짓누릅니다."
];


  const H_LOW = [
  "줄이 헐겁게 늘어져 있습니다. 긴장감이 한순간 빠져나간 듯합니다.",
  "힘이 사라진 듯 줄이 느슨하게 흔들립니다.",
  "팽팽하던 긴장이 풀리며 가벼운 흔적만 남아 있습니다.",
  "움직임은 이어지지만, 강렬함은 이미 사라졌습니다.",
  "빈틈이 드러난 듯 줄이 가볍게 출렁입니다.",
  "어느새 여유로운 흐름이 감돕니다.",
  "묽은 긴장감만 이어집니다. 무게는 거의 느껴지지 않습니다.",
  "물결에 실려 힘이 빠져나간 듯 잔잔합니다.",
  "기세가 풀리며 가벼운 흔들림만 남아 있습니다.",
  "헐거운 줄이 흔들리며 느긋한 기류를 만듭니다.",
  "저항의 무게가 옅어지고 공허한 울림만 스칩니다.",
  "느슨한 결이 퍼져가며 움직임은 점점 희미해집니다.",
  "차분하게 잔물결만 이어질 뿐입니다.",
  "큰 힘은 사라지고 미약한 떨림만이 전해집니다.",
  "여유로운 간격으로 가벼운 흐름이 이어집니다.",
  "팽팽하던 긴장이 완전히 흘러내립니다.",
  "미약한 움직임만이 고요 속에 남아 있습니다.",
  "힘이 빠져나간 듯 잔잔한 분위기입니다.",
  "거센 저항은 사라지고 부드럽게 출렁입니다.",
  "줄은 단순히 흔들릴 뿐, 압박감은 느껴지지 않습니다.",
  "느릿한 움직임만 이어지고 있을 뿐입니다.",
  "저항이 옅어지고 힘은 공허하게 흩어집니다.",
  "부드러운 출렁임만이 남아 있습니다.",
  "대체로 긴장은 풀리고 한가로운 흐름이 이어집니다.",
  "이따금 느슨한 움직임만 전해집니다.",
  "조용히 힘이 빠져나가는 순간입니다.",
  "헐거운 흐름이 공허하게 이어집니다.",
  "기세가 꺾이며 움직임이 서서히 잦아듭니다.",
  "잔잔한 물결만이 차분히 이어집니다.",
  "공백 같은 느슨함이 감돌고 있습니다."
];


  const H_STRONG = [
  "거센 힘이 줄을 타고 폭풍처럼 몰려듭니다. 바다 전체가 뒤집히는 듯합니다.",
  "사납게 요동치며 줄을 무자비하게 끌어당깁니다.",
  "격렬한 저항이 쉼 없이 이어집니다. 굉음처럼 손끝을 강타합니다.",
  "맹렬히 버티며 물결을 거세게 뒤흔듭니다.",
  "사방으로 몸부림치며 포효하듯 기세를 터뜨립니다.",
  "분노에 찬 움직임이 거칠게 이어집니다.",
  "휘몰아치는 저항이 물살을 가르며 밀려옵니다.",
  "벼락 같은 움직임이 줄을 타고 전해집니다.",
  "폭풍우처럼 쉼 없는 저항이 이어집니다.",
  "사납게 몸부림치며 줄을 흔들어댑니다.",
  "포효하는 듯한 기세가 온몸을 휘감습니다.",
  "불꽃처럼 튀어 오르며 저항을 거듭합니다.",
  "위협적인 기운이 파도처럼 몰아칩니다.",
  "맹렬히 휘몰아치며 제어할 틈을 허락하지 않습니다.",
  "폭발적인 힘이 연달아 이어집니다.",
  "공포스러운 기세가 전신을 압박합니다.",
  "광폭하게 버둥거리며 힘을 키워갑니다.",
  "끝을 모르는 압박이 밀려와 줄을 휘게 만듭니다.",
  "짐승 같은 거친 몸짓이 몰려듭니다.",
  "전율이 이는 듯한 강한 저항이 이어집니다.",
  "격정적인 몸부림이 파도처럼 이어집니다.",
  "사나운 기세가 가라앉을 기미가 없습니다.",
  "터져 나오는 힘이 사방으로 분출됩니다.",
  "공격적인 파동이 연이어 몰려듭니다.",
  "제어하기 벅찰 만큼 거친 저항이 이어집니다.",
  "거칠게 날뛰는 기세가 줄을 무겁게 짓누릅니다.",
  "불안정하게 솟구치며 위협을 더해갑니다.",
  "강렬한 파동이 폭발하듯 번져갑니다.",
  "사납게 휘몰아치며 주변을 뒤흔듭니다.",
  "쉬지 않고 이어지는 거대한 몸부림이 멈추질 않습니다."
];


  const H_WEAK = [
  "점차 기세가 꺾이며 움직임이 느려집니다. 남은 힘은 희미합니다.",
  "움찔거리던 동작이 줄어들고 무게감도 사라져갑니다.",
  "기운이 빠져나간 듯 동작이 둔해집니다.",
  "더딘 몸짓 속에 지친 기색이 역력합니다.",
  "점차 무력해지며 저항은 흐릿해집니다.",
  "기세가 약해지고 생기 없는 움직임만 이어집니다.",
  "버거운 듯 둔탁한 몸짓이 힘겹게 이어집니다.",
  "숨이 가빠진 듯 지쳐가는 기운이 드러납니다.",
  "한풀 꺾이며 무거운 기세가 사라져갑니다.",
  "지쳐 쓰러질 듯 남은 힘이 빠져나갑니다.",
  "늘어진 듯 힘이 전혀 실리지 않습니다.",
  "깊이 잠기듯 고요가 번져갑니다.",
  "둔한 몸짓만 이어지고 있을 뿐입니다.",
  "호흡이 흐려지듯 기운이 공허해집니다.",
  "남은 힘을 짜내듯 희미한 저항만 이어집니다.",
  "움직임이 메말라 생동감이 사라졌습니다.",
  "둔탁한 흐름만 어설프게 이어집니다.",
  "마지막 불씨처럼 미약한 기운만 남아 있습니다.",
  "완전히 지쳐 더는 기세를 이어가지 못합니다.",
  "무너져 내리듯 힘이 흩어집니다.",
  "느릿하게 몸짓이 이어지지만 기세는 없습니다.",
  "힘겨운 듯 겨우 몸부림을 이어갑니다.",
  "저항은 옅어지고 지친 기운만 감돕니다.",
  "빈 껍데기 같은 움직임만 어설프게 남아 있습니다.",
  "깊이 잠기듯 고요 속으로 빠져듭니다.",
  "생기가 끊기며 몸짓이 점차 사라집니다.",
  "조용히 꺼져가듯 움직임이 희미해집니다.",
  "미약한 떨림만이 마지막 흔적처럼 남습니다.",
  "모든 기운이 빠져 더는 힘을 쓰지 못합니다.",
  "마지막 흔들림이 서서히 잦아듭니다."
];

  const picks = [];
  if (tension >= SAFE_TENSION_MAX) picks.push(...H_HIGH);
  if (tension <= SAFE_TENSION_MIN) picks.push(...H_LOW);
  if (hpRatio >= 0.7) picks.push(...H_STRONG);
  if (hpRatio <= 0.35) picks.push(...H_WEAK);
  if (picks.length < 2) picks.push(...H_NEUT);
  return picks[randInt(0, picks.length-1)];
}

function caughtSetOf(u){
  const set = new Set(Object.keys(u.stats.best||{}));
  for (const f of (u.inv.fishes||[])) set.add(f.n);
  return set;
}
function dexRarityRows(cur){
  const styleMap = {
    "노말": ButtonStyle.Secondary, 
    "레어": ButtonStyle.Success,  
    "유니크": ButtonStyle.Success,  
    "레전드": ButtonStyle.Primary,  
    "에픽": ButtonStyle.Primary,   
    "언노운": ButtonStyle.Danger   
  };
  const rows = [];
  for (let i=0; i<RARITY.length; i+=3) {
    const chunk = RARITY.slice(i, i+3).map(r =>
      new ButtonBuilder()
        .setCustomId(`dex:rar|${r}`)
        .setLabel(r)
        .setStyle(r===cur ? ButtonStyle.Primary : (styleMap[r] || ButtonStyle.Secondary))
        .setDisabled(r===cur)
    );
    rows.push(new ActionRowBuilder().addComponents(...chunk));
  }
  return rows;
}

function dexNavRow(hasPrev, hasNext){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("dex:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId("dex:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(!hasNext),
    new ButtonBuilder().setCustomId("dex:close").setLabel("닫기").setStyle(ButtonStyle.Secondary)
  );
}
function renderDexList(u, st){
  const all = FISH_BY_RARITY[st.rarity]||[];
  const caught = caughtSetOf(u);
  const total = all.length;
  const start = st.page*DEX_PAGE_SIZE;
  const slice = all.slice(start, start+DEX_PAGE_SIZE);
  const got = all.filter(n=>caught.has(n)).length;

  const lines = slice.map((n,i)=>{
    const idx = start + i + 1;
    if (caught.has(n)) {
      const rec = u.stats.best?.[n]||{};
      const L = rec.length ? `${Math.round(rec.length)}cm` : "-";
      const cnt = u.stats.speciesCount?.[n] ?? 0;
      const meta = [L, `${cnt.toLocaleString()}회`].join(" | ");
      const starName = withStarName(n, rec.length || 0);
      return `${idx}. ${starName} — ${meta}`;
    }
    return `${idx}. ??? — ?????`;
  });

  const eb = new EmbedBuilder()
    .setTitle(`📘 낚시 도감 — ${st.rarity} [${got}/${total}]`)
    .setDescription(lines.join("\n") || "_표시할 항목이 없습니다._")
    .setColor(colorOf(st.rarity));

  const components = [...dexRarityRows(st.rarity)];
  if (slice.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("dex:select")
      .setPlaceholder("상세로 볼 항목 선택")
      .addOptions(slice.map(n=>({ label: caught.has(n) ? n : "???", value: n })));
    components.push(new ActionRowBuilder().addComponents(menu));
  }
  components.push(dexNavRow(start>0, start+DEX_PAGE_SIZE<total));
  return { embeds:[eb], components };
}

function renderDexDetail(u, st, name){
  const caught = caughtSetOf(u);
  const all = FISH_BY_RARITY[st.rarity]||[];
  const total = all.length;
  const got = all.filter(n=>caught.has(n)).length;

  if (!caught.has(name)) {
    const eb = new EmbedBuilder()
      .setTitle(`❔ ??? — ${st.rarity} [${got}/${total}]`)
      .setDescription("아직 발견하지 못했습니다. 더 낚시해 보세요.")
      .setColor(colorOf("언노운"))
      .setImage(getIconURL("unknown") || null);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dex:back").setLabel("목록으로").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("dex:close").setLabel("닫기").setStyle(ButtonStyle.Secondary)
    );
    return { embeds:[eb], components:[...dexRarityRows(st.rarity), row] };
  } else {
    const rec = u.stats.best?.[name]||{};
    const L = rec.length ? `${Math.round(rec.length)}cm` : "-";
    const C = (u.stats.speciesCount?.[name]||0);
    const starName = withStarName(name, rec.length || 0);

    const eb = new EmbedBuilder()
      .setTitle(`📖 ${starName} — ${st.rarity} [${got}/${total}]`)
      .setDescription([`최대 길이: ${L}`, `누적 횟수: ${C.toLocaleString()}회`].join("\n"))
      .setColor(colorOf(st.rarity))
      .setImage(getIconURL(name) || null);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dex:back").setLabel("목록으로").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("dex:close").setLabel("닫기").setStyle(ButtonStyle.Secondary)
    );
    return { embeds:[eb], components:[...dexRarityRows(st.rarity), row] };
  }
}


function aquariumSlotLabel(a, idx){
  if (!a) return `빈 슬롯 #${idx+1}`;
  const name = withStarName(a.n, a.l);
  const price = valueWithLevel(a.base, a.lv).toLocaleString();
  return `${name} • Lv.${a.lv} • ${a.r} • ${a.l}cm • ${price}코인`;
}

function buildAquariumHome(u){
  ensureAquarium(u);
  const eb = new EmbedBuilder()
    .setTitle(`🏝️ 수족관 (${u.aquarium.length}/${AQUARIUM_MAX})`)
    .setDescription([
      "최대 5마리까지 기를 수 있어.",
      "인벤토리에서 분리되며, 판매 대상에서도 제외돼.",
      "개별 물고기를 눌러 상호작용(칭찬/먹이/방출)해봐!"
    ].join("\n"))
    .setColor(0x77ddaa)
    .setImage(AQUARIUM_BANNER_URL);

  const lines = [];
  for (let i=0;i<AQUARIUM_MAX;i++){
    const a = u.aquarium[i];
    lines.push(`• ${aquariumSlotLabel(a, i)}`);
  }
  eb.addFields({ name:"슬롯", value: lines.join("\n"), inline:false });

  const rows = [];
  // 슬롯 버튼들
  const slotBtns = [];
  for (let i=0;i<AQUARIUM_MAX;i++){
    const has = !!u.aquarium[i];
    slotBtns.push(
      new ButtonBuilder()
        .setCustomId(`aqua:view|${i}`)
        .setLabel(has ? `슬롯${i+1}` : `빈 슬롯${i+1}`)
        .setStyle(has ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(!has && u.aquarium.length <= i ? false : !has) // 빈 슬롯 버튼은 활성화(추가 안내)
    );
    if ((i%5)===4 || i===AQUARIUM_MAX-1) rows.push(new ActionRowBuilder().addComponents(...slotBtns.splice(0)));
  }

  // 추가/도움말
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aqua:add").setLabel("➕ 수족관에 넣기").setStyle(ButtonStyle.Success)
      .setDisabled(u.aquarium.length >= AQUARIUM_MAX),
    new ButtonBuilder().setCustomId("aqua:help").setLabel("❓ 안내").setStyle(ButtonStyle.Secondary)
  ));

  return { embeds:[eb], components: rows };
}

function buildAquariumView(u, idx){
  const a = u.aquarium[idx];
  if (!a) {
    const eb = new EmbedBuilder()
      .setTitle(`🕳️ 빈 슬롯 #${idx+1}`)
      .setDescription([
        "여긴 아직 비었어.",
        "인벤토리에서 물고기를 선택해 수족관에 넣어줘!"
      ].join("\n"))
      .setColor(0x77ddaa);

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aqua:add").setLabel("➕ 수족관에 넣기").setStyle(ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aqua:home").setLabel("🏠 수족관 홈").setStyle(ButtonStyle.Secondary)
      )
    ];

    return { embeds:[eb], components: rows };
  }

  resetFeedIfNewDay(a);
  const name = withStarName(a.n, a.l);
  const need = xpNeed(a.lv);
  const cur = Math.min(a.xp, need);
  const price = valueWithLevel(a.base, a.lv);

  const eb = new EmbedBuilder()
    .setTitle(`🐟 ${name}`)
    .setThumbnail(getIconURL(a.n))
    .setColor(0x44cc99)
    .addFields(
      { name:"등급/크기", value:`${a.r} / ${a.l}cm`, inline:true },
      { name:"레벨", value:`Lv.${a.lv} ${a.lv<10?`(${cur}/${need})`: "(만렙)"}`, inline:true },
      { name:"현재 가치", value:`${price.toLocaleString()} 코인`, inline:true },
      { name:"먹이/칭찬", value:`오늘 먹이 ${a.feedCount}/5 · ${canPraise(a)?"칭찬 가능":"칭찬 쿨다운"}`, inline:false }
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aqua:praise|${idx}`).setLabel("💬 칭찬하기").setStyle(ButtonStyle.Secondary).setDisabled(!canPraise(a) || a.lv>=10),
      new ButtonBuilder().setCustomId(`aqua:feed|${idx}`).setLabel("🪱 먹이주기").setStyle(ButtonStyle.Success).setDisabled(a.feedCount>=5 || a.lv>=10),
      new ButtonBuilder().setCustomId(`aqua:release|${idx}`).setLabel("📦 방출하기").setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aqua:home").setLabel("🏠 수족관 홈").setStyle(ButtonStyle.Secondary)
    )
  ];
  return { embeds:[eb], components: rows };
}



function rewardText(u, r) {
  if (r.type === "rod") {
    const own = Object.prototype.hasOwnProperty.call(u.inv.rods, r.name);
    return `🎣 ${r.name} ${own ? "(내구도 최대치로 복구)" : "획득"}`;
  }
  if (r.type === "float") {
    const own = Object.prototype.hasOwnProperty.call(u.inv.floats, r.name);
    return `🟠 ${r.name} ${own ? "(내구도 최대치로 복구)" : "획득"}`;
  }
  if (r.type === "bait") {
    const pack = BAIT_SPECS[r.name]?.pack ?? 20;
    const cur  = u.inv.baits[r.name] || 0;
    if (cur > 0) {
      const need = Math.max(0, pack - cur);
      return need > 0
        ? `🪱 ${r.name} ${need}개 보충 (현재 ${cur}/${pack})`
        : `🪱 ${r.name} 완충 (이미 ${pack}/${pack})`;
    }
    const qty = r.qty ?? pack;
    return `🪱 ${r.name} ${qty}개`;
  }
  if (r.type === "coin") {
    return `🪙 코인 ${Number(r.amt||0).toLocaleString()}`;
  }
  if (r.type === "be") {
    return `🔷 파랑 정수 ${Number(r.amt||0).toLocaleString()}원`;
  }
  if (r.type === "key") {
    return `🗝️ 까리한 열쇠 ${Number(r.qty||1).toLocaleString()}개`;
  }
  if (r.type === "chest") {
    return `📦 까리한 보물상자 ${Number(r.qty||1).toLocaleString()}개`;
  }
  return "";
}

async function giveReward(u, db, reward){
  if (reward.type === "rod") {
    if (u.inv.rods.hasOwnProperty(reward.name))
      u.inv.rods[reward.name] = ROD_SPECS[reward.name]?.maxDur || 0;
    else addRod(u, reward.name);
    if (reward.name === "전설의 낚싯대") recordFirst(db, "legendRod", u._uid);

  } else if (reward.type === "float") {
    if (u.inv.floats.hasOwnProperty(reward.name))
      u.inv.floats[reward.name] = FLOAT_SPECS[reward.name]?.maxDur || 0;
    else addFloat(u, reward.name);

  } else if (reward.type === "bait") {
    const pack = BAIT_SPECS[reward.name]?.pack || 20;
    const cur  = u.inv.baits[reward.name] || 0;
    if (cur > 0) u.inv.baits[reward.name] = Math.max(cur, pack);
    else addBait(u, reward.name, reward.qty ?? pack);

  } else if (reward.type === "coin") {
    gainCoins(u, db, reward.amt || 0);

  } else if (reward.type === "be") {
    await addBE(u._uid, reward.amt || 0, "[낚시 보상]");

  } else if (reward.type === "key") {
    u.inv.keys = (u.inv.keys || 0) + (reward.qty || 1);

  } else if (reward.type === "chest") {
    u.inv.chests = (u.inv.chests || 0) + (reward.qty || 1);
  }
}

async function checkRewards(u, db, interaction){
  const embeds=[];

  // ✅ 티어 점프 대비: 현재 "포인트" 기준으로 달성 가능한 모든 티어를 순회하며 미수령 보상 지급
  for (const t of TIER_ORDER) {
    if ((u.stats.points||0) >= TIER_CUTOFF[t]) {
      if (REWARDS_TIER[t] && !u.rewards.tier[t]) {
        const rewards = REWARDS_TIER[t];
        const lines = rewards.map(r => `• ${rewardText(u, r)}`);
        u.rewards.tier[t] = true;
        if (t === "그랜드마스터") recordFirst(db, "gmTier", u._uid);
        if (t === "챌린저") recordFirst(db, "chTier", u._uid);
        for (const r of rewards) await giveReward(u, db, r);

        const eb = new EmbedBuilder()
          .setTitle("🏅 티어 보상")
          .setDescription([`달성: **${t}**`, "", ...lines].join("\n"))
          .setColor(0x55ff55);
        const tierIcon = getIconURL(t);
        if (tierIcon) eb.setThumbnail(tierIcon);
        embeds.push(eb);
      }
    } else {
      break;
    }
  }

  // 누적 어획 보상
  const caughtKeys = Object.keys(REWARDS_CAUGHT).map(Number).sort((a,b)=>a-b);
  for (const th of caughtKeys) {
    if ((u.stats.caught||0) >= th && !u.rewards.caught[th]) {
      const rewards = REWARDS_CAUGHT[th];
      const lines = rewards.map(r => `• ${rewardText(u, r)}`);
      u.rewards.caught[th] = true;
      for (const r of rewards) await giveReward(u, db, r);
      embeds.push(new EmbedBuilder()
        .setTitle("🎣 누적 어획 보상")
        .setDescription([`달성: **${th.toLocaleString()}마리**`, "", ...lines].join("\n"))
        .setColor(0x55aaee));
    }
  }

  // 사이즈(최대 길이) 보상
  const sizeKeys = Object.keys(REWARDS_SIZE).map(Number).sort((a,b)=>a-b);
  for (const th of sizeKeys) {
    if ((u.stats.max?.length||0) >= th && !u.rewards.size[th]) {
      const rewards = REWARDS_SIZE[th];
      const lines = rewards.map(r => `• ${rewardText(u, r)}`);
      u.rewards.size[th] = true;
      for (const r of rewards) await giveReward(u, db, r);
      embeds.push(new EmbedBuilder()
        .setTitle("📏 기록 갱신 보상")
        .setDescription([`달성: **${Math.round(th)}cm**`, "", ...lines].join("\n"))
        .setColor(0xaa77ff));
    }
  }

  if (embeds.length) {
    await interaction.followUp({ embeds, ephemeral: true });
  }
}


async function checkSpeciesRewards(u, db, fishName) {
  u.rewards.species ??= {};
  const rarity = RARITY_OF[fishName];
  if (!rarity) return null;
  const cnt = u.stats.speciesCount[fishName] || 0;
  const plan = SPECIES_MILESTONES[rarity];
  if (!plan) return null;
  const rec = (u.rewards.species[fishName] ||= {});
  const rewards = plan[cnt];
  if (!rewards || rec[cnt]) return null;

  rec[cnt] = true;
  for (const r of rewards) await giveReward(u, db, r);

  const lines = rewards.map(r => `• ${rewardText(u, r)}`).filter(Boolean);
  const title = cnt === 1 ? `🎉 첫 조우 보상 — ${fishName}` : `🎁 누적 ${cnt}회 보상 — ${fishName}`;
  const eb = new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join("\n"))
    .setColor(0x5bd7a5)
    .setThumbnail(getIconURL(fishName) || null);

  return eb;
}

function rankButtons(mode = "") {
  const is = (m) => mode === m ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const btn = (id, label) => new ButtonBuilder().setCustomId(`rank:${id}`).setLabel(label).setStyle(is(id));
  const row1 = new ActionRowBuilder().addComponents(
    btn("points", "포인트"),
    btn("len",    "최대 길이"),
    btn("caught", "누적 어획")
  );
  const row2 = new ActionRowBuilder().addComponents(
    btn("coins",  "코인"),
    btn("rarity", "등급별"),
    btn("firsts", "최초")
  );

  return [row1, row2]; 
}

async function buildRankEmbedPayload(db, interaction, mode){
  const displayNameCache = {};
  async function nameOf(id) {
    if (displayNameCache[id]) return displayNameCache[id];
    const guild = interaction.guild;
    const cached = guild?.members?.cache?.get(id);
    if (cached) {
      const nm = cached.displayName ?? cached.user?.globalName ?? cached.user?.username ?? `유저(${id})`;
      displayNameCache[id] = nm;
      return nm;
    }
    const m = await guild?.members?.fetch(id).catch(()=>null);
    const nm = m?.displayName ?? m?.user?.globalName ?? m?.user?.username ?? `유저(${id})`;
    displayNameCache[id] = nm;
    return nm;
  }
  function buildRarityRank(db, interaction){
  const rarityStats = {}; 
  for(const r of [...RARITY, "잡동사니"]) rarityStats[r] = {};

  for(const [id, u] of Object.entries(db.users||{})){
    ensureUser(u);
    for(const [name,count] of Object.entries(u.stats.speciesCount||{})){
      const rar = RARITY_OF[name] || (JUNK_SET.has(name) ? "잡동사니" : null);
      if(!rar) continue;
      rarityStats[rar][id] = (rarityStats[rar][id]||0) + count;
    }
  }
  return rarityStats;
}
async function buildRarityRankEmbed(db, interaction){
  const stats = buildRarityRank(db, interaction);
  const eb = new EmbedBuilder()
    .setTitle("🎣 등급별 낚은 횟수 TOP3")
    .setColor(0x99ccff);

  for(const rar of [...RARITY].reverse().concat("잡동사니")){
    const entries = Object.entries(stats[rar]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3);
    if(entries.length===0){
      eb.addFields({ name: `${RARITY_EMOJIS[rar] || ""} [${rar}]`, value:"1. 아직 잡은 유저가 없습니다.", inline:false });
    } else {
      const lines = await Promise.all(entries.map(async([id,cnt],i)=>{
        const nm = await nameOf(id);
        return `${i+1}. ${nm} : ${cnt} 마리`;
      }));
      if(entries.length < 3) lines.push(`${entries.length+1}. 순위권에 도전해보세요!`);
      eb.addFields({ name: `${RARITY_EMOJIS[rar] || ""} [${rar}]`, value:lines.join("\n"), inline:false });
    }
  }

  return { embeds:[eb], components: rankButtons("rarity") };
}

  async function buildFirstsEmbed(db, interaction) {
  ensureFirsts(db);
  const eb = new EmbedBuilder().setTitle("🏁 최초 달성자").setColor(0xf5a623);
  const firsts = db.firsts || {};
  const namesCache = {};

  async function nameOf(id) {
    if (namesCache[id]) return namesCache[id];
    const cached = interaction.guild.members.cache.get(id);
    if (cached) {
      namesCache[id] = cached.displayName;
      return namesCache[id];
    }
    const m = await interaction.guild.members.fetch(id).catch(()=>null);
    namesCache[id] = m?.displayName || `유저(${id})`;
    return namesCache[id];
  }

  async function lineFor(key, label){
    const rec = firsts[key];
    if (!rec) return `• ${label}: _아직 없음_`;
    const nm  = await nameOf(rec.userId);
    const when = new Date(rec.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    return `• ${label}: **${nm}** (${when})`;
  }

  const lines = [];
  lines.push(await lineFor("legendRod",  "최초로 전설의 낚싯대를 획득한 유저"));
  lines.push(await lineFor("gmTier",     "최초로 그랜드 마스터 티어를 달성한 유저"));
  lines.push(await lineFor("chTier",     "최초로 챌린저 티어를 달성한 유저"));
  lines.push(await lineFor("clioneAdult","최초로 클리오네 성체를 낚은 유저"));
  lines.push(await lineFor("leviathan",  "최초로 해룡 레비아탄을 낚은 유저"));

  eb.setDescription(lines.join("\n"));
  return { embeds:[eb], components: rankButtons("firsts") };
}

  if (mode === "firsts") return await buildFirstsEmbed(db, interaction);


  if (mode === "rarity") {
    return await buildRarityRankEmbed(db, interaction);
  }

  const base = Object.entries(db.users||{}).map(([id,u])=>{
    ensureUser(u);
    let bestN = null; let bestL = 0;
    for (const [n,b] of Object.entries(u.stats.best||{})) { const L = b.length||0; if (L > bestL) { bestL = L; bestN = n; } }
    if ((u.stats.max?.length||0) >= bestL) { bestL = u.stats.max?.length||0; bestN = u.stats.max?.name||bestN; }
    return { id, tier:u.tier, points:u.stats.points||0, caught:u.stats.caught||0, bestLen:bestL, bestName:bestN, coins:u.coins||0 };
  });
  let sorted;
  if(mode==="points") sorted=[...base].sort((a,b)=> b.points - a.points);
  if(mode==="len") sorted=[...base].sort((a,b)=> b.bestLen - a.bestLen);
  if(mode==="caught") sorted=[...base].sort((a,b)=> b.caught - a.caught);
  if(mode==="coins") sorted=[...base].sort((a,b)=> b.coins - a.coins);

  const top = sorted.slice(0,20);
  const lines = await Promise.all(top.map(async (o,i)=>{
    const nm = await nameOf(o.id);
    if(mode==="points") return `${i+1}. ${nm} — ${o.tier} (${o.points.toLocaleString()}점)`;
    if(mode==="len")    return `${i+1}. ${nm} — ${Math.round(o.bestLen)}cm${o.bestName?` (${withStarName(o.bestName, o.bestLen)})`:""}`;
    if(mode==="caught") return `${i+1}. ${nm} — ${o.caught.toLocaleString()}마리`;
    if(mode==="coins")  return `${i+1}. ${nm} — ${o.coins.toLocaleString()} 코인`;
  }));
  const titleMap = { points:"포인트", len:"물고기 크기", caught:"어획 횟수", coins:"낚시 코인" };
  const eb = new EmbedBuilder()
    .setTitle(`🏆 낚시 순위 TOP 20 — ${titleMap[mode]}`)
    .setDescription(lines.join("\n") || "_데이터가 없습니다._")
    .setColor(0xff77aa);
  return { embeds:[eb], components: rankButtons(mode) };
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

    if (sub === "퀘스트") {
  return await withDB(async db => {
    ensureQuests(db);
    const u = (db.users[userId] ||= {}); ensureUser(u);
    u._uid = userId;
    try {
      const payload = buildQuestEmbed(db, u);
      return interaction.reply({ ...payload, ephemeral: true });
    } finally {
      delete u._uid;
    }
  });
}

  if (sub === "수족관") {
  await interaction.deferReply({ ephemeral: true });
  return await updateUser(interaction.user.id, async (u, db) => {
    ensureAquarium(u);
    const payload = buildAquariumHome(u);
    return interaction.editReply(payload);
  });
}

  if (sub === "낚시터") {
  return await withDB(async db=>{
    ensureQuests(db);
    const u = (db.users[userId] ||= {}); ensureUser(u);
    try {
      u._uid = userId;

      const timeBand = currentTimeBand();
      const missKey = missingGearKey(u);
      const scene0 = missKey ? (getIconURL(missKey)||null)
                             : getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, timeBand, "기본");
      const eb = sceneEmbed(u, "🏞️ 낚시터", [
        "찌를 던져 입질을 기다려보세요.",
        "",
        equipLine(u)
      ].join("\n"), scene0);
      const viewRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("shop:start|rod").setLabel("🛒 낚싯대 보기").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("shop:start|float").setLabel("🧷 찌 보기").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("shop:start|bait").setLabel("🪱 미끼 보기").setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ embeds:[eb], components:[buttonsStart(u), viewRow], ephemeral:true });
    } finally {
      delete u._uid; 
    }
  });
}


  if (sub === "구매") {
    return await withDB(async db=>{
      const u = (db.users[userId] ||= {}); ensureUser(u);
      const eb = new EmbedBuilder().setTitle("🛒 낚시 상점")
        .setDescription([
          "종류를 골라 하나씩 넘기며 이미지와 스펙, 가격을 확인하고 구매해 주세요.",
          "",
          "• 낚싯대, 찌: 구매 시 내구도 최대치로 제공됩니다.",
          "• 미끼: 20개 묶음이며, 보유 수량이 20 미만이면 부족분만 비례 결제합니다."
        ].join("\n"))
        .setColor(0x55cc77)
        .setFooter({ text:`보유 코인: ${u.coins.toLocaleString()} | 정수: ${getBE(userId).toLocaleString()}` });
      const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("shop:start|rod").setLabel("🎣 낚싯대 보기").setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId("shop:start|float").setLabel("🟠 찌 보기").setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId("shop:start|bait").setLabel("🪱 미끼 보기").setStyle(ButtonStyle.Primary),
);
const row2 = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("nav:pond").setLabel("🏞️ 낚시터 입장").setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("inv:home").setLabel("🎒 인벤토리").setStyle(ButtonStyle.Secondary),
);

await interaction.reply({ embeds:[eb], components:[row, row2], ephemeral:true });

    });
  }

  if (sub === "인벤토리") {
    return await withDB(async db=>{
      const u = (db.users[userId] ||= {}); ensureUser(u);
      const payload = buildInventoryHome(u);
      await interaction.reply({ ...payload, ephemeral:true });
    });
  }

  if (sub === "판매") {
  return await withDB(async db=>{
    const u = (db.users[userId] ||= {}); ensureUser(u);
    const fishes = u.inv.fishes||[];
    const sellable = fishes.filter(f => !f.lock);
    const totalValue = sellable.reduce((sum, f) => sum + (f.price||0), 0);
    const eb = new EmbedBuilder().setTitle("💰 물고기 판매")
      .setDescription([
        `보유 물고기: ${fishes.length}마리`,
        "원하시는 방식으로 판매해 주세요."
      ].join("\n"))
      .addFields({ name:"전체 판매 예상 금액(잠금 제외)", value:`${totalValue.toLocaleString()} 코인`, inline:false })
      .setColor(0xffaa44);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fish:sell_all").setLabel("모두 판매").setStyle(ButtonStyle.Success).setDisabled(fishes.length===0),
      new ButtonBuilder().setCustomId("fish:sell_rarity").setLabel("등급별 판매").setStyle(ButtonStyle.Primary).setDisabled(fishes.length===0),
      new ButtonBuilder().setCustomId("fish:sell_select").setLabel("선택 판매").setStyle(ButtonStyle.Secondary).setDisabled(fishes.length===0),
      new ButtonBuilder().setCustomId("fish:sell_cancel").setLabel("판매 취소").setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("inv:home").setLabel("🎒 인벤토리").setStyle(ButtonStyle.Secondary),
    );
    
    await interaction.reply({ embeds:[eb], components:[row, row2], ephemeral:true });
    });
  }
  
    if (sub === "스타터패키지") {
    return await withDB(async db=>{
      const u = (db.users[userId] ||= {}); ensureUser(u);
      
      u.rewards ??= {};
      if (u.rewards.starter) {
        return interaction.reply({ content:"⚠️ 이미 스타터 패키지를 수령하셨습니다.", ephemeral:true });
      }
      
      addRod(u, "나무 낚싯대");
      addFloat(u, "동 찌");
      addBait(u, "지렁이 미끼", BAIT_SPECS["지렁이 미끼"].pack);
      
      u.equip.rod = "나무 낚싯대";
      u.equip.float = "동 찌";
      u.equip.bait = "지렁이 미끼";
      u.rewards.starter = true;

      const eb = new EmbedBuilder()
        .setTitle("🎁 스타터 패키지 지급 완료!")
        .setDescription([
          "신규 유저용 스타터 패키지를 받으셨습니다.",
          "",
          "• 🎣 나무 낚싯대 (내구도 최대치)",
          "• 🟠 동 찌 (내구도 최대치)",
          "• 🪱 지렁이 미끼 20개"
        ].join("\n"))
        .setColor(0x55ff88);

      return interaction.reply({ embeds:[eb], ephemeral:true });
    });
  }

  if (sub === "도감") {
  return await withDB(async db=>{
    const u = (db.users[userId] ||= {}); ensureUser(u);
    try {
      u._uid = userId;
      const st = { rarity:"노말", page:0, mode:"list" };
      dexSessions.set(userId, st);
      const payload = renderDexList(u, st);
      await interaction.reply({ ...payload, ephemeral:true });
    } finally {
      delete u._uid; 
    }
  });
}

  if (sub === "기록") {
  const target = interaction.options.getUser("유저") || interaction.user;
  return await withDB(async db=>{
    const u = (db.users[target.id] ||= {}); ensureUser(u);
    const top3 = Object.entries(u.stats.best || {}).sort((a,b)=> (b[1].length||0) - (a[1].length||0)).slice(0,3);
    const tierIcon = getIconURL(u.tier);
    const counts = rarityCountsOf(u);

const tierIndex = TIER_ORDER.indexOf(u.tier);
let remainText = "";
if (tierIndex >= 0 && tierIndex < TIER_ORDER.length - 1) {
  const nextTier = TIER_ORDER[tierIndex + 1];
  const nextCutoff = TIER_CUTOFF[nextTier];
  const remain = Math.max(0, nextCutoff - (u.stats.points || 0));
  remainText = ` (다음 티어까지 남은 점수: ${remain.toLocaleString()}점)`;
}

const lines = [
  `티어: **${u.tier}**${remainText}`,
  `포인트: **${(u.stats.points||0).toLocaleString()}**`,
  `누적 어획: **${(u.stats.caught||0).toLocaleString()}**`,
  `언노운 등급 어획: **${((counts||{})["언노운"]||0).toLocaleString()}**`,
  `최대 길이: **${Math.round(u.stats.max?.length||0)}cm** ${u.stats.max?.name ? `— ${withStarName(u.stats.max.name, u.stats.max.length)}` : ""}`,
  top3.length
    ? "**종류별 최대 상위 3**\n"
      + top3.map(([n,i])=>`• ${withStarName(n, i.length)} — ${Math.round(i.length)}cm / 최고가 ${i.price?.toLocaleString?.()||0}코인`).join("\n")
    : "_기록이 없습니다._"
];

    const eb = new EmbedBuilder().setTitle(`📜 낚시 기록 — ${target.username}`)
      .setDescription(lines.join("\n"))
      .setColor(0x66ddee);
    if (tierIcon) eb.setThumbnail(tierIcon);
    await interaction.reply({ embeds:[eb], ephemeral:true });
  });
}

  if (sub === "기록순위") {
    return await withDB(async db=>{
      const payload = await buildRankEmbedPayload(db, interaction, "points");
      await interaction.reply({ ...payload, ephemeral:true });
    });
  }

  if (sub === "도움말") {
    const eb = new EmbedBuilder().setTitle("❔ 낚시 도움말")
      .setDescription([
        "• `/낚시 낚시터` — 낚시 시작: 찌 던지기 → 대기 → 입질 → 릴 감기/풀기(파이팅)",
        "• `/낚시 구매` — 장비/미끼 구매(일부 정수 결제 가능). 미끼는 20개 묶음, 부족분만 비례결제",
        "• `/낚시 판매` — 모두/선택/수량 판매 지원",
        "• `/낚시 수족관` — 물고기를 최대 5마리까지 길러서 값을 올립니다",
        "• `/낚시 인벤토리` — 종류별 보기+장착/상자",
        "• `/낚시 도감` — 등급별 발견 현황과 상세 보기",
        "• `/낚시 퀘스트` — 낚시 관련 일일/주간 퀘스트 진행 및 보상 받기",
        "• `/낚시 기록 [유저]`, `/낚시 기록순위`",
        "",
        "⚙ 시간대: 낮(07:00~15:59) / 노을(16:00~19:59) / 밤(20:00~06:59) (KST)",
        "⚙ 장비는 사용 시 내구도 1 감소, 미끼는 입질 시작 시 1개 소모됩니다.",
        "⚙ ‘낚시 코인’은 BE(정수)와 별개 화폐입니다.",
        "⚙ 물고기는 클수록 낚시 난이도가 오르지만 품질이 높아 습득 경험치가 높고 판매 가격이 커집니다."
      ].join("\n"))
      .setColor(0xcccccc);
    return await interaction.reply({ embeds:[eb], ephemeral:true });
  }
}

async function component(interaction) {
  const userId = interaction.user.id;
  return await withDB(async db=>{
    ensureQuests(db);
    const u = (db.users[userId] ||= {}); ensureUser(u);
    try {
      const id = interaction.customId || "";
      u._uid = userId;

      // === [수족관] 컴포넌트 처리 (component() try 내부) ===
if (id.startsWith("aqua:") && interaction.isButton()) {
  await interaction.deferUpdate();
  const edit = mkSafeEditor(interaction);

  ensureAquarium(u);
  const [ , cmd, p1 ] = id.split(/[:|]/); 

  // 간단 멘트 (원하면 전역 상수로 빼도 됨)
  const praiseLines = [
    "헤헤, 예쁘다~ 오늘도 반짝이는구나~~",
    "좋아! 오늘 기분 최고야?",
    "귀엽다 귀여워~~",
    "물장구도 귀엽네 :D",
    "건강하게 잘 자라자!!"
  ];
  const eatLines = [
    "와아 잘 먹는다~!",
    "냠냠~ 더 튼튼해졌어!",
    "먹이가 마음에 드나보다!",
    "쑥쑥 크는 중!",
    "맛있는 거 먹고, 파워 업!!"
  ];

  if (cmd === "home") {
    return edit(buildAquariumHome(u));
  }

  if (cmd === "help") {
    return edit({
      content: [
        "• 수족관은 최대 5마리까지 보관",
        "• Lv.1→10 성장 (레벨당 가치 1.1배 누적)",
        "• 칭찬: 1시간 쿨다운, 소량 경험치",
        "• 먹이: 하루 5회, 자신보다 작은 물고기만 가능 (레어도/별/크기근접 비례)",
        "• 방출: 인벤토리로 복귀(현 레벨 가격 반영)"
      ].join("\n"),
      embeds: [],
      components: [ new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aqua:home").setLabel("🏠 돌아가기").setStyle(ButtonStyle.Secondary)
      ) ]
    });
  }

  if (cmd === "view") {
    const idx = Number(p1);
    return edit(buildAquariumView(u, idx));
  }

  if (cmd === "praise") {
    const idx = Number(p1);
    const a = u.aquarium[idx];
    if (!a) return edit({ content:"대상을 찾지 못했어.", embeds:[], components:[] });

    resetFeedIfNewDay(a);
    if (!canPraise(a)) return edit({ content:"아직 칭찬 쿨다운이야!", ...(buildAquariumView(u, idx)) });

    const beforeLv = a.lv;
    a.lastPraiseAt = Date.now();
    a.xp += 10;       // 칭찬 경험치 (원하면 값 조절)
    tryLevelUp(a);
    applyQuestEvent(u, db, "aqua_praise");
if (a.lv > beforeLv) {
  applyQuestEvent(u, db, "aqua_levelup", { levels: a.lv - beforeLv });
}

    return edit({ content: randPick(praiseLines), ...(buildAquariumView(u, idx)) });
  }

  if (cmd === "feed") {
    const idx = Number(p1);
    const a = u.aquarium[idx];
    if (!a) return edit({ content:"대상을 찾지 못했어.", embeds:[], components:[] });

    resetFeedIfNewDay(a);
    if (a.feedCount >= 5) return edit({ content:"오늘 먹이는 끝!(하루 5회)", ...(buildAquariumView(u, idx)) });

    // 자신보다 작은 인벤 물고기만 선택지로 노출 (최대 25개)
    const options = (u.inv.fishes || [])
      .map((f,i)=>({ f, i }))
      .filter(x => x.f.l < a.l)
      .slice(0, 25)
      .map(x => ({ label: withStarName(x.f.n, x.f.l), value: String(x.i) }));

    if (!options.length) {
      return edit({ content:"먹일 수 있는(자기보다 작은) 물고기가 없어.", ...(buildAquariumView(u, idx)) });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`aqua:feed_select|${idx}`)
      .setPlaceholder("먹일 물고기 선택")
      .addOptions(options);

    const view = buildAquariumView(u, idx);
    return edit({ ...view, components: [...view.components, new ActionRowBuilder().addComponents(menu)] });
  }

  if (cmd === "release") {
    const idx = Number(p1);
    const a = u.aquarium[idx];
    if (!a) return edit({ content:"대상을 찾지 못했어.", embeds:[], components:[] });

    const price = valueWithLevel(a.base, a.lv);
const back = {
  n: a.n,
  r: a.r,
  l: a.l,
  price,         // 현재 레벨이 반영된 표시/판매가
  lock: false,
  alv: a.lv,     // 수족관 레벨 저장
  axp: a.xp,     // 수족관 경험치 저장
  abase: a.base  // 원가(배율의 기준값) 저장 → 중첩 방지 핵심
};
u.inv.fishes.push(back);
u.aquarium.splice(idx, 1);

    return edit({ content:`${withStarName(a.n, a.l)}(Lv.${a.lv})를 인벤토리로 돌려보냈어.`, ...(buildAquariumHome(u)) });
  }

  if (cmd === "add") {
    if (u.aquarium.length >= AQUARIUM_MAX) {
      return edit({ content:"수족관이 꽉 찼어!", ...(buildAquariumHome(u)) });
    }
    const options = (u.inv.fishes || [])
      .slice(0, 25)
      .map((f,i)=>({ label: withStarName(f.n, f.l), value: String(i) }));

    if (!options.length) {
      return edit({ content:"인벤토리에 물고기가 없어.", ...(buildAquariumHome(u)) });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("aqua:add_select")
      .setPlaceholder("넣을 물고기 선택")
      .addOptions(options);

    const home = buildAquariumHome(u);
    return edit({ ...home, components: [...home.components, new ActionRowBuilder().addComponents(menu)] });
  }

  // 기타 미지정 명령
  return edit({ content:"알 수 없는 수족관 명령이야.", embeds:[], components:[] });
}

// === [수족관] 셀렉트 메뉴 (같은 try 내부) ===
if (interaction.isStringSelectMenu()) {
  const sid = interaction.customId || "";
  const vals = interaction.values || [];
  const first = vals[0];
  await interaction.deferUpdate();
  const edit = mkSafeEditor(interaction);

  // 추가 선택
  if (sid === "aqua:add_select") {
    ensureAquarium(u);
    if (u.aquarium.length >= AQUARIUM_MAX) {
      return edit({ content:"수족관이 꽉 찼어!", ...(buildAquariumHome(u)) });
    }
    const idx = Number(first);
    const f = (u.inv.fishes||[])[idx];
    if (!f) return edit({ content:"선택한 물고기를 찾지 못했어.", embeds:[], components:[] });

    (u.inv.fishes||[]).splice(idx,1);
const base = (f.abase ?? f.price) || 0; // 메타가 있으면 abase(원가), 없으면 현재표시가를 최초 기준으로
const lv   = f.alv ?? 1;
const xp   = f.axp ?? 0;

u.aquarium.push({
  n: f.n, r: f.r, l: f.l,
  base, lv, xp,
  feedKey: dailyKeyKST(),
  feedCount: 0,
  lastPraiseAt: 0
});


    return edit({ content:`${withStarName(f.n,f.l)}가 수족관에 입장!`, ...(buildAquariumHome(u)) });
  }

  // 먹이 선택
  if (sid.startsWith("aqua:feed_select|")) {
  const idx = Number(sid.split("|")[1]);
  const invIdx = Number(first);

  const a = u.aquarium[idx];
  const feed = (u.inv.fishes||[])[invIdx];
  if (!a || !feed) return edit({ content:"대상을 찾지 못했어.", embeds:[], components:[] });

  resetFeedIfNewDay(a);
  if (a.feedCount >= 5) return edit({ content:"오늘 먹이는 끝! (하루 5회)", ...(buildAquariumView(u, idx)) });
  if (feed.l >= a.l)     return edit({ content:"자기보다 작은 물고기만 먹일 수 있어.", ...(buildAquariumView(u, idx)) });

  const beforeLv = a.lv;
  const gain = feedXpGain(a, feed);
  a.xp += gain;
  a.feedCount += 1;
  tryLevelUp(a);
  applyQuestEvent(u, db, "aqua_feed");
  if (a.lv > beforeLv) {
    applyQuestEvent(u, db, "aqua_levelup", { levels: a.lv - beforeLv });
  }

  (u.inv.fishes||[]).splice(invIdx,1);

  return edit({ content: `${randPick(eatLines)} (+${gain}xp)`, ...(buildAquariumView(u, idx)) });
}


    // 먹이는 소모됨
    (u.inv.fishes||[]).splice(invIdx,1);

    return edit({ content: `${randPick(eatLines)} (+${gain}xp)`, ...(buildAquariumView(u, idx)) });
  }
}

    if (interaction.isStringSelectMenu()) {
      const [type] = interaction.customId.split("|");

      if (type === "sell-select") {
  const idxs = interaction.values.map(v=>parseInt(v,10)).filter(n=>!isNaN(n));
  sellSessions.set(userId, { ...(sellSessions.get(userId)||{}), selectIdxs: idxs });

  const fishes = u.inv.fishes || [];
  const pick = idxs.map(i=>fishes[i]).filter(Boolean);
  const sellablePick = pick.filter(f => f && !f.lock);
  const total = sellablePick.reduce((s,f)=>s+(f.price||0),0);

  const eb = new EmbedBuilder()
    .setTitle("🧾 선택 판매 미리보기")
    .setDescription(pick.length
     ? pick.map(f=>{
         const lockTag = f.lock ? "🔒 " : "";
         return `• ${lockTag}[${f.r}] ${f.n} — ${Math.round(f.l)}cm (${(f.price||0).toLocaleString()}코인)`;
       }).join("\n")
      : "_선택되지 않았습니다._")
    .addFields({ name:"합계", value:`${total.toLocaleString()} 코인` })
    .setColor(0xffaa44);

  const opts = fishes.slice(0,25).map((f,i)=>({
    label: `${f.lock ? "🔒 " : ""}[${f.r}] ${withStarName(f.n, f.l)} ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`,
    value: String(i),
    default: idxs.includes(i)
  }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sell-select")
    .setPlaceholder("판매할 물고기 선택(복수 선택 가능)")
    .setMinValues(1).setMaxValues(opts.length)
    .addOptions(opts);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("sell:confirm_selected").setLabel("선택 판매 확정").setStyle(ButtonStyle.Success).setDisabled(sellablePick.length===0),
    new ButtonBuilder().setCustomId("sell:cancel").setLabel("취소").setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds:[eb], components:[ new ActionRowBuilder().addComponents(menu), row ] });
}

      if (type === "sell-qty-choose") {
        const species = interaction.values[0];
        sellSessions.set(userId, { ...(sellSessions.get(userId)||{}), qtySpecies: species });
        const modal = new ModalBuilder().setCustomId("sell:qty_modal").setTitle("수량 입력");
        const input = new TextInputBuilder().setCustomId("qty").setLabel("판매 수량 (숫자)")
          .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("예: 3");
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "sell-rarity-choose") {
  const rarity = interaction.values[0];
  const fishes = u.inv.fishes || [];
  const list = fishes.filter(f => f.r === rarity && !f.lock);
  const total = list.reduce((s,f)=>s+(f.price||0),0);

  const eb = new EmbedBuilder()
    .setTitle(`🧾 [${rarity}] 등급 판매 미리보기`)
    .setDescription(list.length
      ? list.slice(0, 10).map(f => `• ${f.n} — ${Math.round(f.l)}cm (${(f.price||0).toLocaleString()}코인)`).join("\n")
      : "_판매할 물고기가 없습니다._")
    .addFields({ name: "합계", value: `${total.toLocaleString()} 코인` })
    .setColor(0xffaa44);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sell:confirm_rarity|${rarity}`)
      .setLabel(`[${rarity}] 판매 확정`).setStyle(ButtonStyle.Success).setDisabled(list.length===0),
    new ButtonBuilder().setCustomId("sell:cancel")
      .setLabel("판매 취소").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds:[eb], components:[row] });
}


      if (interaction.customId === "dex:select") {
        const name = interaction.values[0];
        const st = dexSessions.get(userId) || { rarity:"노말", page:0, mode:"list" };
        st.mode = "detail"; st.current = name;
        dexSessions.set(userId, st);
        const payload = renderDexDetail(u, st, name);
        return interaction.update({ ...payload });
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "sell:qty_modal") {
        const st = sellSessions.get(userId) || {};
        const species = st.qtySpecies;
        const raw = (interaction.fields.getTextInputValue("qty")||"").trim();
        const qty  = Math.max(0, Number.isFinite(Number(raw)) ? parseInt(raw,10) : 0);
        if (!species || qty<=0) return interaction.reply({ content:"입력이 올바르지 않습니다.", ephemeral:true });

        const fishes = u.inv.fishes || [];
        const selIdx = [];
        for (let i=0;i<fishes.length;i++){
          if (fishes[i]?.n === species) selIdx.push(i);
          if (selIdx.length >= qty) break;
        }
        const pick = selIdx.map(i=>fishes[i]).filter(f=>f && !f.lock); 
        const total = pick.reduce((s,f)=>s+(f.price||0),0);
        u.inv.fishes = fishes.filter((f,i)=>!selIdx.includes(i) || f.lock); 
        gainCoins(u, db, total);

        return interaction.reply({ content:`${species} ${pick.length}마리를 판매하여 ${total.toLocaleString()} 코인을 획득하셨습니다.`, ephemeral:true });
      }
      return;
    }

      if (id && id.startsWith("quest:claim|")) {
  const parts = id.split("|");
  const tier  = parts[1];
  const qid   = parts.slice(2).join("|"); 
  ensureQuests(db);
  const list = tier==="daily" ? (db.quests.daily.list||[]) : (db.quests.weekly.list||[]);
  const q = list.find(x=>x.id===qid);
  if (!q) return interaction.reply({ content:"퀘스트를 찾지 못했어.", ephemeral:true });
  if (u.quests.claimed[q.id]) return interaction.reply({ content:"이미 보상을 받았어.", ephemeral:true });
  if (!isComplete(u, q)) return interaction.reply({ content:"아직 완료되지 않았어!", ephemeral:true });
  u._uid = userId;
  await grantQuestReward(u, db, q.reward);
  u.quests.claimed[q.id] = true;
  delete u._uid;
  const payload = buildQuestEmbed(db, u);
return interaction.update({ ...payload });
}

if (id === "quest:refresh") {
  await interaction.deferUpdate().catch(()=>{});
  const payload = buildQuestEmbed(db, u);
  try {
    await interaction.editReply({ ...payload });
  } catch {
    await interaction.followUp({ ...payload, ephemeral: true }).catch(()=>{});
  }
  return;
}

if (id === "quest:claimAll") {
  await interaction.deferUpdate().catch(()=>{});

  const agg = aggregatePendingRewards(u, db);
  if (!agg.count) {
    await interaction.followUp({ content: "완료한 퀘스트가 없습니다.", ephemeral: true }).catch(()=>{});
    return;
  }

  for (const q of getActiveQuests(db)) {
    if (isComplete(u, q) && !u.quests.claimed[q.id]) {
      await grantQuestReward(u, db, q.reward);
      u.quests.claimed[q.id] = true;
    }
  }

  const payload = buildQuestEmbed(db, u);
  try {
    await interaction.editReply({ ...payload });
  } catch {
    await interaction.followUp({ ...payload, ephemeral: true }).catch(()=>{});
  }

  const lines = [];
  if (agg.coin > 0) lines.push(`• 🪙 코인 ${agg.coin.toLocaleString()}`);
  if (agg.be   > 0) lines.push(`• 🔷 파랑 정수 ${agg.be.toLocaleString()}`);
  for (const [name, qty] of Object.entries(agg.baits)) {
    lines.push(`• 🪱 ${name} x${qty.toLocaleString()}`);
  }
  const doneEb = new EmbedBuilder()
    .setTitle("🎁 퀘스트 보상 수령")
    .setDescription([`완료된 퀘스트 ${agg.count}개 보상을 수령했습니다.`, "", ...lines].join("\n"))
    .setColor(0x55ff88)
    .setImage(QUEST_IMAGE_URL);

  await interaction.followUp({ embeds: [doneEb], ephemeral: true }).catch(()=>{});
  return;
}




    // component() 내부
if (id === "fish:share") {
  const rec = lastCatch.get(userId);
  if (!rec) {
    return interaction.reply({ content: "최근에 잡은 물고기가 없어.", ephemeral: true });
  }
  if (Date.now() - rec.ts > 10 * 60 * 1000) {
    lastCatch.delete(userId);
    return interaction.reply({ content: "최근 포획 정보가 만료됐어. 다음에 또 공유해줘!", ephemeral: true });
  }

  const nick =
    interaction.member?.displayName ??
    interaction.user.globalName ??
    interaction.user.username;

  let eb;
  if (rec.type === "loot") {
    // 🎁 전리품 공유
    eb = new EmbedBuilder()
      .setTitle(`🎁 ${nick}의 전리품!`)
      .setDescription(`• ${rec.desc}`)
      .setColor(colorOf(rec.rarity))
      .setImage(rec.icon || getIconURL(rec.name) || null);
  } else {
    // 🐟 물고기 공유
    eb = new EmbedBuilder()
      .setTitle(`🐟 ${nick}의 성과!`)
      .setDescription([
        `• 이름: [${rec.rarity}] ${withStarName(rec.name, rec.length)}`,
        `• 길이: ${Math.round(rec.length)}cm`,
        `• 판매가: ${rec.sell.toLocaleString()} 코인`,
      ].join("\n"))
      .setColor(colorOf(rec.rarity))
      .setImage(getIconURL(rec.name) || null);
  }

  try {
    await interaction.channel.send({ embeds: [eb] });
    return interaction.reply({ content: "공유 완료! 🎉", ephemeral: true });
  } catch {
    return interaction.reply({ content: "채널에 공유 실패. 권한 확인 부탁!", ephemeral: true });
  }
}

  if (id === "auto:toggle") {
  u.settings ??= {};
  u.settings.autoBuy = !u.settings.autoBuy;

  const viewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("shop:start|rod").setLabel("🛒 낚싯대 보기").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop:start|float").setLabel("🧷 찌 보기").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop:start|bait").setLabel("🪱 미끼 보기").setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ components: [buttonsStart(u), viewRow] });
}

    if (id === "fish:cancel") {
      clearSession(userId);
      return interaction.update({ content:"낚시를 종료했습니다.", components:[], embeds:[] });
    }
    if (id === "fish:equip") {
      const payload = buildInventoryHome(u);
      return interaction.update({ ...payload });
    }      
      if (id === "fish:cast" || id === "fish:recast") {
  // 자동구매(세 파츠 모두 1일 때) 안내
  let autoNote = "";
  try { autoNote = await autoBuyIfAllOne(u, db) || ""; } catch {}

  // 장비 체크
  if (!hasAllGear(u)) {
    const miss = [
      !u.equip.rod ? "낚싯대" : (u.inv.rods[u.equip.rod] ?? 0) <= 0 ? "낚싯대(내구도 0)" : null,
      !u.equip.float ? "찌" : (u.inv.floats[u.equip.float] ?? 0) <= 0 ? "찌(내구도 0)" : null,
      !u.equip.bait ? "미끼" : (u.inv.baits[u.equip.bait] ?? 0) <= 0 ? "미끼(0개)" : null
    ].filter(Boolean).join(", ");
    const missKey = missingGearKey(u);
    const eb = new EmbedBuilder().setTitle("⚠ 장비 부족")
      .setDescription(`부족한 장비: **${miss}**\n/낚시 구매 에서 구매하시거나 인벤토리에서 장착해 주세요.`)
      .setColor(0xff5555);
    if (missKey) eb.setImage(getIconURL(missKey) || null);
    return interaction.update({ embeds: [eb], components: [] });
  }

  clearSession(userId);
  const s = { state: "waiting", tension: randInt(35, 65), safeEdit: mkSafeEditor(interaction) };
  sessions.set(userId, s);

  const timeBand = currentTimeBand();
  const scene1 = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, timeBand, "찌들어감");

  const waitSec = Math.max(
  5,
  Math.min(
    FISHING_LIMIT_SECONDS - 3,
    randInt(20,100) + Math.min(0, sumBiteSpeed(u))
  )
);


  s.biteTimer = setTimeout(async () => {
    const result = await updateUser(userId, (uu) => {
      if (!uu.equip?.bait || (uu.inv.baits[uu.equip.bait] || 0) <= 0) return { ok: false, reason: "no_bait" };
      uu.inv.baits[uu.equip.bait] -= 1;
      applyQuestEvent(uu, db, "bait_used", { count: 1 });
      const fight = startFight(uu);
      return { ok: true, fight, equip: { ...uu.equip }, timeBand: currentTimeBand() };
    });

    if (!result || !result.ok) {
      clearSession(userId);
      return s.safeEdit({ content: "미끼가 없어 입질이 이어지지 않았습니다.", components: [], embeds: [] }).catch(() => {});
    }

    const fobj = result.fight;

    s.state = "fight";
    s.target = fobj;
    s.tension = randInt(35, 65);
    s.fightStart = Date.now();
    s.timeBand = result.timeBand;
    s.sceneBiteURL = getSceneURL(result.equip.rod, result.equip.float, result.equip.bait, s.timeBand, "입질");

    const resetIdle = () => {
      if (s.fightIdleTimer) clearTimeout(s.fightIdleTimer);
      s.fightIdleTimer = setTimeout(() => {
        clearSession(userId);
        s.safeEdit({ content: "아무 행동을 하지 않아 대상을 놓쳤습니다.", embeds: [], components: [] }).catch(() => {});
      }, FIGHT_IDLE_TIMEOUT * 1000);
    };
    resetIdle();
    s.resetIdle = resetIdle;

    s.fightTotalTimer = setTimeout(() => {
      clearSession(userId);
      s.safeEdit({ content: "너무 오래 끌어 대상이 빠져나갔습니다.", embeds: [], components: [] }).catch(() => {});
    }, FIGHT_TOTAL_TIMEOUT * 1000);

const hint = maybeRarityHint(u, s.target);
const desc = hint || "정체를 알 수 없는 무언가가 걸렸습니다.\n릴을 감거나 풀며 상황을 살펴보세요.";

const eb = new EmbedBuilder()
  .setTitle("🐟 입질!")
  .setDescription(desc)
  .setColor(0x44ddaa)
  .setImage(s.sceneBiteURL);

    try { await s.safeEdit({ embeds: [eb], components: [buttonsFight()] }); } catch {}
  }, waitSec * 1000);

  s.expireTimer = setTimeout(() => { clearSession(userId); }, (FISHING_LIMIT_SECONDS + 20) * 1000);

  const eb = sceneEmbed(
    u,
    "🪔 입질을 기다리는 중...",
    [`최대 ${FISHING_LIMIT_SECONDS}초까지 기회가 있습니다.`, "중간에 포기하시면 미끼는 소모되지 않습니다.", "", equipLine(u)].join("\n"),
    scene1
  );

  const res = await interaction.update({ embeds: [eb], components: [buttonsWaiting()] });

  if (autoNote) {
    try { await interaction.followUp({ content: autoNote, ephemeral: true }); } catch {}
  }
  return res;
}

    if (id === "fish:abort") {
      clearSession(userId);
      return interaction.update({ content:"낚시를 중단했습니다. (미끼 미소모)", embeds:[], components:[] });
    }

    const s = sessions.get(userId);
    if (["fish:reel","fish:loosen","fish:giveup"].includes(id) && (!s || s.state!=="fight")) {
      return interaction.update({ content:"진행 중인 낚시가 없습니다.", embeds:[], components:[] });
    }
    if (id === "fish:giveup") {
      clearSession(userId);
      const scene0 = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, currentTimeBand(), "기본");
      const eb = new EmbedBuilder().setTitle("포기하셨습니다.").setColor(0x999999).setImage(scene0);
      return interaction.update({ embeds:[eb], components:[] });
    }
    if (id === "fish:reel" || id === "fish:loosen") {
      if (s.resetIdle) s.resetIdle();
      const act = id === "fish:reel" ? "reel" : "loosen";
      const st = applyReel(u, s.target, s, act); s.target = st;

            if (st.escape) {
        clearSession(userId);
        const scene0 = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, s.timeBand||currentTimeBand(), "기본");
        const eb = new EmbedBuilder().setTitle("놓치셨습니다.").setDescription("텐션 조절에 실패하여 대상이 빠져나갔습니다.").setColor(0xcc6666).setImage(scene0);
        return updateOrEdit(interaction, { embeds:[eb], components:[buttonsAfterCatch(false)] });
      }
      if (st.hp <= 0) {
        useDurability(u, "rod"); 
        useDurability(u, "float");
        applyQuestEvent(u, db, "durability_used", { count: 2 });

        if (st.kind === "fish") {
  const sell = computeSellPrice(st.name, st.length, st.rarity);

  // 포획 전 종 카운트(첫 종 체크용)
  const __beforeSpecies = (u.stats.speciesCount?.[st.name] || 0);

  try {
    fishToInv(u, { name: st.name, rarity: st.rarity, length: st.length, sell });
  } catch (err) { console.error("[낚시 fishToInv 오류]", err, st); }

  // 퀘스트 이벤트 (시간대/특정종/레어 이상/첫 종 등)
  if (__beforeSpecies===0 && (u.stats.speciesCount?.[st.name]||0)===1) {
    applyQuestEvent(u, db, "first_species", { name: st.name });
  }
  applyQuestEvent(u, db, "fish_caught", {
    band: s.timeBand || currentTimeBand(),
    name: st.name, rarity: st.rarity,
    rod: u.equip.rod, float: u.equip.float
  });

  // 연속 판별(잡동 초기화 / 동일등급 연속 / 레어도 순서 3연속)
  u.quests.temp ??= { recentRarities:[], junkStreak:0, lastRarity:null, sameRarityStreak:0 };
  u.quests.temp.junkStreak = 0;
  if (u.quests.temp.lastRarity === st.rarity) u.quests.temp.sameRarityStreak = (u.quests.temp.sameRarityStreak||1)+1;
  else { u.quests.temp.lastRarity = st.rarity; u.quests.temp.sameRarityStreak = 1; }
  if (u.quests.temp.sameRarityStreak >= 3) {
    applyQuestEvent(u, db, "same_rarity3_done", {});
    u.quests.temp.sameRarityStreak = 0;
  }
  u.quests.temp.recentRarities.push(st.rarity);
  if (u.quests.temp.recentRarities.length>3) u.quests.temp.recentRarities.shift();
  if (u.quests.temp.recentRarities.length===3) {
    const key = u.quests.temp.recentRarities.join(">");
    applyQuestEvent(u, db, "rarity_seq_hit", { key });
  }

  updateTier(u);
  clearSession(userId);

          lastCatch.set(userId, { 
            name: st.name, 
            rarity: st.rarity, 
            length: st.length, 
            sell, 
            channelId: interaction.channelId, 
            ts: Date.now() 
          });

          const starName = withStarName(st.name, st.length);
const eb = sceneEmbed(
  u, 
  `✅ 포획 성공! [${st.rarity}] ${starName}`, 
  [
    `길이: ${Math.round(st.length)}cm`,
    `판매가: ${sell.toLocaleString()}코인`,
    "",
    "💡 `/낚시 판매`로 바로 코인화하실 수 있습니다."
  ].join("\n"),
  getIconURL(st.name) || null,
  [],                 
  colorOf(st.rarity)
);


          // ★ 종별(첫 조우/누적) 보상 임베드 함께 붙이기
          let speciesEb = null;
          try {
            speciesEb = await checkSpeciesRewards(u, db, st.name);
          } catch (err) {
            console.error("[낚시 종별 보상 임베드 생성 오류]", err, st.name);
          }

          const embedsToSend = speciesEb ? [eb, speciesEb] : [eb];

          try {
            await updateOrEdit(interaction, { embeds: embedsToSend, components: [buttonsAfterCatch()] });
          } catch (err) {
            console.error("[낚시 결과 embed 오류]", err);
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: "❌ 결과 embed 전송 오류", ephemeral: true }).catch(()=>{});
            }
          }

          try {
            await checkRewards(u, db, interaction);
          } catch (err) {
            console.error('[낚시 보상 처리 오류]', err, st.name);
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: "❌ 보상 처리 중 오류", ephemeral: true }).catch(()=>{});
            }
          }

          return;
        } else if (st.kind === "junk") {
  const junkCoin = randInt(1, 4);
gainCoins(u, db, junkCoin); // 코인 퀘스트 연동
u.stats.speciesCount[st.name] = (u.stats.speciesCount[st.name] || 0) + 1;

// 퀘스트: 잡동/연속3회
applyQuestEvent(u, db, "junk_caught", {});
u.quests.temp ??= { recentRarities:[], junkStreak:0, lastRarity:null, sameRarityStreak:0 };
u.quests.temp.junkStreak = (u.quests.temp.junkStreak||0) + 1;
u.quests.temp.lastRarity = null;
u.quests.temp.sameRarityStreak = 0;
if (u.quests.temp.junkStreak >= 3) {
  applyQuestEvent(u, db, "junk_streak3_done", {});
  u.quests.temp.junkStreak = 0;
}
clearSession(userId);

  lastCatch.set(userId, {
    type: "loot",
    name: st.name,
    rarity: "노말",
    desc: `쓸모없는 ${st.name}, 위로금 ${junkCoin} 코인`,
    icon: getIconURL(st.name) || null,
    ts: Date.now()
  });

  const eb = sceneEmbed(
    u,
    "🪣 잡동사니를 건졌습니다",
    `쓸모없는 ${st.name}을(를) 건졌습니다. 위로금으로 ${junkCoin} 코인을 받으셨습니다.`,
    getIconURL(st.name) || null
  );
  return updateOrEdit(interaction, { embeds:[eb], components:[buttonsAfterCatch()] });

} else {
  if (st.itemType === "coin") {
    gainCoins(u, db, st.amount||0);
    clearSession(userId);

    lastCatch.set(userId, {
      type: "loot",
      name: "낚시 코인",
      rarity: "노말",
      desc: `${(st.amount||0).toLocaleString()} 코인을 획득`,
      icon: getIconURL("낚시 코인"),
      ts: Date.now()
    });

    const eb = sceneEmbed(
      u, "🪙 획득 성공!",
      `${(st.amount||0).toLocaleString()} 코인을 획득하셨습니다.`,
      getIconURL("낚시 코인")
    );
    return updateOrEdit(interaction, { embeds:[eb], components:[buttonsAfterCatch()] });
  }
  if (st.itemType === "be") {
    await addBE(userId, st.amount||0, "[낚시] 드랍");
    clearSession(userId);

    lastCatch.set(userId, {
      type: "loot",
      name: "파랑 정수",
      rarity: "레어",
      desc: `${(st.amount||0).toLocaleString()}원을 획득`,
      icon: getIconURL("파랑 정수"),
      ts: Date.now()
    });

    const eb = sceneEmbed(
      u, "🔷 파랑 정수 획득!",
      `${(st.amount||0).toLocaleString()}원을 받으셨습니다.`,
      getIconURL("파랑 정수")
    );
    return updateOrEdit(interaction, { embeds:[eb], components:[buttonsAfterCatch()] });
  }
  if (st.itemType === "key") {
    u.inv.keys = (u.inv.keys||0) + (st.qty||1);
    clearSession(userId);

    lastCatch.set(userId, {
      type: "loot",
      name: "까리한 열쇠",
      rarity: "유니크",
      desc: `까리한 열쇠 ${st.qty||1}개를 획득`,
      icon: getIconURL("까리한 열쇠"),
      ts: Date.now()
    });

    const eb = sceneEmbed(
      u, "🗝️ 열쇠 획득!",
      `인벤토리에 추가되었습니다.`,
      getIconURL("까리한 열쇠")
    );
    return updateOrEdit(interaction, { embeds:[eb], components:[buttonsAfterCatch()] });
  }
  if (st.itemType === "chest") {
    u.inv.chests = (u.inv.chests||0) + (st.qty||1);
    clearSession(userId);

    lastCatch.set(userId, {
      type: "loot",
      name: "까리한 보물상자",
      rarity: "유니크",
      desc: `까리한 보물상자 ${st.qty||1}개를 획득`,
      icon: getIconURL("까리한 보물상자"),
      ts: Date.now()
    });

    const eb = sceneEmbed(
      u, "📦 보물상자 획득!",
      `인벤토리에 추가되었습니다.`,
      getIconURL("까리한 보물상자")
    );
    return updateOrEdit(interaction, { embeds:[eb], components:[buttonsAfterCatch()] });
  }
}

      }


      const hpRatio = (st.hp||1) / (st.maxHP||1);
      const line = hintLine(s.tension, hpRatio);
      const eb = new EmbedBuilder().setTitle(`🎣 파이팅 중`)
        .setDescription([line, "릴을 감거나 풀며 흐름을 유지해 보세요."].join("\n"))
        .setColor(0x44ddaa)
        .setImage(s.sceneBiteURL || getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, s.timeBand||currentTimeBand(), "입질"));
      return updateOrEdit(interaction, { embeds:[eb], components:[buttonsFight()] });
    }
if (id === "fish:sell_all") {
  const fishes = u.inv.fishes || [];
  const sellable = fishes.filter(f => !f.lock);
  const total = sellable.reduce((s, f) => s + (f.price || 0), 0);
  gainCoins(u, db, total);
  u.inv.fishes = fishes.filter(f => f.lock);
  return interaction.update({
    content: `총 ${total.toLocaleString()} 코인을 획득하셨습니다. (판매 ${sellable.length}마리, 잠금 ${fishes.length - sellable.length}마리 제외)`,
    embeds: [],
    components: []
  });
}
    if (id === "fish:sell_cancel" || id === "sell:cancel") {
      return interaction.update({ content:"판매 창을 닫았습니다.", embeds:[], components:[] });
    }
    if (id === "fish:sell_select") {
      const fishes = u.inv.fishes||[];
      const opts = fishes.slice(0,25).map((f,i)=>({
        label: `[${f.r}] ${withStarName(f.n, f.l)} ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`,
        value: String(i)
      }));
      if (opts.length===0) return interaction.reply({ content:"판매할 물고기가 없습니다.", ephemeral:true });
      const menu = new StringSelectMenuBuilder().setCustomId("sell-select").setPlaceholder("판매할 물고기 선택(복수 선택 가능)").setMinValues(1).setMaxValues(opts.length).addOptions(opts);
      const confirmRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("sell:confirm_selected")
    .setLabel("선택 판매 확정").setStyle(ButtonStyle.Success).setDisabled(true),
  new ButtonBuilder().setCustomId("sell:cancel")
    .setLabel("판매 취소").setStyle(ButtonStyle.Secondary)
);
return interaction.update({
  embeds:[ new EmbedBuilder().setTitle("🐟 판매할 물고기 선택").setColor(0xffaa44) ],
  components:[ new ActionRowBuilder().addComponents(menu), confirmRow ]
});

    }
if (id === "fish:sell_rarity") {
  const rarities = [...new Set((u.inv.fishes||[]).map(f=>f.r))];
  if (rarities.length===0) return interaction.reply({ content:"판매할 물고기가 없습니다.", ephemeral:true });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("sell-rarity-choose")
    .setPlaceholder("판매할 등급 선택")
    .addOptions(rarities.map(r=>({ label:r, value:r })));

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("sell:cancel").setLabel("판매 취소").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({
    embeds:[ new EmbedBuilder().setTitle("등급별 판매 선택").setColor(0xffaa44) ],
    components:[ new ActionRowBuilder().addComponents(menu), back ]
  });
}
      
if (interaction.customId === "sell-rarity-choose") {
  const rarity = interaction.values[0];
  const fishes = u.inv.fishes || [];
  const list = fishes.filter(f => f.r === rarity && !f.lock);
  const total = list.reduce((s,f)=>s+(f.price||0),0);

  const eb = new EmbedBuilder()
    .setTitle(`🧾 [${rarity}] 등급 판매 미리보기`)
    .setDescription(list.length
      ? list.slice(0, 10).map(f => `• ${f.n} — ${Math.round(f.l)}cm (${(f.price||0).toLocaleString()}코인)`).join("\n")
      : "_판매할 물고기가 없습니다._")
    .addFields({ name: "합계", value: `${total.toLocaleString()} 코인` })
    .setColor(0xffaa44);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sell:confirm_rarity|${rarity}`)
      .setLabel(`[${rarity}] 판매 확정`).setStyle(ButtonStyle.Success).setDisabled(list.length===0),
    new ButtonBuilder().setCustomId("sell:cancel")
      .setLabel("판매 취소").setStyle(ButtonStyle.Secondary)
  );

  return interaction.update({ embeds:[eb], components:[row] });
}
      
    if (id === "sell:confirm_selected") {
      const st = sellSessions.get(userId) || {};
      const fishes = u.inv.fishes||[];
      const idxs = (st.selectIdxs||[]).filter(i=>Number.isInteger(i) && fishes[i]);
      const pick = idxs.map(i=>fishes[i]).filter(f=>!f.lock); 
      const total = pick.reduce((s,f)=>s+(f.price||0),0);
      u.inv.fishes = fishes.filter((f,i)=>!idxs.includes(i) || f.lock); 
      gainCoins(u, db, total);
      sellSessions.delete(userId);
      return interaction.update({ content:`선택하신 ${pick.length}마리를 판매하여 ${total.toLocaleString()} 코인을 획득하셨습니다.`, embeds:[], components:[] });
    }
    if (id && id.startsWith("sell:confirm_rarity|")) {
  const rarity = id.split("|")[1];
  const fishes = u.inv.fishes || [];
  const sellable = fishes.filter(f => f.r === rarity && !f.lock);
  const total = sellable.reduce((s,f)=>s+(f.price||0),0);
  gainCoins(u, db, total);
  u.inv.fishes = fishes.filter(f => (f.r !== rarity) || f.lock);
  return interaction.update({
    content: `[${rarity}] ${sellable.length}마리를 판매하여 ${total.toLocaleString()} 코인을 획득했습니다.`,
    embeds:[], components:[]
  });
}
    if (id === "fish:sell_qty") {
      const fishes = u.inv.fishes||[];
      const kinds = [...new Set(fishes.map(f=>f.n))];
      if (kinds.length===0) return interaction.reply({ content:"판매할 물고기가 없습니다.", ephemeral:true });
      const opts = kinds.slice(0,25).map(n=>({ label:n, value:n }));
      const menu = new StringSelectMenuBuilder().setCustomId("sell-qty-choose").setPlaceholder("종류 선택").addOptions(opts);
      return interaction.update({ embeds:[ new EmbedBuilder().setTitle("🐟 수량 판매 — 종류 선택").setColor(0xffaa44) ], components:[ new ActionRowBuilder().addComponents(menu) ] });
    }

    if (id.startsWith("inv:start|")) {
      const kind = id.split("|")[1];
      const list = kind==="rod"? Object.keys(u.inv.rods)
                 : kind==="float"? Object.keys(u.inv.floats)
                 : kind==="bait"? Object.keys(u.inv.baits).filter(k=>(u.inv.baits[k]||0)>0)
                 : u.inv.fishes.map((f,idx)=>({ idx, label:`[${f.r}] ${f.n} ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인` }));
      invSessions.set(userId, { kind, idx:0 });
      if (!list || list.length===0) return interaction.reply({ content:"해당 분류에 아이템이 없습니다.", ephemeral:true });

      function renderInv(k, i) {
        if (k==="fish") {
        const f = u.inv.fishes[i];
        const starName = withStarName(f.n, f.l);
        const eb = new EmbedBuilder().setTitle(`🐟 인벤 — ${starName}`)
          .setDescription(`[${f.r}] ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`)
          .setColor(colorOf(f.r))
          .setImage(getIconURL(f.n)||null)
          .setFooter({ text: `낚시 코인: ${u.coins.toLocaleString()} | 티어: ${u.tier}` });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
          new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=u.inv.fishes.length-1),
          new ButtonBuilder().setCustomId("inv:lock").setLabel(f.lock ? "🔒 잠금 해제" : "🔒 잠금").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("inv:share").setLabel("📣 공유하기").setStyle(ButtonStyle.Secondary),
        );
  
        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("inv:home").setLabel("🎒 인벤토리").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("aqua:home").setLabel("🐠 수족관").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("sell:home").setLabel("💰 판매").setStyle(ButtonStyle.Secondary),
         );
          return { eb, row, navRow };
        }

        } else {
          const name = (k==="rod"? Object.keys(u.inv.rods)
                       : k==="float"? Object.keys(u.inv.floats)
                       : Object.keys(u.inv.baits).filter(x=>(u.inv.baits[x]||0)>0))[i];
          const dur = k==="rod"? (u.inv.rods[name]||0) : k==="float"? (u.inv.floats[name]||0) : (u.inv.baits[name]||0);
          const spec = k==="rod"? ROD_SPECS[name] : k==="float"? FLOAT_SPECS[name] : BAIT_SPECS[name];
          const lines = [];
          if (k!=="bait") lines.push(`내구도: ${dur}/${spec.maxDur}`);
          else lines.push(`보유: ${dur}/${spec.pack}`);
          const tb = getTierBuff(u.tier);
          if (k==="rod") {
            lines.push(
              statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
              statLine("제압력", spec.dmg, tb.dmg),
              statLine("저항 감소", spec.resistReduce, tb.resistReduce),
              `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
              "_(+티어 능력치)_"
            );
          }
          if (k==="float") {
            lines.push(
              statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
              statLine("저항 감소", spec.resistReduce, tb.resistReduce),
              `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
              "_(+티어 능력치)_"
            );
          }
          if (k==="bait") {
            lines.push(
              statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
              `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
              "_(+티어 능력치)_"
            );
          }

          const eb = new EmbedBuilder().setTitle(`🎒 ${k==="rod"?"낚싯대":k==="float"?"찌":"미끼"} — ${name}`)
            .setDescription(lines.join("\n"))
            .setColor(gearColorOf(name))
            .setThumbnail(getIconURL(name)||null)
            .setFooter({ text: `낚시 코인: ${u.coins.toLocaleString()} | 티어: ${u.tier}` });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
            new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=((k==="rod"?Object.keys(u.inv.rods):k==="float"?Object.keys(u.inv.floats):Object.keys(u.inv.baits).filter(x=>(u.inv.baits[x]||0)>0)).length-1)),
            new ButtonBuilder().setCustomId(`inv:equip|${k}|${name}`).setLabel("장착").setStyle(ButtonStyle.Primary).setDisabled(k==="fish"),
            new ButtonBuilder().setCustomId("inv:home").setLabel("🏠 인벤토리").setStyle(ButtonStyle.Secondary)
          );
          return { eb, row };
        }
      }

      const { eb, row, navRow } = renderInv(kind, 0);
      return interaction.update({ embeds:[eb], components: navRow ? [row, navRow] : [row] });
    }
    if (id === "inv:lock") {
  const st = invSessions.get(userId);
  if (!st || st.kind !== "fish") return interaction.reply({ content:"물고기에서만 잠금 가능", ephemeral:true });
  const f = u.inv.fishes[st.idx];
  if (!f) return interaction.reply({ content:"대상 물고기가 없음", ephemeral:true });

  f.lock = !f.lock;

  const starName = withStarName(f.n, f.l);
  const eb = new EmbedBuilder().setTitle(`🐟 인벤 — ${starName}`)
    .setDescription(`[${f.r}] ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`)
    .setColor(0x88ddff)
    .setImage(getIconURL(f.n)||null)
    .setFooter({ text: `낚시 코인: ${u.coins.toLocaleString()} | 티어: ${u.tier}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(st.idx<=0),
    new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(st.idx>=u.inv.fishes.length-1),
    new ButtonBuilder().setCustomId("inv:lock").setLabel(f.lock ? "🔒 잠금 해제" : "🔒 잠금").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("inv:share").setLabel("📣 공유하기").setStyle(ButtonStyle.Secondary),
  );
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv:home").setLabel("🎒 인벤토리").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("aqua:home").setLabel("🐠 수족관").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sell:home").setLabel("💰 판매").setStyle(ButtonStyle.Secondary),
  );

  return interaction.update({ embeds:[eb], components:[row, navRow] });

  }
    if (id === "inv:share") {
      const st = invSessions.get(userId);
      if (!st || st.kind !== "fish") {
        return interaction.reply({ content: "물고기 화면에서만 공유할 수 있어요.", ephemeral: true });
      }
      const f = u.inv.fishes[st.idx];
      if (!f) {
        return interaction.reply({ content: "공유할 물고기를 찾지 못했어요.", ephemeral: true });
      }
      const nick = interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
      const eb = new EmbedBuilder()
        .setTitle(`🐟 ${nick}의 성과 공유`)
        .setDescription(`• 이름: [${f.r}] ${withStarName(f.n, f.l)}\n• 길이: ${Math.round(f.l)}cm\n• 판매가: ${f.price.toLocaleString()} 코인`)
        .setColor(colorOf(f.r))
        .setImage(getIconURL(f.n) || null);
      try {
        await interaction.channel.send({ embeds: [eb] });
        return interaction.reply({ content: "채널에 공유했어! 🎉", ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: "채널에 공유 실패… 권한을 확인해줘!", ephemeral: true });
      }
    }
    if (id==="inv:prev" || id==="inv:next") {
      const st = invSessions.get(userId); if (!st) return interaction.reply({ content:"보기 세션이 없습니다.", ephemeral:true });
      const listLen = st.kind==="rod"? Object.keys(u.inv.rods).length
                    : st.kind==="float"? Object.keys(u.inv.floats).length
                    : st.kind==="bait"? Object.keys(u.inv.baits).filter(x=>(u.inv.baits[x]||0)>0).length
                    : u.inv.fishes.length;
      st.idx += (id==="inv:next"?1:-1);
      st.idx = Math.max(0, Math.min(listLen-1, st.idx));
      invSessions.set(userId, st);
      
      const kind = st.kind;
      function rerender(k, i){
        if (k==="fish") {
      const f = u.inv.fishes[i];
      const starName = withStarName(f.n, f.l);
      const eb = new EmbedBuilder().setTitle(`🐟 인벤 — ${starName}`)
        .setDescription(`[${f.r}] ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`)
        .setColor(0x88ddff)
        .setImage(getIconURL(f.n)||null)
        .setFooter({ text: `낚시 코인: ${u.coins.toLocaleString()} | 티어: ${u.tier}` });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
        new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=u.inv.fishes.length-1),
        new ButtonBuilder().setCustomId("inv:lock").setLabel(f.lock ? "🔒 잠금 해제" : "🔒 잠금").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("inv:share").setLabel("📣 공유하기").setStyle(ButtonStyle.Secondary),
      );
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("inv:home").setLabel("🎒 인벤토리").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("aqua:home").setLabel("🐠 수족관").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("sell:home").setLabel("💰 판매").setStyle(ButtonStyle.Secondary),
      );
        return { eb, row, navRow };
          } else {
          const names = k==="rod"? Object.keys(u.inv.rods)
                       : k==="float"? Object.keys(u.inv.floats)
                       : Object.keys(u.inv.baits).filter(x=>(u.inv.baits[x]||0)>0);
          const name = names[i]; const dur = k==="rod"? u.inv.rods[name] : k==="float"? u.inv.floats[name] : u.inv.baits[name];
          const spec = k==="rod"? ROD_SPECS[name] : k==="float"? FLOAT_SPECS[name] : BAIT_SPECS[name];
          const lines = [];
          if (k!=="bait") lines.push(`내구도: ${dur}/${spec.maxDur}`);
          else            lines.push(`보유: ${dur}/${spec.pack}`);
          const tb = getTierBuff(u.tier);
          if (k==="rod") {
            lines.push(
              statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
              statLine("제압력", spec.dmg, tb.dmg),
              statLine("저항 감소", spec.resistReduce, tb.resistReduce),
              `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
              "_(+티어 능력치)_"
            );
          }
          if (k==="float") {
            lines.push(
              statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
              statLine("저항 감소", spec.resistReduce, tb.resistReduce),
              `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
              "_(+티어 능력치)_"
            );
          }
          if (k==="bait") {
            lines.push(
              statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
              `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
              "_(+티어 능력치)_"
            );
          }
          const eb = new EmbedBuilder().setTitle(`🎒 ${k==="rod"?"낚싯대":k==="float"?"찌":"미끼"} — ${name}`)
            .setDescription(lines.join("\n")).setColor(0x88ddff).setThumbnail(getIconURL(name)||null)
            .setFooter({ text: `낚시 코인: ${u.coins.toLocaleString()} | 티어: ${u.tier}` });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
            new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=names.length-1),
            new ButtonBuilder().setCustomId(`inv:equip|${k}|${name}`).setLabel("장착").setStyle(ButtonStyle.Primary).setDisabled(k==="fish"),
            new ButtonBuilder().setCustomId("inv:home").setLabel("🏠 인벤토리").setStyle(ButtonStyle.Secondary)
          );
          return { eb, row };
        }
      }
      const { eb, row, navRow } = rerender(kind, st.idx);
      return interaction.update({ embeds:[eb], components: navRow ? [row, navRow] : [row] });
    }
    if (id.startsWith("inv:equip|")) {
      const [,slot,name] = id.split("|");
      if (slot==="rod"   && (u.inv.rods[name]??0)<=0)   return interaction.reply({ content:"해당 낚싯대의 내구도가 없습니다.", ephemeral:true });
      if (slot==="float" && (u.inv.floats[name]??0)<=0) return interaction.reply({ content:"해당 찌의 내구도가 없습니다.", ephemeral:true });
      if (slot==="bait"  && (u.inv.baits[name]??0)<=0)  return interaction.reply({ content:"해당 미끼가 없습니다.", ephemeral:true });
      u.equip[slot] = name;
      return interaction.reply({ content:`장착 완료: ${slot} → ${name}`, ephemeral:true });
    }
    if (id === "open:chest") {
      if ((u.inv.chests||0)<=0) return interaction.reply({ content:"보물상자가 없습니다.", ephemeral:true });
      if ((u.inv.keys||0)<=0)   return interaction.reply({ content:"열쇠가 없습니다.", ephemeral:true });
      u.inv.chests -= 1; u.inv.keys -= 1;
      applyQuestEvent(u, db, "chest_open", { count: 1 });  
      const pool = CHEST_REWARDS.loot;
      const w = {}; for (const it of pool) w[it.name] = it.chance;
      const pick = pickWeighted(w);
      const item = pool.find(x=>x.name===pick);
      if (item.kind === "bait")  { addBait(u, item.name, item.qty); return interaction.reply({ content:`상자를 개봉하여 ${item.name} ${item.qty}개를 받으셨습니다.`, ephemeral:true }); }
      if (item.kind === "be")    { const amt = randInt(item.min, item.max); await addBE(userId, amt, "[낚시] 상자 보상"); return interaction.reply({ content:`상자를 개봉하여 파랑 정수 ${amt.toLocaleString()}원을 받으셨습니다.`, ephemeral:true }); }
      if (item.kind === "float") { addFloat(u, item.name); return interaction.reply({ content:`상자를 개봉하여 ${item.name}를 획득하셨습니다.`, ephemeral:true }); }
      if (item.kind === "rod")   { addRod(u, item.name);   return interaction.reply({ content:`상자를 개봉하여 ${item.name}를 획득하셨습니다.`, ephemeral:true }); }
      if (item.kind === "coin") { const amt = randInt(item.min, item.max); gainCoins(u, db, amt); return interaction.reply({ content:`상자에서 ${amt} 코인을 받으셨습니다.`, ephemeral:true }); }
      return interaction.reply({ content:"상자 보상 처리 중 오류가 발생했습니다.", ephemeral:true });
    }
    if (id === "info:key") {
      return interaction.reply({ content:`보유 열쇠: ${u.inv.keys||0}개`, ephemeral:true });
    }
    if (id === "inv:home") {
     const payload = buildInventoryHome(u);
     return interaction.update({ ...payload });
   }
    if (id === "nav:pond") {
      const timeBand = currentTimeBand();
      const missKey = missingGearKey(u);
      const scene0 = missKey ? (getIconURL(missKey)||null)
                         : getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, timeBand, "기본");
      const eb = sceneEmbed(u, "🏞️ 낚시터", [
    "찌를 던져 입질을 기다려보세요.",
    "",
    equipLine(u)
    ].join("\n"), scene0);
      const viewRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("shop:start|rod").setLabel("🛒 낚싯대 보기").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("shop:start|float").setLabel("🧷 찌 보기").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("shop:start|bait").setLabel("🪱 미끼 보기").setStyle(ButtonStyle.Secondary),
    );
      return interaction.update({ embeds:[eb], components:[buttonsStart(u), viewRow] });
    }

    if (id === "shop:home") {
      const eb = new EmbedBuilder().setTitle("🛒 낚시 상점")
      .setDescription([
        "종류를 골라 하나씩 넘기며 이미지와 스펙, 가격을 확인하고 구매해 주세요.",
        "",
        "• 낚싯대, 찌: 구매 시 내구도 최대치로 제공됩니다.",
        "• 미끼: 20개 묶음이며, 보유 수량이 20 미만이면 부족분만 비례 결제합니다."
      ].join("\n"))
      .setColor(0x55cc77)
      .setFooter({ text:`보유 코인: ${u.coins.toLocaleString()} | 정수: ${getBE(userId).toLocaleString()}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("shop:start|rod").setLabel("🎣 낚싯대 보기").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("shop:start|float").setLabel("🟠 찌 보기").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("shop:start|bait").setLabel("🪱 미끼 보기").setStyle(ButtonStyle.Primary),
    );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("nav:pond").setLabel("🏞️ 낚시터 입장").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("inv:home").setLabel("🎒 인벤토리").setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ embeds:[eb], components:[row, row2] });
  }

  if (id === "sell:home") {
    const fishes = u.inv.fishes||[];
    const sellable = fishes.filter(f => !f.lock);
    const totalValue = sellable.reduce((sum, f) => sum + (f.price||0), 0);
    const eb = new EmbedBuilder().setTitle("💰 물고기 판매")
      .setDescription([
        `보유 물고기: ${fishes.length}마리`,
        "원하시는 방식으로 판매해 주세요."
      ].join("\n"))
      .addFields({ name:"전체 판매 예상 금액(잠금 제외)", value:`${totalValue.toLocaleString()} 코인`, inline:false })
      .setColor(0xffaa44);
  
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fish:sell_all").setLabel("모두 판매").setStyle(ButtonStyle.Success).setDisabled(fishes.length===0),
      new ButtonBuilder().setCustomId("fish:sell_rarity").setLabel("등급별 판매").setStyle(ButtonStyle.Primary).setDisabled(fishes.length===0),
      new ButtonBuilder().setCustomId("fish:sell_select").setLabel("선택 판매").setStyle(ButtonStyle.Secondary).setDisabled(fishes.length===0),
      new ButtonBuilder().setCustomId("fish:sell_cancel").setLabel("판매 취소").setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("inv:home").setLabel("🎒 인벤토리").setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ embeds:[eb], components:[row, row2] });
  }

    if (id.startsWith("shop:start|")) {
      const kind = id.split("|")[1];
      const order = kind==="rod"? RODS : kind==="float"? FLOATS : BAITS;
      shopSessions.set(userId, { kind, idx:0 });

      function renderShop(k, i) {
        const name = order[i];
        const icon = getIconURL(name)||null;
        const price = PRICES[k==="rod"?"rods":k==="float"?"floats":"baits"][name];
        const spec  = k==="rod"? ROD_SPECS[name] : k==="float"? FLOAT_SPECS[name] : BAIT_SPECS[name];
        const lines = [];
        const tb = getTierBuff(u.tier);
        if (k!=="bait") lines.push(`내구도: ${spec.maxDur}`);
        if (k==="rod") {
          lines.push(
            statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
            statLine("제압력", spec.dmg, tb.dmg),
            statLine("저항 감소", spec.resistReduce, tb.resistReduce),
            `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
            "_(+티어 능력치)_"
          );
        } else if (k==="float") {
          lines.push(
            statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
            statLine("저항 감소", spec.resistReduce, tb.resistReduce),
            `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
            "_(+티어 능력치)_"
          );
        } else {
          lines.push(
            `묶음 ${spec.pack}개`,
            statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
            `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
            "_(+티어 능력치)_"
          );
        }
        const eb = new EmbedBuilder().setTitle(`🛒 ${k==="rod"?"낚싯대":k==="float"?"찌":"미끼"} — ${name}`)
          .setDescription(lines.join("\n"))
          .addFields(
            { name:"코인", value: price.coin!=null ? price.coin.toLocaleString() : "-", inline:true },
            { name:"정수", value: price.be!=null ? price.be.toLocaleString()   : "-", inline:true },
          )
          .setColor(0x55cc77);
        if (icon) eb.setImage(icon);
        const bf = buffField(u); if (bf) eb.addFields(bf);
        eb.setFooter({ text:`보유 코인: ${u.coins.toLocaleString()} | 정수: ${getBE(userId).toLocaleString()}` });
        const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("shop:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
        new ButtonBuilder().setCustomId("shop:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=order.length-1),
        new ButtonBuilder().setCustomId(`shop:buy|coin|${name}`).setLabel("코인 구매").setStyle(ButtonStyle.Success).setDisabled(price.coin==null),
        new ButtonBuilder().setCustomId(`shop:buy|be|${name}`).setLabel("정수 구매").setStyle(ButtonStyle.Primary).setDisabled(price.be==null),
        new ButtonBuilder().setCustomId("shop:close").setLabel("닫기").setStyle(ButtonStyle.Secondary),
      );
        const backRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("shop:home").setLabel("↩ 상점으로 돌아가기").setStyle(ButtonStyle.Secondary),
      );

        return { eb, row, backRow };
        }

      const { eb, row, backRow } = renderShop(kind, 0);
      return interaction.update({ embeds:[eb], components:[row, backRow] });
    }
    if (id==="shop:prev" || id==="shop:next") {
      const st = shopSessions.get(userId); if (!st) return interaction.reply({ content:"상점 보기 세션이 없습니다.", ephemeral:true });
      const order = st.kind==="rod"? RODS : st.kind==="float"? FLOATS : BAITS;
      st.idx += (id==="shop:next"?1:-1); st.idx = Math.max(0, Math.min(order.length-1, st.idx));
      shopSessions.set(userId, st);

      const name = order[st.idx];
      const price = PRICES[st.kind==="rod"?"rods":st.kind==="float"?"floats":"baits"][name];
      const spec  = st.kind==="rod"? ROD_SPECS[name] : st.kind==="float"? FLOAT_SPECS[name] : BAIT_SPECS[name];
      const descLines = [];
      const tb = getTierBuff(u.tier);
      if (st.kind!=="bait") descLines.push(`내구도: ${spec.maxDur}`);
      if (st.kind==="rod") {
        descLines.push(
          statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
          statLine("제압력", spec.dmg, tb.dmg),
          statLine("저항 감소", spec.resistReduce, tb.resistReduce),
          `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
          "_(+티어 능력치)_"
        );
      } else if (st.kind==="float") {
        descLines.push(
          statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
          statLine("저항 감소", spec.resistReduce, tb.resistReduce),
          `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
          "_(+티어 능력치)_"
        );
      } else {
        descLines.push(
          `묶음 ${spec.pack}개`,
          statLine("입질시간", spec.biteSpeed, tb.biteSpeed, "s"),
          `희귀도 +${spec.rarityBias} (${signed(tb.rarityBias)})`,
          "_(+티어 능력치)_"
        );
      }
      const desc = descLines.join("\n");

      const eb = new EmbedBuilder().setTitle(`🛒 ${st.kind==="rod"?"낚싯대":st.kind==="float"?"찌":"미끼"} — ${name}`)
        .setDescription(desc)
        .addFields(
          { name:"코인", value: price.coin!=null ? price.coin.toLocaleString() : "-", inline:true },
          { name:"정수", value: price.be!=null ? price.be.toLocaleString()   : "-", inline:true },
        ).setColor(0x55cc77).setImage(getIconURL(name)||null)
        .setFooter({ text:`보유 코인: ${u.coins.toLocaleString()} | 정수: ${getBE(userId).toLocaleString()}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("shop:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(st.idx<=0),
        new ButtonBuilder().setCustomId("shop:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(st.idx>=order.length-1),
        new ButtonBuilder().setCustomId(`shop:buy|coin|${name}`).setLabel("코인 구매").setStyle(ButtonStyle.Success).setDisabled(price.coin==null),
        new ButtonBuilder().setCustomId(`shop:buy|be|${name}`).setLabel("정수 구매").setStyle(ButtonStyle.Primary).setDisabled(price.be==null),
        new ButtonBuilder().setCustomId("shop:close").setLabel("닫기").setStyle(ButtonStyle.Secondary),
        );
     const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("shop:home").setLabel("↩ 상점으로 돌아가기").setStyle(ButtonStyle.Secondary),
        );
      return interaction.update({ embeds:[eb], components:[row, backRow] });
        }
    if (id.startsWith("shop:buy|")) {
      const [, pay, name] = id.split("|");
      const st = shopSessions.get(userId); if (!st) return interaction.reply({ content:"상점 보기 세션이 없습니다.", ephemeral:true });
      const kind = st.kind; const price = PRICES[kind==="rod"?"rods":kind==="float"?"floats":"baits"][name];
      if (!price) return interaction.reply({ content:"가격 정보를 불러오지 못했습니다.", ephemeral:true });

      if (kind === "bait") {
        const pack = BAIT_SPECS[name].pack;
const cur  = u.inv.baits[name] || 0;
const need = Math.max(0, pack - cur);
if (need === 0) return interaction.reply({ content:`이미 ${name}가 가득(${pack}개)입니다.`, ephemeral:true });
        if (pay === "coin") {
          const cost = Math.ceil(price.coin * (need/pack));
          if ((u.coins||0) < cost) return interaction.reply({ content:`코인이 부족합니다. (필요: ${cost})`, ephemeral:true });
          spendCoins(u, db, cost); addBait(u, name, need);
          return interaction.reply({ content:`${name} ${need}개를 보충했습니다. (코인 ${cost} 소모)`, ephemeral:true });
        } else {
          if (price.be == null) return interaction.reply({ content:"정수 결제가 불가합니다.", ephemeral:true });
          const cost = Math.ceil(price.be * (need/pack));
          if ((getBE(userId)||0) < cost) return interaction.reply({ content:`정수가 부족합니다. (필요: ${cost}원)`, ephemeral:true });
          await addBE(userId, -cost, `[낚시] ${name} 보충(${need})`); addBait(u, name, need);
          return interaction.reply({ content:`${name} ${need}개를 보충했습니다. (정수 ${cost.toLocaleString()}원)`, ephemeral:true });
        }
      } else {
        if (pay === "coin") {
          const cost = price.coin; if (cost==null) return interaction.reply({ content:"코인 결제가 불가합니다.", ephemeral:true });
          if ((u.coins||0) < cost) return interaction.reply({ content:`코인이 부족합니다. (필요: ${cost})`, ephemeral:true });
          spendCoins(u, db, cost);
        } else {
          const cost = price.be; if (cost==null) return interaction.reply({ content:"정수 결제가 불가합니다.", ephemeral:true });
          if ((getBE(userId)||0) < cost) return interaction.reply({ content:`정수가 부족합니다. (필요: ${cost}원)`, ephemeral:true });
          await addBE(userId, -cost, `[낚시] ${name} 구매`);
        }
        if (kind==="rod") addRod(u, name);
        if (kind==="float") addFloat(u, name);
        return interaction.reply({ content:`구매 완료: ${name}`, ephemeral:true });
      }
    }
    if (id === "shop:close") {
      shopSessions.delete(userId);
      return interaction.update({ content:"상점을 닫았습니다.", embeds:[], components:[] });
    }

    if (id.startsWith("dex:")) {
      const st = dexSessions.get(userId) || { rarity:"노말", page:0, mode:"list" };
      if (id.startsWith("dex:rar|")) {
        const rar = id.split("|")[1];
        st.rarity = rar; st.page = 0; st.mode = "list"; delete st.current;
        dexSessions.set(userId, st);
        const payload = renderDexList(u, st);
        return interaction.update({ ...payload });
      }
      if (id === "dex:prev" || id === "dex:next") {
        const all = FISH_BY_RARITY[st.rarity]||[];
        const maxPage = Math.max(0, Math.ceil(all.length/DEX_PAGE_SIZE)-1);
        st.page += (id==="dex:next"?1:-1);
        st.page = Math.max(0, Math.min(maxPage, st.page));
        st.mode = "list"; delete st.current;
        dexSessions.set(userId, st);
        const payload = renderDexList(u, st);
        return interaction.update({ ...payload });
      }
      if (id === "dex:back") {
        st.mode = "list"; delete st.current;
        dexSessions.set(userId, st);
        const payload = renderDexList(u, st);
        return interaction.update({ ...payload });
      }
      if (id === "dex:close") {
        dexSessions.delete(userId);
        return interaction.update({ content:"도감을 닫았습니다.", embeds:[], components:[] });
      }
    }

    if (id.startsWith("rank:")) {
  await interaction.deferUpdate();
  const mode = id.split(":")[1];
  const payload = await buildRankEmbedPayload(db, interaction, mode);
  return interaction.editReply({ ...payload });
}


    if (cmd === "view") {
      const idx = Number(p1);
      return edit(buildAquariumView(u, idx));
    }

    if (cmd === "add") {
      if (u.aquarium.length >= AQUARIUM_MAX) {
        return edit({ content:"수족관이 꽉 찼어!", embeds:[], components:[ new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("aqua:home").setLabel("🏠 홈").setStyle(ButtonStyle.Secondary)
        )]});
      }
      // 인벤 물고기 목록에서 선택(자유 선택 1마리)
      const fishes = u.inv.fishes || [];
      if (!fishes.length) {
        return edit({ content:"인벤토리에 물고기가 없어.", embeds:[], components:[ new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("aqua:home").setLabel("🏠 홈").setStyle(ButtonStyle.Secondary)
        )]});
      }
      const opts = fishes.slice(0, 25).map((f, i)=>({
        label: `${withStarName(f.n, f.l)} • ${f.r} • ${f.l}cm • ${f.price.toLocaleString()}코인`,
        value: String(i)
      }));
      const sel = new StringSelectMenuBuilder()
        .setCustomId("aqua:add_select")
        .setPlaceholder("수족관에 넣을 물고기 선택")
        .addOptions(opts);
      return edit({ content:"추가할 물고기를 골라줘!", embeds:[], components:[
        new ActionRowBuilder().addComponents(sel),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("aqua:home").setLabel("취소").setStyle(ButtonStyle.Secondary)
        )
      ]});
    }

    if (cmd === "praise") {
      const idx = Number(p1);
      const a = u.aquarium[idx];
      if (!a) return edit({ content:"빈 슬롯이야.", embeds:[], components:[] });

      resetFeedIfNewDay(a);
      if (!canPraise(a)) {
        return edit({ content:"아직 칭찬 쿨다운이야 (1시간).", ...(buildAquariumView(u, idx)) });
      }
      const beforeLv = a.lv;
      const gain = 8; // 소량 XP
      a.xp += gain;
      a.lastPraiseAt = Date.now();
      tryLevelUp(a);
      return edit({
        content: `${randPick(praiseLines)} (+${gain}xp)`,
        ...(buildAquariumView(u, idx))
      });
    }

    if (cmd === "feed") {
      const idx = Number(p1);
      const a = u.aquarium[idx];
      if (!a) return edit({ content:"빈 슬롯이야.", embeds:[], components:[] });
      resetFeedIfNewDay(a);
      if (a.feedCount >= 5) {
        return edit({ content:"오늘 먹이는 끝! (하루 5회)", ...(buildAquariumView(u, idx)) });
      }
      // 자기보다 작은 물고기 필터
      const candidates = (u.inv.fishes||[])
  .map((f,i)=>({ ...f, _i:i }))
  .filter(f => !f.lock && f.l < a.l);
      if (!candidates.length) {
  return edit({
    content:"먹이로 줄 더 작은 **잠금 해제된** 물고기가 없어.\n(인벤에서 잠금 해제하거나 더 작은 물고기를 잡아와줘!)",
    ...(buildAquariumView(u, idx))
  });
}
      const opts = candidates.slice(0,25).map(f=>({
        label: `${withStarName(f.n,f.l)} • ${f.r} • ${f.l}cm`,
        value: String(f._i)
      }));
      const sel = new StringSelectMenuBuilder()
        .setCustomId(`aqua:feed_select|${idx}`)
        .setPlaceholder("먹이로 줄 물고기 선택")
        .addOptions(opts);
      const ui = buildAquariumView(u, idx);
      ui.components.push(new ActionRowBuilder().addComponents(sel));
      return edit(ui);
    }

    if (cmd === "release") {
      const idx = Number(p1);
      const a = u.aquarium[idx];
      if (!a) return edit({ content:"빈 슬롯이야.", embeds:[], components:[] });

      // 인벤으로 복귀 (현 레벨 가치 반영)
      const back = { n:a.n, r:a.r, l:a.l, price: valueWithLevel(a.base, a.lv), lock:false };
      u.inv.fishes.push(back);
      u.aquarium.splice(idx,1);
      return edit({ content:`${withStarName(back.n,back.l)}를 인벤토리로 보냈어! (가격 ${back.price.toLocaleString()}코인)`, ...(buildAquariumHome(u)) });
    }

    // 기본: 홈
    return edit(buildAquariumHome(u));
  } catch (err) {
    console.error("[component] error:", err);
    try {
      await interaction.reply({ content: "❌ 상호작용 처리 중 오류가 발생했어.", ephemeral: true });
    } catch {}
  }
  });
}


const COIN_DROP_RANGE = [50, 500];
const BE_DROP_RANGE   = [10, 30000];
const DROP_TABLE = {
  "노말":   ["멸치","피라냐","금붕어","작은 새우","빈 페트병","해초","뚱이의 바지","갓봇의 안경","낚시 코인","작은입배스","홍어","가오리","우럭","민어","병어","방어","전어","은어","송어","넙치","청어","꽁치",
            "쏘가리","농어","뼈 생선","피라미","해마","앵무조개","따분한 멸치","등푸른 생선","모래 송사리","숭어"],
  "레어":   ["전갱이","고등어","가재","연어","다랑어","가자미","오징어","잉어","삼치","복어","황어","도미","참돔","붕어","비단 잉어","빙어","갈치","파랑 정수","큰입배스","참다랑어","황다랑어",
             "꼴뚜기","쏠배감펭","개구리","홍게","별점어","돌꼬치","붉은점 돌돔","파도 송사리","푸른 바다뱀","푸른 복어","두꺼비","망둑어","해파리"],
  "유니크": ["참치","장어","개복치","문어","거북이","까리한 열쇠","까리한 보물상자","메기","블롭피쉬","그림자 장어","별빛 잉어","심연의 복어","황금 잉어","톱상어","야광어","유령고래",
            "메기 잉어","잿빛 멸치","밤의 잉어","붉은 바다뱀","마블 고등어","달무늬 고래","알콩이와 달콩이"],
  "레전드": ["곰치","고래상어","빨판상어","청새치","아귀","에테르 피쉬","덤보 문어","샤이닝 해파리","실러캔스","안개 고래","구름 잉어"],
  "에픽":   ["철갑상어","대왕고래","루미나 샤크","해룡 까리오스","해룡 레비아탄","용신 까리오스","새끼 크라켄","엔젤 고래"],
  "언노운": ["클리오네의 정령","클리오네 성체"]
};

const NON_FISH = new Set(["낚시 코인","파랑 정수","까리한 열쇠","까리한 보물상자","빈 페트병","해초","작은 새우","뚱이의 바지","갓봇의 안경"]);
const FISH_BY_RARITY = Object.fromEntries(RARITY.map(r=>[r, (DROP_TABLE[r]||[]).filter(n=>!NON_FISH.has(n))]));
const RARITY_OF = {};
for (const [rar, arr] of Object.entries(FISH_BY_RARITY)) {
  for (const n of arr) RARITY_OF[n] = rar;
}
const DEX_PAGE_SIZE = 10;

const CHEST_REWARDS = {
  loot: [
    // 🪙 낚시 코인 (1만 ~ 10만) — 고액일수록 확률 낮음
    { kind:"coin", name:"낚시 코인", min:10000,  max:30000,  chance:12 },
    { kind:"coin", name:"낚시 코인", min:30001,  max:50000,  chance:6 },
    { kind:"coin", name:"낚시 코인", min:50001,  max:100000, chance:2 },

    // 🔷 파랑 정수 (1만 ~ 50만) — 고액일수록 확률 낮음
    { kind:"be",   name:"파랑 정수", min:10000,   max:100000,  chance:10 },
    { kind:"be",   name:"파랑 정수", min:100001,  max:200000,  chance:5 },
    { kind:"be",   name:"파랑 정수", min:200001,  max:500000,  chance:1 },

    // 🎣 낚싯대 (강철/금/다이아)
    { kind:"rod",  name:"강철 낚싯대", chance:4 },
    { kind:"rod",  name:"금 낚싯대",   chance:2 },
    { kind:"rod",  name:"다이아 낚싯대", chance:0.5 },

    // 🪱 빛나는 젤리 미끼 (3~20개) — 수량 많을수록 확률 낮음
    { kind:"bait", name:"빛나는 젤리 미끼", qty:3,  chance:8 },
    { kind:"bait", name:"빛나는 젤리 미끼", qty:10, chance:4 },
    { kind:"bait", name:"빛나는 젤리 미끼", qty:20, chance:1 },

    // 🟠 찌 (은/금/다이아)
    { kind:"float", name:"은 찌",    chance:6 },
    { kind:"float", name:"금 찌",    chance:2 },
    { kind:"float", name:"다이아 찌", chance:0.5 },
  ]
};


module.exports = { data, execute, component };
