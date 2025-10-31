"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");
const relationship = require("../utils/relationship.js");
const activity = require("../utils/activity-tracker.js");
const activityLogger = require("../utils/activity-logger.js");
const profilesPath = path.join(__dirname, "../data/profiles.json");
const favorPath = path.join(__dirname, "../data/favor.json");
const bePath = path.join(__dirname, "../data/BE.json");
const ratingsPath = path.join(__dirname, "../data/ratings.json");
const memosPath = path.join(__dirname, "../data/memos.json");
const cooldownPath = path.join(__dirname, "../data/favor-cooldown.json");

function addBE(userId, amount, reason) {
  const be = readJson(bePath);
  if (!be[userId]) be[userId] = { amount: 0, history: [] };
  be[userId].amount = (be[userId].amount || 0) + amount;
  (be[userId].history ||= []).push({ type: "earn", amount, reason, timestamp: Date.now() });
  writeJson(bePath, be);
}

const PLAY_STYLE_ROLES = {
  "빡겜러": "1210762363704311838",
  "즐빡겜러": "1210762298172383273",
  "즐겜러": "1210762420151394354"
};

const PRIVACY_BYPASS_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
const BASE_MEMBER_ROLE_ID = "816619403205804042";

const readJson = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : {});
const writeJson = (p, obj) => {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
};
const formatAmount = n => Number(n ?? 0).toLocaleString("ko-KR");
const formatVoice = sec => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}시간 ${m}분` : `${m}분`;
};
const getFavorEmoji = v => (v >= 15 ? "💖" : v >= 5 ? "😊" : v >= 0 ? "🤝" : "💢");
function getTierEmoji(str = "") {
  const lower = String(str || "").toLowerCase();
  if (!str) return "❔";
  if (str.includes("챌린저") || lower.includes("challenger")) return "🌟";
  if (str.includes("마스터") || lower.includes("master")) return "🔱";
  if (str.includes("다이아") || lower.includes("diamond")) return "💎";
  if (str.includes("플래") || lower.includes("plat")) return "🥈";
  if (str.includes("골드") || lower.includes("gold")) return "🥇";
  if (str.includes("실버") || lower.includes("silver")) return "🥉";
  if (str.includes("브론즈") || lower.includes("bronze")) return "🥄";
  return "🎮";
}
function getPlayStyle(member) {
  if (!member) return "미설정";
  for (const [name, id] of Object.entries(PLAY_STYLE_ROLES)) {
    if (member.roles.cache.has(id)) return name;
  }
  return "미설정";
}
const toLower = v => String(v || "").toLowerCase();
function isVoiceLog(log) {
  const t = toLower(log.activityType || log.type || log.event || "");
  return t.includes("voice");
}
function isMessageLog(log) {
  const t = toLower(log.activityType || log.type || log.event || "");
  return t.includes("message") || t.includes("chat") || t.includes("text");
}
function pickChannelIdFromLog(log) {
  return (
    log.details?.channelId ||
    log.details?.channel?.id ||
    log.channelId ||
    log.channel?.id ||
    log.details?.voiceChannelId ||
    log.details?.channel_id ||
    null
  );
}
function pickDurationFromLog(log) {
  return (
    log.details?.durationSec ??
    log.durationSec ??
    log.details?.lengthSec ??
    log.lengthSec ??
    0
  );
}
function formatActivityName(log) {
  if (!log) return "";
  if (log.activityType === "game" && log.details?.name) return log.details.name;
  if (toLower(log.activityType) === "music" && log.details?.song) {
    return `🎵 ${log.details.song} - ${log.details.artist || ""}`.trim();
  }
  if ((log.activityType || log.type) && (log.details?.name || log.name)) {
    return `${log.activityType || log.type}: ${log.details?.name || log.name}`;
  }
  return log.activityType || log.type || "활동";
}
function formatTimeString(ms) {
  const date = new Date(ms + 9 * 60 * 60 * 1000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${mi}`;
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function clampScore(x) {
  const n = Number(x);
  if (!isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}
function dayNightBuckets(hoursObj) {
  let day = 0;
  let night = 0;
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    const b = hoursObj[hh] || { message: 0, voice: 0 };
    const act = (b.message || 0) + (b.voice || 0) / 60;
    if (h >= 7 && h <= 20) day += act;
    else night += act;
  }
  return { day, night, total: day + night };
}
function buildRadarStats30d(userId) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const stat = activity.getStats?.({ from, to, userId })?.[0] || { message: 0, voice: 0 };
  const voiceSec = stat.voice || 0;
  const msgCnt = stat.message || 0;
  const dailyHourly = activity.getDailyHourlyStats?.({ from, to, userId }) || {};
  let dayAct = 0, nightAct = 0, totalAct = 0;
  for (const date of Object.keys(dailyHourly)) {
    const { day, night, total } = dayNightBuckets(dailyHourly[date] || {});
    dayAct += day;
    nightAct += night;
    totalAct += total;
  }
  const last = relationship.loadLastInteraction?.() || {};
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let distinctUsersCount = 0;
  if (last[userId]) {
    distinctUsersCount = Object.entries(last[userId]).filter(([, t]) => t >= cutoff).length;
  }
  const speakingScore = clamp01(voiceSec / (3600 * 360)) * 100;
  const typingScore = clamp01(msgCnt / 15000) * 100;
  const affinityScore = clamp01(distinctUsersCount / 130) * 100;
  const dayRatio = totalAct > 0 ? (dayAct / totalAct) * 100 : 0;
  const nightRatio = totalAct > 0 ? (nightAct / totalAct) * 100 : 0;
  return {
    labels: ["스피킹", "채팅", "포용력", "주간형", "야간형"],
    values: [Math.round(speakingScore), Math.round(typingScore), Math.round(affinityScore), Math.round(dayRatio), Math.round(nightRatio)],
  };
}
function renderRadarPng({ labels, values }) {
  const W = 1100, H = 680;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a2340";
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.55, cy = H * 0.52;
  const rMax = Math.min(W, H) * 0.40;
  const axisN = 5;
  const angles = [];
  for (let i = 0; i < axisN; i++) angles.push(-Math.PI / 2 + i * (2 * Math.PI / axisN));
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 5; ring++) {
    const rr = (rMax * ring) / 5;
    ctx.beginPath();
    for (let i = 0; i < axisN; i++) {
      const a = angles[i];
      const x = cx + rr * Math.cos(a);
      const y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  for (let i = 0; i < axisN; i++) {
    const a = angles[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rMax * Math.cos(a), cy + rMax * Math.sin(a));
    ctx.stroke();
  }
  ctx.fillStyle = "#cfe6ff";
  ctx.font = "600 32px Pretendard, Malgun Gothic, sans-serif";
  const labelRadius = rMax + 34;
  for (let i = 0; i < axisN; i++) {
    const a = angles[i];
    const rx = cx + labelRadius * Math.cos(a);
    const ry = cy + labelRadius * Math.sin(a);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labels[i], rx, ry);
  }
  const pts = values.map((v, i) => {
    const a = angles[i];
    const rr = rMax * (v / 100);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
  ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.closePath();
  ctx.fillStyle = "rgba(93, 183, 255, 0.35)";
  ctx.strokeStyle = "rgba(93, 183, 255, 0.95)";
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Pretendard, Malgun Gothic, sans-serif";
  for (let i = 0; i < axisN; i++) {
    const a = angles[i];
    const rr = rMax * (values[i] / 100);
    const x = cx + rr * Math.cos(a);
    const y = cy + rr * Math.sin(a);
    const label = `${values[i]}%`;
    const mw = ctx.measureText(label).width;
    ctx.fillText(label, x - mw / 2, y - 8);
  }
  return canvas.toBuffer("image/png");
}

async function buildProfileShareEmbed(interaction, targetUser) {
  const userId = targetUser.id;
  const profiles = readJson(profilesPath);
  const favor = readJson(favorPath);
  const be = readJson(bePath);
  const defaultProfile = { statusMsg: "", favGames: [], owTier: "", lolTier: "", steamNick: "", lolNick: "", bnetNick: "", isPrivate: false };
  const profile = { ...defaultProfile, ...(profiles[userId] || {}) };
  const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
  const playStyle = getPlayStyle(targetMember);
  const favorVal = favor[userId] ?? 0;
  const beAmount = formatAmount(be[userId]?.amount ?? 0);
  const statusMsg = `🗨️ 『${profile.statusMsg?.trim() || "상태 메시지가 없습니다."}』`;
  const joinedStr = `<t:${Math.floor((targetMember?.joinedAt || new Date()).getTime() / 1000)}:R>`;
  let recentMsg = 0, recentVoice = 0;
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const stat = activity?.getStats ? activity.getStats({ from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), userId }) : [];
    if (stat?.length) {
      recentMsg = stat[0].message ?? 0;
      recentVoice = stat[0].voice ?? 0;
    }
  } catch {}
  let recentActivitiesStr = "없거나 활동 공유를 하고 있지 않음";
  try {
    const logs = activityLogger.getUserActivities?.(userId) || [];
    logs.sort((a, b) => (b.time || 0) - (a.time || 0));
    const recentLogs = logs.slice(0, 1);
    if (recentLogs.length) {
      recentActivitiesStr = recentLogs.map(log => `• ${formatActivityName(log)} [${formatTimeString(log.time)}]`).join("\n");
    }
  } catch {
    recentActivitiesStr = "불러오기 실패";
  }
  const favVoiceChannel = await getFavVoiceChannelText(userId, interaction.guild).catch(() => "데이터 없음");
  const favTimeRange = await getFavTimeRangeText(userId).catch(() => "데이터 없음");
  const radar = buildRadarStats30d(userId);
  const png = renderRadarPng(radar);
  const attachment = new AttachmentBuilder(png, { name: "profile-stats.png" });
  const ratingFieldValue = buildRatingFieldValue(userId);
  const fields = [
    { name: "🎮 스타일", value: playStyle, inline: true },
    { name: "💗 호감도", value: String(favorVal), inline: true },
    { name: "⏰ 입장", value: joinedStr, inline: true },
    { name: "🎲 선호 게임", value: profile.favGames.length ? profile.favGames.map(g => `• ${g}`).join("\n") : "없음", inline: false },
    { name: "🟠 오버워치", value: `${getTierEmoji(profile.owTier)} ${profile.owTier || "없음"}`, inline: true },
    { name: "🔵 롤", value: `${getTierEmoji(profile.lolTier)} ${profile.lolTier || "없음"}`, inline: true },
    { name: "💻 스팀", value: profile.steamNick || "없음", inline: true },
    { name: "🔖 롤 닉네임", value: profile.lolNick || "없음", inline: true },
    { name: "🟦 배틀넷", value: profile.bnetNick || "없음", inline: true },
    { name: "📊 최근 7일 채팅", value: `${recentMsg}회`, inline: true },
    { name: "🔊 최근 7일 음성", value: formatVoice(recentVoice), inline: true },
    { name: "📝 최근 활동 이력", value: recentActivitiesStr, inline: false },
    { name: "🎤 자주 이용하는 음성채널", value: favVoiceChannel, inline: false },
    { name: "⏱️ 자주 등장하는 시간대", value: favTimeRange, inline: false },
    { name: "⭐ 유저 평가 현황", value: ratingFieldValue, inline: false },
  ];
  const embed = new EmbedBuilder()
    .setTitle("프로필 공유")
    .setThumbnail(targetUser.displayAvatarURL())
    .setColor(favorVal >= 15 ? 0xff71b3 : favorVal >= 5 ? 0x82d8ff : 0xbcbcbc)
    .setDescription([
      `<@${userId}> 님의 프로필`,
      statusMsg,
      `🔷 파랑 정수(BE): **${beAmount} BE**`
    ].join("\n"))
    .addFields(fields)
    .setImage("attachment://profile-stats.png")
    .setFooter({ text: `공유자: ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() });
  return { embeds: [embed], files: [attachment] };
}

async function buildRadarOnlyShareEmbed(interaction, targetUser) {
  const userId = targetUser.id;
  const radar = buildRadarStats30d(userId);
  const png = renderRadarPng(radar);
  const attachment = new AttachmentBuilder(png, { name: "server-radar.png" });
  const embed = new EmbedBuilder()
    .setTitle("서버 스탯 오각형")
    .setDescription(`<@${userId}> 님의 지난 30일 서버 활동 스탯`)
    .setImage("attachment://server-radar.png")
    .setColor(0x5db7ff)
    .setFooter({ text: `공유자: ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL() });
  return { embeds: [embed], files: [attachment] };
}

