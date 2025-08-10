const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

const relationship = require("../utils/relationship.js");
const activity = require("../utils/activity-tracker.js");
const activityLogger = require("../utils/activity-logger.js");

const profilesPath = path.join(__dirname, "../data/profiles.json");
const favorPath = path.join(__dirname, "../data/favor.json");
const bePath = path.join(__dirname, "../data/BE.json");

const PLAY_STYLE_ROLES = {
  "빡겜러": "1210762363704311838",
  "즐빡겜러": "1210762298172383273",
  "즐겜러": "1210762420151394354"
};

// 🔓 비공개 무시 열람 권한(관리용 등)
const PRIVACY_BYPASS_ROLE_IDS = ["786128824365482025", "1201856430580432906"];

const readJson = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : {});
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
  const speakingScore = clamp01(voiceSec / (3600 * 400)) * 100;
  const typingScore = clamp01(msgCnt / 20000) * 100;
  const affinityScore = clamp01(distinctUsersCount / 150) * 100;
  const dayRatio = totalAct > 0 ? (dayAct / totalAct) * 100 : 0;
  const nightRatio = totalAct > 0 ? (nightAct / totalAct) * 100 : 0;
  return {
    labels: ["스피킹", "타이핑", "친화력", "주행성", "야행성"],
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

// ---- 폴백 포함: 자주 사용하는 음성채널(30일) ----
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

// ---- 폴백 포함: 자주 등장하는 시간대(30일, KST) ----
async function getFavTimeRangeText(userId, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  try {
    if (typeof activity.getDailyHourlyStats === "function") {
      const dailyHourly = activity.getDailyHourlyStats({ from, to, userId }) || {};
      const hours = {};
      for (let h = 0; h < 24; h++) hours[String(h).padStart(2, "0")] = 0;
      for (const day of Object.keys(dailyHourly)) {
        const byHour = dailyHourly[day] || {};
        for (let h = 0; h < 24; h++) {
          const hh = String(h).padStart(2, "0");
          const b = byHour[hh] || { message: 0, voice: 0 };
          const score = (b.message || 0) + (b.voice || 0) / 60;
          hours[hh] += score;
        }
      }
      const top = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0) {
        const hour = Number(top[0]);
        return `${hour}시 ~ ${((hour + 1) % 24)}시`;
      }
    }
  } catch {}

  try {
    if (typeof activity.getHourlyStats === "function") {
      const hourly = activity.getHourlyStats({ from, to, userId }) || {};
      const norm = {};
      for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, "0");
        const v = hourly[hh];
        if (typeof v === "number") norm[hh] = v;
        else {
          const score = (v?.message || 0) + (v?.voice || 0) / 60;
          norm[hh] = score;
        }
      }
      const top = Object.entries(norm).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
      if (top && (top[1] || 0) > 0) {
        const hour = Number(top[0]);
        return `${hour}시 ~ ${((hour + 1) % 24)}시`;
      }
    }
  } catch {}

  try {
    const logs = activityLogger.getUserActivities?.(userId) || [];
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const hours = new Array(24).fill(0);
    for (const l of logs) {
      if (!l || typeof l.time !== "number" || l.time < cutoff) continue;
      const kst = new Date(l.time + 9 * 3600 * 1000);
      const h = kst.getHours();
      let weight = 1;
      if (isMessageLog(l)) weight += 0.5;
      if (isVoiceLog(l)) {
        const dur = pickDurationFromLog(l);
        if (dur > 0) weight += Math.min(10, Math.round(dur / 300));
        else weight += 1;
      }
      hours[h] += weight;
    }
    const idx = hours.findIndex(v => v === Math.max(...hours));
    if (hours[idx] > 0) return `${idx}시 ~ ${(idx + 1) % 24}시`;
  } catch {}

  return "데이터 없음";
}

