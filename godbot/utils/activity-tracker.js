const fs = require("fs");
const path = require("path");

const CANDIDATE_PATHS = [
  path.join(__dirname, "../data/activity-data.json"),
  path.join(__dirname, "../activity-data.json"),
  path.join(__dirname, "../data/activity.json")
];

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
  } catch (_) {
    try {
      const bak = file + ".bak";
      if (fs.existsSync(bak)) {
        const braw = fs.readFileSync(bak, "utf8");
        if (braw && braw.trim()) return JSON.parse(braw);
      }
    } catch (_) {}
    try { fs.renameSync(file, file + ".corrupt"); } catch (_) {}
    return fallback;
  }
}

function atomicWriteJSONSync(file, obj) {
  ensureDir(file);
  const json = JSON.stringify(obj, null, 2);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, file);
  try { fs.writeFileSync(file + ".bak", json); } catch (_) {}
}

function pickDataPath() {
  for (const p of CANDIDATE_PATHS) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch (_) {}
  }
  return CANDIDATE_PATHS[0];
}

let dataPath = pickDataPath();

const includedCategoryIds = [];
const includedChannelIds = [];
const excludedCategoryIds = ["1318529703480397954", "1318445879455125514", "1204329649530998794"];
const excludedChannelIds = ["1202971727915651092"];

function isTracked(channel, type = "all") {
  if (!channel) return false;
  const parentId = channel.parentId != null ? String(channel.parentId) : null;
  const channelId = channel.id != null ? String(channel.id) : null;
  if (type === "message") {
    if (includedCategoryIds.length && !includedCategoryIds.includes(parentId)) return false;
    if (includedChannelIds.length && !includedChannelIds.includes(channelId)) return false;
    if (parentId && excludedCategoryIds.includes(parentId)) return false;
    if (channelId && excludedChannelIds.includes(channelId)) return false;
    return true;
  }
  if (type === "voice") {
    if (includedCategoryIds.length && !includedCategoryIds.includes(parentId)) return false;
    if (includedChannelIds.length && !includedChannelIds.includes(channelId)) return false;
    if (parentId && excludedCategoryIds.includes(parentId)) return false;
    if (channelId && excludedChannelIds.includes(channelId)) return false;
    return true;
  }
  return isTracked(channel, "message") || isTracked(channel, "voice");
}

function loadData() {
  ensureDir(dataPath);
  return safeReadJSONSync(dataPath, {});
}
function saveData(data) {
  atomicWriteJSONSync(dataPath, data);
}

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

function pruneOld(data) {
  const keepDays = 90;
  const nowMs = nowKstMs();
  for (const userId in data) {
    for (const dateStr of Object.keys(data[userId])) {
      const diff = (nowMs - kstMidnightMs(dateStr)) / (1000 * 60 * 60 * 24);
      if (diff > keepDays) delete data[userId][dateStr];
    }
    if (Object.keys(data[userId]).length === 0) delete data[userId];
  }
}

function ensureDay(data, userId, dateStr) {
  if (!data[userId]) data[userId] = {};
  if (!data[userId][dateStr]) {
    data[userId][dateStr] = { message: 0, voice: 0, hours: {}, voiceByChannel: {}, messageByChannel: {}, hourVoiceByChannel: {}, hourMessageByChannel: {} };
  }
  const d = data[userId][dateStr];
  if (!d.hours) d.hours = {};
  if (!d.voiceByChannel) d.voiceByChannel = {};
  if (!d.messageByChannel) d.messageByChannel = {};
  if (!d.hourVoiceByChannel) d.hourVoiceByChannel = {};
  if (!d.hourMessageByChannel) d.hourMessageByChannel = {};
  return d;
}

function bumpHourBucket(dayObj, hour, kind, amount) {
  if (!dayObj.hours[hour]) dayObj.hours[hour] = { message: 0, voice: 0 };
  dayObj.hours[hour][kind] += amount;
}

function addMessage(userId, channel, at = new Date()) {
  if (!isTracked(channel, "message")) return;
  const { dateStr, hourStr } = kstParts(at);
  const data = loadData();
  const day = ensureDay(data, userId, dateStr);
  day.message += 1;
  bumpHourBucket(day, hourStr, "message", 1);
  const cid = channel?.id != null ? String(channel.id) : null;
  if (cid) {
    day.messageByChannel[cid] = (day.messageByChannel[cid] || 0) + 1;
    if (!day.hourMessageByChannel[hourStr]) day.hourMessageByChannel[hourStr] = {};
    day.hourMessageByChannel[hourStr][cid] = (day.hourMessageByChannel[hourStr][cid] || 0) + 1;
  }
  pruneOld(data);
  saveData(data);
}

function addVoice(userId, seconds, channel, at = new Date()) {
  if (!isTracked(channel, "voice")) return;
  const { dateStr, hourStr } = kstParts(at);
  const data = loadData();
  const day = ensureDay(data, userId, dateStr);
  day.voice += seconds;
  bumpHourBucket(day, hourStr, "voice", seconds);
  const cid = channel?.id != null ? String(channel.id) : null;
  if (cid) {
    day.voiceByChannel[cid] = (day.voiceByChannel[cid] || 0) + seconds;
    if (!day.hourVoiceByChannel[hourStr]) day.hourVoiceByChannel[hourStr] = {};
    day.hourVoiceByChannel[hourStr][cid] = (day.hourVoiceByChannel[hourStr][cid] || 0) + seconds;
  }
  pruneOld(data);
  saveData(data);
}

