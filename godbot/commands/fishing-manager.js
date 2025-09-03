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
  "브론즈": 0, "실버": 500, "골드": 1500, "플래티넘": 4000,
  "다이아": 10000, "마스터": 25000, "그랜드마스터": 75000, "챌린저": 145000
};

const ROD_SPECS = {
  "나무 낚싯대":   { maxDur: 50 },
  "강철 낚싯대":   { maxDur: 120 },
  "금 낚싯대":     { maxDur: 250 },
  "다이아 낚싯대": { maxDur: 490 },
  "전설의 낚싯대": { maxDur: 880 }
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

const RELIC_LIST = [
  "에메랄드 상어 비늘",
  "황금 지렁이",
  "황금 유령선 피규어",
  "낚시꾼의 증표",
  "황금 상어의 지느러미",
  "용녀의 진주",
  "인어공주의 비녀",
  "낚시꾼의 모자",
  "고대 용왕의 석판",
];
const RELIC_MAX_LEVEL = 5;

function readDB() {
  if (!fs.existsSync(FISH_DB)) return { users:{}, quests:{ daily:{ key:null, list:[] }, weekly:{ key:null, list:[] } }, config:{} };
  try { return JSON.parse(fs.readFileSync(FISH_DB, "utf8")); } catch { return { users:{}, quests:{ daily:{ key:null, list:[] }, weekly:{ key:null, list:[] } }, config:{} }; }
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
}
async function withDB(fn) {
  if (!fs.existsSync(FISH_DB)) writeDB({ users:{}, quests:{ daily:{ key:null, list:[] }, weekly:{ key:null, list:[] } }, config:{ quest:{ countDaily:4, countWeekly:3, rewardMul:{ dailyCoins:100, weeklyCoins:100, dailyBE:100, weeklyBE:100 } } } });
  const release = await lockfile.lock(FISH_DB, { realpath:false, retries:{ retries: 10, factor: 1.6, minTimeout: 30, maxTimeout: 200 } }).catch(()=>null);
  try {
    const db = readDB(); ensureDB(db);
    const res = await fn(db);
    writeDB(db);
    return res;
  } finally { if (release) await release().catch(()=>{}); }
}
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
  u.aquarium ??= [];
  u.relics ??= { equipped:null, lv:{} };
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
  u.quests.temp ??= { recentRarities:[], junkStreak:0, lastRarity:null, sameRarityStreak:0 };
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
function setBait(u, name, qty){
  if (qty <= 0){
    delete u.inv.baits[name];
    if (u.equip.bait === name) u.equip.bait = null;
    return 0;
  }
  u.inv.baits[name] = qty;
  return qty;
}
function removeBait(u, name, qty){
  const cur = u.inv.baits[name] || 0;
  const next = Math.max(0, cur - Math.abs(qty));
  if (next === 0){
    delete u.inv.baits[name];
    if (u.equip.bait === name) u.equip.bait = null;
  } else {
    u.inv.baits[name] = next;
  }
  return next;
}
function aquaValueMult(lv){ return Math.pow(1.1, Math.max(0, (lv||1)-1)); }
function valueWithLevel(base, lv){ return Math.round((base||0) * aquaValueMult(lv)); }
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
  const baitList = Object.entries(u.inv.baits||{}).map(([k,v])=>`${k} x${v}`);
  return [
    `• Rods: ${rodList.length? rodList.join(", ") : "없음"}`,
    `• Floats: ${floatList.length? floatList.join(", ") : "없음"}`,
    `• Baits: ${baitList.length? baitList.join(", ") : "없음"}`,
    `• Keys: ${u.inv.keys||0}개, Chests: ${u.inv.chests||0}개`,
  ].join("\n");
}
function dailyKeyKST(){
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset()*60000;
  const kst = new Date(utc + 9*3600000);
  return `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,"0")}-${String(kst.getDate()).padStart(2,"0")}`;
}
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
  u.quests.temp = { recentRarities:[], junkStreak:0, lastRarity:null, sameRarityStreak:0 };
}
function trimQuestLists(db, kind, keepN, applyAll=false, uForSingle=null) {
  if (applyAll) {
    if (kind === "daily") db.quests.daily.list = db.quests.daily.list.slice(0, Math.max(0,keepN));
    if (kind === "weekly") db.quests.weekly.list = db.quests.weekly.list.slice(0, Math.max(0,keepN));
    for (const uid of Object.keys(db.users)) {
      const u = db.users[uid]; ensureUser(u);
      for (const k of Object.keys(u.quests.progress)) {
        const isDaily = k.startsWith("d:");
        const idx = parseInt(k.split(":")[1]||"-1",10);
        if (isDaily && kind==="daily" && idx >= keepN) delete u.quests.progress[k];
        if (!isDaily && kind==="weekly" && idx >= keepN) delete u.quests.progress[k];
      }
      for (const k of Object.keys(u.quests.claimed)) {
        const isDaily = k.startsWith("d:");
        const idx = parseInt(k.split(":")[1]||"-1",10);
        if (isDaily && kind==="daily" && idx >= keepN) delete u.quests.claimed[k];
        if (!isDaily && kind==="weekly" && idx >= keepN) delete u.quests.claimed[k];
      }
    }
  } else if (uForSingle) {
    const u = uForSingle; ensureUser(u);
    for (const k of Object.keys(u.quests.progress)) {
      const isDaily = k.startsWith("d:");
      const idx = parseInt(k.split(":")[1]||"-1",10);
      if (isDaily && kind==="daily" && idx >= keepN) delete u.quests.progress[k];
      if (!isDaily && kind==="weekly" && idx >= keepN) delete u.quests.progress[k];
    }
    for (const k of Object.keys(u.quests.claimed)) {
      const isDaily = k.startsWith("d:");
      const idx = parseInt(k.split(":")[1]||"-1",10);
      if (isDaily && kind==="daily" && idx >= keepN) delete u.quests.claimed[k];
      if (!isDaily && kind==="weekly" && idx >= keepN) delete u.quests.claimed[k];
    }
  }
}
function buildInvEmbed(u, target) {
  const eb = new EmbedBuilder()
    .setTitle(`🎣 인벤토리 | ${target.username}`)
    .setColor(0x00bcd4)
    .setThumbnail(getIconURL(u.tier))
    .addFields(
      { name:"장착", value: equipLine(u), inline:false },
      { name:"보유", value: invSummary(u), inline:false },
      { name:"통계", value: `포인트: ${u.stats.points||0} | 잡은 횟수: ${u.stats.caught||0} | 티어: ${u.tier}`, inline:false },
    );
  return eb;
}

