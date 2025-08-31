// commands/fishing-manager.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const { RODS, FLOATS, BAITS, getIconURL } = require("../embeds/fishing-images.js");
const { addBE, getBE } = require("./be-util.js");

const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const FISH_DB = path.join(dataDir, "fishing.json");

const TIER_ORDER = ["브론즈","실버","골드","플래티넘","다이아","마스터","그랜드마스터","챌린저"];
const TIER_CUTOFF = {
  "브론즈": 0, "실버": 300, "골드": 1200, "플래티넘": 3500,
  "다이아": 9000, "마스터": 20000, "그랜드마스터": 45000, "챌린저": 85000
};

const ROD_SPECS = {
  "나무 낚싯대":   { maxDur: 50 },
  "강철 낚싯대":   { maxDur: 120 },
  "금 낚싯대":     { maxDur: 250 },
  "다이아 낚싯대": { maxDur: 550 },
  "전설의 낚싯대": { maxDur: 990 }
};
const FLOAT_SPECS = {
  "동 찌":    { maxDur: 30 },
  "은 찌":    { maxDur: 60 },
  "금 찌":    { maxDur: 90 },
  "다이아 찌": { maxDur: 200 }
};
const BAIT_SPECS = {
  "지렁이 미끼": { pack: 20 },
  "새우 미끼": { pack: 20 },
  "빛나는 젤리 미끼": { pack: 20 }
};

// ---------- DB I/O ----------
function readDB() {
  if (!fs.existsSync(FISH_DB)) return { users:{}, quests:{ daily:{key:null,list:[]}, weekly:{key:null,list:[]} }, config:{} };
  try { return JSON.parse(fs.readFileSync(FISH_DB, "utf8")); } catch { return { users:{}, quests:{ daily:{key:null,list:[]}, weekly:{key:null,list:[]} }, config:{} }; }
}
function writeDB(d) { fs.writeFileSync(FISH_DB, JSON.stringify(d, null, 2)); }
function ensureDB(db){
  db.users ??= {};
  db.quests ??= {};
  db.quests.daily ??= { key:null, list:[] };
  db.quests.weekly ??= { key:null, list:[] };
  db.config ??= {};
  db.config.quest ??= {};
  db.config.quest.countDaily ??= 4;
  db.config.quest.countWeekly ??= 3;
  db.config.quest.rewardMul ??= { dailyCoins:100, weeklyCoins:100, dailyBE:100, weeklyBE:100 };
  return db;
}
async function withDB(fn) {
  if (!fs.existsSync(FISH_DB)) fs.writeFileSync(FISH_DB, JSON.stringify({ users:{}, quests:{ daily:{key:null,list:[]}, weekly:{key:null,list:[]} }, config:{} }, null, 2));
  const rel = await lockfile.lock(FISH_DB, { retries: { retries: 10, factor: 1.2, minTimeout: 50, maxTimeout: 250 } });
  try {
    const d = ensureDB(readDB());
    const r = await fn(d);
    writeDB(d);
    return r;
  } finally {
    await rel();
  }
}

// ---------- User / Config ----------
function ensureUser(u) {
  u.coins ??= 0;
  u.tier ??= "브론즈";
  u.equip ??= { rod:null, float:null, bait:null };
  u.inv   ??= {};
  u.inv.rods   ??= {};
  u.inv.floats ??= {};
  u.inv.baits  ??= {};
  u.inv.fishes ??= [];
  u.inv.keys   ??= 0;
  u.inv.chests ??= 0;
  u.stats ??= {};
  u.stats.caught ??= 0;
  u.stats.points ??= 0;
  u.stats.best   ??= {};
  u.stats.max    ??= { name:null, length:0 };
  u.stats.speciesCount ??= {};
  u.rewards ??= {};
  u.rewards.tier   ??= {};
  u.rewards.caught ??= {};
  u.rewards.size   ??= {};
  u.rewards.species??= {};
  u.quests ??= {};
  u.quests.progress ??= {};
  u.quests.claimed  ??= {};
  // temp는 fishing.js와 호환
  u.quests.temp ??= { recentRarities:[], junkStreak:0, lastRarity:null, sameRarityStreak:0 };
  // 예전 구조 호환(안 써도 무방)
  u.quests.daily ??= [];
  u.quests.weekly ??= [];
  u.settings ??= {};
  u.settings.autoBuy ??= false;
}
function ensureConfig(db) {
  db.config ??= {};
  db.config.quest ??= {};
  db.config.quest.countDaily ??= 4;
  db.config.quest.countWeekly ??= 3;
  db.config.quest.rewardMul ??= { dailyCoins:100, weeklyCoins:100, dailyBE:100, weeklyBE:100 };
}

