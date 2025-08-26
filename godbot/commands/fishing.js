// 📁 commands/fishing.js
// 단일 /낚시 명령어에 서브커맨드 통합: 낚시터/구매/판매/인벤토리/기록/기록순위/도움말
// - 낚시 코인(별도 화폐) 시스템
// - 일부 아이템은 BE(정수)로도 결제 가능: be-util.js(addBE/getBE) 사용
// - 장비 내구도, 미끼(20개 묶음, 입질 시 1개 소모), 120초 안에 무조건 1회 입질
// - 장면 이미지(540가지)는 embeds/fishing-images.js에서 URL만 채우면 자동 반영
// - 티어/랭킹, 보물상자/열쇠, 파랑 정수 즉시 지급 포함
// - 모든 상호작용은 명령어 입력자 기준 ephemeral 처리

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const {
  RODS, FLOATS, BAITS, TIMES, SCENES,
  getSceneURL, getIconURL
} = require("../embeds/fishing-images.js");

// ✅ BE(정수) 유틸(네 프로젝트 경로 기준으로 맞춰)
const { addBE, getBE } = require("./be-util.js");

// ===== 저장소 경로 =====
const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const FISH_DB = path.join(dataDir, "fishing.json");

// ===== 내부 상수/테이블 =====
const FISHING_LIMIT_SECONDS = 120; // 120초 내 1회 입질
const SAFE_TENSION_MIN = 30;
const SAFE_TENSION_MAX = 70;

const RARITY = ["노말","레어","유니크","레전드","에픽"];
const TIER_ORDER = ["브론즈","실버","골드","플래티넘","다이아","마스터","그랜드마스터","챌린저"];

// 티어 커트라인(총 평점 점수 기준). 필요시 조정.
const TIER_CUTOFF = {
  "브론즈": 0,
  "실버": 300,
  "골드": 1200,
  "플래티넘": 3500,
  "다이아": 9000,
  "마스터": 20000,
  "그랜드마스터": 45000,
  "챌린저": 85000
};

// 아이템 스펙(내구/능력치). 출력용 설명에도 사용.
// - biteSpeed: 입질 시간 단축(초), 음수이면 더 빨리 옴.
// - dmg: 릴 감기 1회당 데미지 기본값
// - resistReduce: 물고기 저항 약화(퍼센트 가산치)
// - rarityBias: 희귀 어종 가중치(가치 높은 등급 등장률에 가산)
const ROD_SPECS = {
  "나무 낚싯대":   { maxDur: 50,  biteSpeed: -4, dmg: 6,  resistReduce: 0,  rarityBias: 0 },
  "강철 낚싯대":   { maxDur: 80,  biteSpeed: -8, dmg: 9,  resistReduce: 3,  rarityBias: 2 },
  "금 낚싯대":     { maxDur: 120, biteSpeed: -12, dmg: 12, resistReduce: 5,  rarityBias: 5 },
  "다이아 낚싯대": { maxDur: 180, biteSpeed: -18, dmg: 15, resistReduce: 8,  rarityBias: 10 },
  "전설의 낚싯대": { maxDur: 300, biteSpeed: -25, dmg: 20, resistReduce: 12, rarityBias: 18 }
};

const FLOAT_SPECS = {
  "동 찌":    { maxDur: 60,  biteSpeed: -3,  resistReduce: 2,  rarityBias: 0 },
  "은 찌":    { maxDur: 100, biteSpeed: -6,  resistReduce: 4,  rarityBias: 2 },
  "금 찌":    { maxDur: 140, biteSpeed: -9,  resistReduce: 7,  rarityBias: 4 },
  "다이아 찌": { maxDur: 200, biteSpeed: -12, resistReduce: 10, rarityBias: 7 }
};

const BAIT_SPECS = {
  "지렁이 미끼":        { pack: 20, biteSpeed: -2, rarityBias: 0  },
  "새우 미끼":          { pack: 20, biteSpeed: -4, rarityBias: 2  },
  "빛나는 젤리 미끼":  { pack: 20, biteSpeed: -7, rarityBias: 6  }
};

// 구매 가격표
const PRICES = {
  rods: {
    "나무 낚싯대":   { coin: 30,    be: 100000 },
    "강철 낚싯대":   { coin: 500,   be: 1000000 },
    "금 낚싯대":     { coin: 5000,  be: 5000000 },
    "다이아 낚싯대": { coin: 50000, be: null },
    "전설의 낚싯대": { coin: 500000, be: null }
  },
  floats: {
    "동 찌":    { coin: 10,    be: 50000 },
    "은 찌":    { coin: 100,   be: 300000 },
    "금 찌":    { coin: 1000,  be: null },
    "다이아 찌": { coin: 10000, be: null }
  },
  baits: {
    "지렁이 미끼":       { coin: 10,   be: 50000  },
    "새우 미끼":         { coin: 100,  be: 300000 },
    "빛나는 젤리 미끼": { coin: 1000, be: null   }
  }
};

// 드랍 테이블(간단화) — 등급별 후보 목록
const DROP_TABLE = {
  "노말":  ["멸치","피라냐","금붕어","작은 새우","빈 페트병","해초","낚시 코인"],
  "레어":  ["전갱이","고등어","가재","연어","다랑어","가자미","오징어","잉어","삼치","복어","황어","도미","참돔","붕어","비단 잉어","빙어","갈치","파랑 정수"],
  "유니크":["참치","장어","개복치","문어","거북이","까리한 열쇠","까리한 보물상자"],
  "레전드":["곰치","고래상어","빨판상어","청새치"],
  "에픽":  ["철갑상어","대왕고래"]
};

// 등급 기본 가중치(장비/미끼 가중치와 합산)
const BASE_RARITY_WEIGHT = { "노말": 100, "레어": 40, "유니크": 10, "레전드": 3, "에픽": 1 };

