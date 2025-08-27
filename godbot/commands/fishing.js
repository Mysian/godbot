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

const FISHING_LIMIT_SECONDS = 120;
const FIGHT_IDLE_TIMEOUT = 12;
const FIGHT_TOTAL_TIMEOUT = 60;
const SAFE_TENSION_MIN = 30;
const SAFE_TENSION_MAX = 70;
const SELL_PRICE_MULT = 0.35;

const RARITY = ["노말","레어","유니크","레전드","에픽"];
const TIER_ORDER = ["브론즈","실버","골드","플래티넘","다이아","마스터","그랜드마스터","챌린저"];
const TIER_CUTOFF = {
  "브론즈": 0, "실버": 300, "골드": 1200, "플래티넘": 3500,
  "다이아": 9000, "마스터": 20000, "그랜드마스터": 45000, "챌린저": 85000
};

const ROD_SPECS = {
  "나무 낚싯대":   { maxDur: 50,  biteSpeed: -4,  dmg: 6,  resistReduce: 0,  rarityBias: 0 },
  "강철 낚싯대":   { maxDur: 120,  biteSpeed: -8,  dmg: 9,  resistReduce: 3,  rarityBias: 2 },
  "금 낚싯대":     { maxDur: 250, biteSpeed: -12, dmg: 12, resistReduce: 5,  rarityBias: 5 },
  "다이아 낚싯대": { maxDur: 550, biteSpeed: -18, dmg: 15, resistReduce: 8,  rarityBias: 10 },
  "전설의 낚싯대": { maxDur: 1250, biteSpeed: -25, dmg: 20, resistReduce: 12, rarityBias: 18 }
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
    return await updater(u, db);
  });
}