const rodChoices   = RODS.map(n=>({ name:n, value:n }));
const floatChoices = FLOATS.map(n=>({ name:n, value:n }));
const baitChoices  = BAITS.map(n=>({ name:n, value:n }));
const relicChoices = RELIC_LIST.map(n=>({ name:n, value:n }));

const data = new SlashCommandBuilder()
  .setName("낚시관리")
  .setDescription("낚시 시스템 관리자 명령어")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addSubcommand(s=>s.setName("코인지급").setDescription("코인 지급/회수 (음수 가능)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("수량").setDescription("예:+1000,-500").setRequired(true)))
  .addSubcommand(s=>s.setName("정수지급").setDescription("파랑 정수(BE) 지급/회수 (음수 가능)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("수량").setDescription("예:+100000,-50000").setRequired(true)))
  .addSubcommand(s=>s.setName("낚싯대지급").setDescription("낚싯대 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("낚싯대 이름").setRequired(true).addChoices(...rodChoices); return o; }))
  .addSubcommand(s=>s.setName("찌지급").setDescription("찌 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("찌 이름").setRequired(true).addChoices(...floatChoices); return o; }))
  .addSubcommand(s=>s.setName("미끼지급").setDescription("미끼 지급/회수/삭제 (양수=지급, 음수=회수, 0=삭제)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("미끼 이름").setRequired(true).addChoices(...baitChoices); return o; })
    .addIntegerOption(o=>o.setName("수량").setDescription("양수/음수/0(삭제), 미입력 시 기본묶음")))
  .addSubcommand(s=>s.setName("미끼설정").setDescription("미끼 수량을 특정 값으로 설정 (0이면 삭제)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("미끼 이름").setRequired(true).addChoices(...baitChoices); return o; })
    .addIntegerOption(o=>o.setName("수량").setDescription("0 이상 정수").setRequired(true)))
  .addSubcommand(s=>s.setName("아이템삭제").setDescription("rod/float/bait 아이템 삭제")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>o.setName("종류").setDescription("rod/float/bait").setRequired(true)
      .addChoices({name:"rod", value:"rod"},{name:"float", value:"float"},{name:"bait", value:"bait"}))
    .addStringOption(o=>o.setName("이름").setDescription("아이템 이름").setRequired(true)))
  .addSubcommand(s=>s.setName("유물조회").setDescription("유물 보유/장착 상태 조회")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("유물장착").setDescription("유물 장착/해제")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("유물 이름 또는 '해제'").setRequired(true).addChoices(...relicChoices, {name:"해제", value:"해제"}); return o; }))
  .addSubcommand(s=>s.setName("유물레벨설정").setDescription("유물 레벨 설정(0~5)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("유물 이름").setRequired(true).addChoices(...relicChoices); return o; })
    .addIntegerOption(o=>o.setName("레벨").setDescription("0~5").setRequired(true)))
  .addSubcommand(s=>s.setName("수족관조회").setDescription("수족관 슬롯 상태 조회")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("수족관넣기").setDescription("인벤토리에서 수족관으로 이동")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("인벤인덱스").setDescription("인벤토리 fish 배열 인덱스").setRequired(true)))
  .addSubcommand(s=>s.setName("수족관빼기").setDescription("수족관에서 인벤토리로 이동")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("슬롯").setDescription("수족관 슬롯 인덱스(0~4)").setRequired(true)))
  .addSubcommand(s=>s.setName("내구도수리").setDescription("장비 내구도 수리")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>o.setName("종류").setDescription("rod/float/all").setRequired(true)
      .addChoices({name:"rod", value:"rod"},{name:"float", value:"float"},{name:"all", value:"all"}))
    .addStringOption(o=>o.setName("이름").setDescription("단일 장비 수리 시 이름(선택)")))
  .addSubcommand(s=>s.setName("포인트설정").setDescription("포인트 설정 후 티어 재계산")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("점수").setDescription("0 이상 정수").setRequired(true)))
  .addSubcommand(s=>s.setName("티어갱신").setDescription("현재 포인트 기준 티어 갱신")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("전체판매").setDescription("인벤 물고기 전량 판매(경고)")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("인벤조회").setDescription("인벤토리 임베드 조회")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("초기화").setDescription("대상 유저 낚시 데이터 초기화")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("키상자설정").setDescription("열쇠/상자 개수 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("열쇠").setDescription("0 이상 정수").setRequired(true))
    .addIntegerOption(o=>o.setName("상자").setDescription("0 이상 정수").setRequired(true)))
  .addSubcommand(s=>s.setName("장착설정").setDescription("장비/미끼 장착 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>o.setName("종류").setDescription("rod/float/bait").setRequired(true)
      .addChoices({name:"rod", value:"rod"},{name:"찌", value:"float"},{name:"미끼", value:"bait"}))
    .addStringOption(o=>{ o.setName("이름").setDescription("장착할 이름").setRequired(true)
      .addChoices(...rodChoices, ...floatChoices, ...baitChoices); return o; }))
  .addSubcommand(s=>s.setName("자동구매").setDescription("대상 유저 자동구매 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addBooleanOption(o=>o.setName("상태").setDescription("ON/OFF").setRequired(true)))
  .addSubcommand(s=>s.setName("스타터지급").setDescription("대상 유저에게 스타터 패키지 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
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
  .addSubcommand(s=>s.setName("퀘스트보상배율").setDescription("퀘스트 보상 배율(%) 설정")
    .addIntegerOption(o=>o.setName("일일코인").setDescription("%"))
    .addIntegerOption(o=>o.setName("주간코인").setDescription("%"))
    .addIntegerOption(o=>o.setName("일일정수").setDescription("%"))
    .addIntegerOption(o=>o.setName("주간정수").setDescription("%")));

async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content:"이 명령어는 관리자만 사용할 수 있습니다.", ephemeral:true });
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "코인지급") {
    const target = interaction.options.getUser("유저");
    const amount = interaction.options.getInteger("수량");
    if (amount === 0) return interaction.reply({ content:"수량은 0이 될 수 없습니다.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.coins = (u.coins||0) + amount;
      if (u.coins < 0) u.coins = 0;
    });
    return interaction.reply({ content:`${target.username}에게 코인 ${amount.toLocaleString()} 처리 완료.`, ephemeral:true });
  }

  if (sub === "정수지급") {
    const target = interaction.options.getUser("유저");
    const amount = interaction.options.getInteger("수량");
    if (amount === 0) return interaction.reply({ content:"수량은 0이 될 수 없습니다.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      await addBE(u, amount);
    });
    const now = await withDB(db=>getBE(db.users[target.id]));
    return interaction.reply({ content:`${target.username}에게 BE ${amount.toLocaleString()} 처리 완료. 현재 ${now.toLocaleString()} BE`, ephemeral:true });
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
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      if (qty === 0){
        setBait(u, name, 0);
      } else if (qty > 0){
        addBait(u, name, qty);
      } else {
        removeBait(u, name, qty);
      }
    });
    return interaction.reply({ content:`${target.username}의 '${name}' 수량을 ${qty>0?`+${qty}`:(qty<0?`${qty}`:"삭제")} 처리했습니다.`, ephemeral:true });
  }

  if (sub === "미끼설정") {
    const target = interaction.options.getUser("유저");
    const name = interaction.options.getString("이름");
    const qty = interaction.options.getInteger("수량");
    if (!BAITS.includes(name)) return interaction.reply({ content:"유효하지 않은 미끼입니다.", ephemeral:true });
    if (qty < 0) return interaction.reply({ content:"0 이상으로 설정해줘.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      setBait(u, name, qty);
    });
    return interaction.reply({ content:`${target.username}의 '${name}' 수량을 ${qty}로 설정했습니다.`, ephemeral:true });
  }

  if (sub === "아이템삭제") {
    const target = interaction.options.getUser("유저");
    const kind = interaction.options.getString("종류");
    const name = interaction.options.getString("이름");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      if (kind === "rod") {
        delete u.inv.rods[name];
        if (u.equip.rod === name) u.equip.rod = null;
      } else if (kind === "float") {
        delete u.inv.floats[name];
        if (u.equip.float === name) u.equip.float = null;
      } else if (kind === "bait") {
        setBait(u, name, 0);
      }
    });
    return interaction.reply({ content:`${target.username}의 ${kind} '${name}'를 삭제했습니다.`, ephemeral:true });
  }

  if (sub === "유물조회") {
    const target = interaction.options.getUser("유저");
    let u;
    await withDB(async db=>{ u = (db.users[target.id] ||= {}); ensureUser(u); });
    const equipped = u.relics?.equipped || "없음";
    const lvPairs = Object.entries(u.relics?.lv||{}).map(([k,v])=>`${k}: ${v}`).slice(0, 20).join("\n") || "보유 정보 없음";
    const eb = new EmbedBuilder().setTitle(`유물 | ${target.username}`).setColor(0x8e44ad).addFields({name:"장착", value:String(equipped)},{name:"레벨", value:lvPairs});
    return interaction.reply({ embeds:[eb], ephemeral:true });
  }

  if (sub === "유물장착") {
    const target = interaction.options.getUser("유저");
    const name = interaction.options.getString("이름");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      if (name === "해제") u.relics.equipped = null;
      else {
        u.relics.lv ||= {};
        if (!(name in u.relics.lv)) u.relics.lv[name] = 0;
        u.relics.equipped = name;
      }
    });
    return interaction.reply({ content:`${target.username}의 유물 장착 상태를 '${name === "해제" ? "해제" : name}'로 설정했습니다.`, ephemeral:true });
  }

  if (sub === "유물레벨설정") {
    const target = interaction.options.getUser("유저");
    const name = interaction.options.getString("이름");
    let lv = interaction.options.getInteger("레벨");
    if (lv < 0) lv = 0; if (lv > RELIC_MAX_LEVEL) lv = RELIC_MAX_LEVEL;
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.relics.lv ||= {}; u.relics.lv[name] = lv;
    });
    return interaction.reply({ content:`${target.username}의 '${name}' 레벨을 ${lv}로 설정했습니다.`, ephemeral:true });
  }

  if (sub === "수족관조회") {
    const target = interaction.options.getUser("유저");
    let u;
    await withDB(async db=>{ u = (db.users[target.id] ||= {}); ensureUser(u); });
    const lines = (u.aquarium||[]).map((a,i)=>`[${i}] ${a.n||"?"} Lv.${a.lv||1} xp:${a.xp||0} 길이:${a.l||0} 기본가:${a.base||0} 현재가:${valueWithLevel(a.base||0, a.lv||1)}`);
    const text = lines.length?lines.join("\n"):"빈 수족관";
    return interaction.reply({ content:text, ephemeral:true });
  }

  if (sub === "수족관넣기") {
    const target = interaction.options.getUser("유저");
    const idx = interaction.options.getInteger("인벤인덱스");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      const fish = (u.inv.fishes||[])[idx];
      if (!fish) return;
      if (!Array.isArray(u.aquarium)) u.aquarium = [];
      if (u.aquarium.length >= 5) return;
      const a = { n:fish.n, r:fish.r, l:fish.l, base: fish.price||0, lv:1, xp:0, feedKey:null, feedCount:0 };
      u.aquarium.push(a);
      u.inv.fishes.splice(idx,1);
    });
    return interaction.reply({ content:`${target.username} 인벤[${idx}] → 수족관 이동`, ephemeral:true });
  }

  if (sub === "수족관빼기") {
    const target = interaction.options.getUser("유저");
    const slot = interaction.options.getInteger("슬롯");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      const a = (u.aquarium||[])[slot];
      if (!a) return;
      const back = { n:a.n, r:a.r, l:a.l, price: valueWithLevel(a.base||0, a.lv||1), lock:false };
      u.inv.fishes.push(back);
      u.aquarium.splice(slot,1);
    });
    return interaction.reply({ content:`${target.username} 수족관[${slot}] → 인벤 이동`, ephemeral:true });
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
    const pts = interaction.options.getInteger("점수");
    if (pts < 0) return interaction.reply({ content:"0 이상으로 설정해줘.", ephemeral:true });
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.stats.points = pts; updateTier(u);
    });
    return interaction.reply({ content:`${target.username} 포인트 ${pts.toLocaleString()} 설정 및 티어 갱신 완료.`, ephemeral:true });
  }

  if (sub === "티어갱신") {
    const target = interaction.options.getUser("유저");
    await withDB(async db=>{ const u = (db.users[target.id] ||= {}); ensureUser(u); updateTier(u); });
    return interaction.reply({ content:`${target.username} 티어 갱신 완료.`, ephemeral:true });
  }

  if (sub === "전체판매") {
    const target = interaction.options.getUser("유저");
    let sold = 0, count = 0;
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      for (const f of (u.inv.fishes||[])) { sold += (f.price||0); count++; }
      u.coins = (u.coins||0) + sold;
      u.inv.fishes = [];
    });
    return interaction.reply({ content:`${target.username} 물고기 ${count}마리 총 ${sold.toLocaleString()} 코인 판매 처리.`, ephemeral:true });
  }

  if (sub === "인벤조회") {
    const target = interaction.options.getUser("유저");
    let u; await withDB(async db=>{ u = (db.users[target.id] ||= {}); ensureUser(u); });
    return interaction.reply({ embeds:[buildInvEmbed(u, target)], ephemeral:true });
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
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      if (kind === "rod") {
        if (!ROD_SPECS[name]) return;
        if (u.inv.rods[name]==null || u.inv.rods[name]<=0) return;
        u.equip.rod = name;
      } else if (kind === "float") {
        if (!FLOAT_SPECS[name]) return;
        if (u.inv.floats[name]==null || u.inv.floats[name]<=0) return;
        u.equip.float = name;
      } else if (kind === "bait") {
        if (!BAIT_SPECS[name]) return;
        if ((u.inv.baits[name]||0) <= 0) return;
        u.equip.bait = name;
      }
    });
    return interaction.reply({ content:`${target.username} 장착 변경 완료.`, ephemeral:true });
  }

  if (sub === "자동구매") {
    const target = interaction.options.getUser("유저");
    const state = interaction.options.getBoolean("상태");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      u.settings.autoBuy = !!state;
    });
    return interaction.reply({ content:`${target.username} 자동구매를 ${state?"ON":"OFF"}로 설정했습니다.`, ephemeral:true });
  }

  if (sub === "스타터지급") {
    const target = interaction.options.getUser("유저");
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      addRod(u, RODS[0]); addFloat(u, FLOATS[0]); addBait(u, BAITS[0], BAIT_SPECS[BAITS[0]]?.pack || 20);
      if (!u.equip.rod) u.equip.rod = RODS[0];
      if (!u.equip.float) u.equip.float = FLOATS[0];
      if (!u.equip.bait) u.equip.bait = BAITS[0];
    });
    return interaction.reply({ content:`${target.username}에게 스타터 패키지 지급 완료.`, ephemeral:true });
  }

  if (sub === "퀘스트리셋") {
    const kind = interaction.options.getString("종류");
    const all = interaction.options.getBoolean("전체");
    const target = interaction.options.getUser("유저");
    await withDB(async db=>{
      if (all) {
        for (const uid of Object.keys(db.users)) {
          const u = (db.users[uid] ||= {}); ensureUser(u);
          clearQuestType(db, u, kind, true);
        }
      } else if (target) {
        const u = (db.users[target.id] ||= {}); ensureUser(u);
        clearQuestType(db, u, kind, true);
      }
    });
    return interaction.reply({ content:`퀘스트 리셋 처리 완료.`, ephemeral:true });
  }

  if (sub === "퀘스트트림") {
    const kind = interaction.options.getString("종류");
    const keep = interaction.options.getInteger("개수");
    const all = interaction.options.getBoolean("전체");
    const target = interaction.options.getUser("유저");
    await withDB(async db=>{
      if (all) trimQuestLists(db, kind, keep, true, null);
      else if (target) { const u = (db.users[target.id] ||= {}); ensureUser(u); trimQuestLists(db, kind, keep, false, u); }
    });
    return interaction.reply({ content:`퀘스트 목록 정리 완료.`, ephemeral:true });
  }

  if (sub === "퀘스트상태") {
    const target = interaction.options.getUser("유저");
    let text = "";
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      const prog = Object.keys(u.quests.progress).length;
      const clm  = Object.keys(u.quests.claimed).length;
      text = `진행 ${prog}개, 수령 ${clm}개`;
    });
    return interaction.reply({ content:text || "정보 없음", ephemeral:true });
  }

  if (sub === "퀘스트개수") {
    const d = interaction.options.getInteger("일일");
    const w = interaction.options.getInteger("주간");
    await withDB(async db=>{
      if (d != null) db.config.quest.countDaily = Math.max(0, d);
      if (w != null) db.config.quest.countWeekly = Math.max(0, w);
    });
    return interaction.reply({ content:`퀘스트 개수 설정 완료.`, ephemeral:true });
  }

  if (sub === "퀘스트보상배율") {
    const dC = interaction.options.getInteger("일일코인");
    const wC = interaction.options.getInteger("주간코인");
    const dB = interaction.options.getInteger("일일정수");
    const wB = interaction.options.getInteger("주간정수");
    await withDB(async db=>{
      db.config.quest.rewardMul = {
        dailyCoins: dC ?? db.config.quest.rewardMul.dailyCoins,
        weeklyCoins: wC ?? db.config.quest.rewardMul.weeklyCoins,
        dailyBE: dB ?? db.config.quest.rewardMul.dailyBE,
        weeklyBE: wB ?? db.config.quest.rewardMul.weeklyBE,
      };
    });
    return interaction.reply({ content:`퀘스트 보상 배율 설정 완료.`, ephemeral:true });
  }
}

module.exports = { data, execute };