async function getFavVoiceChannelText(userId, guild, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    if (typeof activity.getVoiceChannelUsage === "function") {
      const stats = activity.getVoiceChannelUsage({ from, to, userId }) || {};
      const top = Object.entries(stats).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
      if (top) {
        const [chId, seconds] = top;
        return `<#${chId}> (${formatVoice(seconds || 0)})`;
      }
    }
    if (typeof activity.getVoiceTopChannels === "function") {
      const arr = activity.getVoiceTopChannels({ from, to, userId }) || [];
      if (Array.isArray(arr) && arr.length) {
        const first = arr[0];
        const chId = first.channelId || first[0];
        const seconds = first.seconds || first[1] || 0;
        if (chId) return `<#${chId}> (${formatVoice(seconds)})`;
      }
    }
  } catch {}
  try {
    const logs = activityLogger.getUserActivities?.(userId) || [];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const count = {};
    for (const l of logs) {
      if (!l || typeof l.time !== "number" || l.time < cutoff) continue;
      if (!isVoiceLog(l)) continue;
      const chId = pickChannelIdFromLog(l);
      if (!chId) continue;
      const dur = pickDurationFromLog(l);
      const weight = dur > 0 ? Math.max(1, Math.round(dur / 60)) : 1;
      count[chId] = (count[chId] || 0) + weight;
    }
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      return `<#${top[0]}> (이용 지수 ${top[1]}점)`;
    }
  } catch {}
  return "데이터 없음";
}