// 길이/가치 계산 보조(실측 반영하려면 여기 값 수정)
const FISH_SIZE_RANGE = {
  // 안전한 기본값(임시). 실제 치수로 바꾸려면 이 표만 수정.
  // 단위: cm
  "멸치": [5, 12], "피라냐":[15, 35], "금붕어":[6, 18], "작은 새우":[3, 8],
  "전갱이":[15, 35], "고등어":[20, 45], "가재":[8, 18], "연어":[40, 120], "다랑어":[60, 220],
  "가자미":[20, 50], "오징어":[15, 45], "잉어":[25, 90], "삼치":[30, 120], "복어":[15, 35],
  "황어":[15, 45], "도미":[25, 80], "참돔":[25, 90], "붕어":[12, 45], "비단 잉어":[25, 80],
  "빙어":[8, 18], "갈치":[40, 180],
  "참치":[70, 250], "장어":[40, 150], "개복치":[80, 220], "문어":[25, 100], "거북이":[20, 80],
  "곰치":[50, 150], "고래상어":[300, 1200], "빨판상어":[20, 80], "청새치":[120, 300],
  "철갑상어":[80, 250], "대왕고래":[1000, 3000],
  // 비물고기형은 길이 대신 고정값(판매가 0~특수처리)
  "빈 페트병":[0,0], "해초":[0,0], "낚시 코인":[0,0], "파랑 정수":[0,0], "까리한 열쇠":[0,0], "까리한 보물상자":[0,0], "작은 새우":[3,8]
};

// 희귀도별 판매가 기본 상한(길이 보정 전)
const RARITY_BASE_PRICE = { "노말": 50, "레어": 1200, "유니크": 8000, "레전드": 40000, "에픽": 120000 };

// ‘낚시 코인’ 드랍량(노말의 “낚시 코인” 항목일 때)
const COIN_DROP_RANGE = [1, 10];

// “파랑 정수” 드랍량(레어 테이블의 “파랑 정수”일 때)
const BE_DROP_RANGE = [100, 5000];

// 보물상자 보상(대부분 미끼/정수, 극저확률로 상위 장비)
const CHEST_REWARDS = {
  // chance는 상대가중치
  loot: [
    { name: "지렁이 미끼", kind: "bait", qty: 20, chance: 60 },
    { name: "새우 미끼",   kind: "bait", qty: 20, chance: 30 },
    { name: "빛나는 젤리 미끼", kind: "bait", qty: 20, chance: 10 },
    { name: "파랑 정수",   kind: "be",   min: 30000, max: 200000, chance: 25 },
    // 극저확률(낚싯대는 매우 희박, 찌는 낮은 확률)
    { name: "금 찌",       kind: "float", chance: 3 },
    { name: "다이아 찌",   kind: "float", chance: 1 },
    // 전설/다이아 낚싯대는 실질적으로 거의 안나오지만 ‘존재’만
    { name: "다이아 낚싯대", kind: "rod", chance: 0.2 },
    { name: "전설의 낚싯대", kind: "rod", chance: 0.05 },
  ]
};

// KST 시간대 판정
function getKSTHour() {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit'
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === "hour").value);
  return h;
}
function currentTimeBand() {
  const h = getKSTHour();
  if (h >= 7 && h <= 15) return "낮";
  if (h >= 16 && h <= 19) return "노을";
  // 20~23 or 0~6
  return "밤";
}

// ===== 파일 IO =====
function loadDB() {
  if (!fs.existsSync(FISH_DB)) fs.writeFileSync(FISH_DB, JSON.stringify({ users: {} }, null, 2));
  try {
    return JSON.parse(fs.readFileSync(FISH_DB, "utf8"));
  } catch {
    return { users: {} };
  }
}
function saveDB(obj) {
  fs.writeFileSync(FISH_DB, JSON.stringify(obj, null, 2));
}

