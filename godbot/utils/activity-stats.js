// activity-stats.js (hardened, idempotent rewards, safer I/O)
"use strict";

const cron = require("node-cron");
const path = require("path");
const fs = require("fs");
const { EmbedBuilder } = require("discord.js");

const activityTracker = require("../utils/activity-tracker");
const client = require("../index").client;
const { addBE } = require("../commands/be-util.js");

// ====== 설정 ======
const TARGET_CHANNEL_ID = "1202425624061415464";
const SERVER_ICON_URL = "https://media.discordapp.net/attachments/1388728993787940914/1389194104424108223/2D.png?ex=6863bb54&is=686269d4&hm=59f7fbfb39d474b2577fbc87765daa533f636fa3e702285c24eda0fd51aebaa3&=&format=webp&quality=lossless";
const THUMBNAIL_URL   = "https://media.discordapp.net/attachments/1388728993787940914/1389192042143551548/image.png?ex=6863b968&is=686267e8&hm=f5cd94557360f427a8a3bfca9b8c27290ce29d5e655871541c309133b0082e85&=&format=webp";
const DONOR_ROLE_ID   = "1397076919127900171";

// 보상 금액
const DAILY_REWARD  = 20000;
const WEEKLY_REWARD = 100000;

// 보상 지급 중복 방지 저장소
const REWARD_STORE_PATH = path.join(__dirname, "../data/activity-rewards.json");

// ====== 파일 유틸(원자적 저장/백업/손상 격리) ======
function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function safeReadJSONSync(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    try {
      const bak = file + ".bak";
      if (fs.existsSync(bak)) {
        const braw = fs.readFileSync(bak, "utf8");
        if (braw && braw.trim()) return JSON.parse(braw);
      }
    } catch {}
    try { fs.renameSync(file, file + `.corrupt.${Date.now()}`); } catch {}
    return fallback;
  }
}
function atomicWriteJSONSync(file, obj) {
  ensureDir(file);
  const json = JSON.stringify(obj, null, 2);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, file);
  try { fs.writeFileSync(file + ".bak", json); } catch {}
}

// ====== 보상 원장(중복 지급 방지) ======
function loadRewardStore() {
  return safeReadJSONSync(REWARD_STORE_PATH, { daily: {}, weekly: {} });
}
function saveRewardStore(store) {
  atomicWriteJSONSync(REWARD_STORE_PATH, store);
}
function markDailyPaid(dateStr, kind, userId) {
  const store = loadRewardStore();
  if (!store.daily[dateStr]) store.daily[dateStr] = {};
  store.daily[dateStr][kind] = String(userId);
  store.daily[dateStr]._ts = Date.now();
  saveRewardStore(store);
}
function isDailyPaid(dateStr, kind) {
  const store = loadRewardStore();
  return Boolean(store.daily?.[dateStr]?.[kind]);
}
function markWeeklyPaid(rangeKey, kind, userId) {
  const store = loadRewardStore();
  if (!store.weekly[rangeKey]) store.weekly[rangeKey] = {};
  store.weekly[rangeKey][kind] = String(userId);
  store.weekly[rangeKey]._ts = Date.now();
  saveRewardStore(store);
}
function isWeeklyPaid(rangeKey, kind) {
  const store = loadRewardStore();
  return Boolean(store.weekly?.[rangeKey]?.[kind]);
}

// ====== 표시/시간 유틸 ======
const userCache = new Map(); // userId -> { name, ts }
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간
async function getDisplayName(userId, preferGuild) {
  try {
    const hit = userCache.get(userId);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.name;

    let name = null;
    // 길드 우선 조회(빠름/정확)
    if (preferGuild) {
      try {
        const m = await preferGuild.members.fetch(userId);
        if (m) name = m.nickname || m.user?.username || null;
      } catch {}
    }
    // 모든 길드에서 탐색(백업)
    if (!name) {
      for (const [, guild] of client.guilds.cache) {
        try {
          const m = await guild.members.fetch(userId);
          if (m) { name = m.nickname || m.user?.username; break; }
        } catch {}
      }
    }
    // 최후의 수단: User API
    if (!name) {
      const u = await client.users.fetch(userId);
      name = u?.username || null;
    }
    if (!name) name = "(알 수 없음)";
    userCache.set(userId, { name, ts: Date.now() });
    return name;
  } catch {
    return "(알 수 없음)";
  }
}

