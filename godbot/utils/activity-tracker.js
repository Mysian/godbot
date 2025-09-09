// utils/activity-tracker.js (hardened & buffered)

const fs = require("fs");
const path = require("path");

// === 저장 경로 후보 ===
const CANDIDATE_PATHS = [
  path.join(__dirname, "../data/activity-data.json"),
  path.join(__dirname, "../activity-data.json"),
  path.join(__dirname, "../data/activity.json")
];

// === 경로/파일 유틸 ===
function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeReadJSONSync(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw || !raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : fallback;
  } catch (_) {
    // 손상 파일 시 .bak 우선 복구
    try {
      const bak = file + ".bak";
      if (fs.existsSync(bak)) {
        const braw = fs.readFileSync(bak, "utf8");
        if (braw && braw.trim()) return JSON.parse(braw);
      }
    } catch (_) {}
    // 그래도 실패면 손상본 격리
    try { fs.renameSync(file, file + `.corrupt.${Date.now()}`); } catch (_) {}
    return fallback;
  }
}

function atomicWriteJSONSync(file, obj) {
  ensureDir(file);
  const json = JSON.stringify(obj, null, 2);
  const tmp = file + ".tmp";
  // 같은 볼륨 내 rename 은 원자적
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, file);
  // 백업본은 best-effort
  try { fs.writeFileSync(file + ".bak", json); } catch (_) {}
}

function pickDataPath() {
  for (const p of CANDIDATE_PATHS) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch (_) {}
  }
  return CANDIDATE_PATHS[0];
}

// === 전역 상태 ===
let dataPath = pickDataPath();
let cache = null;           // { [userId]: { [YYYY-MM-DD]: DayObj } }
let dirty = false;
let flushTimer = null;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// === 추적 범위 설정 ===
const includedCategoryIds = [];
const includedChannelIds  = [];
const excludedCategoryIds = ["1318529703480397954", "1318445879455125514", "1204329649530998794"];
const excludedChannelIds  = ["1202971727915651092"];

// === 시간 유틸(KST) ===
function pad2(n) { return String(n).padStart(2, "0"); }
function kstParts(at = new Date()) {
  const base = at instanceof Date ? at : new Date(at);
  const k = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const y = k.getUTCFullYear();
  const m = pad2(k.getUTCMonth() + 1);
  const d = pad2(k.getUTCDate());
  const h = pad2(k.getUTCHours());
  return { dateStr: `${y}-${m}-${d}`, hourStr: h };
}
function nowKstMs() { return Date.now() + 9 * 60 * 60 * 1000; }
function kstMidnightMs(dateStr) { return new Date(`${dateStr}T00:00:00+09:00`).getTime(); }

// === 로딩/플러시 ===
function ensureLoaded() {
  if (cache !== null) return;
  cache = safeReadJSONSync(dataPath, {});
  normalizeAll(cache);
}

function scheduleFlushSoon() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 2000);
}
function flush() {
  if (!dirty || cache === null) return;
  try {
    pruneOld(cache);
    atomicWriteJSONSync(dataPath, cache);
    dirty = false;
  } catch (_) {
    // 실패 시 dirty 유지 -> 다음 주기에 재시도
  }
}

// 주기적 백스톱 플러시(60s)
setInterval(() => { try { flush(); } catch {} }, 60000).unref?.();