// 락 감싸기
async function withDB(fn) {
  let release;
  try {
    release = await lockfile.lock(FISH_DB, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    const db = loadDB();
    const res = await fn(db);
    saveDB(db);
    return res;
  } finally {
    if (release) await release();
  }
}

// ===== 유저 상태 =====
function ensureUser(u) {
  if (!u.coins) u.coins = 0; // 낚시 코인
  if (!u.equip) u.equip = { rod: null, float: null, bait: null };
  if (!u.inv) u.inv = { rods: {}, floats: {}, baits: {}, keys: 0, chests: 0, fishes: [] };
  if (!u.stats) u.stats = { points: 0, caught: 0, best: {} };
  if (!u.tier) u.tier = "브론즈";
}

function rarityOf(name) {
  if (DROP_TABLE["노말"].includes(name)) return "노말";
  if (DROP_TABLE["레어"].includes(name)) return "레어";
  if (DROP_TABLE["유니크"].includes(name)) return "유니크";
  if (DROP_TABLE["레전드"].includes(name)) return "레전드";
  if (DROP_TABLE["에픽"].includes(name)) return "에픽";
  return "노말";
}

// ===== 구매/소지/내구 =====
function addRod(u, name, dur)   { if (!u.inv.rods[name]) u.inv.rods[name] = 0; u.inv.rods[name] += (dur ?? ROD_SPECS[name].maxDur); }
function addFloat(u, name, dur) { if (!u.inv.floats[name]) u.inv.floats[name] = 0; u.inv.floats[name] += (dur ?? FLOAT_SPECS[name].maxDur); }
function addBait(u, name, qty)  { if (!u.inv.baits[name]) u.inv.baits[name] = 0; u.inv.baits[name] += qty; }

function useDurability(u, slot) {
  // slot: "rod" | "float"
  const name = u.equip[slot];
  if (!name) return;
  if (slot === "rod") {
    u.inv.rods[name] = Math.max(0, (u.inv.rods[name] ?? 0) - 1);
    if (u.inv.rods[name] === 0) u.equip.rod = null;
  } else {
    u.inv.floats[name] = Math.max(0, (u.inv.floats[name] ?? 0) - 1);
    if (u.inv.floats[name] === 0) u.equip.float = null;
  }
}

function consumeBait(u) {
  const name = u.equip.bait;
  if (!name) return false;
  if ((u.inv.baits[name] ?? 0) <= 0) { u.equip.bait = null; return false; }
  u.inv.baits[name] -= 1;
  if (u.inv.baits[name] <= 0) u.equip.bait = null;
  return true;
}

function hasAllGear(u) {
  return !!(u.equip.rod && u.equip.float && u.equip.bait && (u.inv.rods[u.equip.rod] ?? 0) > 0 && (u.inv.floats[u.equip.float] ?? 0) > 0 && (u.inv.baits[u.equip.bait] ?? 0) > 0);
}

// ===== 가치/길이/점수 계산 =====
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

function pickWeighted(weightsMap){
  const entries = Object.entries(weightsMap);
  const total = entries.reduce((s, [,w])=>s+w,0);
  if (total<=0) return entries[0][0];
  let r = Math.random()*total;
  for (const [k,w] of entries) { if ((r-=w) <= 0) return k; }
  return entries[entries.length-1][0];
}

function computeRarityWeight(u) {
  const rod = u.equip.rod, flo = u.equip.float, bait = u.equip.bait;
  const rSpec = ROD_SPECS[rod] || { rarityBias: 0 };
  const fSpec = FLOAT_SPECS[flo] || { rarityBias: 0 };
  const bSpec = BAIT_SPECS[bait] || { rarityBias: 0 };

  const weights = {};
  for (const r of RARITY) {
    const base = BASE_RARITY_WEIGHT[r];
    const bias = (rSpec.rarityBias + fSpec.rarityBias + bSpec.rarityBias);
    // 높은 희귀도일수록 bias 혜택을 조금 더 받도록(선형 가산)
    const tierBonus = { "노말":0, "레어":bias, "유니크":bias*1.5, "레전드":bias*2.2, "에픽":bias*3.5 }[r];
    weights[r] = Math.max(1, base + tierBonus);
  }
  return weights;
}

function computeSellPrice(name, length) {
  const r = rarityOf(name);
  if (["빈 페트병","해초","파랑 정수","낚시 코인","까리한 열쇠","까리한 보물상자"].includes(name)) return 0;
  const baseCap = RARITY_BASE_PRICE[r] || 50;
  const [minL,maxL] = FISH_SIZE_RANGE[name] || [10,50];
  const norm = Math.max(0, Math.min(1, (length - minL) / Math.max(1, maxL - minL))); // 0~1
  let price = Math.round(baseCap * (0.6 + 0.8*norm)); // 60%~140%
  // 전역 한도 보정
  price = Math.max(1, Math.min(100000, price));
  return price;
}

function computePoints(rarity, price) {
  // 포인트: 희귀도 가중치 * 판매가 루트
  const mult = { "노말": 1, "레어": 4, "유니크": 9, "레전드": 20, "에픽": 45 }[rarity] || 1;
  return Math.round(mult * Math.sqrt(Math.max(1, price)));
}

function updateTier(u) {
  const p = u.stats.points || 0;
  let best = "브론즈";
  for (const t of TIER_ORDER) {
    if (p >= TIER_CUTOFF[t]) best = t; else break;
  }
  u.tier = best;
}

// ===== 진행 세션(메모리) =====
const sessions = new Map(); // userId -> { state, timers... }
function clearSession(userId) {
  const s = sessions.get(userId);
  if (s) {
    if (s.biteTimer) clearTimeout(s.biteTimer);
    if (s.expireTimer) clearTimeout(s.expireTimer);
  }
  sessions.delete(userId);
}

// ===== 임베드/컴포넌트 =====
function sceneEmbed(user, title, desc, sceneURL, extraFields = []) {
  const eb = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc || "")
    .setColor(0x3aa0ff);
  if (sceneURL) eb.setImage(sceneURL);
  if (extraFields.length) eb.addFields(extraFields);
  eb.setFooter({ text: `낚시 코인: ${user.coins.toLocaleString()} | 티어: ${user.tier}` });
  return eb;
}

function equipLine(u) {
  const rodI = getIconURL(u.equip.rod || "");
  const floI = getIconURL(u.equip.float || "");
  const baitI= getIconURL(u.equip.bait || "");
  const rDur = u.equip.rod ? (u.inv.rods[u.equip.rod] ?? 0) : 0;
  const fDur = u.equip.float ? (u.inv.floats[u.equip.float] ?? 0) : 0;
  return [
    `🎣 낚싯대: ${u.equip.rod || "없음"}${rDur?` (${rDur} 내구)`:''}${rodI?`  ⎯ ⎯ 이미지`:""}`,
    `🟠 찌: ${u.equip.float || "없음"}${fDur?` (${fDur} 내구)`:''}${floI?`  ⎯ ⎯ 이미지`:""}`,
    `🪱 미끼: ${u.equip.bait || "없음"}${u.equip.bait?` (잔여 ${u.inv.baits[u.equip.bait]||0})`:''}${baitI?`  ⎯ ⎯ 이미지`:""}`
  ].join("\n");
}

function buttonsStart() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fish:cast").setLabel("🎯 찌 던지기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fish:cancel").setLabel("🛑 중단하기").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("fish:equip").setLabel("🧰 아이템 교체하기").setStyle(ButtonStyle.Secondary),
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

