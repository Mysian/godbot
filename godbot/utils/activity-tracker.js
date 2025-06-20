const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../activity-data.json");

// 필터 (아래 ID만 넣으면됨)
const includedCategoryIds = []; // 이 카테고리만 집계
const includedChannelIds = [];
const excludedCategoryIds = [1318529703480397954, 1318445879455125514, 1204329649530998794]; // 이 카테고리 제외
const excludedChannelIds = [];
function isTracked(channel, type = "all") {
  if (!channel) return false;
  // 메시지/음성 구분 필터
  if (type === "message") {
    if (includedCategoryIds.length && !includedCategoryIds.includes(channel.parentId)) return false;
    if (includedChannelIds.length && !includedChannelIds.includes(channel.id)) return false;
    if (excludedCategoryIds.includes(channel.parentId)) return false;
    if (excludedChannelIds.includes(channel.id)) return false;
    return true;
  }
  if (type === "voice") {
    if (includedCategoryIds.length && !includedCategoryIds.includes(channel.parentId)) return false;
    if (includedChannelIds.length && !includedChannelIds.includes(channel.id)) return false;
    if (excludedCategoryIds.includes(channel.parentId)) return false;
    if (excludedChannelIds.includes(channel.id)) return false;
    return true;
  }
  // 종합
  return isTracked(channel, "message") || isTracked(channel, "voice");
}

// { [userId]: { [date]: { message: n, voice: 초 } } }
function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath));
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}
function pruneOld(data) {
  const keepDays = 90;
  const now = new Date();
  for (const userId in data) {
    for (const dateStr of Object.keys(data[userId])) {
      const date = new Date(dateStr);
      const diff = (now - date) / (1000 * 60 * 60 * 24);
      if (diff > keepDays) delete data[userId][dateStr];
    }
    if (Object.keys(data[userId]).length === 0) delete data[userId];
  }
}

function addMessage(userId, channel) {
  if (!isTracked(channel, "message")) return;
  const today = new Date();
  const dateStr = today.toISOString().slice(0,10);
  const data = loadData();
  if (!data[userId]) data[userId] = {};
  if (!data[userId][dateStr]) data[userId][dateStr] = { message: 0, voice: 0 };
  data[userId][dateStr].message += 1;
  pruneOld(data);
  saveData(data);
}

function addVoice(userId, seconds, channel) {
  if (!isTracked(channel, "voice")) return;
  const today = new Date();
  const dateStr = today.toISOString().slice(0,10);
  const data = loadData();
  if (!data[userId]) data[userId] = {};
  if (!data[userId][dateStr]) data[userId][dateStr] = { message: 0, voice: 0 };
  data[userId][dateStr].voice += seconds;
  pruneOld(data);
  saveData(data);
}

// 기간 및 필터별 통계
function getStats({ from, to, filterType = "all", userId = null }) {
  // filterType: "all"|"message"|"voice"
  const data = loadData();
  let result = [];
  for (const uid in data) {
    if (userId && uid !== userId) continue;
    let totalMsg = 0, totalVoice = 0;
    for (const date of Object.keys(data[uid])) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      totalMsg += data[uid][date].message || 0;
      totalVoice += data[uid][date].voice || 0;
    }
    if (filterType === "message" && totalMsg === 0) continue;
    if (filterType === "voice" && totalVoice === 0) continue;
    result.push({ userId: uid, message: totalMsg, voice: totalVoice });
  }
  return result;
}

// 역할기준 등급(채팅/음성), 예시로 바로 return
function getRoleLevel({ message = 0, voice = 0 }) {
  // 여기서 자유롭게 커스텀 (예시)
  if (voice >= 3600 * 100) return "음성채팅 고인물";
  if (voice >= 3600 * 10) return "음성 매니아";
  if (message >= 5000) return "채팅 지박령";
  if (message >= 500) return "채팅 프렌드";
  return null;
}

module.exports = {
  addMessage, addVoice, getStats, getRoleLevel,
  includedCategoryIds, includedChannelIds, excludedCategoryIds, excludedChannelIds, isTracked,
};