async function getFavTimeRangeText(userId, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const topHourLabel = (hoursMap) => {
    const top = Object.entries(hoursMap).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
    if (!top || (top[1] || 0) <= 0) return "데이터 없음";
    const hour = Number(top[0]);
    return `${hour}시 ~ ${((hour + 1) % 24)}시`;
  };
  const isWeekday = (d) => {
  const day = d.getDay();
  return day >= 1 && day <= 5;
};
const isWeekend = (d) => {
  const day = d.getDay();
  return day === 0 || day === 6;
};
  const emptyHours = () => {
    const obj = {};
    for (let h = 0; h < 24; h++) obj[String(h).padStart(2, "0")] = 0;
    return obj;
  };
  try {
    if (typeof activity.getDailyHourlyStats === "function") {
      const dailyHourly = activity.getDailyHourlyStats({ from, to, userId }) || {};
      const weekdayHours = emptyHours();
      const weekendHours = emptyHours();
      for (const dateStr of Object.keys(dailyHourly)) {
        const dateKst = new Date(`${dateStr}T00:00:00+09:00`);
        const byHour = dailyHourly[dateStr] || {};
        const bucketTarget = isWeekday(dateKst) ? weekdayHours : isWeekend(dateKst) ? weekendHours : null;
        if (!bucketTarget) continue;
        for (let h = 0; h < 24; h++) {
          const hh = String(h).padStart(2, "0");
          const b = byHour[hh] || { message: 0, voice: 0 };
          const score = (b.message || 0) + (b.voice || 0) / 60;
          bucketTarget[hh] += score;
        }
      }
      const weekdayRange = topHourLabel(weekdayHours);
      const weekendRange = topHourLabel(weekendHours);
      return `평일: ${weekdayRange}\n주말: ${weekendRange}`;
    }
  } catch {}
  try {
    const logs = activityLogger.getUserActivities?.(userId) || [];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const weekdayArr = new Array(24).fill(0);
    const weekendArr = new Array(24).fill(0);
    for (const l of logs) {
      if (!l || typeof l.time !== "number" || l.time < cutoff) continue;
      const kst = new Date(l.time + 9 * 3600 * 1000);
      const h = kst.getHours();
      const target = isWeekday(kst) ? weekdayArr : isWeekend(kst) ? weekendArr : null;
      if (!target) continue;
      let weight = 1;
      if (isMessageLog(l)) weight += 0.5;
      if (isVoiceLog(l)) {
        const dur = pickDurationFromLog(l);
        if (dur > 0) weight += Math.min(10, Math.round(dur / 300));
        else weight += 1;
      }
      target[h] += weight;
    }
    const arrTopLabel = (arr) => {
      const max = Math.max(...arr);
      if (!isFinite(max) || max <= 0) return "데이터 없음";
      const idx = arr.findIndex(v => v === max);
      return `${idx}시 ~ ${(idx + 1) % 24}시`;
    };
    const weekdayRange = arrTopLabel(weekdayArr);
    const weekendRange = arrTopLabel(weekendArr);
    return `평일: ${weekdayRange}\n주말: ${weekendRange}`;
  } catch {}
  return "데이터 없음";
}