// ===== 낚시 로직 =====
function biteDelaySec(u){
  // 기본 120초 안쪽에서 최소~최대
  let base = randInt(20, 100);
  const rSpec = ROD_SPECS[u.equip.rod] || { biteSpeed: 0 };
  const fSpec = FLOAT_SPECS[u.equip.float] || { biteSpeed: 0 };
  const bSpec = BAIT_SPECS[u.equip.bait] || { biteSpeed: 0 };
  base += Math.min(0, rSpec.biteSpeed) + Math.min(0, fSpec.biteSpeed) + Math.min(0, bSpec.biteSpeed);
  base = Math.max(5, Math.min(FISHING_LIMIT_SECONDS - 3, base));
  return base;
}

function startFight(u) {
  // 물고기 선택(희귀도 → 개체)
  const rarityWeights = computeRarityWeight(u);
  const rar = pickWeighted(rarityWeights);
  const pool = DROP_TABLE[rar];
  const name = pool[randInt(0, pool.length-1)];

  // 특별 케이스 처리(낚시 코인/파랑 정수/상자/열쇠 등)
  if (name === "낚시 코인") {
    const amt = randInt(COIN_DROP_RANGE[0], COIN_DROP_RANGE[1]);
    return { type: "instantCoin", name, rarity: "노말", coin: amt };
  }
  if (name === "파랑 정수") {
    const amt = randInt(BE_DROP_RANGE[0], BE_DROP_RANGE[1]);
    return { type: "instantBE", name, rarity: "레어", be: amt };
  }
  if (name === "까리한 열쇠") {
    return { type: "instantKey", name, rarity: "유니크", qty: 1 };
  }
  if (name === "까리한 보물상자") {
    return { type: "instantChest", name, rarity: "유니크", qty: 1 };
  }

  // 전투형(실제 낚는 과정)
  const [minL,maxL] = FISH_SIZE_RANGE[name] || [10, 50];
  const targetLen = randInt(minL, maxL);
  const hp = Math.max(20, Math.round(20 + (RARITY.indexOf(rar)+1)*10 + targetLen*0.2));
  const resist = 10 + (RARITY.indexOf(rar)*4);

  return {
    type: "fight",
    name, rarity: rar,
    maxHP: hp, hp,
    length: targetLen,
    resist
  };
}

function applyReel(u, st, action) {
  // st: { hp, maxHP, tension, resist }
  const rSpec = ROD_SPECS[u.equip.rod] || { dmg: 8, resistReduce: 0 };
  const fSpec = FLOAT_SPECS[u.equip.float] || { resistReduce: 0 };

  if (action === "reel") {
    // 감기: 데미지 + 텐션 증가
    const rr = rSpec.resistReduce + fSpec.resistReduce;
    const effectiveResist = Math.max(0, st.resist - rr);
    const dmg = Math.max(1, Math.round((rSpec.dmg || 8) * (1 - effectiveResist/100)));
    st.hp = Math.max(0, st.hp - dmg);
    st.tension = Math.min(100, st.tension + randInt(8, 15));
  } else {
    // 풀기: 데미지 없음, 텐션 감소
    st.tension = Math.max(0, st.tension - randInt(10, 18));
  }

  // 텐션 체크: 너무 높거나 너무 낮으면 도주확률 증가
  let escape = false;
  if (st.tension >= 100 && Math.random() < 0.8) escape = true;
  if (st.tension <= 0 && Math.random() < 0.4)  escape = true;

  return { ...st, escape };
}

// ===== 인벤토리/판매/상자 =====
function fishToInv(u, obj) {
  // obj: { name, rarity, length, sell }
  u.inv.fishes.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,7),
    name: obj.name,
    rarity: obj.rarity,
    length: obj.length,
    price: obj.sell
  });
  u.stats.caught++;
  u.stats.points += computePoints(obj.rarity, obj.sell);
  // 베스트 기록
  const best = u.stats.best[obj.name];
  if (!best || obj.length > best.length) {
    u.stats.best[obj.name] = { length: obj.length, price: obj.sell, ts: Date.now() };
  }
  updateTier(u);
}

// ===== 명령어 빌더 =====
const data = new SlashCommandBuilder()
  .setName("낚시")
  .setDescription("낚시 미니게임")
  .addSubcommand(s => s.setName("낚시터").setDescription("낚시 시작/진행"))
  .addSubcommand(s => s.setName("구매").setDescription("장비/미끼 구매"))
  .addSubcommand(s => s.setName("판매").setDescription("낚은 물고기 판매"))
  .addSubcommand(s => s.setName("인벤토리").setDescription("낚시 인벤토리 확인/장착"))
  .addSubcommand(s => s.setName("기록").setDescription("내/다른 유저 낚시 기록 조회")
    .addUserOption(o=>o.setName("유저").setDescription("조회 대상(미지정시 본인)")))
  .addSubcommand(s => s.setName("기록순위").setDescription("낚시 티어/포인트 순위"))
  .addSubcommand(s => s.setName("도움말").setDescription("명령어/시스템 설명"));