function addRod(u, name)   { u.inv.rods[name]   = ROD_SPECS[name]?.maxDur || 0; }
function addFloat(u, name) { u.inv.floats[name] = FLOAT_SPECS[name]?.maxDur || 0; }
function addBait(u, name, qty=0) { u.inv.baits[name] = (u.inv.baits[name]||0) + qty; }

function updateTier(u) {
  const p = u.stats.points || 0;
  let best = "브론즈";
  for (const t of TIER_ORDER) { if (p >= TIER_CUTOFF[t]) best = t; else break; }
  u.tier = best;
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
function invSummary(u) {
  const rodList = Object.keys(u.inv.rods||{});
  const floatList = Object.keys(u.inv.floats||{});
  const baitList = Object.entries(u.inv.baits||{}).filter(([,q])=>q>0).map(([n,q])=>`${n} x${q}`);
  return [
    equipLine(u),
    "",
    `🗝️ 열쇠: ${u.inv.keys||0} | 📦 상자: ${u.inv.chests||0}`,
    `🐟 물고기: ${u.inv.fishes.length}마리`,
    `🎣 보유 낚싯대: ${rodList.length?rodList.join(", "):"없음"}`,
    `🟠 보유 찌: ${floatList.length?floatList.join(", "):"없음"}`,
    `🪱 보유 미끼: ${baitList.length?baitList.join(", "):"없음"}`
  ].join("\n");
}

// ---------- QUEST ADMIN UTILS ----------
// 접두어는 d:/w: 로 일원화. regenerate=true면 서버 공통 목록(db.quests.*)도 초기화.
function clearQuestType(db, u, kind, regenerate=false) {
  ensureUser(u);
  const delByPrefix = (prefix) => {
    for (const k of Object.keys(u.quests.progress)) if (k.startsWith(prefix)) delete u.quests.progress[k];
    for (const k of Object.keys(u.quests.claimed))  if (k.startsWith(prefix)) delete u.quests.claimed[k];
  };
  if (kind === "daily" || kind === "both") {
    delByPrefix("d:");
    if (regenerate) { db.quests.daily.key = null; db.quests.daily.list = []; }
  }
  if (kind === "weekly" || kind === "both") {
    delByPrefix("w:");
    if (regenerate) { db.quests.weekly.key = null; db.quests.weekly.list = []; }
  }
  // temp 리셋
  u.quests.temp = { recentRarities:[], junkStreak:0, lastRarity:null, sameRarityStreak:0 };
}

// 서버 공통 목록을 자르거나(전체=true), 유저 진행/수령만 정리(전체=false)
function trimQuestType(db, u, kind, keep, forAll=false) {
  keep = Math.max(0, keep|0);
  const list = db.quests[kind].list || [];
  const keepObjs = list.slice(0, keep);
  const removedIds = list.slice(keep).map(q=>q.id);

  if (forAll) {
    db.quests[kind].list = keepObjs;
    for (const uid of Object.keys(db.users||{})) {
      const ux = ensureUser(db.users[uid] || (db.users[uid] = {}));
      for (const id of removedIds) {
        if (id in ux.quests.progress) delete ux.quests.progress[id];
        if (id in ux.quests.claimed)  delete ux.quests.claimed[id];
      }
    }
    return { before:list.length, after:db.quests[kind].list.length, removed:removedIds.length };
  } else {
    const uu = ensureUser(u);
    let cleaned = 0;
    for (const id of removedIds) {
      if (id in uu.quests.progress) { delete uu.quests.progress[id]; cleaned++; }
      if (id in uu.quests.claimed)  { delete uu.quests.claimed[id];  cleaned++; }
    }
    return { before:list.length, after:keep, cleaned };
  }
}

// 진행판정(관리자 조회용)
function isQuestCompleteLocal(u, q) {
  const p = u.quests.progress?.[q.id];
  if (q.type === "timeband") {
    const need = q.target || {};
    const cur  = p || {};
    const needN = (k)=>Math.max(0, need[k]||0);
    const curN  = (k)=>Math.max(0, cur[k]||0);
    return curN("낮")>=needN("낮") && curN("노을")>=needN("노을") && curN("밤")>=needN("밤");
  }
  if (q.type === "junk_streak3" || q.type === "same_rarity3" || q.type === "rarity_seq") {
    return (p||0) >= (q.times||q.target||1);
  }
  const target = q.target ?? q.times ?? 1;
  return (typeof p === "number" ? p : 0) >= target;
}
function formatQuestProgress(u, q) {
  const p = u.quests.progress?.[q.id];
  if (q.type === "timeband") {
    const need = q.target || {};
    return `낮:${(p?.["낮"]||0)}/${need["낮"]||0} | 노을:${(p?.["노을"]||0)}/${need["노을"]||0} | 밤:${(p?.["밤"]||0)}/${need["밤"]||0}`;
  }
  const target = q.target ?? q.times ?? 1;
  return `${(typeof p === "number" ? p : 0)}/${target}`;
}

// ---------- Slash Command ----------
const rodChoices = RODS.map(n=>({ name:n, value:n })).slice(0,25);
const floatChoices = FLOATS.map(n=>({ name:n, value:n })).slice(0,25);
const baitChoices = BAITS.map(n=>({ name:n, value:n })).slice(0,25);

const data = new SlashCommandBuilder().setName("낚시관리").setDescription("낚시 시스템 관리")
  .addSubcommand(s=>s.setName("코인지급").setDescription("유저에게 코인 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("수량").setDescription("지급 코인(음수 가능)").setRequired(true)))
  .addSubcommand(s=>s.setName("정수지급").setDescription("유저에게 파랑 정수 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("수량").setDescription("지급 정수(음수 가능)").setRequired(true)))
  .addSubcommand(s=>s.setName("낚싯대지급").setDescription("낚싯대 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("낚싯대 이름").setRequired(true).addChoices(...rodChoices); return o; }))
  .addSubcommand(s=>s.setName("찌지급").setDescription("찌 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("찌 이름").setRequired(true).addChoices(...floatChoices); return o; }))
  .addSubcommand(s=>s.setName("미끼지급").setDescription("미끼 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("미끼 이름").setRequired(true).addChoices(...baitChoices); return o; })
    .addIntegerOption(o=>o.setName("수량").setDescription("지급 개수(미입력 시 기본 묶음)")))
  .addSubcommand(s=>s.setName("내구도수리").setDescription("장비 내구도 수리")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>o.setName("종류").setDescription("rod/float/all").setRequired(true).addChoices(
      {name:"낚싯대", value:"rod"},{name:"찌", value:"float"},{name:"전체", value:"all"}))
    .addStringOption(o=>o.setName("이름").setDescription("장비 이름(전체 수리시 생략)")))
  .addSubcommand(s=>s.setName("포인트설정").setDescription("유저 포인트 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("점수").setDescription("설정 포인트").setRequired(true)))
  .addSubcommand(s=>s.setName("티어갱신").setDescription("유저/전체 티어 재계산")
    .addUserOption(o=>o.setName("유저").setDescription("대상(전체 미선택)"))
    .addBooleanOption(o=>o.setName("전체").setDescription("전체 갱신")))
  .addSubcommand(s=>s.setName("전체판매").setDescription("대상 유저 물고기 전부 판매(잠금 제외)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("인벤조회").setDescription("대상 유저 인벤토리 요약")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("초기화").setDescription("대상 유저 낚시 데이터 초기화")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("키상자설정").setDescription("대상 유저의 열쇠/상자 수 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("열쇠").setDescription("키 개수").setRequired(true))
    .addIntegerOption(o=>o.setName("상자").setDescription("상자 개수").setRequired(true)))
  .addSubcommand(s=>s.setName("장착설정").setDescription("대상 유저 장비 장착/변경")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>o.setName("종류").setDescription("rod/float/bait").setRequired(true).addChoices(
      {name:"낚싯대", value:"rod"},{name:"찌", value:"float"},{name:"미끼", value:"bait"}))
    .addStringOption(o=>{ o.setName("이름").setDescription("장착할 이름").setRequired(true)
      .addChoices(...rodChoices, ...floatChoices, ...baitChoices); return o; }))
  .addSubcommand(s=>s.setName("자동구매").setDescription("대상 유저 자동구매 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addBooleanOption(o=>o.setName("상태").setDescription("ON/OFF").setRequired(true)))
  .addSubcommand(s=>s.setName("스타터지급").setDescription("대상 유저에게 스타터 패키지 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  // === 퀘스트 관리자 ===
  .addSubcommand(s=>s.setName("퀘스트리셋").setDescription("일일/주간 퀘스트 강제 리셋 (진행/수령 제거 + 목록 재생성 준비)")
    .addStringOption(o=>o.setName("종류").setDescription("daily/weekly/both").setRequired(true).addChoices(
      {name:"일일", value:"daily"},{name:"주간", value:"weekly"},{name:"둘다", value:"both"}))
    .addBooleanOption(o=>o.setName("전체").setDescription("서버 전체 적용"))
    .addUserOption(o=>o.setName("유저").setDescription("대상(전체 리셋 시 생략)")))
  .addSubcommand(s=>s.setName("퀘스트트림").setDescription("현재 서버 공통 퀘스트 목록을 N개만 남기기 / 또는 유저 진행/수령 정리")
    .addStringOption(o=>o.setName("종류").setDescription("daily/weekly").setRequired(true).addChoices(
      {name:"일일", value:"daily"},{name:"주간", value:"weekly"}))
    .addIntegerOption(o=>o.setName("개수").setDescription("남길 개수").setRequired(true))
    .addBooleanOption(o=>o.setName("전체").setDescription("서버 공통 목록을 실제로 자르고 전 유저 정리"))
    .addUserOption(o=>o.setName("유저").setDescription("유저 진행/수령만 정리(전체 미사용시)")))
  .addSubcommand(s=>s.setName("퀘스트상태").setDescription("대상 유저의 퀘스트 진행상태 (서버 공통 목록 기준)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("퀘스트개수").setDescription("퀘스트 생성 기본 개수 설정")
    .addIntegerOption(o=>o.setName("일일").setDescription("일일 퀘스트 기본 개수"))
    .addIntegerOption(o=>o.setName("주간").setDescription("주간 퀘스트 기본 개수")))
  .addSubcommand(s=>s.setName("퀘스트보상배율").setDescription("일일/주간 보상 배율(%) 설정")
    .addIntegerOption(o=>o.setName("일일코인").setDescription("일일 코인 배율(%)"))
    .addIntegerOption(o=>o.setName("주간코인").setDescription("주간 코인 배율(%)"))
    .addIntegerOption(o=>o.setName("일일정수").setDescription("일일 BE 배율(%)"))
    .addIntegerOption(o=>o.setName("주간정수").setDescription("주간 BE 배율(%)")));

async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content:"이 명령어는 관리자만 사용할 수 있습니다.", ephemeral:true });
  }
  const sub = interaction.options.getSubcommand();

  // ----- 지급/설정 계열 기존 기능들 유지 -----
  if (sub === "코인지급") {
    const target = interaction.options.getUser("유저");
    const amount = interaction.options.getInteger("수량");
    if (amount === 0) return interaction.reply({ content:"수량은 0이 될 수 없습니다.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.coins = (u.coins||0) + amount;
      if (u.coins < 0) u.coins = 0;
    });
    return interaction.reply({ content:`${target.username}에게 코인 ${amount.toLocaleString()} 지급 처리했습니다.`, ephemeral:true });
  }
  if (sub === "정수지급") {
    const target = interaction.options.getUser("유저");
    const amount = interaction.options.getInteger("수량");
    if (amount === 0) return interaction.reply({ content:"수량은 0이 될 수 없습니다.", ephemeral:true });
    await addBE(target.id, amount, "[낚시관리] 관리자 지급/회수");
    return interaction.reply({ content:`${target.username}에게 파랑 정수 ${amount.toLocaleString()}원 처리했습니다.`, ephemeral:true });
  }
  if (sub === "낚싯대지급") {
    const target = interaction.options.getUser("유저");
    const name = interaction.options.getString("이름");
    if (!RODS.includes(name)) return interaction.reply({ content:"유효하지 않은 낚싯대입니다.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u); addRod(u, name);
    });
    return interaction.reply({ content:`${target.username}에게 '${name}' 지급 완료.`, ephemeral:true });
  }
  if (sub === "찌지급") {
    const target = interaction.options.getUser("유저");
    const name = interaction.options.getString("이름");
    if (!FLOATS.includes(name)) return interaction.reply({ content:"유효하지 않은 찌입니다.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u); addFloat(u, name);
    });
    return interaction.reply({ content:`${target.username}에게 '${name}' 지급 완료.`, ephemeral:true });
  }
  if (sub === "미끼지급") {
    const target = interaction.options.getUser("유저");
    const name = interaction.options.getString("이름");
    const qtyOpt = interaction.options.getInteger("수량");
    const qty = qtyOpt != null ? qtyOpt : (BAIT_SPECS[name]?.pack || 20);
    if (!BAITS.includes(name)) return interaction.reply({ content:"유효하지 않은 미끼입니다.", ephemeral:true });
    if (qty <= 0) return interaction.reply({ content:"수량은 1 이상이어야 합니다.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u); addBait(u, name, qty);
    });
    return interaction.reply({ content:`${target.username}에게 '${name}' ${qty}개 지급 완료.`, ephemeral:true });
  }
  if (sub === "내구도수리") {
    const target = interaction.options.getUser("유저");
    const kind = interaction.options.getString("종류");
    const name = interaction.options.getString("이름");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      if (kind === "all") {
        for (const [n] of Object.entries(u.inv.rods)) if (ROD_SPECS[n]?.maxDur) u.inv.rods[n] = ROD_SPECS[n].maxDur;
        for (const [n] of Object.entries(u.inv.floats)) if (FLOAT_SPECS[n]?.maxDur) u.inv.floats[n] = FLOAT_SPECS[n].maxDur;
      } else if (kind === "rod") {
        const nm = name || u.equip.rod;
        if (!nm || !ROD_SPECS[nm]) return interaction.reply({ content:"대상 낚싯대를 찾을 수 없습니다.", ephemeral:true });
        if (!(nm in u.inv.rods)) u.inv.rods[nm] = 0;
        u.inv.rods[nm] = ROD_SPECS[nm].maxDur;
      } else if (kind === "float") {
        const nm = name || u.equip.float;
        if (!nm || !FLOAT_SPECS[nm]) return interaction.reply({ content:"대상 찌를 찾을 수 없습니다.", ephemeral:true });
        if (!(nm in u.inv.floats)) u.inv.floats[nm] = 0;
        u.inv.floats[nm] = FLOAT_SPECS[nm].maxDur;
      }
    });
    return interaction.reply({ content:`${target.username} 장비 내구도 수리 완료.`, ephemeral:true });
  }
  if (sub === "포인트설정") {
    const target = interaction.options.getUser("유저");
    const points = interaction.options.getInteger("점수");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.stats.points = Math.max(0, points||0);
      updateTier(u);
    });
    return interaction.reply({ content:`${target.username} 포인트를 ${points.toLocaleString()}로 설정하고 티어를 갱신했습니다.`, ephemeral:true });
  }
  if (sub === "티어갱신") {
    const all = interaction.options.getBoolean("전체") || false;
    const target = interaction.options.getUser("유저");
    if (all) {
      await withDB(async db=>{
        for (const [,u] of Object.entries(db.users||{})) { ensureUser(u); updateTier(u); }
      });
      return interaction.reply({ content:"전체 유저의 티어를 갱신했습니다.", ephemeral:true });
    } else {
      if (!target) return interaction.reply({ content:"대상 유저를 선택하거나 전체 옵션을 사용하세요.", ephemeral:true });
      await withDB(async db=>{
        const u = (db.users[target.id] ||= {}); ensureUser(u); updateTier(u);
      });
      return interaction.reply({ content:`${target.username}의 티어를 갱신했습니다.`, ephemeral:true });
    }
  }
  if (sub === "전체판매") {
    const target = interaction.options.getUser("유저");
    let total = 0; let sold = 0; let kept = 0;
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      const fishes = u.inv.fishes||[];
      const sellable = fishes.filter(f=>!f.lock);
      const locked = fishes.filter(f=>f.lock);
      total = sellable.reduce((s,f)=>s+(f.price||0),0);
      sold = sellable.length;
      kept = locked.length;
      u.coins = (u.coins||0) + total;
      u.inv.fishes = locked;
    });
    return interaction.reply({ content:`${target.username}의 물고기 ${sold}마리를 판매하여 ${total.toLocaleString()} 코인을 지급했습니다. (잠금 ${kept}마리 보존)`, ephemeral:true });
  }
  if (sub === "인벤조회") {
    const target = interaction.options.getUser("유저");
    let uSnap = null;
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      uSnap = JSON.parse(JSON.stringify(u));
    });
    const eb = new EmbedBuilder().setTitle(`🎒 인벤토리 — ${target.username}`)
      .setDescription(invSummary(uSnap))
      .setThumbnail(getIconURL(uSnap.tier)||null)
      .setColor(0x4db6ac)
      .setFooter({ text:`코인: ${uSnap.coins.toLocaleString()} | 포인트: ${(uSnap.stats.points||0).toLocaleString()} | 티어: ${uSnap.tier} | 정수: ${getBE(target.id).toLocaleString()} | 자동구매: ${uSnap.settings?.autoBuy?"ON":"OFF"}` });
    return interaction.reply({ embeds:[eb], ephemeral:true });
  }
  if (sub === "초기화") {
    const target = interaction.options.getUser("유저");
    await withDB(async db=>{
      db.users[target.id] = {};
      ensureUser(db.users[target.id]);
    });
    return interaction.reply({ content:`${target.username}의 낚시 데이터를 초기화했습니다.`, ephemeral:true });
  }
  if (sub === "키상자설정") {
    const target = interaction.options.getUser("유저");
    const keys = Math.max(0, interaction.options.getInteger("열쇠"));
    const chests = Math.max(0, interaction.options.getInteger("상자"));
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.inv.keys = keys;
      u.inv.chests = chests;
    });
    return interaction.reply({ content:`${target.username}의 열쇠를 ${keys}개, 상자를 ${chests}개로 설정했습니다.`, ephemeral:true });
  }
  if (sub === "장착설정") {
    const target = interaction.options.getUser("유저");
    const kind = interaction.options.getString("종류");
    const name = interaction.options.getString("이름");
    let msg = "";
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      if (kind === "rod") {
        if (!(name in u.inv.rods) || (u.inv.rods[name]||0) <= 0) return interaction.reply({ content:"해당 낚싯대를 보유하고 있지 않거나 내구도가 없습니다.", ephemeral:true });
        u.equip.rod = name; msg = "낚싯대";
      } else if (kind === "float") {
        if (!(name in u.inv.floats) || (u.inv.floats[name]||0) <= 0) return interaction.reply({ content:"해당 찌를 보유하고 있지 않거나 내구도가 없습니다.", ephemeral:true });
        u.equip.float = name; msg = "찌";
      } else if (kind === "bait") {
        if ((u.inv.baits[name]||0) <= 0) return interaction.reply({ content:"해당 미끼를 보유하고 있지 않습니다.", ephemeral:true });
        u.equip.bait = name; msg = "미끼";
      }
    });
    if (!msg) msg = "장비";
    return interaction.reply({ content:`${target.username}의 ${msg}를 '${name}'로 장착했습니다.`, ephemeral:true });
  }
  if (sub === "자동구매") {
    const target = interaction.options.getUser("유저");
    const state = interaction.options.getBoolean("상태");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.settings.autoBuy = !!state;
    });
    return interaction.reply({ content:`${target.username}의 자동구매를 ${state?"ON":"OFF"}로 설정했습니다.`, ephemeral:true });
  }
  if (sub === "스타터지급") {
    const target = interaction.options.getUser("유저");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      addRod(u, "나무 낚싯대");
      addFloat(u, "동 찌");
      addBait(u, "지렁이 미끼", BAIT_SPECS["지렁이 미끼"].pack);
      u.equip.rod = "나무 낚싯대";
      u.equip.float = "동 찌";
      u.equip.bait = "지렁이 미끼";
    });
    return interaction.reply({ content:`${target.username}에게 스타터 패키지를 지급하고 장착까지 완료했습니다.`, ephemeral:true });
  }

  // ----- 퀘스트 관리자 3종 개편 -----
  if (sub === "퀘스트리셋") {
    const kind = interaction.options.getString("종류"); // daily | weekly | both
    const all = interaction.options.getBoolean("전체") || false;

    if (all) {
      await withDB(async db=>{
        for (const [,u] of Object.entries(db.users||{})) { ensureUser(u); clearQuestType(db, u, kind, /*regenerate*/ true); }
      });
      return interaction.reply({ content:`서버 전체 ${kind==="daily"?"일일":kind==="weekly"?"주간":"일일/주간"} 퀘스트 진행/수령을 리셋하고 목록 재생성을 준비했어.`, ephemeral:true });
    } else {
      const target = interaction.options.getUser("유저");
      if (!target) return interaction.reply({ content:"대상 유저를 선택하거나 전체 옵션을 사용하세요.", ephemeral:true });
      await withDB(async db=>{
        const u = (db.users[target.id] ||= {}); ensureUser(u);
        clearQuestType(db, u, kind, /*regenerate*/ true);
      });
      return interaction.reply({ content:`${target.username}의 ${kind==="daily"?"일일":kind==="weekly"?"주간":"일일/주간"} 퀘스트를 리셋하고 목록 재생성을 준비했어.`, ephemeral:true });
    }
  }

  if (sub === "퀘스트트림") {
    const kind = interaction.options.getString("종류"); // daily | weekly
    const keep = interaction.options.getInteger("개수");
    const all = interaction.options.getBoolean("전체") || false;

    if (all) {
      const result = await withDB(async db=> trimQuestType(db, null, kind, keep, true));
      return interaction.reply({ content:`서버 공통 ${kind==="daily"?"일일":"주간"} 퀘스트를 ${result.before}→${result.after}개로 트림하고, 전 유저 진행/수령을 정리했어.`, ephemeral:true });
    } else {
      const target = interaction.options.getUser("유저");
      if (!target) return interaction.reply({ content:"대상 유저를 선택하거나 전체 옵션을 사용하세요.", ephemeral:true });
      const result = await withDB(async db=>{
        const u = (db.users[target.id] ||= {}); ensureUser(u);
        return trimQuestType(db, u, kind, keep, false);
      });
      return interaction.reply({ content:`${target.username} 기준, ${kind==="daily"?"일일":"주간"} 퀘스트 정리 완료(keep=${keep}, cleaned=${result.cleaned}).`, ephemeral:true });
    }
  }

  if (sub === "퀘스트상태") {
    const target = interaction.options.getUser("유저");
    const { eb } = await withDB(async db=>{
      const uid = target.id;
      const u = (db.users[uid] ||= {}); ensureUser(u);
      const daily = db.quests.daily.list || [];
      const weekly = db.quests.weekly.list || [];

      const eb = new EmbedBuilder()
        .setTitle("🧭 퀘스트 상태 (관리자 조회)")
        .setDescription(`유저: <@${uid}>`)
        .setColor(0x6a5acd);

      const paint = (title, list) => {
        if (!list.length) { eb.addFields({ name:title, value:"_없음_", inline:false }); return; }
        const lines = list.map(q=>{
          const status = u.quests.claimed?.[q.id] ? "수령완료" : isQuestCompleteLocal(u, q) ? "완료" : "진행중";
          return `• ${q.title||q.name||q.id} — **${status}** (${formatQuestProgress(u, q)})`;
        });
        eb.addFields({ name:title, value:lines.join("\n"), inline:false });
      };
      paint("🗓️ 일일 퀘스트", daily);
      paint("📅 주간 퀘스트", weekly);
      return { eb };
    });
    return interaction.reply({ embeds:[eb], ephemeral:true });
  }

  if (sub === "퀘스트개수") {
    const daily = interaction.options.getInteger("일일");
    const weekly = interaction.options.getInteger("주간");
    await withDB(async db=>{
      ensureConfig(db);
      if (typeof daily === "number" && daily >= 0) db.config.quest.countDaily = daily;
      if (typeof weekly === "number" && weekly >= 0) db.config.quest.countWeekly = weekly;
    });
    return interaction.reply({ content:`퀘스트 기본 개수를 일일 ${daily??"변경없음"}, 주간 ${weekly??"변경없음"}으로 설정했습니다.`, ephemeral:true });
  }
  if (sub === "퀘스트보상배율") {
    const dC = interaction.options.getInteger("일일코인");
    const wC = interaction.options.getInteger("주간코인");
    const dB = interaction.options.getInteger("일일정수");
    const wB = interaction.options.getInteger("주간정수");
    await withDB(async db=>{
      ensureConfig(db);
      const rm = db.config.quest.rewardMul;
      if (typeof dC === "number" && dC >= 0) rm.dailyCoins = dC;
      if (typeof wC === "number" && wC >= 0) rm.weeklyCoins = wC;
      if (typeof dB === "number" && dB >= 0) rm.dailyBE = dB;
      if (typeof wB === "number" && wB >= 0) rm.weeklyBE = wB;
    });
    return interaction.reply({ content:`보상 배율을 적용했습니다. 일일 코인 ${dC??"유지"}%, 주간 코인 ${wC??"유지"}%, 일일 BE ${dB??"유지"}%, 주간 BE ${wB??"유지"}%`, ephemeral:true });
  }
}

module.exports = { data, execute };