function hasAnyRole(member, roleIds = []) {
  if (!member) return false;
  return roleIds.some(rid => member.roles.cache.has(rid));
}

const CRITERIA = [
  ["kindness", "친절함"],
  ["manners", "예절"],
  ["charm", "매력"],
  ["affinity", "친화력"],
  ["skill", "게임 실력"],
];

function summarizeRatings(targetId) {
  const store = readJson(ratingsPath);
  const data = store[targetId]?.entries || {};
  const users = Object.keys(data);
  const result = {};
  let totalAvg = 0;
  let filled = 0;
  for (const [key, label] of CRITERIA) {
    const arr = users.map(uid => Number(data[uid]?.[key] || 0)).filter(v => v > 0);
    const avg = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    result[key] = { label, avg: Number(avg.toFixed(1)), count: arr.length };
    if (arr.length) {
      totalAvg += avg;
      filled++;
    }
  }
  const overall = filled ? Number((totalAvg / filled).toFixed(1)) : 0;
  return { result, overall, totalRaters: users.length };
}

function starsFromAvg(avg) {
  const rounded = Math.round(avg);
  const filled = "★".repeat(rounded);
  const empty = "☆".repeat(5 - rounded);
  return `${filled}${empty} ${avg.toFixed(1)}점`;
}

function buildRatingFieldValue(targetId) {
  const { result, overall, totalRaters } = summarizeRatings(targetId);
  const lines = CRITERIA.map(([key]) => {
    const r = result[key] || { label: "", avg: 0, count: 0 };
    return `• ${r.label}: ${starsFromAvg(r.avg)}`;
  });
  const head = totalRaters > 0
    ? `종합 ${overall.toFixed(1)}점`
    : "아직 평가가 없습니다. 첫 평가를 남겨 보세요!";
  return `${head}\n${lines.join("\n")}`;
}

function renderBar(pct, width = 16) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  const empty = Math.max(0, width - filled);
  return `〔${"█".repeat(filled)}${"░".repeat(empty)}〕 ${p.toFixed(1)}%`;
}

async function getEligibleMemberIds(guild) {
  const role = guild.roles.cache.get(BASE_MEMBER_ROLE_ID) || await guild.roles.fetch(BASE_MEMBER_ROLE_ID).catch(() => null);
  if (role && role.members) return Array.from(role.members.keys());
  return guild.members.cache.filter(m => m.roles.cache.has(BASE_MEMBER_ROLE_ID)).map(m => m.id);
}

async function buildTop3RelationsField(interaction, targetUserId) {
  const eligible = new Set(await getEligibleMemberIds(interaction.guild));
  eligible.delete(targetUserId);
  const raw = relationship.getTopRelations?.(targetUserId, 1000) || [];
  const rows = [];
  for (const entry of raw) {
    const id = typeof entry === "string" ? entry : (entry?.userId || entry?.id || null);
    if (!id) continue;
    if (!eligible.has(id)) continue;
    const score = Number(entry?.score ?? entry?.value ?? relationship.getScore?.(targetUserId, id) ?? 0);
    if (!isFinite(score)) continue;
    rows.push({ id, score });
  }
  if (!rows.length) return "없음";
  const totalEligibleScore = rows.reduce((a, b) => a + Math.max(0, b.score), 0) || 0;
  const top3 = rows.sort((a, b) => b.score - a.score).slice(0, 3);
  const lines = [];
  for (const r of top3) {
  const member = await interaction.guild.members.fetch(r.id).catch(() => null);
  const name = member ? member.displayName : (await interaction.client.users.fetch(r.id).catch(() => null))?.username || "(탈주)";
  const pct = totalEligibleScore > 0 ? (Math.max(0, r.score) / totalEligibleScore) * 100 : 0;
  lines.push(`- ${name}\n${renderBar(pct)}`);
}
return lines.join("\n");
}