// === 스키마 정규화/안전 가드 ===
function blankDay() {
  return {
    message: 0,
    voice: 0,
    hours: {},
    voiceByChannel: {},
    messageByChannel: {},
    hourVoiceByChannel: {},
    hourMessageByChannel: {}
  };
}
function normalizeDay(d) {
  if (!d || typeof d !== "object") return blankDay();
  d.message = Number(d.message) || 0;
  d.voice   = Number(d.voice)   || 0;
  d.hours   = (d.hours && typeof d.hours === "object") ? d.hours : {};
  d.voiceByChannel       = (d.voiceByChannel && typeof d.voiceByChannel === "object") ? d.voiceByChannel : {};
  d.messageByChannel     = (d.messageByChannel && typeof d.messageByChannel === "object") ? d.messageByChannel : {};
  d.hourVoiceByChannel   = (d.hourVoiceByChannel && typeof d.hourVoiceByChannel === "object") ? d.hourVoiceByChannel : {};
  d.hourMessageByChannel = (d.hourMessageByChannel && typeof d.hourMessageByChannel === "object") ? d.hourMessageByChannel : {};
  return d;
}
function normalizeAll(data) {
  if (!data || typeof data !== "object") return;
  for (const uid of Object.keys(data)) {
    const perDay = data[uid];
    if (!perDay || typeof perDay !== "object") { delete data[uid]; continue; }
    for (const dateStr of Object.keys(perDay)) {
      if (!DATE_RE.test(dateStr)) { delete perDay[dateStr]; continue; }
      perDay[dateStr] = normalizeDay(perDay[dateStr]);
    }
    if (Object.keys(perDay).length === 0) delete data[uid];
  }
}

// === 유지 기간 관리 ===
function pruneOld(data) {
  const keepDays = 90;
  const nowMs = nowKstMs();
  for (const userId in data) {
    for (const dateStr of Object.keys(data[userId])) {
      if (!DATE_RE.test(dateStr)) { delete data[userId][dateStr]; continue; }
      const diff = (nowMs - kstMidnightMs(dateStr)) / (1000 * 60 * 60 * 24);
      if (diff > keepDays) delete data[userId][dateStr];
    }
    if (Object.keys(data[userId]).length === 0) delete data[userId];
  }
}

// === 트래킹 범위 판정 ===
function isTracked(channel, type = "all") {
  if (!channel) return false;
  const parentId  = channel.parentId != null ? String(channel.parentId) : null;
  const channelId = channel.id != null ? String(channel.id) : null;

  const commonChecks = () => {
    if (includedCategoryIds.length && !includedCategoryIds.includes(parentId)) return false;
    if (includedChannelIds.length  && !includedChannelIds.includes(channelId)) return false;
    if (parentId && excludedCategoryIds.includes(parentId)) return false;
    if (channelId && excludedChannelIds.includes(channelId)) return false;
    return true;
  };

  if (type === "message") return commonChecks();
  if (type === "voice")   return commonChecks();
  return isTracked(channel, "message") || isTracked(channel, "voice");
}

// === 내부 조작 유틸 ===
function ensureDay(data, userId, dateStr) {
  if (!data[userId]) data[userId] = {};
  if (!data[userId][dateStr]) data[userId][dateStr] = blankDay();
  data[userId][dateStr] = normalizeDay(data[userId][dateStr]);
  return data[userId][dateStr];
}

function bumpHourBucket(dayObj, hour, kind, amount) {
  if (!dayObj.hours[hour]) dayObj.hours[hour] = { message: 0, voice: 0 };
  dayObj.hours[hour][kind] += amount;
}

// === 공개 API ===
function addMessage(userId, channel, at = new Date()) {
  if (!userId) return;
  if (!isTracked(channel, "message")) return;
  ensureLoaded();

  const { dateStr, hourStr } = kstParts(at);
  const day = ensureDay(cache, String(userId), dateStr);

  day.message += 1;
  bumpHourBucket(day, hourStr, "message", 1);

  const cid = channel?.id != null ? String(channel.id) : null;
  if (cid) {
    day.messageByChannel[cid] = (day.messageByChannel[cid] || 0) + 1;
    if (!day.hourMessageByChannel[hourStr]) day.hourMessageByChannel[hourStr] = {};
    day.hourMessageByChannel[hourStr][cid] = (day.hourMessageByChannel[hourStr][cid] || 0) + 1;
  }

  pruneOld(cache);
  dirty = true;
  scheduleFlushSoon();
}