// ===== 실행 =====
async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === "낚시터") {
    return await withDB(async db => {
      const u = (db.users[userId] ||= {});
      ensureUser(u);

      // 초기 화면
      const timeBand = currentTimeBand(); // 낮/노을/밤
      const sceneURL = getSceneURL(u.equip.rod||"나무 낚싯대", u.equip.float||"동 찌", u.equip.bait||"지렁이 미끼", timeBand, "기본");
      const eb = sceneEmbed(u, "🎣 낚시터", [
        `⌛ 제한: ${FISHING_LIMIT_SECONDS}초 내 1회 입질 확정`,
        `🕒 현재 시간대(한국): **${timeBand}**`,
        "",
        equipLine(u)
      ].join("\n"), sceneURL);
      await interaction.reply({ embeds:[eb], components:[buttonsStart()], ephemeral:true });
    });
  }

  if (sub === "구매") {
    return await withDB(async db => {
      const u = (db.users[userId] ||= {}); ensureUser(u);
      const eb = new EmbedBuilder().setTitle("🛒 낚시 상점")
        .setDescription([
          "구매 통화: **낚시 코인** / 일부 품목은 **정수(BE)** 도 가능",
          "미끼는 20개 묶음. 같은 미끼 보유 중 구매 시 **부족분만 비례 결제**(최대 20개).",
          "",
          "**낚싯대**",
          ...Object.keys(PRICES.rods).map(n=>{
            const p=PRICES.rods[n]; const spec=ROD_SPECS[n];
            return `• ${n} — 코인 ${p.coin?.toLocaleString() ?? "-"} / 정수 ${p.be?.toLocaleString() ?? "-"} | 내구 ${spec.maxDur}, dmg ${spec.dmg}, 호감(희귀도) +${spec.rarityBias}`;
          }),
          "",
          "**찌**",
          ...Object.keys(PRICES.floats).map(n=>{
            const p=PRICES.floats[n]; const spec=FLOAT_SPECS[n];
            return `• ${n} — 코인 ${p.coin?.toLocaleString() ?? "-"} / 정수 ${p.be?.toLocaleString() ?? "-"} | 내구 ${spec.maxDur}, 저항↓ ${spec.resistReduce}%`;
          }),
          "",
          "**미끼(20개/묶음)**",
          ...Object.keys(PRICES.baits).map(n=>{
            const p=PRICES.baits[n]; const spec=BAIT_SPECS[n];
            return `• ${n} — 코인 ${p.coin?.toLocaleString() ?? "-"} / 정수 ${p.be?.toLocaleString() ?? "-"} | 입질가속 ${spec.biteSpeed}s, 희귀도 가중 +${spec.rarityBias}`;
          })
        ].join("\n")).setColor(0x55cc77)
        .setFooter({ text: `보유 코인: ${u.coins.toLocaleString()} | 정수: ${getBE(userId).toLocaleString()}` });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("fish:buy")
        .setPlaceholder("구매할 품목/통화 선택")
        .addOptions(
          ...Object.keys(PRICES.rods).flatMap(n=>{
            const p=PRICES.rods[n];
            const o=[];
            if (p.coin!=null) o.push({ label:`[코인] ${n}`, value:`buy|rod|coin|${n}` });
            if (p.be!=null)   o.push({ label:`[정수] ${n}`, value:`buy|rod|be|${n}` });
            return o;
          }),
          ...Object.keys(PRICES.floats).flatMap(n=>{
            const p=PRICES.floats[n];
            const o=[];
            if (p.coin!=null) o.push({ label:`[코인] ${n}`, value:`buy|float|coin|${n}` });
            if (p.be!=null)   o.push({ label:`[정수] ${n}`, value:`buy|float|be|${n}` });
            return o;
          }),
          ...Object.keys(PRICES.baits).flatMap(n=>{
            const p=PRICES.baits[n];
            const o=[];
            if (p.coin!=null) o.push({ label:`[코인] ${n}`, value:`buy|bait|coin|${n}` });
            if (p.be!=null)   o.push({ label:`[정수] ${n}`, value:`buy|bait|be|${n}` });
            return o;
          })
        );

      const row = new ActionRowBuilder().addComponents(menu);
      await interaction.reply({ embeds:[eb], components:[row], ephemeral:true });
    });
  }

  if (sub === "판매") {
    return await withDB(async db => {
      const u = (db.users[userId] ||= {}); ensureUser(u);
      const fishes = u.inv.fishes || [];
      const total = fishes.reduce((s,f)=>s+(f.price||0),0);
      const eb = new EmbedBuilder().setTitle("💰 낚시 판매")
        .setDescription([
          `보유 물고기 수: **${fishes.length}**`,
          `일괄 판매 예상: **${total.toLocaleString()}** 코인`,
          "",
          fishes.slice(-10).map(f=>`• [${f.rarity}] ${f.name} ${Math.round(f.length)}cm — ${f.price.toLocaleString()}코인`).join("\n") || "_최근 10개 미리보기 없음_"
        ].join("\n"))
        .setColor(0xffcc55);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("fish:sell_all").setLabel("모두 판매").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("fish:sell_cancel").setLabel("닫기").setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds:[eb], components:[row], ephemeral:true });
    });
  }

  if (sub === "인벤토리") {
    return await withDB(async db => {
      const u = (db.users[userId] ||= {}); ensureUser(u);
      const eb = new EmbedBuilder().setTitle("🎒 낚시 인벤토리")
        .setDescription([
          equipLine(u),
          "",
          "• 낚싯대: " + (Object.entries(u.inv.rods).map(([n,d])=>`${n}(${d})`).join(", ") || "없음"),
          "• 찌: "   + (Object.entries(u.inv.floats).map(([n,d])=>`${n}(${d})`).join(", ") || "없음"),
          "• 미끼: " + (Object.entries(u.inv.baits).map(([n,q])=>`${n}(${q})`).join(", ") || "없음"),
          `• 열쇠: ${u.inv.keys||0}개 | 상자: ${u.inv.chests||0}개`,
          `• 물고기: ${u.inv.fishes.length}마리`
        ].join("\n"))
        .setColor(0x8888ff);

      const menu = new StringSelectMenuBuilder()
        .setCustomId("fish:equip_menu")
        .setPlaceholder("장착/열기/관리")
        .addOptions(
          ...Object.keys(u.inv.rods).map(n=>({ label:`장착: ${n}`, value:`equip|rod|${n}` })),
          ...Object.keys(u.inv.floats).map(n=>({ label:`장착: ${n}`, value:`equip|float|${n}` })),
          ...Object.keys(u.inv.baits).map(n=>({ label:`장착: ${n}`, value:`equip|bait|${n}` })),
          ...(u.inv.chests>0 ? [{ label:`상자 열기 (보유 ${u.inv.chests})`, value:`open|chest` }] : []),
          ...(u.inv.keys>0 ? [{ label:`열쇠 보유 (${u.inv.keys})`, value:`info|key` }] : [])
        );

      await interaction.reply({ embeds:[eb], components:[ new ActionRowBuilder().addComponents(menu) ], ephemeral:true });
    });
  }

  if (sub === "기록") {
    const target = interaction.options.getUser("유저") || interaction.user;
    const targetId = target.id;
    return await withDB(async db => {
      const u = (db.users[targetId] ||= {}); ensureUser(u);
      const top3 = Object.entries(u.stats.best || {})
        .sort((a,b)=> (b[1].price||0) - (a[1].price||0))
        .slice(0,3);

      const tierIcon = getIconURL(u.tier);
      const eb = new EmbedBuilder().setTitle(`📜 낚시 기록 — ${target.username}`)
        .setDescription([
          `티어: **${u.tier}**`,
          `포인트: **${u.stats.points.toLocaleString()}**`,
          `누적 어획: **${u.stats.caught.toLocaleString()}**`,
          "",
          top3.length ? "**베스트 상위 3**\n" + top3.map(([n,i])=>`• ${n} — ${Math.round(i.length)}cm / ${i.price.toLocaleString()}코인`).join("\n") : "_기록 없음_"
        ].join("\n"))
        .setColor(0x66ddee);
      if (tierIcon) eb.setThumbnail(tierIcon);
      await interaction.reply({ embeds:[eb], ephemeral:true });
    });
  }

  if (sub === "기록순위") {
    return await withDB(async db => {
      const arr = Object.entries(db.users||{}).map(([id,u])=>{
        ensureUser(u);
        return { id, tier:u.tier, points:u.stats.points||0 };
      }).sort((a,b)=> b.points - a.points).slice(0,20);

      const lines = await Promise.all(arr.map(async (o,i)=>{
        const member = await interaction.guild.members.fetch(o.id).catch(()=>null);
        const name = member?.displayName || `유저(${o.id})`;
        return `${i+1}. ${name} — ${o.tier} (${o.points.toLocaleString()}점)`;
      }));

      const eb = new EmbedBuilder().setTitle("🏆 낚시 기록 순위 TOP 20")
        .setDescription(lines.join("\n") || "_데이터 없음_")
        .setColor(0xff77aa);
      await interaction.reply({ embeds:[eb], ephemeral:true });
    });
  }

  if (sub === "도움말") {
    const eb = new EmbedBuilder().setTitle("❔ 낚시 도움말")
      .setDescription([
        "• `/낚시 낚시터` — 낚시 시작. **찌 던지기 → 대기 → 입질 → 릴 감기/풀기**",
        "• `/낚시 구매` — 장비/미끼 구매(일부 정수 결제 가능). 미끼는 20개 묶음, **부족분만 비례결제**",
        "• `/낚시 판매` — 보유 물고기 일괄 판매",
        "• `/낚시 인벤토리` — 장착/상자 열기",
        "• `/낚시 기록 [유저]` — 기록/티어 조회",
        "• `/낚시 기록순위` — 티어/포인트 랭킹",
        "",
        "⚙ 시간대: **낮(07:00~15:59) / 노을(16:00~19:59) / 밤(20:00~06:59)** (KST)",
        "⚙ 장비는 사용 시 **내구도 1** 감소, 미끼는 **입질 시작 시 1개** 소모",
        "⚙ ‘낚시 코인’은 BE(정수)와 **별개 화폐**"
      ].join("\n"))
      .setColor(0xcccccc);
    return await interaction.reply({ embeds:[eb], ephemeral:true });
  }
}