async function buildProfileView(interaction, targetUser) {
  const userId = targetUser.id;
  const profiles = readJson(profilesPath);
  const favor = readJson(favorPath);
  const be = readJson(bePath);
  const ratings = readJson(ratingsPath);
  const defaultProfile = { statusMsg: "", favGames: [], owTier: "", lolTier: "", steamNick: "", lolNick: "", bnetNick: "", isPrivate: false };
  const profile = { ...defaultProfile, ...(profiles[userId] || {}) };
  const viewerId = interaction.user.id;
  const isSelf = viewerId === userId;
  const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
  const viewerMember = interaction.member ?? (await interaction.guild.members.fetch(viewerId).catch(() => null));
  if (!isSelf && profile.isPrivate) {
    const canBypass = hasAnyRole(viewerMember, PRIVACY_BYPASS_ROLE_IDS);
    if (!canBypass) {
      return { ephemeral: true, content: "해당 유저는 프로필 비공개 상태 입니다." };
    }
  }
  const playStyle = getPlayStyle(targetMember);
  const favorVal = favor[userId] ?? 0;
  const beAmount = formatAmount(be[userId]?.amount ?? 0);
  const statusMsg = `🗨️ 『${profile.statusMsg?.trim() || "상태 메시지가 없습니다."}』`;
  const joinedStr = `<t:${Math.floor((targetMember?.joinedAt || new Date()).getTime() / 1000)}:R>`;
  const friendsStr = await buildTop3RelationsField(interaction, userId).catch(() => "없음");
  let recentMsg = 0, recentVoice = 0;
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const stat = activity?.getStats ? activity.getStats({ from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), userId }) : [];
    if (stat?.length) {
      recentMsg = stat[0].message ?? 0;
      recentVoice = stat[0].voice ?? 0;
    }
  } catch {}
  let recentActivitiesStr = "없거나 활동 공유를 하고 있지 않음";
  try {
    const logs = activityLogger.getUserActivities?.(userId) || [];
    logs.sort((a, b) => (b.time || 0) - (a.time || 0));
    const recentLogs = logs.slice(0, 1);
    if (recentLogs.length) {
      recentActivitiesStr = recentLogs.map(log => `• ${formatActivityName(log)} [${formatTimeString(log.time)}]`).join("\n");
    }
  } catch {
    recentActivitiesStr = "불러오기 실패";
  }
  const favVoiceChannel = await getFavVoiceChannelText(userId, interaction.guild).catch(() => "데이터 없음");
  const favTimeRange = await getFavTimeRangeText(userId).catch(() => "데이터 없음");
  const radar = buildRadarStats30d(userId);
  const png = renderRadarPng(radar);
  const attachment = new AttachmentBuilder(png, { name: "profile-stats.png" });
  const privacyNotice =
    (!isSelf && profile.isPrivate && hasAnyRole(viewerMember, PRIVACY_BYPASS_ROLE_IDS))
      ? "⚠️ 해당 유저는 프로필 비공개를 설정한 유저입니다.\n"
      : "";
  const ratingFieldValue = buildRatingFieldValue(userId);
  const viewerMemoText = getMemo(userId, viewerId);
  const memoFieldValue = viewerMemoText ? viewerMemoText : "등록된 메모가 없습니다.";
  const fields = [
    { name: "🎮 스타일", value: playStyle, inline: true },
    { name: `${getFavorEmoji(favorVal)} 호감도`, value: String(favorVal), inline: true },
    { name: "⏰ 입장", value: joinedStr, inline: true },
    { name: "🎲 선호 게임", value: profile.favGames.length ? profile.favGames.map(g => `• ${g}`).join("\n") : "없음", inline: false },
    { name: "🟠 오버워치", value: `${getTierEmoji(profile.owTier)} ${profile.owTier || "없음"}`, inline: true },
    { name: "🔵 롤", value: `${getTierEmoji(profile.lolTier)} ${profile.lolTier || "없음"}`, inline: true },
    { name: "💻 스팀", value: profile.steamNick || "없음", inline: true },
    { name: "🔖 롤 닉네임", value: profile.lolNick || "없음", inline: true },
    { name: "🟦 배틀넷", value: profile.bnetNick || "없음", inline: true },
    { name: "🤗 교류가 활발한 3인", value: friendsStr, inline: false },
    { name: "📊 최근 7일 채팅", value: `${recentMsg}회`, inline: true },
    { name: "🔊 최근 7일 음성", value: formatVoice(recentVoice), inline: true },
    { name: "📝 최근 활동 이력", value: recentActivitiesStr, inline: false },
    { name: "🎤 자주 이용하는 음성채널", value: favVoiceChannel, inline: false },
    { name: "⏱️ 자주 등장하는 시간대", value: favTimeRange, inline: false },
    { name: "⭐ 유저 평가 현황", value: ratingFieldValue, inline: false },
    { name: "🔒 당신에게만 보이는 메모", value: memoFieldValue, inline: false }
  ];
  const embed = new EmbedBuilder()
    .setTitle("프로필 정보")
    .setThumbnail(targetUser.displayAvatarURL())
    .setColor(favorVal >= 15 ? 0xff71b3 : favorVal >= 5 ? 0x82d8ff : 0xbcbcbc)
    .setDescription([
      privacyNotice + `<@${userId}> 님의 프로필`,
      statusMsg,
      `🔷 파랑 정수(BE): **${beAmount} BE**`
    ].join("\n"))
    .addFields(fields)
    .setImage("attachment://profile-stats.png")
    .setFooter({
      text: userId === interaction.user.id ? "/프로필등록 /프로필수정 을 통해 프로필을 보강하세요!" : "혁신적 종합게임서버, 까리한디스코드",
      iconURL: interaction.client.user.displayAvatarURL()
    });

  const viewerEntry = ratings[userId]?.entries?.[interaction.user.id] || null;
  const rateBtnLabel = viewerEntry ? "해당 유저 평가 수정하기" : "해당 유저 평가하기";
  const memoBtnLabel = viewerMemoText ? "메모 수정" : "메모하기";
  let components;
    if (isSelf) {
    const privacyLabel = profile.isPrivate ? "프로필 공개" : "프로필 비공개";
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`profile:edit|${userId}`)
          .setStyle(ButtonStyle.Primary)
          .setLabel("프로필 수정 하기"),
        new ButtonBuilder()
          .setCustomId(`profile:pv_toggle|${userId}`)
          .setStyle(ButtonStyle.Danger)
          .setLabel(privacyLabel)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`profile:share|${userId}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📣")
          .setLabel("프로필 공유"),
        new ButtonBuilder()
          .setCustomId(`profile:share_radar|${userId}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📊")
          .setLabel("서버 스탯 오각형 공유")
      )
    ];
  } else {
    components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`profile:rate|${userId}`).setStyle(ButtonStyle.Primary).setLabel(rateBtnLabel),
        new ButtonBuilder().setCustomId(`profile:memo|${userId}`).setStyle(ButtonStyle.Secondary).setLabel(memoBtnLabel)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`profile:favor+|${userId}`)
          .setStyle(ButtonStyle.Success)
          .setEmoji("♥️")
          .setLabel("호감도 지급"),
        new ButtonBuilder()
          .setCustomId(`profile:favor-|${userId}`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💔")
          .setLabel("호감도 차감")
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`profile:share|${userId}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📣")
          .setLabel("프로필 공유"),
        new ButtonBuilder()
          .setCustomId(`profile:share_radar|${userId}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📊")
          .setLabel("서버 스탯 오각형 공유")
      )
    ];
  }
  return { embeds: [embed], files: [attachment], components, ephemeral: true };
}