function secToHMS(sec) {
  sec = Math.floor(Number(sec) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h}시간`);
  if (m || h) parts.push(`${m}분`);
  parts.push(`${s}초`);
  return parts.join(" ");
}

function getYesterdayKST() {
  const now = new Date();
  now.setHours(now.getHours() + 9); // KST 보정
  now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getWeekRangeKST() {
  // "지난주 월~일" 범위. (이 파일은 월요일 21:00 KST에 실행)
  const now = new Date();
  now.setHours(now.getHours() + 9); // KST
  const end = new Date(now);
  // 월(1)이라면 1일 빼서 '어제'=일요일, 일(0)은 7로 취급
  const delta = (now.getDay() === 0 ? 7 : now.getDay()); // 1~7
  end.setDate(end.getDate() - delta);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function rangeKey({ from, to }) {
  return `${from}_to_${to}`;
}

async function buildDonorLine(guild) {
  try {
    if (!guild) return "현재 후원자 없음";
    const role = guild.roles.cache.get(DONOR_ROLE_ID) || await guild.roles.fetch(DONOR_ROLE_ID).catch(() => null);
    if (!role) return "현재 후원자 없음";

    const members = await guild.members.fetch(); // 한 번에 캐시
    const donors = members.filter(m => m.roles.cache.has(DONOR_ROLE_ID));
    if (!donors.size) return "현재 후원자 없음";

    const names = donors.map(m => (m.nickname || m.user.username)).sort((a, b) => a.localeCompare(b, "ko"));
    const maxShow = 20;
    const shown = names.slice(0, maxShow).map(n => `${n}님`);
    const extra = Math.max(0, names.length - shown.length);
    return extra > 0 ? `${shown.join(", ")} 외 ${extra}인` : shown.join(", ");
  } catch {
    return "현재 후원자 없음";
  }
}

async function safeSend(channel, payload) {
  try { return await channel.send(payload); } catch { return null; }
}

// ====== 보상 지급(아이템포턴트) ======
async function payOnceDaily(kind, dateStr, userId, reason, amount) {
  // kind: "voice" | "message"
  if (!userId) return { paid: false, reason: "NO_USER" };
  if (isDailyPaid(dateStr, kind)) return { paid: false, reason: "ALREADY_PAID" };
  try {
    await addBE(userId, amount, reason);
    markDailyPaid(dateStr, kind, userId);
    return { paid: true };
  } catch {
    return { paid: false, reason: "ADD_BE_FAILED" };
  }
}
async function payOnceWeekly(kind, key, userId, reason, amount) {
  if (!userId) return { paid: false, reason: "NO_USER" };
  if (isWeeklyPaid(key, kind)) return { paid: false, reason: "ALREADY_PAID" };
  try {
    await addBE(userId, amount, reason);
    markWeeklyPaid(key, kind, userId);
    return { paid: true };
  } catch {
    return { paid: false, reason: "ADD_BE_FAILED" };
  }
}

// ====== 임베드 도움 ======
function addField(embed, name, value, inline = false) {
  try { embed.addFields({ name, value, inline }); } catch {}
}

// ====== 크론 실행 가드(중복 실행 방지) ======
let runningDaily = false;
let runningWeekly = false;

// [1] 매일 오전 9시 (한국시간) — 어제치 1위 보상
cron.schedule("0 9 * * *", async () => {
  if (runningDaily) return; runningDaily = true;
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const guild = channel.guild || null;
    const yesterday = getYesterdayKST();
    const stats = activityTracker.getStats({ from: yesterday, to: yesterday });

    // 1등 산출
    let topMsg = null, topVoice = null;
    for (const s of stats) {
      if (!topMsg || s.message > topMsg.message) topMsg = s;
      if (!topVoice || s.voice > topVoice.voice) topVoice = s;
    }

    const embed = new EmbedBuilder()
      .setColor(0x666666)
      .setTitle("📊 어제의 활동 요약")
      .setThumbnail(THUMBNAIL_URL)
      .setFooter({ text: "까리한 디스코드 | 이용량 통계", iconURL: SERVER_ICON_URL })
      .setTimestamp();

    addField(embed, "🎁 각 활동량 1등 보상", `${DAILY_REWARD.toLocaleString()} BE`, false);

    // 음성 1등
    if (topVoice && topVoice.voice > 0) {
      const name = await getDisplayName(topVoice.userId, guild);
      const pay = await payOnceDaily("voice", yesterday, topVoice.userId, "일일 음성채널 1등 보상", DAILY_REWARD);
      const payLine = pay.paid ? `\n🔷 ${DAILY_REWARD.toLocaleString()} BE 지급!` : (pay.reason === "ALREADY_PAID" ? "\n(이미 지급됨)" : "\n(지급 오류: 나중에 재시도)");
      addField(embed, "🎤 음성채널 활동 1위", `🥇 ${name}${payLine}`, false);
    } else {
      addField(embed, "🎤 음성채널 활동", "기록된 활동이 없습니다.", false);
    }

    // 채팅 1등
    if (topMsg && topMsg.message > 0) {
      const name = await getDisplayName(topMsg.userId, guild);
      const pay = await payOnceDaily("message", yesterday, topMsg.userId, "일일 채팅 1등 보상", DAILY_REWARD);
      const payLine = pay.paid ? `\n🔷 ${DAILY_REWARD.toLocaleString()} BE 지급!` : (pay.reason === "ALREADY_PAID" ? "\n(이미 지급됨)" : "\n(지급 오류: 나중에 재시도)");
      addField(embed, "💬 채팅 메시지 1위", `🥇 ${name}${payLine}`, false);
    } else {
      addField(embed, "💬 채팅 메시지", "기록된 활동이 없습니다.", false);
    }

    // 후원자 라인
    const donorLine = await buildDonorLine(guild);
    addField(embed, "💜 후원 혜택을 받는 𝕯𝖔𝖓𝖔𝖗", donorLine || "현재 후원자 없음", false);

    addField(embed, "\u200b", "🙌 활동해주신 모든 유저분들께 감사드립니다.", false);

    await safeSend(channel, { embeds: [embed] });
  } finally {
    runningDaily = false;
  }
}, { timezone: "Asia/Seoul" });

// [2] 매주 월요일 오후 9시 (한국시간) — 지난주 TOP3 및 1등 보상
cron.schedule("0 21 * * 1", async () => {
  if (runningWeekly) return; runningWeekly = true;
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const guild = channel.guild || null;
    const range = getWeekRangeKST(); // 지난주 월~일
    const stats = activityTracker.getStats({ from: range.from, to: range.to });

    const msgRank = [...stats].sort((a, b) => b.message - a.message).slice(0, 3);
    const voiceRank = [...stats].sort((a, b) => b.voice - a.voice).slice(0, 3);

    const embed = new EmbedBuilder()
      .setColor(0x666666)
      .setTitle(`📅 주간 활동 TOP 3 (${range.from} ~ ${range.to})`)
      .setThumbnail(THUMBNAIL_URL)
      .setFooter({ text: "까리한 디스코드 | 자동 통계", iconURL: SERVER_ICON_URL })
      .setTimestamp();

    addField(embed, "🎁 주간 1등 보상 안내", `각 1등 ${WEEKLY_REWARD.toLocaleString()} BE`, false);

    const podium = ["🥇", "🥈", "🥉"];

    // 주간 음성 TOP3
    let voiceStr = "기록된 활동이 없습니다.";
    if (voiceRank.length && voiceRank[0].voice > 0) {
      const lines = [];
      for (let i = 0; i < voiceRank.length; i++) {
        const u = voiceRank[i];
        const name = await getDisplayName(u.userId, guild);
        lines.push(`${podium[i] || ""} ${name} (${secToHMS(u.voice)})`);
      }
      // 1등 보상
      const key = rangeKey(range);
      const pay = await payOnceWeekly("voice", key, voiceRank[0].userId, "주간 음성채널 1등 보상", WEEKLY_REWARD);
      if (pay.paid) lines[0] += `\n🔷 ${WEEKLY_REWARD.toLocaleString()} BE 지급!`;
      else if (pay.reason === "ALREADY_PAID") lines[0] += `\n(이미 지급됨)`;
      else lines[0] += `\n(지급 오류: 나중에 재시도)`;
      voiceStr = lines.join("\n");
    }
    addField(embed, "🎤 음성채널 TOP 3", voiceStr, false);

    // 주간 채팅 TOP3
    let chatStr = "기록된 활동이 없습니다.";
    if (msgRank.length && msgRank[0].message > 0) {
      const lines = [];
      for (let i = 0; i < msgRank.length; i++) {
        const u = msgRank[i];
        const name = await getDisplayName(u.userId, guild);
        lines.push(`${podium[i] || ""} ${name} (${u.message}회)`);
      }
      // 1등 보상
      const key = rangeKey(range);
      const pay = await payOnceWeekly("message", key, msgRank[0].userId, "주간 채팅 1등 보상", WEEKLY_REWARD);
      if (pay.paid) lines[0] += `\n🔷 ${WEEKLY_REWARD.toLocaleString()} BE 지급!`;
      else if (pay.reason === "ALREADY_PAID") lines[0] += `\n(이미 지급됨)`;
      else lines[0] += `\n(지급 오류: 나중에 재시도)`;
      chatStr = lines.join("\n");
    }
    addField(embed, "💬 채팅 메시지 TOP 3", chatStr, false);

    addField(embed, "\u200b", "🙌 한 주간 활동해주신 모든 분들께 감사드립니다.", false);

    await safeSend(channel, { embeds: [embed] });
  } finally {
    runningWeekly = false;
  }
}, { timezone: "Asia/Seoul" });

module.exports = {};
