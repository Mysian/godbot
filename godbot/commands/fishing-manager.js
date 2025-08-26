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
  "나무 낚싯대":   { maxDur: 30 },
  "강철 낚싯대":   { maxDur: 100 },
  "금 낚싯대":     { maxDur: 200 },
  "다이아 낚싯대": { maxDur: 500 },
  "전설의 낚싯대": { maxDur: 1000 }
};
const FLOAT_SPECS = {
  "동 찌":    { maxDur: 60 },
  "은 찌":    { maxDur: 120 },
  "금 찌":    { maxDur: 200 },
  "다이아 찌": { maxDur: 500 }
};
const DEFAULT_BAIT_PACK = 20;

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
function ensureUser(u) {
  u.coins ||= 0;
  u.tier ||= "브론즈";
  u.equip ||= { rod:null, float:null, bait:null };
  u.inv ||= { rods:{}, floats:{}, baits:{}, fishes:[], keys:0, chests:0 };
  u.stats ||= { caught:0, points:0, best:{}, max:{ name:null, length:0 } };
}
function addRod(u, name) { u.inv.rods[name] = (ROD_SPECS[name]?.maxDur)||0; }
function addFloat(u, name) { u.inv.floats[name] = (FLOAT_SPECS[name]?.maxDur)||0; }
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

const rodChoices = RODS.map(n=>({ name:n, value:n })).slice(0,25);
const floatChoices = FLOATS.map(n=>({ name:n, value:n })).slice(0,25);
const baitChoices = BAITS.map(n=>({ name:n, value:n })).slice(0,25);

const data = new SlashCommandBuilder().setName("낚시관리").setDescription("낚시 시스템 관리")
  .addSubcommand(s=>s.setName("코인지급").setDescription("유저에게 코인 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("수량").setDescription("지급 코인").setRequired(true)))
  .addSubcommand(s=>s.setName("정수지급").setDescription("유저에게 파랑 정수 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("수량").setDescription("지급 정수").setRequired(true)))
  .addSubcommand(s=>s.setName("낚싯대지급").setDescription("낚싯대 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("낚싯대 이름").setRequired(true).addChoices(...rodChoices); return o; }))
  .addSubcommand(s=>s.setName("찌지급").setDescription("찌 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("찌 이름").setRequired(true).addChoices(...floatChoices); return o; }))
  .addSubcommand(s=>s.setName("미끼지급").setDescription("미끼 지급")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>{ o.setName("이름").setDescription("미끼 이름").setRequired(true).addChoices(...baitChoices); return o; })
    .addIntegerOption(o=>o.setName("수량").setDescription("지급 개수").setRequired(false)))
  .addSubcommand(s=>s.setName("내구도수리").setDescription("장비 내구도 수리")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addStringOption(o=>o.setName("종류").setDescription("rod/float/all").setRequired(true).addChoices(
      {name:"낚싯대", value:"rod"},{name:"찌", value:"float"},{name:"전체", value:"all"}))
    .addStringOption(o=>o.setName("이름").setDescription("장비 이름(전체 수리시 생략)").setRequired(false)))
  .addSubcommand(s=>s.setName("포인트설정").setDescription("유저 포인트 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("점수").setDescription("설정 포인트").setRequired(true)))
  .addSubcommand(s=>s.setName("티어갱신").setDescription("유저/전체 티어 재계산")
    .addUserOption(o=>o.setName("유저").setDescription("대상(전체 미선택)").setRequired(false))
    .addBooleanOption(o=>o.setName("전체").setDescription("전체 갱신").setRequired(false)))
  .addSubcommand(s=>s.setName("전체판매").setDescription("대상 유저 물고기 전부 판매")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("인벤조회").setDescription("대상 유저 인벤토리 요약")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("초기화").setDescription("대상 유저 낚시 데이터 초기화")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true)))
  .addSubcommand(s=>s.setName("키상자설정").setDescription("대상 유저의 열쇠/상자 수 설정")
    .addUserOption(o=>o.setName("유저").setDescription("대상").setRequired(true))
    .addIntegerOption(o=>o.setName("열쇠").setDescription("키 개수").setRequired(true))
    .addIntegerOption(o=>o.setName("상자").setDescription("상자 개수").setRequired(true)));

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
    });
    return interaction.reply({ content:`${target.username}에게 코인 ${amount.toLocaleString()} 지급 완료.`, ephemeral:true });
  }
  if (sub === "정수지급") {
    const target = interaction.options.getUser("유저");
    const amount = interaction.options.getInteger("수량");
    if (amount === 0) return interaction.reply({ content:"수량은 0이 될 수 없습니다.", ephemeral:true });
    await addBE(target.id, amount, "[낚시관리] 관리자 지급");
    return interaction.reply({ content:`${target.username}에게 파랑 정수 ${amount.toLocaleString()}원 지급 완료.`, ephemeral:true });
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
    const qty = interaction.options.getInteger("수량") ?? DEFAULT_BAIT_PACK;
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
    let total = 0; let count = 0;
    await withDB(async db=>{
      const u = (db.users[target.id] ||= {}); ensureUser(u);
      total = (u.inv.fishes||[]).reduce((s,f)=>s+(f.price||0),0);
      count = (u.inv.fishes||[]).length;
      u.coins += total;
      u.inv.fishes = [];
    });
    return interaction.reply({ content:`${target.username}의 물고기 ${count}마리를 모두 판매하여 ${total.toLocaleString()} 코인을 지급했습니다.`, ephemeral:true });
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
      .setFooter({ text:`코인: ${uSnap.coins.toLocaleString()} | 포인트: ${(uSnap.stats.points||0).toLocaleString()} | 티어: ${uSnap.tier} | 정수: ${getBE(target.id).toLocaleString()}` });
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
}

module.exports = { data, execute };