function upsertRating(targetId, raterId, scores) {
  const store = readJson(ratingsPath);
  if (!store[targetId]) store[targetId] = { entries: {} };
  store[targetId].entries[raterId] = {
    kindness: clampScore(scores.kindness),
    manners: clampScore(scores.manners),
    charm: clampScore(scores.charm),
    affinity: clampScore(scores.affinity),
    skill: clampScore(scores.skill),
    updatedAt: Date.now()
  };
  writeJson(ratingsPath, store);
}

function upsertMemo(targetId, authorId, text) {
  const store = readJson(memosPath);
  if (!store[targetId]) store[targetId] = {};
  store[targetId][authorId] = {
    text: String(text).slice(0, 500),
    updatedAt: Date.now(),
  };
  writeJson(memosPath, store);
  return store[targetId][authorId];
}

function getMemo(targetId, authorId) {
  const store = readJson(memosPath);
  return store[targetId]?.[authorId]?.text || null;
}

function buildEditRows(profile) {
  const buttons1 = [
    new ButtonBuilder().setCustomId('edit:statusMsg').setLabel('상태 메시지').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('edit:favGames').setLabel('선호 게임(3개)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('edit:owTier').setLabel('오버워치 티어/포지션').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('edit:lolTier').setLabel('롤 티어/포지션').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('edit:steamNick').setLabel('스팀 닉네임').setStyle(ButtonStyle.Secondary),
  ];
  const privacyLabel = profile.isPrivate ? '프로필 공개' : '프로필 비공개';
  const buttons2 = [
    new ButtonBuilder().setCustomId('edit:lolNick').setLabel('롤 닉네임#태그').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('edit:bnetNick').setLabel('배틀넷 닉네임').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('edit:togglePrivacy').setLabel(privacyLabel).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('edit:submit').setLabel('수정 완료').setStyle(ButtonStyle.Success),
  ];
  return [new ActionRowBuilder().addComponents(buttons1), new ActionRowBuilder().addComponents(buttons2)];
}

function parseFavGames(input) {
  return String(input || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("프로필")
    .setDescription("유저의 프로필을 확인합니다.")
    .addUserOption(opt => opt.setName("유저").setDescription("확인할 유저 (입력 안하면 본인)").setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser("유저") || interaction.user;
    const profiles = readJson(profilesPath);
    const isSelf = target.id === interaction.user.id;
    if (!profiles[interaction.user.id] && isSelf) {
      await startProfileRegistration(interaction);
      return;
    }
    const view = await buildProfileView(interaction, target);
    if (view.content) return await interaction.reply({ content: view.content, ephemeral: true });
    await interaction.reply({ embeds: view.embeds, files: view.files, components: view.components, ephemeral: true });

    const msg = await interaction.fetchReply().catch(() => null);
    if (!msg) return;

    const filter = i => {
      if (i.user.id !== interaction.user.id) return false;
      if (!i.customId) return false;
      return (
        i.customId === `profile:rate|${target.id}` ||
        i.customId === `profile:memo|${target.id}` ||
        i.customId === `profile:favor+|${target.id}` ||
        i.customId === `profile:favor-|${target.id}` ||
        i.customId === `profile:share|${target.id}` ||
        i.customId === `profile:share_radar|${target.id}` ||
        i.customId === `profile:edit|${target.id}` ||  
        i.customId === `profile:pv_toggle|${target.id}` || 
        i.customId.startsWith('edit:')     
      );
    };

    const collector = msg.createMessageComponentCollector({ filter, time: 10 * 60 * 1000 });

    collector.on("collect", async i => {
      if (i.customId === `profile:rate|${target.id}`) {
        const modal = new ModalBuilder().setCustomId(`profile:rate|${target.id}`).setTitle("유저 평가 입력");
        const ti = (id, label, placeholder) =>
          new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setPlaceholder(placeholder).setRequired(true);
        modal.addComponents(
          new ActionRowBuilder().addComponents(ti("r_kindness", "친절함 (1~5)", "예: 5")),
          new ActionRowBuilder().addComponents(ti("r_manners", "예절 (1~5)", "예: 4")),
          new ActionRowBuilder().addComponents(ti("r_charm", "매력 (1~5)", "예: 3")),
          new ActionRowBuilder().addComponents(ti("r_affinity", "친화력 (1~5)", "예: 5")),
          new ActionRowBuilder().addComponents(ti("r_skill", "게임 실력 (1~5)", "예: 4")),
        );
        await i.showModal(modal);

        let submitted = null;
        try {
          submitted = await i.awaitModalSubmit({
            time: 120000,
            filter: m => m.customId === `profile:rate|${target.id}` && m.user.id === interaction.user.id
          });
        } catch {}
        if (!submitted) return;

        const scores = {
          kindness: submitted.fields.getTextInputValue("r_kindness"),
          manners: submitted.fields.getTextInputValue("r_manners"),
          charm: submitted.fields.getTextInputValue("r_charm"),
          affinity: submitted.fields.getTextInputValue("r_affinity"),
          skill: submitted.fields.getTextInputValue("r_skill"),
        };
        upsertRating(target.id, interaction.user.id, scores);

        const { overall } = summarizeRatings(target.id);
        await submitted.reply({ content: `평가가 저장되었습니다. 현재 종합 ${overall.toFixed(1)}점입니다.`, ephemeral: true });

        const refreshed = await buildProfileView(interaction, target);
        await interaction.editReply({ embeds: refreshed.embeds, files: refreshed.files, components: refreshed.components });
      }

      else if (i.customId === `profile:memo|${target.id}`) {
        const modal = new ModalBuilder().setCustomId(`profile:memo|${target.id}`).setTitle("메모 입력/수정");
        const input = new TextInputBuilder()
          .setCustomId("memo_text")
          .setLabel("메모 내용 (본인만 열람, 1회성)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true)
          .setPlaceholder("메모를 입력하세요.");
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);

        let submitted = null;
        try {
          submitted = await i.awaitModalSubmit({
            time: 120000,
            filter: m => m.customId === `profile:memo|${target.id}` && m.user.id === interaction.user.id
          });
        } catch {}
        if (!submitted) return;

        const text = submitted.fields.getTextInputValue("memo_text");
        upsertMemo(target.id, interaction.user.id, text);
        await submitted.reply({ content: `메모가 저장되었습니다.\n\n당신에게만 보이는 메모: ${text}`, ephemeral: true });

        const refreshed = await buildProfileView(interaction, target);
        await interaction.editReply({ embeds: refreshed.embeds, files: refreshed.files, components: refreshed.components });
      }

      else if (i.customId === `profile:share|${target.id}`) {
        const profileRec = readJson(profilesPath)[target.id] || {};
        const isPrivate = !!profileRec.isPrivate;
        const canBypass = hasAnyRole(i.member, PRIVACY_BYPASS_ROLE_IDS);
        if (isPrivate && i.user.id !== target.id && !canBypass) {
          return i.reply({ content: "비공개 프로필은 공유할 수 없어.", ephemeral: true });
        }
        await i.deferReply({ ephemeral: true });
        const pub = await buildProfileShareEmbed(interaction, target);
        await i.channel.send({ embeds: pub.embeds, files: pub.files });
        await i.editReply({ content: "채널에 프로필을 공유했어!" });
      }
        

      else if (i.customId === `profile:share_radar|${target.id}`) {
        await i.deferReply({ ephemeral: true });
        const pub = await buildRadarOnlyShareEmbed(interaction, target);
        await i.channel.send({ embeds: pub.embeds, files: pub.files });
        await i.editReply({ content: "채널에 오각형 스탯을 공유했어!" });
      }

        else if (i.customId === `profile:pv_toggle|${target.id}`) {
  if (i.user.id !== target.id) return i.reply({ content: "본인만 사용할 수 있어.", ephemeral: true });
  const profiles = readJson(profilesPath);
  const me = profiles[target.id] || {};
  me.isPrivate = !me.isPrivate;
  profiles[target.id] = me;
  writeJson(profilesPath, profiles);
  await i.reply({ content: `설정 저장됨: 현재 상태는 **${me.isPrivate ? "비공개" : "공개"}** 입니다.`, ephemeral: true });

  const refreshed = await buildProfileView(interaction, target);
  await interaction.editReply({ embeds: refreshed.embeds, files: refreshed.files, components: refreshed.components });
}


     else if (i.customId === `profile:edit|${target.id}`) {
  if (i.user.id !== target.id) return i.reply({ content: "본인만 수정할 수 있어.", ephemeral: true });

  const profiles = readJson(profilesPath);
  const myProfile = Object.assign(
    { statusMsg: "", favGames: [], owTier: "", lolTier: "", steamNick: "", lolNick: "", bnetNick: "", isPrivate: false },
    profiles[target.id] || {}
  );

  const editEmbed = new EmbedBuilder()
    .setTitle("프로필 수정")
    .setDescription("수정할 정보를 버튼을 통해 변경할 수 있어. 변경할 항목만 골라서 수정하자.")
    .setColor(0x00bb77);

  const [row1, row2] = buildEditRows(myProfile);
  const ep = await i.reply({ embeds: [editEmbed], components: [row1, row2], ephemeral: true, fetchReply: true });

  const validIds = new Set([
    'edit:statusMsg','edit:favGames','edit:owTier','edit:lolTier','edit:steamNick','edit:lolNick','edit:bnetNick',
    'edit:togglePrivacy','edit:submit'
  ]);

  const subCollector = ep.createMessageComponentCollector({
    filter: x => x.user.id === i.user.id && x.message.id === ep.id && validIds.has(x.customId),
    time: 10 * 60 * 1000
  });

  subCollector.on('collect', async b => {
    // 저장 종료
    if (b.customId === 'edit:submit') {
      profiles[target.id] = myProfile;
      writeJson(profilesPath, profiles);
      try { await b.update({ content: '✅ 프로필 수정이 완료되었어!', embeds: [], components: [] }); } catch {}
      subCollector.stop('submitted');

      const refreshed = await buildProfileView(interaction, target);
      await interaction.editReply({ embeds: refreshed.embeds, files: refreshed.files, components: refreshed.components });
      return;
    }

    // 공개/비공개 토글
    if (b.customId === 'edit:togglePrivacy') {
      myProfile.isPrivate = !myProfile.isPrivate;
      profiles[target.id] = myProfile;
      writeJson(profilesPath, profiles);
      const [nr1, nr2] = buildEditRows(myProfile);
      await b.update({ embeds: [editEmbed], components: [nr1, nr2] });
      await i.followUp({ content: `설정 저장됨: 현재 상태는 **${myProfile.isPrivate ? '비공개' : '공개'}** 입니다.`, ephemeral: true });
      return;
    }

    // 모달 공통 생성 헬퍼
    const showModal = async (customId, title, inputId, label, preset = "", long = false, max = 30) => {
      const modal = new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(inputId)
            .setLabel(label)
            .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setMaxLength(max)
            .setValue(preset)
            .setRequired(true)
        )
      );
      await b.showModal(modal);
      return b.awaitModalSubmit({ time: 60_000, filter: m => m.user.id === i.user.id });
    };

    try {
      if (b.customId === 'edit:statusMsg') {
        const s = await showModal('modalStatusMsg','상태 메시지 수정','statusMsgInput','상태 메시지', myProfile.statusMsg || '', false, 30);
        myProfile.statusMsg = s.fields.getTextInputValue('statusMsgInput');
        await s.reply({ content: '수정 완료!', ephemeral: true });
      }
      else if (b.customId === 'edit:favGames') {
        const s = await showModal('modalFavGames','선호 게임 수정 (최대 3개)','favGamesInput','게임명 (콤마로 구분)', (myProfile.favGames||[]).join(', '), false, 50);
        myProfile.favGames = parseFavGames(s.fields.getTextInputValue('favGamesInput'));
        await s.reply({ content: '수정 완료!', ephemeral: true });
      }
      else if (b.customId === 'edit:owTier') {
        const s = await showModal('modalOwTier','오버워치 티어/포지션 수정','owTierInput','티어/포지션', myProfile.owTier || '');
        myProfile.owTier = s.fields.getTextInputValue('owTierInput');
        await s.reply({ content: '수정 완료!', ephemeral: true });
      }
      else if (b.customId === 'edit:lolTier') {
        const s = await showModal('modalLolTier','롤 티어/포지션 수정','lolTierInput','티어/포지션', myProfile.lolTier || '');
        myProfile.lolTier = s.fields.getTextInputValue('lolTierInput');
        await s.reply({ content: '수정 완료!', ephemeral: true });
      }
      else if (b.customId === 'edit:steamNick') {
        const s = await showModal('modalSteamNick','스팀 닉네임 수정','steamNickInput','스팀 닉네임', myProfile.steamNick || '');
        myProfile.steamNick = s.fields.getTextInputValue('steamNickInput');
        await s.reply({ content: '수정 완료!', ephemeral: true });
      }
      else if (b.customId === 'edit:lolNick') {
        const s = await showModal('modalLolNick','롤 닉네임#태그 수정','lolNickInput','롤 닉네임#태그', myProfile.lolNick || '');
        myProfile.lolNick = s.fields.getTextInputValue('lolNickInput');
        await s.reply({ content: '수정 완료!', ephemeral: true });
      }
      else if (b.customId === 'edit:bnetNick') {
        const s = await showModal('modalBnetNick','배틀넷 닉네임 수정','bnetNickInput','배틀넷 닉네임', myProfile.bnetNick || '');
        myProfile.bnetNick = s.fields.getTextInputValue('bnetNickInput');
        await s.reply({ content: '수정 완료!', ephemeral: true });
      }
    } catch {
      try { await i.followUp({ content: '⏳ 입력 시간이 초과되었어. 다시 시도해줘.', ephemeral: true }); } catch {}
    }
  });

  subCollector.on('end', async () => {
    try {
      const disabled = ep.components.map(row => {
        const r = ActionRowBuilder.from(row);
        r.components = r.components.map(c => ButtonBuilder.from(c).setDisabled(true));
        return r;
      });
      await ep.edit({ components: disabled });
    } catch {}
  });
}


      else if (i.customId === `profile:favor+|${target.id}` || i.customId === `profile:favor-|${target.id}`) {
        const isGive = i.customId.includes("favor+");
        const giver = interaction.user.id;
        const receiver = target.id;

        if (giver === receiver) {
          return i.reply({
            content: isGive ? "자기 자신에게는 호감도를 줄 수 없어." : "자기 자신에게는 호감도를 차감할 수 없어.",
            ephemeral: true
          });
        }

        const favor = readJson(favorPath);
        const cooldown = readJson(cooldownPath);
        const now = Date.now();

        const cdKey = (isGive ? "" : "rm_") + `${giver}_${receiver}`;
        const DAY = 24 * 60 * 60 * 1000;
        if (cooldown[cdKey] && now - cooldown[cdKey] < DAY) {
          const left = DAY - (now - cooldown[cdKey]);
          const hr = Math.floor(left / 3600000);
          const min = Math.floor((left % 3600000) / 60000);
          return i.reply({ content: `쿨타임이 남아 있어. (남은 시간: ${hr}시간 ${min}분)`, ephemeral: true });
        }

        favor[receiver] = (favor[receiver] || 0) + (isGive ? 1 : -1);
        cooldown[cdKey] = now;
        writeJson(favorPath, favor);
        writeJson(cooldownPath, cooldown);

        try {
          if (isGive) {
            relationship.onPositive(giver, receiver, 0.3);
            relationship.onPositive(receiver, giver, 0.3);
          } else {
            relationship.addScore(giver, receiver, -0.3);
          }
        } catch {}

        const reward = Math.floor(Math.random() * 2) + 1;
        addBE(giver, reward, isGive ? "호감도 지급 성공 보상" : "호감도 차감 성공 보상");

        await i.reply({
          content: isGive
            ? `<@${receiver}>에게 호감도를 1점 지급했어!\n🎁 파랑 정수 ${reward} BE를 획득했어!`
            : `<@${receiver}>의 호감도를 1점 차감했어.\n🎁 파랑 정수 ${reward} BE를 획득했어!`,
          ephemeral: true
        });

        const refreshed = await buildProfileView(interaction, target);
        await interaction.editReply({ embeds: refreshed.embeds, files: refreshed.files, components: refreshed.components });
      }
    });
  },
  buildView: buildProfileView
};