function addVoice(userId, seconds, channel, at = new Date()) {
  if (!userId) return;
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  if (!isTracked(channel, "voice")) return;
  ensureLoaded();

  const { dateStr, hourStr } = kstParts(at);
  const day = ensureDay(cache, String(userId), dateStr);

  day.voice += seconds;
  bumpHourBucket(day, hourStr, "voice", seconds);

  const cid = channel?.id != null ? String(channel.id) : null;
  if (cid) {
    day.voiceByChannel[cid] = (day.voiceByChannel[cid] || 0) + seconds;
    if (!day.hourVoiceByChannel[hourStr]) day.hourVoiceByChannel[hourStr] = {};
    day.hourVoiceByChannel[hourStr][cid] = (day.hourVoiceByChannel[hourStr][cid] || 0) + seconds;
  }

  pruneOld(cache);
  dirty = true;
  scheduleFlushSoon();
}

function getStats({ from, to, filterType = "all", userId = null } = {}) {
  ensureLoaded();
  const result = [];
  const data = cache;

  for (const uid in data) {
    if (userId && uid !== userId) continue;
    let totalMsg = 0, totalVoice = 0;

    for (const date of Object.keys(data[uid])) {
      if (!DATE_RE.test(date)) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;

      const day = data[uid][date] || {};
      totalMsg   += Number(day.message) || 0;
      totalVoice += Number(day.voice)   || 0;
    }

    if (filterType === "message" && totalMsg === 0) continue;
    if (filterType === "voice"   && totalVoice === 0) continue;

    result.push({ userId: uid, message: totalMsg, voice: totalVoice });
  }
  return result;
}

function getRoleLevel({ message = 0, voice = 0 }) {
  if (voice   >= 3600 * 100) return "음성채팅 고인물";
  if (voice   >= 3600 * 10)  return "음성 매니아";
  if (message >= 5000)       return "채팅 지박령";
  if (message >= 500)        return "채팅 프렌드";
  return null;
}

function getLastActiveDate(userId) {
  ensureLoaded();
  const userData = cache[String(userId)];
  if (!userData) return null;
  const dates = Object.keys(userData).filter(d => DATE_RE.test(d)).sort().reverse();
  if (!dates.length) return null;
  return new Date(`${dates[0]}T00:00:00+09:00`);
}

function getVoiceChannelUsage({ from, to, userId = null } = {}) {
  ensureLoaded();
  const data = cache;

  if (userId) {
    const user = data[String(userId)] || {};
    const agg = {};
    for (const date of Object.keys(user)) {
      if (!DATE_RE.test(date)) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;
      const vbc = user[date].voiceByChannel || {};
      for (const cid in vbc) agg[cid] = (agg[cid] || 0) + (Number(vbc[cid]) || 0);
    }
    return agg;
  }

  const list = [];
  for (const uid in data) {
    const agg = {};
    for (const date of Object.keys(data[uid])) {
      if (!DATE_RE.test(date)) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;
      const vbc = data[uid][date].voiceByChannel || {};
      for (const cid in vbc) agg[cid] = (agg[cid] || 0) + (Number(vbc[cid]) || 0);
    }
    list.push({ userId: uid, channels: agg });
  }
  return list;
}

function getDailyHourlyStats({ from, to, userId = null } = {}) {
  ensureLoaded();
  const data = cache;
  const out = {};

  const pushHour = (date, hour, kind, val) => {
    if (!out[date]) out[date] = {};
    if (!out[date][hour]) out[date][hour] = { message: 0, voice: 0 };
    out[date][hour][kind] += val;
  };
  const iterUser = (uData) => {
    for (const date of Object.keys(uData)) {
      if (!DATE_RE.test(date)) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;
      const day = uData[date] || {};
      const hours = day.hours || {};
      for (let h = 0; h < 24; h++) {
        const hh = pad2(h);
        const bucket = hours[hh] || { message: 0, voice: 0 };
        const m = Number(bucket.message) || 0;
        const v = Number(bucket.voice)   || 0;
        if (m) pushHour(date, hh, "message", m);
        if (v) pushHour(date, hh, "voice", v);
      }
    }
  };
  if (userId) iterUser(data[String(userId)] || {});
  else for (const uid in data) iterUser(data[uid]);

  return out;
}