// ===== 버튼/셀렉트 처리 =====
async function component(interaction) {
  const userId = interaction.user.id;

  // 공통 DB 핸들
  return await withDB(async db => {
    const u = (db.users[userId] ||= {}); ensureUser(u);

    // 셀렉트: 구매/장착/열기
    if (interaction.isStringSelectMenu()) {
      const [type, a, b, c] = interaction.values[0].split("|");

      // 구매
      if (type === "buy") {
        const kind = a; // rod/float/bait
        const pay  = b; // coin/be
        const name = c;

        const price = PRICES[kind === "rod" ? "rods" : kind === "float" ? "floats" : "baits"][name];
        if (!price) return interaction.reply({ content:"가격 오류", ephemeral:true });

        if (kind === "bait") {
          // 부족분만 결제(최대 20)
          const pack = BAIT_SPECS[name].pack;
          const cur = u.inv.baits[name] || 0;
          const need = Math.max(0, pack - cur);
          if (need === 0) return interaction.reply({ content:`이미 ${name}가 가득(20개)입니다.`, ephemeral:true });

          if (pay === "coin") {
            const cost = Math.ceil(price.coin * (need/pack));
            if ((u.coins||0) < cost) return interaction.reply({ content:`코인 부족(필요 ${cost})`, ephemeral:true });
            u.coins -= cost;
            addBait(u, name, need);
            return interaction.reply({ content:`${name} ${need}개 보충(코인 ${cost} 소모)`, ephemeral:true });
          } else {
            if (price.be == null) return interaction.reply({ content:"정수 결제가 불가한 품목", ephemeral:true });
            const cost = Math.ceil(price.be * (need/pack));
            if ((getBE(userId)||0) < cost) return interaction.reply({ content:`정수 부족(필요 ${cost}원)`, ephemeral:true });
            await addBE(userId, -cost, `[낚시] ${name} 보충구매 (${need})`);
            addBait(u, name, need);
            return interaction.reply({ content:`${name} ${need}개 보충(정수 ${cost.toLocaleString()}원 차감)`, ephemeral:true });
          }
        }

        // 장비(내구 풀)
        if (pay === "coin") {
          const cost = price.coin;
          if (cost == null) return interaction.reply({ content:"코인 결제 불가", ephemeral:true });
          if ((u.coins||0) < cost) return interaction.reply({ content:`코인 부족(필요 ${cost})`, ephemeral:true });
          u.coins -= cost;
        } else {
          const cost = price.be;
          if (cost == null) return interaction.reply({ content:"정수 결제 불가", ephemeral:true });
          if ((getBE(userId)||0) < cost) return interaction.reply({ content:`정수 부족(필요 ${cost}원)`, ephemeral:true });
          await addBE(userId, -cost, `[낚시] ${name} 구매`);
        }

        if (kind === "rod") addRod(u, name);
        if (kind === "float") addFloat(u, name);
        return interaction.reply({ content:`구매 완료: ${name}`, ephemeral:true });
      }

      // 장착
      if (type === "equip") {
        const slot = a; // rod/float/bait
        const name = b;
        if (slot === "rod" && (u.inv.rods[name]??0) <= 0) return interaction.reply({ content:"해당 낚싯대 내구가 없습니다.", ephemeral:true });
        if (slot === "float" && (u.inv.floats[name]??0) <= 0) return interaction.reply({ content:"해당 찌 내구가 없습니다.", ephemeral:true });
        if (slot === "bait" && (u.inv.baits[name]??0) <= 0) return interaction.reply({ content:"해당 미끼가 없습니다.", ephemeral:true });
        u.equip[slot] = name;
        return interaction.reply({ content:`장착 완료: ${slot} → ${name}`, ephemeral:true });
      }

      // 상자 열기
      if (type === "open" && a === "chest") {
        if ((u.inv.chests||0) <= 0) return interaction.reply({ content:"보물상자가 없습니다.", ephemeral:true });
        if ((u.inv.keys||0) <= 0) return interaction.reply({ content:"열쇠가 없습니다.", ephemeral:true });

        // 소모
        u.inv.chests -= 1;
        u.inv.keys   -= 1;

        // 보상 추첨
        const pool = CHEST_REWARDS.loot;
        const w = {};
        for (const it of pool) w[it.name] = it.chance;
        const pick = pickWeighted(w);
        const item = pool.find(x=>x.name===pick);

        if (item.kind === "bait") {
          addBait(u, item.name, item.qty);
          return interaction.reply({ content:`상자 개봉 → ${item.name} ${item.qty}개`, ephemeral:true });
        }
        if (item.kind === "be") {
          const amt = randInt(item.min, item.max);
          await addBE(userId, amt, "[낚시] 상자 보상");
          return interaction.reply({ content:`상자 개봉 → 파랑 정수 ${amt.toLocaleString()}원`, ephemeral:true });
        }
        if (item.kind === "float") { addFloat(u, item.name); return interaction.reply({ content:`상자 개봉 → ${item.name}`, ephemeral:true }); }
        if (item.kind === "rod")   { addRod(u, item.name);   return interaction.reply({ content:`상자 개봉 → ${item.name}`, ephemeral:true }); }

        return interaction.reply({ content:"상자 보상 오류", ephemeral:true });
      }

      // 열쇠 정보 표기만
      if (type === "info" && a === "key") {
        return interaction.reply({ content:`보유 열쇠: ${u.inv.keys||0}개`, ephemeral:true });
      }

      return;
    }

    // 버튼류
    const id = interaction.customId;

    // 시작 화면 버튼
    if (id === "fish:cancel") {
      clearSession(userId);
      return interaction.update({ content:"낚시를 종료했어.", components:[], embeds:[] });
    }
    if (id === "fish:equip") {
      // 인벤토리 화면으로 우회
      const fake = interaction;
      fake.client.commands.get("낚시").execute({ ...interaction, options:{ getSubcommand:()=> "인벤토리" }});
      return;
    }
    if (id === "fish:cast") {
      // 장비 체크
      if (!hasAllGear(u)) {
        const miss = [
          !u.equip.rod ? "낚싯대" : (u.inv.rods[u.equip.rod]??0)<=0 ? "낚싯대(내구 0)" : null,
          !u.equip.float ? "찌" : (u.inv.floats[u.equip.float]??0)<=0 ? "찌(내구 0)" : null,
          !u.equip.bait ? "미끼" : (u.inv.baits[u.equip.bait]??0)<=0 ? "미끼(0개)" : null
        ].filter(Boolean).join(", ");
        const eb = new EmbedBuilder().setTitle("⚠ 장비 부족")
          .setDescription(`부족: **${miss}**\n/낚시 구매 에서 구매해줘.`)
          .setColor(0xff5555);
        return interaction.update({ embeds:[eb], components:[], ephemeral:true });
      }

      // 세션 생성
      clearSession(userId);
      const s = { state:"waiting", tension: randInt(35,65) };
      sessions.set(userId, s);

      const timeBand = currentTimeBand();
      const scene1 = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, timeBand, "찌들어감");

      const waitSec = biteDelaySec(u);
      s.biteTimer = setTimeout(async ()=>{
        // 입질 시작 시점에 미끼 1개 소모
        if (!consumeBait(u)) {
          clearSession(userId);
          try { await interaction.followUp({ content:"미끼가 없어 입질을 놓쳤어.", ephemeral:true }); } catch{}
          return;
        }

        // 무슨 대상인지 결정
        const fight = startFight(u); // instant* | fight
        if (fight.type === "instantCoin") {
          u.coins += fight.coin;
          clearSession(userId);
          const eb = sceneEmbed(u, "🪙 낚시 코인 획득!", `+${fight.coin} 코인 (노말)`, getIconURL("낚시 코인"));
          return interaction.editReply({ embeds:[eb], components:[], ephemeral:true });
        }
        if (fight.type === "instantBE") {
          await addBE(userId, fight.be, "[낚시] 파랑 정수 드랍");
          clearSession(userId);
          const eb = sceneEmbed(u, "🔵 파랑 정수 획득!", `+${fight.be.toLocaleString()}원 (레어)`, getIconURL("파랑 정수"));
          return interaction.editReply({ embeds:[eb], components:[], ephemeral:true });
        }
        if (fight.type === "instantKey") {
          u.inv.keys = (u.inv.keys||0) + 1;
          clearSession(userId);
          const eb = sceneEmbed(u, "🗝️ 까리한 열쇠 획득!", `인벤토리에 추가됨.`, getIconURL("까리한 열쇠"));
          return interaction.editReply({ embeds:[eb], components:[], ephemeral:true });
        }
        if (fight.type === "instantChest") {
          u.inv.chests = (u.inv.chests||0) + 1;
          clearSession(userId);
          const eb = sceneEmbed(u, "📦 까리한 보물상자 획득!", `인벤토리에 추가됨.`, getIconURL("까리한 보물상자"));
          return interaction.editReply({ embeds:[eb], components:[], ephemeral:true });
        }

        // 전투 시작
        s.state = "fight";
        s.target = fight;
        s.tension = randInt(35,65);

        const sceneBite = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, timeBand, "입질");
        const eb = sceneEmbed(u, `🐟 입질! [${fight.rarity}] ${fight.name}`,
          [
            `체력: ${fight.hp}/${fight.maxHP}`,
            `텐션: ${s.tension}% (안정 ${SAFE_TENSION_MIN}~${SAFE_TENSION_MAX}%)`,
            "",
            "올바른 타이밍으로 릴을 감고/풀자!"
          ].join("\n"), sceneBite);
        try {
          await interaction.editReply({ embeds:[eb], components:[buttonsFight()], ephemeral:true });
        } catch {}
      }, waitSec*1000);

      // 만료 타이머
      s.expireTimer = setTimeout(()=>{
        clearSession(userId);
      }, (FISHING_LIMIT_SECONDS+20)*1000);

      // 대기 화면 업데이트
      const eb = sceneEmbed(u, "🪔 입질을 기다리는 중...", [
        `최대 ${FISHING_LIMIT_SECONDS}초 내 1회 입질 확정`,
        "중간에 포기하면 미끼는 소모되지 않음.",
        "",
        equipLine(u)
      ].join("\n"), scene1);
      return interaction.update({ embeds:[eb], components:[buttonsWaiting()], ephemeral:true });
    }

    // 대기중 중단
    if (id === "fish:abort") {
      clearSession(userId);
      return interaction.update({ content:"낚시를 중단했어. (미끼 미소모)", embeds:[], components:[], ephemeral:true });
    }

    // 전투 단계
    const s = sessions.get(userId);
    if (!s || s.state !== "fight") {
      if (["fish:reel","fish:loosen","fish:giveup"].includes(id)) {
        return interaction.reply({ content:"진행 중인 전투가 없어.", ephemeral:true });
      }
      return;
    }

    if (id === "fish:giveup") {
      clearSession(userId);
      return interaction.update({ content:"물고기를 놓쳤어...", embeds:[], components:[], ephemeral:true });
    }

    if (id === "fish:reel" || id === "fish:loosen") {
      const act = id === "fish:reel" ? "reel" : "loosen";
      const st = applyReel(u, s.target, act);
      s.target = st;

      // 탈주 체크
      if (st.escape) {
        clearSession(userId);
        return interaction.update({ content:"텐션 조절 실패로 도망쳤다!", embeds:[], components:[], ephemeral:true });
      }

      // 포획 성공?
      if (st.hp <= 0) {
        // 내구 소모
        useDurability(u, "rod");
        useDurability(u, "float");

        const sell = computeSellPrice(st.name, st.length);
        fishToInv(u, { name: st.name, rarity: st.rarity, length: st.length, sell });
        updateTier(u);

        clearSession(userId);

        const eb = sceneEmbed(u, `✅ 포획 성공! [${st.rarity}] ${st.name}`, [
          `길이: ${Math.round(st.length)}cm`,
          `판매가: ${sell.toLocaleString()}코인`,
          "",
          "💡 `/낚시 판매`로 바로 코인화 할 수 있어."
        ].join("\n"), getIconURL(st.name));
        return interaction.update({ embeds:[eb], components:[], ephemeral:true });
      }

      // 진행 업데이트
      const eb = new EmbedBuilder().setTitle(`🎣 전투 중 — [${st.rarity}] ${st.name}`)
        .setDescription([
          `체력: ${st.hp}/${st.maxHP}`,
          `텐션: ${s.tension}% (안정 ${SAFE_TENSION_MIN}~${SAFE_TENSION_MAX}%)`,
          "",
          (s.tension<SAFE_TENSION_MIN? "⚠ 텐션 낮음 — 살살 감기!" : s.tension>SAFE_TENSION_MAX? "⚠ 텐션 높음 — 조금 풀어!" : "✅ 텐션 안정적"),
        ].join("\n"))
        .setColor(0x44ddaa);
      return interaction.update({ embeds:[eb], components:[buttonsFight()], ephemeral:true });
    }

    // 판매
    if (id === "fish:sell_all") {
      const fishes = u.inv.fishes || [];
      const total = fishes.reduce((s,f)=>s+(f.price||0),0);
      u.coins += total;
      u.inv.fishes = [];
      return interaction.update({ content:`총 ${total.toLocaleString()} 코인을 획득했어.`, embeds:[], components:[], ephemeral:true });
    }
    if (id === "fish:sell_cancel") {
      return interaction.update({ content:"판매 창을 닫았어.", embeds:[], components:[], ephemeral:true });
    }
  });
}

module.exports = {
  data,
  execute,
  component
};