function hasAnyRole(member, roleIds = []) {
  if (!member) return false;
  return roleIds.some(rid => member.roles.cache.has(rid));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("프로필")
    .setDescription("유저의 프로필을 확인합니다.")
    .addUserOption(opt => opt.setName("유저").setDescription("확인할 유저 (입력 안하면 본인)").setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser("유저") || interaction.user;
    const userId = target.id;

    const profiles = readJson(profilesPath);
    const favor = readJson(favorPath);
    const be = readJson(bePath);

    // 기본 프로필 + 비공개 플래그 폴백
    const defaultProfile = { statusMsg: "", favGames: [], owTier: "", lolTier: "", steamNick: "", lolNick: "", bnetNick: "", isPrivate: false };
    const profile = { ...defaultProfile, ...(profiles[userId] || {}) };

    const viewerId = interaction.user.id;
    const isSelf = viewerId === userId;

    // 대상/열람자 멤버
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
    const viewerMember = interaction.member ?? (await interaction.guild.members.fetch(viewerId).catch(() => null));

    // 🔒 비공개 처리
    if (!isSelf && profile.isPrivate) {
      const canBypass = hasAnyRole(viewerMember, PRIVACY_BYPASS_ROLE_IDS);
      if (!canBypass) {
        await interaction.reply({ content: "해당 유저는 프로필 비공개 상태 입니다.", ephemeral: true });
        return;
      }
      // bypass 시 안내만 첨언하고 계속 진행
    }

    const playStyle = getPlayStyle(targetMember);
    const favorVal = favor[userId] ?? 0;
    const beAmount = formatAmount(be[userId]?.amount ?? 0);
    const statusMsg = `🗨️ 『${profile.statusMsg?.trim() || "상태 메시지가 없습니다."}』`;
    const joinedStr = `<t:${Math.floor((targetMember?.joinedAt || new Date()).getTime() / 1000)}:R>`;

    // 교류 TOP3
    let friendsStr = "없음";
    try {
      const rawTop = relationship?.getTopRelations ? relationship.getTopRelations(userId, 3) : [];
      const names = [];
      for (const rel of rawTop) {
        const fid = typeof rel === "string" ? rel : rel.userId ?? rel.id;
        if (!fid) continue;
        const m = await interaction.guild.members.fetch(fid).catch(() => null);
        if (m) names.push(m.displayName);
        else {
          const u = await interaction.client.users.fetch(fid).catch(() => null);
          names.push(u ? `${u.username} (탈주)` : "(탈주)");
        }
      }
      if (names.length) friendsStr = names.map(n => `• ${n}`).join("\n");
    } catch {}

    // 최근 7일 숫자
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

    // 최근 활동 이력: 1개만
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

    // 레이더 PNG
    const radar = buildRadarStats30d(userId);
    const png = renderRadarPng(radar);
    const attachment = new AttachmentBuilder(png, { name: "profile-stats.png" });

    // 🔔 비공개 우회 열람 안내 문구 구성
    const privacyNotice =
      (!isSelf && profile.isPrivate && hasAnyRole(viewerMember, PRIVACY_BYPASS_ROLE_IDS))
        ? "⚠️ 해당 유저는 프로필 비공개를 설정한 유저입니다.\n"
        : "";

    const embed = new EmbedBuilder()
      .setTitle("프로필 정보")
      .setThumbnail(target.displayAvatarURL())
      .setColor(favorVal >= 15 ? 0xff71b3 : favorVal >= 5 ? 0x82d8ff : 0xbcbcbc)
      .setDescription([
        privacyNotice + `<@${userId}> 님의 프로필`,
        statusMsg,
        `🔷 파랑 정수(BE): **${beAmount} BE**`
      ].join("\n"))
      .addFields(
        { name: "🎮 플레이 스타일", value: playStyle, inline: true },
        { name: `${getFavorEmoji(favorVal)} 호감도`, value: String(favorVal), inline: true },
        { name: "⏰ 서버 입장", value: joinedStr, inline: true },
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
        { name: "🎤 자주 사용하는 음성채널", value: favVoiceChannel, inline: false },
        { name: "⏱️ 자주 등장하는 시간대", value: favTimeRange, inline: false }
      )
      .setImage("attachment://profile-stats.png")
      .setFooter({
        text: userId === interaction.user.id ? "/프로필등록 /프로필수정 을 통해 프로필을 보강하세요!" : "혁신적 종합게임서버, 까리한디스코드",
        iconURL: interaction.client.user.displayAvatarURL()
      });

    await interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });
  }
};