function ensureUser(u) {
  u.coins ||= 0;
  u.tier ||= "브론즈";
  u.equip ||= { rod:null, float:null, bait:null };
  u.inv ||= { rods:{}, floats:{}, baits:{}, fishes:[], keys:0, chests:0 };
  u.stats ||= { caught:0, points:0, best:{}, max:{ name:null, length:0 } };
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

const RARITY_PRICE_MULT = { "노말":0.7, "레어":2, "유니크":4, "레전드":9, "에픽":20 };
const RARITY_HP_MULT = { "노말":1, "레어":1.35, "유니크":1.8, "레전드":2.4, "에픽":3.2 };

const LENGTH_TABLE = {
  "멸치":[5,15],
  "피라냐":[15,40],
  "금붕어":[5,25],
  "전갱이":[20,50],
  "고등어":[25,60],
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
  "해룡 까리오스": [800,3500]
};
const JUNK_SET = new Set(["빈 페트병","해초","작은 새우"]);

function drawLength(name){
  const r = LENGTH_TABLE[name];
  if (!r) return 0;
  return Math.max(r[0], Math.min(r[1], Math.round(randInt(r[0]*10, r[1]*10)/10)));
}
function computeSellPrice(name, length, rarity) {
  const base = RARITY_PRICE_MULT[rarity] || 1;
  const speciesBias = (name.charCodeAt(0)%13)+1;
  const L = Math.max(1, length||1);
  return Math.max(1, Math.round(SELL_PRICE_MULT * (base * Math.pow(L, 1.25) + speciesBias*5)));
}
function computePoints(rarity, price, length) {
  const base = { "노말":1, "레어":4, "유니크":9, "레전드":20, "에픽":45 }[rarity] || 1;
  return Math.round(base * Math.sqrt(Math.max(1, price)) + Math.sqrt(Math.max(1,length)));
}
function updateTier(u) {
  const p = u.stats.points || 0;
  let best = "브론즈";
  for (const t of TIER_ORDER) { if (p >= TIER_CUTOFF[t]) best = t; else break; }
  u.tier = best;
}
function fishToInv(u, fish) {
  u.inv.fishes.push({ n: fish.name, r: fish.rarity, l: fish.length, price: fish.sell });
  u.stats.caught += 1;
  const gained = computePoints(fish.rarity, fish.sell, fish.length);
  u.stats.points += gained;
  const prevBest = u.stats.best[fish.name] || { length:0, price:0 };
  if ((fish.length||0) > (prevBest.length||0)) u.stats.best[fish.name] = { length: fish.length, price: Math.max(prevBest.price||0, fish.sell) };
  if ((fish.sell||0) > (prevBest.price||0)) u.stats.best[fish.name] = { length: Math.max(prevBest.length||0, fish.length), price: fish.sell };
  if (!u.stats.max || (fish.length||0) > (u.stats.max.length||0)) u.stats.max = { name: fish.name, length: fish.length };
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
function sceneEmbed(user, title, desc, imageURL, extraFields = []) {
  const eb = new EmbedBuilder().setTitle(title).setDescription(desc||"").setColor(0x3aa0ff);
  if (imageURL) eb.setImage(imageURL);
  if (extraFields.length) eb.addFields(extraFields);
  eb.setFooter({ text: `낚시 코인: ${user.coins.toLocaleString()} | 티어: ${user.tier}` });
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
function buttonsAfterCatch() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fish:recast").setLabel("🎯 다시 찌 던지기").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fish:share").setLabel("📣 잡은 물고기 공유하기").setStyle(ButtonStyle.Secondary)
  );
}
function computeRarityWeight(u){
  const base = { "노말": 110, "레어": 30, "유니크": 5, "레전드": 1.5, "에픽": 0.5 };
  const r = ROD_SPECS[u.equip.rod] || {};
  const f = FLOAT_SPECS[u.equip.float] || {};
  const b = BAIT_SPECS[u.equip.bait] || {};
  const bias = (r.rarityBias||0)+(f.rarityBias||0)+(b.rarityBias||0);
  const m = { ...base };
  m["레어"] += bias*0.8;
  m["유니크"] += bias*0.35;
  m["레전드"] += bias*0.12;
  m["에픽"] += bias*0.04;
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
  const dmgBase = (ROD_SPECS[u.equip.rod]?.dmg || 6);
  const resist = Math.max(5, Math.round((10 + (RARITY.indexOf(rar)*5)) - (FLOAT_SPECS[u.equip.float]?.resistReduce||0)));
  return { type:"fight", kind:"fish", name, rarity:rar, hp, maxHP, dmgBase, resist, length };
}
function baseItemFight(u, rar) {
  const dmgBase = (ROD_SPECS[u.equip.rod]?.dmg || 6);
  const baseHP = Math.round(60 * (RARITY_HP_MULT[rar]||1));
  const hp = Math.max(25, Math.min(600, baseHP + randInt(-10,10)));
  const maxHP = hp;
  const resist = Math.max(5, Math.round(12 - (FLOAT_SPECS[u.equip.float]?.resistReduce||0)));
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
    .setColor(0x8888ff);
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
  .addSubcommand(s=>s.setName("도감").setDescription("잡은 물고기 도감 보기"))
  .addSubcommand(s=>s.setName("기록").setDescription("개인 낚시 기록 확인").addUserOption(o=>o.setName("유저").setDescription("조회 대상")))
  .addSubcommand(s=>s.setName("기록순위").setDescription("티어/포인트/최대길이 순위 TOP20"))
  .addSubcommand(s=>s.setName("도움말").setDescription("낚시 시스템 도움말"));

function hintLine(tension, hpRatio) {
  const H_NEUT = [
    "가볍게 흔들립니다. 한 템포 지켜보세요.",
    "미세한 반응이 느껴집니다.",
    "조심스레 대응하시는 게 좋아 보입니다.",
    "상대가 탐색 중인 듯합니다.",
    "긴장하지 마시고 흐름을 보세요."
  ];
  const H_HIGH = [
    "텐션이 높아 보입니다. 약간만 풀어주실까요?",
    "줄이 팽팽합니다. 조금만 여유를 주세요.",
    "강하게 버팁니다. 무리하지 않는 게 좋겠습니다.",
    "위험해 보입니다. 살짝 풀어 안정시키세요.",
    "매우 거칩니다. 주의가 필요합니다."
  ];
  const H_LOW = [
    "힘이 빠지는 느낌입니다. 조금 감아보시겠어요?",
    "줄이 느슨합니다. 천천히 압박해 보세요.",
    "틈이 보입니다. 부드럽게 감아 올리세요.",
    "조금 더 힘을 실어도 괜찮겠습니다.",
    "약간은 공격적으로 가도 좋겠습니다."
  ];
  const H_STRONG = [
    "상대가 거세게 저항합니다!",
    "이 녀석, 힘이 센데요!",
    "강하게 치고 나옵니다. 신중히 대응하세요.",
    "버티는 힘이 대단합니다.",
    "예측하기 어렵습니다. 리듬을 무너뜨리지 마세요."
  ];
  const H_WEAK = [
    "약해진 모양입니다.",
    "기세가 꺾였어요. 침착하게 이어가세요.",
    "움찔거림이 줄었습니다.",
    "조금만 더 밀어붙이면 되겠습니다.",
    "좋습니다, 우세해 보입니다."
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
function dexRarityRow(cur){
  return new ActionRowBuilder().addComponents(
    ...RARITY.map(r=> new ButtonBuilder().setCustomId(`dex:rar|${r}`).setLabel(r).setStyle(r===cur?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(r===cur))
  );
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
    if (caught.has(n)) {
      const rec = u.stats.best?.[n]||{};
      const L = rec.length ? `${Math.round(rec.length)}cm` : "";
      const P = rec.price ? `${(rec.price||0).toLocaleString()}코인` : "";
      const meta = [L,P].filter(Boolean).join(" | ");
      return `${start+i+1}. ${n}${meta?` — ${meta}`:""}`;
    } else {
      return `${start+i+1}. ???`;
    }
  });
  const eb = new EmbedBuilder()
    .setTitle(`📘 낚시 도감 — ${st.rarity} [${got}/${total}]`)
    .setDescription(lines.length?lines.join("\n"):"_표시할 항목이 없습니다._")
    .setColor(0x66ccff);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("dex:select")
    .setPlaceholder("상세로 볼 항목 선택")
    .addOptions(slice.map(n=>({
      label: caught.has(n) ? n : "???",
      value: n
    })));
  const listRow = new ActionRowBuilder().addComponents(menu);
  return { embeds:[eb], components:[dexRarityRow(st.rarity), listRow, dexNavRow(start>0, start+DEX_PAGE_SIZE<total)] };
}
function renderDexDetail(u, st, name){
  const caught = caughtSetOf(u);
  const all = FISH_BY_RARITY[st.rarity]||[];
  const total = all.length;
  const got = all.filter(n=>caught.has(n)).length;
  if (!caught.has(name)) {
    const eb = new EmbedBuilder().setTitle(`❔ ??? — ${st.rarity} [${got}/${total}]`).setDescription("아직 발견하지 못했습니다. 더 낚시해 보세요.").setColor(0x999999);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("dex:back").setLabel("목록으로").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("dex:close").setLabel("닫기").setStyle(ButtonStyle.Secondary));
    return { embeds:[eb], components:[dexRarityRow(st.rarity), row] };
  } else {
    const rec = u.stats.best?.[name]||{};
    const L = rec.length ? `${Math.round(rec.length)}cm` : "-";
    const P = rec.price ? `${(rec.price||0).toLocaleString()}코인` : "-";
    const eb = new EmbedBuilder().setTitle(`📖 ${name} — ${st.rarity} [${got}/${total}]`).setDescription([`최대 길이: ${L}`,`최고가: ${P}`].join("\n")).setColor(0x44ddaa).setImage(getIconURL(name)||null);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("dex:back").setLabel("목록으로").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("dex:close").setLabel("닫기").setStyle(ButtonStyle.Secondary));
    return { embeds:[eb], components:[dexRarityRow(st.rarity), row] };
  }
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === "낚시터") {
    return await withDB(async db=>{
      const u = (db.users[userId] ||= {}); ensureUser(u); u._uid = userId;
      const timeBand = currentTimeBand();
      const missKey = missingGearKey(u);
      const scene0 = missKey ? (getIconURL(missKey)||null) : getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, timeBand, "기본");
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
      await interaction.reply({ embeds:[eb], components:[buttonsStart(), viewRow], ephemeral:true });
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
      await interaction.reply({ embeds:[eb], components:[row], ephemeral:true });
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
      const eb = new EmbedBuilder().setTitle("💰 물고기 판매")
        .setDescription([
          `보유 물고기: ${fishes.length}마리`,
          "원하시는 방식으로 판매해 주세요."
        ].join("\n"))
        .setColor(0xffaa44);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("fish:sell_all").setLabel("모두 판매").setStyle(ButtonStyle.Success).setDisabled(fishes.length===0),
        new ButtonBuilder().setCustomId("fish:sell_select").setLabel("선택 판매").setStyle(ButtonStyle.Primary).setDisabled(fishes.length===0),
        new ButtonBuilder().setCustomId("fish:sell_qty").setLabel("수량 판매").setStyle(ButtonStyle.Secondary).setDisabled(fishes.length===0),
        new ButtonBuilder().setCustomId("fish:sell_cancel").setLabel("닫기").setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds:[eb], components:[row], ephemeral:true });
    });
  }

  if (sub === "도감") {
    return await withDB(async db=>{
      const u = (db.users[userId] ||= {}); ensureUser(u); u._uid = userId;
      const st = { rarity:"노말", page:0, mode:"list" };
      dexSessions.set(userId, st);
      const payload = renderDexList(u, st);
      await interaction.reply({ ...payload, ephemeral:true });
    });
  }

  if (sub === "기록") {
    const target = interaction.options.getUser("유저") || interaction.user;
    return await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      const top3 = Object.entries(u.stats.best || {}).sort((a,b)=> (b[1].length||0) - (a[1].length||0)).slice(0,3);
      const tierIcon = getIconURL(u.tier);
      const eb = new EmbedBuilder().setTitle(`📜 낚시 기록 — ${target.username}`)
        .setDescription([
          `티어: **${u.tier}**`,
          `포인트: **${(u.stats.points||0).toLocaleString()}**`,
          `누적 어획: **${(u.stats.caught||0).toLocaleString()}**`,
          `최대 길이: **${Math.round(u.stats.max?.length||0)}cm** ${u.stats.max?.name?`— ${u.stats.max.name}`:""}`,
          "",
          top3.length ? "**종류별 최대 상위 3**\n" + top3.map(([n,i])=>`• ${n} — ${Math.round(i.length)}cm / 최고가 ${i.price?.toLocaleString?.()||0}코인`).join("\n") : "_기록이 없습니다._"
        ].join("\n"))
        .setColor(0x66ddee);
      if (tierIcon) eb.setThumbnail(tierIcon);
      await interaction.reply({ embeds:[eb], ephemeral:true });
    });
  }

  if (sub === "기록순위") {
    return await withDB(async db=>{
      const base = Object.entries(db.users||{}).map(([id,u])=>{
        ensureUser(u);
        let bestN = null; let bestL = 0;
        for (const [n,b] of Object.entries(u.stats.best||{})) { const L = b.length||0; if (L > bestL) { bestL = L; bestN = n; } }
        if ((u.stats.max?.length||0) >= bestL) { bestL = u.stats.max?.length||0; bestN = u.stats.max?.name||bestN; }
        return { id, tier:u.tier, points:u.stats.points||0, caught:u.stats.caught||0, bestLen:bestL, bestName:bestN };
      });
      const topPoints = [...base].sort((a,b)=> b.points - a.points).slice(0,20);
      const topLen = [...base].sort((a,b)=> b.bestLen - a.bestLen).slice(0,20);
      const topCaught = [...base].sort((a,b)=> b.caught - a.caught).slice(0,20);

      const namesCache = {};
      async function nameOf(id){
        if (namesCache[id]) return namesCache[id];
        const m = await interaction.guild.members.fetch(id).catch(()=>null);
        const nm = m?.displayName || `유저(${id})`;
        namesCache[id] = nm;
        return nm;
      }
      const linesPoints = await Promise.all(topPoints.map(async (o,i)=>`${i+1}. ${await nameOf(o.id)} — ${o.tier} (${o.points.toLocaleString()}점)`));
      const linesLen = await Promise.all(topLen.map(async (o,i)=>`${i+1}. ${await nameOf(o.id)} — ${Math.round(o.bestLen)}cm${o.bestName?` (${o.bestName})`:""}`));
      const linesCaught = await Promise.all(topCaught.map(async (o,i)=>`${i+1}. ${await nameOf(o.id)} — ${o.caught.toLocaleString()}마리`));

      const eb = new EmbedBuilder().setTitle("🏆 낚시 순위 TOP 20")
        .addFields(
          { name:"포인트", value: linesPoints.join("\n") || "_데이터가 없습니다._", inline:false },
          { name:"최대 길이", value: linesLen.join("\n") || "_데이터가 없습니다._", inline:false },
          { name:"어획 수", value: linesCaught.join("\n") || "_데이터가 없습니다._", inline:false },
        )
        .setColor(0xff77aa);
      await interaction.reply({ embeds:[eb], ephemeral:true });
    });
  }

  if (sub === "도움말") {
    const eb = new EmbedBuilder().setTitle("❔ 낚시 도움말")
      .setDescription([
        "• `/낚시 낚시터` — 낚시 시작: 찌 던지기 → 대기 → 입질 → 릴 감기/풀기(파이팅)",
        "• `/낚시 구매` — 장비/미끼 구매(일부 정수 결제 가능). 미끼는 20개 묶음, 부족분만 비례결제",
        "• `/낚시 판매` — 모두/선택/수량 판매 지원",
        "• `/낚시 인벤토리` — 종류별 보기+장착/상자",
        "• `/낚시 도감` — 등급별 발견 현황과 상세 보기",
        "• `/낚시 기록 [유저]`, `/낚시 기록순위`",
        "",
        "⚙ 시간대: 낮(07:00~15:59) / 노을(16:00~19:59) / 밤(20:00~06:59) (KST)",
        "⚙ 장비는 사용 시 내구도 1 감소, 미끼는 입질 시작 시 1개 소모됩니다.",
        "⚙ ‘낚시 코인’은 BE(정수)와 별개 화폐입니다.",
        "⚙ 물고기마다 최소/최대 길이가 있으며, 클수록 보상과 포인트가 커집니다."
      ].join("\n"))
      .setColor(0xcccccc);
    return await interaction.reply({ embeds:[eb], ephemeral:true });
  }
}