function buildChannelIndexFromGuild(guild) {
  const idx = {};
  guild?.channels?.cache?.forEach((c) => {
    idx[String(c.id)] = { parentId: c.parentId != null ? String(c.parentId) : null };
  });
  return idx;
}

function purgeExcludedHistory(channelIndex) {
  ensureLoaded();
  const data = cache;

  const isExcluded = (cid) => {
    if (!cid) return false;
    if (excludedChannelIds.includes(cid)) return true;
    const parentId = channelIndex?.[cid]?.parentId ? String(channelIndex[cid].parentId) : null;
    if (parentId && excludedCategoryIds.includes(parentId)) return true;
    return false;
  };

  for (const uid in data) {
    const dates = Object.keys(data[uid]);
    for (const date of dates) {
      if (!DATE_RE.test(date)) { delete data[uid][date]; continue; }
      const day = normalizeDay(data[uid][date]);

      let removedVoice = 0;
      let removedMsg = 0;

      const vbc = day.voiceByChannel || {};
      for (const cid of Object.keys(vbc)) {
        const scid = String(cid);
        if (isExcluded(scid)) {
          removedVoice += Number(vbc[scid]) || 0;
          delete vbc[scid];
        }
      }

      const mbc = day.messageByChannel || {};
      for (const cid of Object.keys(mbc)) {
        const scid = String(cid);
        if (isExcluded(scid)) {
          removedMsg += Number(mbc[scid]) || 0;
          delete mbc[scid];
        }
      }

      const hvbc = day.hourVoiceByChannel || {};
      for (const hour of Object.keys(hvbc)) {
        const map = hvbc[hour] || {};
        for (const cid of Object.keys(map)) {
          const scid = String(cid);
          if (isExcluded(scid)) {
            const sec = Number(map[scid]) || 0;
            if (day.hours?.[hour]) day.hours[hour].voice = Math.max(0, (Number(day.hours[hour].voice) || 0) - sec);
            removedVoice += sec;
            delete map[scid];
          }
        }
        if (Object.keys(map).length === 0) delete hvbc[hour];
      }

      const hmbc = day.hourMessageByChannel || {};
      for (const hour of Object.keys(hmbc)) {
        const map = hmbc[hour] || {};
        for (const cid of Object.keys(map)) {
          const scid = String(cid);
          if (isExcluded(scid)) {
            const cnt = Number(map[scid]) || 0;
            if (day.hours?.[hour]) day.hours[hour].message = Math.max(0, (Number(day.hours[hour].message) || 0) - cnt);
            removedMsg += cnt;
            delete map[scid];
          }
        }
        if (Object.keys(map).length === 0) delete hmbc[hour];
      }

      if (removedVoice) day.voice   = Math.max(0, (Number(day.voice)   || 0) - removedVoice);
      if (removedMsg)   day.message = Math.max(0, (Number(day.message) || 0) - removedMsg);

      if (
        !day.message && !day.voice &&
        Object.keys(day.voiceByChannel || {}).length === 0 &&
        Object.keys(day.messageByChannel || {}).length === 0 &&
        Object.keys(day.hourVoiceByChannel || {}).length === 0 &&
        Object.keys(day.hourMessageByChannel || {}).length === 0
      ) {
        delete data[uid][date];
      }
    }
    if (Object.keys(data[uid]).length === 0) delete data[uid];
  }

  dirty = true;
  flush(); // 정리 직후 바로 저장 시도
}

// === 프로세스 종료 훅 ===
process.on("exit", () => { try { flush(); } catch {} });
process.on("SIGINT",  () => { try { flush(); } finally { process.exit(); } });
process.on("SIGTERM", () => { try { flush(); } finally { process.exit(); } });

// === exports ===
module.exports = {
  addMessage,
  addVoice,
  getStats,
  getRoleLevel,
  includedCategoryIds,
  includedChannelIds,
  excludedCategoryIds,
  excludedChannelIds,
  isTracked,
  getLastActiveDate,
  getVoiceChannelUsage,
  getDailyHourlyStats,
  buildChannelIndexFromGuild,
  purgeExcludedHistory
};