function getStats({ from, to, filterType = "all", userId = null } = {}) {
  const data = loadData();
  const result = [];
  for (const uid in data) {
    if (userId && uid !== userId) continue;
    let totalMsg = 0, totalVoice = 0;
    for (const date of Object.keys(data[uid])) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      const day = data[uid][date] || {};
      totalMsg += day.message || 0;
      totalVoice += day.voice || 0;
    }
    if (filterType === "message" && totalMsg === 0) continue;
    if (filterType === "voice" && totalVoice === 0) continue;
    result.push({ userId: uid, message: totalMsg, voice: totalVoice });
  }
  return result;
}

function getRoleLevel({ message = 0, voice = 0 }) {
  if (voice >= 3600 * 100) return "음성채팅 고인물";
  if (voice >= 3600 * 10) return "음성 매니아";
  if (message >= 5000) return "채팅 지박령";
  if (message >= 500) return "채팅 프렌드";
  return null;
}

function getLastActiveDate(userId) {
  const data = loadData();
  const userData = data[userId];
  if (!userData) return null;
  const dates = Object.keys(userData).sort().reverse();
  if (!dates.length) return null;
  return new Date(`${dates[0]}T00:00:00+09:00`);
}

function getVoiceChannelUsage({ from, to, userId = null } = {}) {
  const data = loadData();
  if (userId) {
    const user = data[userId] || {};
    const agg = {};
    for (const date of Object.keys(user)) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      const vbc = user[date].voiceByChannel || {};
      for (const cid in vbc) agg[cid] = (agg[cid] || 0) + (vbc[cid] || 0);
    }
    return agg;
  }
  const list = [];
  for (const uid in data) {
    const agg = {};
    for (const date of Object.keys(data[uid])) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      const vbc = data[uid][date].voiceByChannel || {};
      for (const cid in vbc) agg[cid] = (agg[cid] || 0) + (vbc[cid] || 0);
    }
    list.push({ userId: uid, channels: agg });
  }
  return list;
}

function getDailyHourlyStats({ from, to, userId = null } = {}) {
  const data = loadData();
  const out = {};
  const pushHour = (date, hour, kind, val) => {
    if (!out[date]) out[date] = {};
    if (!out[date][hour]) out[date][hour] = { message: 0, voice: 0 };
    out[date][hour][kind] += val;
  };
  const iterUser = (uData) => {
    for (const date of Object.keys(uData)) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      const day = uData[date] || {};
      const hours = day.hours || {};
      for (let h = 0; h < 24; h++) {
        const hh = pad2(h);
        const bucket = hours[hh] || { message: 0, voice: 0 };
        if (bucket.message) pushHour(date, hh, "message", bucket.message);
        if (bucket.voice) pushHour(date, hh, "voice", bucket.voice);
      }
    }
  };
  if (userId) iterUser(data[userId] || {}); else for (const uid in data) iterUser(data[uid]);
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
  const data = loadData();
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
      const day = data[uid][date] || {};
      let removedVoice = 0;
      let removedMsg = 0;
      const vbc = day.voiceByChannel || {};
      for (const cid of Object.keys(vbc)) {
        const scid = String(cid);
        if (isExcluded(scid)) {
          removedVoice += vbc[scid] || 0;
          delete vbc[scid];
        }
      }
      const mbc = day.messageByChannel || {};
      for (const cid of Object.keys(mbc)) {
        const scid = String(cid);
        if (isExcluded(scid)) {
          removedMsg += mbc[scid] || 0;
          delete mbc[scid];
        }
      }
      const hvbc = day.hourVoiceByChannel || {};
      for (const hour of Object.keys(hvbc)) {
        const map = hvbc[hour] || {};
        for (const cid of Object.keys(map)) {
          const scid = String(cid);
          if (isExcluded(scid)) {
            const sec = map[scid] || 0;
            if (day.hours?.[hour]) day.hours[hour].voice = Math.max(0, (day.hours[hour].voice || 0) - sec);
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
            const cnt = map[scid] || 0;
            if (day.hours?.[hour]) day.hours[hour].message = Math.max(0, (day.hours[hour].message || 0) - cnt);
            removedMsg += cnt;
            delete map[scid];
          }
        }
        if (Object.keys(map).length === 0) delete hmbc[hour];
      }
      if (removedVoice) day.voice = Math.max(0, (day.voice || 0) - removedVoice);
      if (removedMsg) day.message = Math.max(0, (day.message || 0) - removedMsg);
      if (!day.message && !day.voice && Object.keys(day.voiceByChannel || {}).length === 0 && Object.keys(day.messageByChannel || {}).length === 0) {
        delete data[uid][date];
      }
    }
    if (Object.keys(data[uid]).length === 0) delete data[uid];
  }
  saveData(data);
}

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