async function component(interaction) {
  const userId = interaction.user.id;
  return await withDB(async db=>{
    const u = (db.users[userId] ||= {}); ensureUser(u); u._uid = userId;

    if (interaction.isStringSelectMenu()) {
      const [type] = interaction.customId.split("|");

      if (type === "sell-select") {
        const idxs = interaction.values.map(v=>parseInt(v,10)).filter(n=>!isNaN(n));
        sellSessions.set(userId, { ...(sellSessions.get(userId)||{}), selectIdxs: idxs });
        const fishes = u.inv.fishes || [];
        const pick = idxs.map(i=>fishes[i]).filter(Boolean);
        const total = pick.reduce((s,f)=>s+(f.price||0),0);
        const eb = new EmbedBuilder().setTitle("🧾 선택 판매 미리보기")
          .setDescription(pick.length? pick.map(f=>`• [${f.r}] ${f.n} — ${Math.round(f.l)}cm (${(f.price||0).toLocaleString()}코인)`).join("\n") : "_선택되지 않았습니다._")
          .addFields({ name:"합계", value:`${total.toLocaleString()} 코인` })
          .setColor(0xffaa44);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("sell:confirm_selected").setLabel("선택 판매 확정").setStyle(ButtonStyle.Success).setDisabled(pick.length===0),
          new ButtonBuilder().setCustomId("sell:cancel").setLabel("취소").setStyle(ButtonStyle.Secondary),
        );
        return interaction.update({ embeds:[eb], components:[row], ephemeral:true });
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

      if (interaction.customId === "dex:select") {
        const name = interaction.values[0];
        const st = dexSessions.get(userId) || { rarity:"노말", page:0, mode:"list" };
        st.mode = "detail"; st.current = name;
        dexSessions.set(userId, st);
        const payload = renderDexDetail(u, st, name);
        return interaction.update({ ...payload, ephemeral:true });
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "sell:qty_modal") {
        const st = sellSessions.get(userId) || {};
        const species = st.qtySpecies;
        const qty = Math.max(0, parseInt(interaction.fields.getTextInputValue("qty"),10)||0);
        if (!species || qty<=0) return interaction.reply({ content:"입력이 올바르지 않습니다.", ephemeral:true });

        const fishes = u.inv.fishes || [];
        const selIdx = [];
        for (let i=0;i<fishes.length;i++){
          if (fishes[i]?.n === species) selIdx.push(i);
          if (selIdx.length >= qty) break;
        }
        const pick = selIdx.map(i=>fishes[i]).filter(Boolean);
        const total = pick.reduce((s,f)=>s+(f.price||0),0);
        u.inv.fishes = fishes.filter((_,i)=>!selIdx.includes(i));
        u.coins += total;

        return interaction.reply({ content:`${species} ${pick.length}마리를 판매하여 ${total.toLocaleString()} 코인을 획득하셨습니다.`, ephemeral:true });
      }
      return;
    }

    const id = interaction.customId;

    if (id === "fish:share") {
      const rec = lastCatch.get(userId);
      if (!rec) {
        return interaction.reply({ content: "최근에 잡은 물고기가 없어.", ephemeral: true });
      }
      if (Date.now() - rec.ts > 10 * 60 * 1000) {
        lastCatch.delete(userId);
        return interaction.reply({ content: "최근 포획 정보가 만료됐어. 다음에 또 공유해줘!", ephemeral: true });
      }
      const eb = new EmbedBuilder()
        .setTitle(`🐟 ${interaction.user.displayName || interaction.user.username}의 성과!`)
        .setDescription([
          `• 이름: [${rec.rarity}] ${rec.name}`,
          `• 길이: ${Math.round(rec.length)}cm`,
          `• 판매가: ${rec.sell.toLocaleString()} 코인`,
        ].join("\n"))
        .setColor(0x66ccff)
        .setImage(getIconURL(rec.name) || null);
      try {
        await interaction.channel.send({ embeds: [eb] });
        return interaction.reply({ content: "공유 완료! 🎉", ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: "채널에 공유 실패. 권한 확인 부탁!", ephemeral: true });
      }
    }

    if (id === "fish:cancel") {
      clearSession(userId);
      return interaction.update({ content:"낚시를 종료했습니다.", components:[], embeds:[] });
    }
    if (id === "fish:equip") {
      const payload = buildInventoryHome(u);
      return interaction.update({ ...payload, ephemeral:true });
    }
    if (id === "fish:cast" || id === "fish:recast") {
      if (!hasAllGear(u)) {
        const miss = [
          !u.equip.rod ? "낚싯대" : (u.inv.rods[u.equip.rod]??0)<=0 ? "낚싯대(내구도 0)" : null,
          !u.equip.float ? "찌" : (u.inv.floats[u.equip.float]??0)<=0 ? "찌(내구도 0)" : null,
          !u.equip.bait ? "미끼" : (u.inv.baits[u.equip.bait]??0)<=0 ? "미끼(0개)" : null
        ].filter(Boolean).join(", ");
        const missKey = missingGearKey(u);
        const eb = new EmbedBuilder().setTitle("⚠ 장비 부족")
          .setDescription(`부족한 장비: **${miss}**\n/낚시 구매 에서 구매하시거나 인벤토리에서 장착해 주세요.`)
          .setColor(0xff5555);
        if (missKey) eb.setImage(getIconURL(missKey)||null);
        return interaction.update({ embeds:[eb], components:[], ephemeral:true });
      }

      clearSession(userId);
      const s = { state:"waiting", tension: randInt(35,65) };
      sessions.set(userId, s);

      const timeBand = currentTimeBand();
      const scene1 = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, timeBand, "찌들어감");

      const waitSec = Math.max(5, Math.min(FISHING_LIMIT_SECONDS-3,
        (randInt(20,100) + Math.min(0, (ROD_SPECS[u.equip.rod]?.biteSpeed||0)
                                      + (FLOAT_SPECS[u.equip.float]?.biteSpeed||0)
                                      + (BAIT_SPECS[u.equip.bait]?.biteSpeed||0)))));

      s.biteTimer = setTimeout(async ()=>{
        const result = await updateUser(userId, (uu)=>{
          if (!uu.equip?.bait || (uu.inv.baits[uu.equip.bait]||0) <= 0) return { ok:false, reason:"no_bait" };
          uu.inv.baits[uu.equip.bait] -= 1;
          const fight = startFight(uu);
          return { ok:true, fight, equip:{...uu.equip}, timeBand: currentTimeBand() };
        });

        if (!result || !result.ok) {
          clearSession(userId);
          return interaction.editReply({ content:"미끼가 없어 입질이 이어지지 않았습니다.", components:[], embeds:[], ephemeral:true }).catch(()=>{});
        }

        const fobj = result.fight;

        s.state = "fight"; s.target = fobj; s.tension = randInt(35,65);
        s.fightStart = Date.now();
        s.timeBand = result.timeBand;
        s.sceneBiteURL = getSceneURL(result.equip.rod, result.equip.float, result.equip.bait, s.timeBand, "입질");

        const resetIdle = ()=>{
          if (s.fightIdleTimer) clearTimeout(s.fightIdleTimer);
          s.fightIdleTimer = setTimeout(()=>{
            clearSession(userId);
            interaction.editReply({ content:"아무 행동을 하지 않아 대상을 놓쳤습니다.", embeds:[], components:[], ephemeral:true }).catch(()=>{});
          }, FIGHT_IDLE_TIMEOUT*1000);
        };
        resetIdle();
        s.resetIdle = resetIdle;
        s.fightTotalTimer = setTimeout(()=>{
          clearSession(userId);
          interaction.editReply({ content:"너무 오래 끌어 대상이 빠져나갔습니다.", embeds:[], components:[], ephemeral:true }).catch(()=>{});
        }, FIGHT_TOTAL_TIMEOUT*1000);

        const eb = new EmbedBuilder().setTitle(`🐟 입질!`)
          .setDescription([
            "정체를 알 수 없는 무언가가 걸렸습니다.",
            "릴을 감거나 풀며 상황을 살펴보세요."
          ].join("\n"))
          .setColor(0x44ddaa)
          .setImage(s.sceneBiteURL);
        try { await interaction.editReply({ embeds:[eb], components:[buttonsFight()], ephemeral:true }); } catch {}
      }, waitSec*1000);

      s.expireTimer = setTimeout(()=>{ clearSession(userId); }, (FISHING_LIMIT_SECONDS+20)*1000);

      const eb = sceneEmbed(u, "🪔 입질을 기다리는 중...", [
        `최대 ${FISHING_LIMIT_SECONDS}초까지 기회가 있습니다.`,
        "중간에 포기하시면 미끼는 소모되지 않습니다.", "", equipLine(u)
      ].join("\n"), scene1);
      return interaction.update({ embeds:[eb], components:[buttonsWaiting()], ephemeral:true });
    }

    if (id === "fish:abort") {
      clearSession(userId);
      return interaction.update({ content:"낚시를 중단했습니다. (미끼 미소모)", embeds:[], components:[], ephemeral:true });
    }

    const s = sessions.get(userId);
    if (["fish:reel","fish:loosen","fish:giveup"].includes(id) && (!s || s.state!=="fight")) {
      return interaction.reply({ content:"진행 중인 낚시가 없습니다.", ephemeral:true });
    }
    if (id === "fish:giveup") {
      clearSession(userId);
      const scene0 = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, currentTimeBand(), "기본");
      const eb = new EmbedBuilder().setTitle("포기하셨습니다.").setColor(0x999999).setImage(scene0);
      return interaction.update({ embeds:[eb], components:[], ephemeral:true });
    }
    if (id === "fish:reel" || id === "fish:loosen") {
      if (s.resetIdle) s.resetIdle();
      const act = id === "fish:reel" ? "reel" : "loosen";
      const st = applyReel(u, s.target, s, act); s.target = st;

      if (st.escape) {
        clearSession(userId);
        const scene0 = getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, s.timeBand||currentTimeBand(), "기본");
        const eb = new EmbedBuilder().setTitle("놓치셨습니다.").setDescription("텐션 조절에 실패하여 대상이 빠져나갔습니다.").setColor(0xcc6666).setImage(scene0);
        return interaction.update({ embeds:[eb], components:[], ephemeral:true });
      }
      if (st.hp <= 0) {
        useDurability(u, "rod"); useDurability(u, "float");
        if (st.kind === "fish") {
          const sell = computeSellPrice(st.name, st.length, st.rarity);
          fishToInv(u, { name: st.name, rarity: st.rarity, length: st.length, sell });
          updateTier(u);
          clearSession(userId);
          lastCatch.set(userId, { name: st.name, rarity: st.rarity, length: st.length, sell, channelId: interaction.channelId, ts: Date.now() });
          const eb = sceneEmbed(u, `✅ 포획 성공! [${st.rarity}] ${st.name}`, [
            `길이: ${Math.round(st.length)}cm`,
            `판매가: ${sell.toLocaleString()}코인`,
            "", "💡 `/낚시 판매`로 바로 코인화하실 수 있습니다."
          ].join("\n"), getIconURL(st.name));
          return interaction.update({ embeds:[eb], components:[buttonsAfterCatch()], ephemeral:true });
        } else if (st.kind === "junk") {
          const junkCoin = randInt(1, 4);
          u.coins += junkCoin;
          clearSession(userId);
          const eb = sceneEmbed(u, "🪣 잡동사니를 건졌습니다", `쓸모없는 ${st.name}을(를) 건졌습니다. 위로금으로 ${junkCoin} 코인을 받으셨습니다.`, getIconURL(st.name)||null);
          return interaction.update({ embeds:[eb], components:[], ephemeral:true });
        } else {
          if (st.itemType === "coin") {
            u.coins += st.amount||0;
            clearSession(userId);
            const eb = sceneEmbed(u, "🪙 획득 성공!", `${(st.amount||0).toLocaleString()} 코인을 획득하셨습니다.`, getIconURL("낚시 코인"));
            return interaction.update({ embeds:[eb], components:[], ephemeral:true });
          }
          if (st.itemType === "be") {
            await addBE(userId, st.amount||0, "[낚시] 드랍");
            clearSession(userId);
            const eb = sceneEmbed(u, "🔷 파랑 정수 획득!", `${(st.amount||0).toLocaleString()}원을 받으셨습니다.`, getIconURL("파랑 정수"));
            return interaction.update({ embeds:[eb], components:[], ephemeral:true });
          }
          if (st.itemType === "key") {
            u.inv.keys = (u.inv.keys||0) + (st.qty||1);
            clearSession(userId);
            const eb = sceneEmbed(u, "🗝️ 열쇠 획득!", `인벤토리에 추가되었습니다.`, getIconURL("까리한 열쇠"));
            return interaction.update({ embeds:[eb], components:[], ephemeral:true });
          }
          if (st.itemType === "chest") {
            u.inv.chests = (u.inv.chests||0) + (st.qty||1);
            clearSession(userId);
            const eb = sceneEmbed(u, "📦 보물상자 획득!", `인벤토리에 추가되었습니다.`, getIconURL("까리한 보물상자"));
            return interaction.update({ embeds:[eb], components:[], ephemeral:true });
          }
        }
      }

      const hpRatio = (st.hp||1) / (st.maxHP||1);
      const line = hintLine(s.tension, hpRatio);
      const eb = new EmbedBuilder().setTitle(`🎣 파이팅 중`)
        .setDescription([line, "릴을 감거나 풀며 흐름을 유지해 보세요."].join("\n"))
        .setColor(0x44ddaa)
        .setImage(s.sceneBiteURL || getSceneURL(u.equip.rod, u.equip.float, u.equip.bait, s.timeBand||currentTimeBand(), "입질"));
      return interaction.update({ embeds:[eb], components:[buttonsFight()], ephemeral:true });
    }

    if (id === "fish:sell_all") {
      const fishes = u.inv.fishes || [];
      const total = fishes.reduce((s,f)=>s+(f.price||0),0);
      u.coins += total; u.inv.fishes = [];
      return interaction.update({ content:`총 ${total.toLocaleString()} 코인을 획득하셨습니다.`, embeds:[], components:[], ephemeral:true });
    }
    if (id === "fish:sell_cancel" || id === "sell:cancel") {
      return interaction.update({ content:"판매 창을 닫았습니다.", embeds:[], components:[], ephemeral:true });
    }
    if (id === "fish:sell_select") {
      const fishes = u.inv.fishes||[];
      const opts = fishes.slice(0,25).map((f,i)=>({
        label: `[${f.r}] ${f.n} ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`,
        value: String(i)
      }));
      if (opts.length===0) return interaction.reply({ content:"판매할 물고기가 없습니다.", ephemeral:true });
      const menu = new StringSelectMenuBuilder().setCustomId("sell-select|list").setPlaceholder("판매할 물고기 선택(복수 선택 가능)").setMinValues(1).setMaxValues(opts.length).addOptions(opts);
      return interaction.update({ embeds:[ new EmbedBuilder().setTitle("🐟 판매할 물고기 선택").setColor(0xffaa44) ], components:[ new ActionRowBuilder().addComponents(menu) ], ephemeral:true });
    }
    if (id === "sell:confirm_selected") {
      const st = sellSessions.get(userId) || {};
      const fishes = u.inv.fishes||[];
      const idxs = (st.selectIdxs||[]).filter(i=>Number.isInteger(i) && fishes[i]);
      const pick = idxs.map(i=>fishes[i]);
      const total = pick.reduce((s,f)=>s+(f.price||0),0);
      u.inv.fishes = fishes.filter((_,i)=>!idxs.includes(i));
      u.coins += total;
      sellSessions.delete(userId);
      return interaction.update({ content:`선택하신 ${pick.length}마리를 판매하여 ${total.toLocaleString()} 코인을 획득하셨습니다.`, embeds:[], components:[], ephemeral:true });
    }
    if (id === "fish:sell_qty") {
      const fishes = u.inv.fishes||[];
      const kinds = [...new Set(fishes.map(f=>f.n))];
      if (kinds.length===0) return interaction.reply({ content:"판매할 물고기가 없습니다.", ephemeral:true });
      const opts = kinds.slice(0,25).map(n=>({ label:n, value:n }));
      const menu = new StringSelectMenuBuilder().setCustomId("sell-qty-choose|species").setPlaceholder("종류 선택").addOptions(opts);
      return interaction.update({ embeds:[ new EmbedBuilder().setTitle("🐟 수량 판매 — 종류 선택").setColor(0xffaa44) ], components:[ new ActionRowBuilder().addComponents(menu) ], ephemeral:true });
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
          const eb = new EmbedBuilder().setTitle(`🐟 인벤 — ${f.n}`)
            .setDescription(`[${f.r}] ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`)
            .setColor(0x88ddff)
            .setImage(getIconURL(f.n)||null);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
            new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=u.inv.fishes.length-1),
            new ButtonBuilder().setCustomId("inv:share").setLabel("📣 공유하기").setStyle(ButtonStyle.Secondary),
          );
          return { eb, row };
        } else {
          const name = (k==="rod"? Object.keys(u.inv.rods)
                       : k==="float"? Object.keys(u.inv.floats)
                       : Object.keys(u.inv.baits).filter(x=>(u.inv.baits[x]||0)>0))[i];
          const dur = k==="rod"? (u.inv.rods[name]||0) : k==="float"? (u.inv.floats[name]||0) : (u.inv.baits[name]||0);
          const spec = k==="rod"? ROD_SPECS[name] : k==="float"? FLOAT_SPECS[name] : BAIT_SPECS[name];
          const lines = [];
          if (k!=="bait") lines.push(`내구도: ${dur}/${spec.maxDur}`);
          else lines.push(`보유: ${dur}/${spec.pack}`);
          if (k==="rod") lines.push(`입질시간 ${spec.biteSpeed}s, 제압력 ${spec.dmg}, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
          if (k==="float") lines.push(`입질시간 ${spec.biteSpeed}s, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
          if (k==="bait") lines.push(`입질시간 ${spec.biteSpeed}s, 희귀도 +${spec.rarityBias}`);

          const eb = new EmbedBuilder().setTitle(`🎒 ${k==="rod"?"낚싯대":k==="float"?"찌":"미끼"} — ${name}`)
            .setDescription(lines.join("\n")).setColor(0x88ddff).setThumbnail(getIconURL(name)||null);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
            new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=((k==="rod"?Object.keys(u.inv.rods):k==="float"?Object.keys(u.inv.floats):Object.keys(u.inv.baits).filter(x=>(u.inv.baits[x]||0)>0)).length-1)),
            new ButtonBuilder().setCustomId(`inv:equip|${k}|${name}`).setLabel("장착").setStyle(ButtonStyle.Primary).setDisabled(k==="fish")
          );
          return { eb, row };
        }
      }

      const { eb, row } = renderInv(kind, 0);
      return interaction.update({ embeds:[eb], components:[row], ephemeral:true });
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
        .setDescription(`• 이름: [${f.r}] ${f.n}\n• 길이: ${Math.round(f.l)}cm\n• 판매가: ${f.price.toLocaleString()} 코인`)
        .setColor(0x66ccff)
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
          const eb = new EmbedBuilder().setTitle(`🐟 인벤 — ${f.n}`)
            .setDescription(`[${f.r}] ${Math.round(f.l)}cm / ${f.price.toLocaleString()}코인`)
            .setColor(0x88ddff).setImage(getIconURL(f.n)||null);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
            new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=u.inv.fishes.length-1),
            new ButtonBuilder().setCustomId("inv:share").setLabel("📣 공유하기").setStyle(ButtonStyle.Secondary),
          );
          return { eb, row };
        } else {
          const names = k==="rod"? Object.keys(u.inv.rods)
                       : k==="float"? Object.keys(u.inv.floats)
                       : Object.keys(u.inv.baits).filter(x=>(u.inv.baits[x]||0)>0);
          const name = names[i]; const dur = k==="rod"? u.inv.rods[name] : k==="float"? u.inv.floats[name] : u.inv.baits[name];
          const spec = k==="rod"? ROD_SPECS[name] : k==="float"? FLOAT_SPECS[name] : BAIT_SPECS[name];
          const lines = [];
          if (k!=="bait") lines.push(`내구도: ${dur}/${spec.maxDur}`); else lines.push(`보유: ${dur}/${spec.pack}`);
          if (k==="rod") lines.push(`입질시간 ${spec.biteSpeed}s, 제압력 ${spec.dmg}, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
          if (k==="float") lines.push(`입질시간 ${spec.biteSpeed}s, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
          if (k==="bait") lines.push(`입질시간 ${spec.biteSpeed}s, 희귀도 +${spec.rarityBias}`);
          const eb = new EmbedBuilder().setTitle(`🎒 ${k==="rod"?"낚싯대":k==="float"?"찌":"미끼"} — ${name}`)
            .setDescription(lines.join("\n")).setColor(0x88ddff).setThumbnail(getIconURL(name)||null);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("inv:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
            new ButtonBuilder().setCustomId("inv:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=names.length-1),
            new ButtonBuilder().setCustomId(`inv:equip|${k}|${name}`).setLabel("장착").setStyle(ButtonStyle.Primary).setDisabled(k==="fish")
          );
          return { eb, row };
        }
      }
      const { eb, row } = rerender(kind, st.idx);
      return interaction.update({ embeds:[eb], components:[row], ephemeral:true });
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
      const pool = CHEST_REWARDS.loot;
      const w = {}; for (const it of pool) w[it.name] = it.chance;
      const pick = pickWeighted(w);
      const item = pool.find(x=>x.name===pick);
      if (item.kind === "bait")  { addBait(u, item.name, item.qty); return interaction.reply({ content:`상자를 개봉하여 ${item.name} ${item.qty}개를 받으셨습니다.`, ephemeral:true }); }
      if (item.kind === "be")    { const amt = randInt(item.min, item.max); addBE(userId, amt, "[낚시] 상자 보상"); return interaction.reply({ content:`상자를 개봉하여 파랑 정수 ${amt.toLocaleString()}원을 받으셨습니다.`, ephemeral:true }); }
      if (item.kind === "float") { addFloat(u, item.name); return interaction.reply({ content:`상자를 개봉하여 ${item.name}를 획득하셨습니다.`, ephemeral:true }); }
      if (item.kind === "rod")   { addRod(u, item.name);   return interaction.reply({ content:`상자를 개봉하여 ${item.name}를 획득하셨습니다.`, ephemeral:true }); }
      if (item.kind === "coin") { const amt = randInt(item.min, item.max); u.coins += amt; return interaction.reply({ content:`상자에서 ${amt} 코인을 받으셨습니다.`, ephemeral:true }); }
      return interaction.reply({ content:"상자 보상 처리 중 오류가 발생했습니다.", ephemeral:true });
    }
    if (id === "info:key") {
      return interaction.reply({ content:`보유 열쇠: ${u.inv.keys||0}개`, ephemeral:true });
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
        if (k!=="bait") lines.push(`내구도: ${spec.maxDur}`);
        if (k==="rod")   lines.push(`입질시간 ${spec.biteSpeed}s, 제압력 ${spec.dmg}, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
        if (k==="float") lines.push(`입질시간 ${spec.biteSpeed}s, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
        if (k==="bait")  lines.push(`묶음 ${spec.pack}개, 입질시간 ${spec.biteSpeed}s, 희귀도 +${spec.rarityBias}`);
        const eb = new EmbedBuilder().setTitle(`🛒 ${k==="rod"?"낚싯대":k==="float"?"찌":"미끼"} — ${name}`)
          .setDescription(lines.join("\n"))
          .addFields(
            { name:"코인", value: price.coin!=null ? price.coin.toLocaleString() : "-", inline:true },
            { name:"정수", value: price.be!=null ? price.be.toLocaleString()   : "-", inline:true },
          )
          .setColor(0x55cc77);
        if (icon) eb.setImage(icon);
        eb.setFooter({ text:`보유 코인: ${u.coins.toLocaleString()} | 정수: ${getBE(userId).toLocaleString()}` });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("shop:prev").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i<=0),
          new ButtonBuilder().setCustomId("shop:next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i>=order.length-1),
          new ButtonBuilder().setCustomId(`shop:buy|coin|${name}`).setLabel("코인 구매").setStyle(ButtonStyle.Success).setDisabled(price.coin==null),
          new ButtonBuilder().setCustomId(`shop:buy|be|${name}`).setLabel("정수 구매").setStyle(ButtonStyle.Primary).setDisabled(price.be==null),
          new ButtonBuilder().setCustomId("shop:close").setLabel("닫기").setStyle(ButtonStyle.Secondary),
        );
        return { eb, row };
      }

      const { eb, row } = renderShop(kind, 0);
      return interaction.update({ embeds:[eb], components:[row], ephemeral:true });
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
      if (st.kind!=="bait") descLines.push(`내구도: ${spec.maxDur}`);
      if (st.kind==="rod")   descLines.push(`입질시간 ${spec.biteSpeed}s, 제압력 ${spec.dmg}, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
      if (st.kind==="float") descLines.push(`입질시간 ${spec.biteSpeed}s, 저항 완화 ${spec.resistReduce}, 희귀도 +${spec.rarityBias}`);
      if (st.kind==="bait")  descLines.push(`묶음 ${spec.pack}개, 입질시간 ${spec.biteSpeed}s, 희귀도 +${spec.rarityBias}`);
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
      return interaction.update({ embeds:[eb], components:[row], ephemeral:true });
    }
    if (id.startsWith("shop:buy|")) {
      const [, pay, name] = id.split("|");
      const st = shopSessions.get(userId); if (!st) return interaction.reply({ content:"상점 보기 세션이 없습니다.", ephemeral:true });
      const kind = st.kind; const price = PRICES[kind==="rod"?"rods":kind==="float"?"floats":"baits"][name];
      if (!price) return interaction.reply({ content:"가격 정보를 불러오지 못했습니다.", ephemeral:true });

      if (kind === "bait") {
        const pack = BAIT_SPECS[name].pack;
        const cur = u.inv.baits[name] || 0;
        const need = Math.max(0, pack - cur);
        if (need === 0) return interaction.reply({ content:`이미 ${name}가 가득(20개)입니다.`, ephemeral:true });
        if (pay === "coin") {
          const cost = Math.ceil(price.coin * (need/pack));
          if ((u.coins||0) < cost) return interaction.reply({ content:`코인이 부족합니다. (필요: ${cost})`, ephemeral:true });
          u.coins -= cost; addBait(u, name, need);
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
          u.coins -= cost;
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
      return interaction.update({ content:"상점을 닫았습니다.", embeds:[], components:[], ephemeral:true });
    }

    if (id.startsWith("dex:")) {
      const st = dexSessions.get(userId) || { rarity:"노말", page:0, mode:"list" };
      if (id.startsWith("dex:rar|")) {
        const rar = id.split("|")[1];
        st.rarity = rar; st.page = 0; st.mode = "list"; delete st.current;
        dexSessions.set(userId, st);
        const payload = renderDexList(u, st);
        return interaction.update({ ...payload, ephemeral:true });
      }
      if (id === "dex:prev" || id === "dex:next") {
        const all = FISH_BY_RARITY[st.rarity]||[];
        const maxPage = Math.max(0, Math.ceil(all.length/DEX_PAGE_SIZE)-1);
        st.page += (id==="dex:next"?1:-1);
        st.page = Math.max(0, Math.min(maxPage, st.page));
        st.mode = "list"; delete st.current;
        dexSessions.set(userId, st);
        const payload = renderDexList(u, st);
        return interaction.update({ ...payload, ephemeral:true });
      }
      if (id === "dex:back") {
        st.mode = "list"; delete st.current;
        dexSessions.set(userId, st);
        const payload = renderDexList(u, st);
        return interaction.update({ ...payload, ephemeral:true });
      }
      if (id === "dex:close") {
        dexSessions.delete(userId);
        return interaction.update({ content:"도감을 닫았습니다.", embeds:[], components:[], ephemeral:true });
      }
    }

  });
}

const COIN_DROP_RANGE = [1, 5];
const BE_DROP_RANGE   = [500, 10000];
const DROP_TABLE = {
  "노말":   ["멸치","피라냐","금붕어","작은 새우","빈 페트병","해초","낚시 코인","작은입배스","홍어","가오리","우럭","민어","병어","방어","전어","은어","송어","넙치","청어","꽁치",
            "쏘가리","농어"],
  "레어":   ["전갱이","고등어","가재","연어","다랑어","가자미","오징어","잉어","삼치","복어","황어","도미","참돔","붕어","비단 잉어","빙어","갈치","파랑 정수","큰입배스","참다랑어","황다랑어"],
  "유니크": ["참치","장어","개복치","문어","거북이","까리한 열쇠","까리한 보물상자","메기","블롭피쉬","그림자 장어","별빛 잉어","심연의 복어"],
  "레전드": ["곰치","고래상어","빨판상어","청새치","아귀","에테르 피쉬"],
  "에픽":   ["철갑상어","대왕고래","루미나 샤크","해룡 까리오스"]
};

const NON_FISH = new Set(["낚시 코인","파랑 정수","까리한 열쇠","까리한 보물상자","빈 페트병","해초","작은 새우"]);
const FISH_BY_RARITY = Object.fromEntries(RARITY.map(r=>[r, (DROP_TABLE[r]||[]).filter(n=>!NON_FISH.has(n))]));
const DEX_PAGE_SIZE = 10;

const CHEST_REWARDS = {
  loot: [
    { kind:"bait",  name:"지렁이 미끼", qty:20, chance:28 },
    { kind:"bait",  name:"새우 미끼",   qty:20, chance:18 },
    { kind:"float", name:"은 찌",       chance:6 },
    { kind:"rod",   name:"강철 낚싯대", chance:2 },
    { kind:"be",    name:"파랑 정수",   min:10000, max:100000, chance:4 },
    { kind:"coin", name:"낚시 코인", min:1000, max:10000, chance:6 },
  ]
};

module.exports = { data, execute, component };
