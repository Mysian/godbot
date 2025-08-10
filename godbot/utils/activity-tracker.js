// utils/activity-tracker.js
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/activity-data.json");

let activityData = {};

function loadData() {
  if (fs.existsSync(dataPath)) {
    try {
      activityData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch {
      activityData = {};
    }
  }
}
function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(activityData, null, 2), "utf8");
}

function getToday() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getHour() {
  return new Date().getHours().toString().padStart(2, "0"); // 00~23
}

// 오래된 데이터 삭제 (90일 이전)
function cleanOldData() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  for (const userId in activityData) {
    for (const date in activityData[userId]) {
      if (date === "total") continue;
      const dateObj = new Date(date);
      if (dateObj < cutoff) delete activityData[userId][date];
    }
  }
}

// 메시지 기록
function logMessage(userId) {
  const today = getToday();
  const hour = getHour();
  if (!activityData[userId]) activityData[userId] = {};
  if (!activityData[userId][today]) activityData[userId][today] = { message: 0, voice: 0, hourly: {}, voiceChannels: {} };
  if (!activityData[userId].total) activityData[userId].total = { message: 0, voice: 0, hourly: {}, voiceChannels: {} };

  // 날짜별
  activityData[userId][today].message++;
  if (!activityData[userId][today].hourly[hour]) activityData[userId][today].hourly[hour] = { message: 0, voice: 0 };
  activityData[userId][today].hourly[hour].message++;

  // 총합
  activityData[userId].total.message++;
  if (!activityData[userId].total.hourly[hour]) activityData[userId].total.hourly[hour] = { message: 0, voice: 0 };
  activityData[userId].total.hourly[hour].message++;

  saveData();
}

// 음성 기록 (초 단위, channelId 추가)
function logVoice(userId, channelId, seconds) {
  const today = getToday();
  const hour = getHour();
  if (!activityData[userId]) activityData[userId] = {};
  if (!activityData[userId][today]) activityData[userId][today] = { message: 0, voice: 0, hourly: {}, voiceChannels: {} };
  if (!activityData[userId].total) activityData[userId].total = { message: 0, voice: 0, hourly: {}, voiceChannels: {} };

  // 날짜별
  activityData[userId][today].voice += seconds;
  if (!activityData[userId][today].hourly[hour]) activityData[userId][today].hourly[hour] = { message: 0, voice: 0 };
  activityData[userId][today].hourly[hour].voice += seconds;

  // 날짜별 채널 기록
  if (!activityData[userId][today].voiceChannels[channelId]) activityData[userId][today].voiceChannels[channelId] = 0;
  activityData[userId][today].voiceChannels[channelId] += seconds;

  // 총합
  activityData[userId].total.voice += seconds;
  if (!activityData[userId].total.hourly[hour]) activityData[userId].total.hourly[hour] = { message: 0, voice: 0 };
  activityData[userId].total.hourly[hour].voice += seconds;

  // 총합 채널 기록
  if (!activityData[userId].total.voiceChannels[channelId]) activityData[userId].total.voiceChannels[channelId] = 0;
  activityData[userId].total.voiceChannels[channelId] += seconds;

  saveData();
}

function getStats({ days = null } = {}) {
  const result = [];
  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  for (const userId in activityData) {
    let messageCount = 0;
    let voiceTime = 0;

    if (days) {
      for (const date in activityData[userId]) {
        if (date === "total") continue;
        const dateObj = new Date(date);
        if (dateObj >= cutoff) {
          messageCount += activityData[userId][date].message || 0;
          voiceTime += activityData[userId][date].voice || 0;
        }
      }
    } else {
      messageCount = activityData[userId].total?.message || 0;
      voiceTime = activityData[userId].total?.voice || 0;
    }

    result.push({ userId, message: messageCount, voice: voiceTime });
  }
  return result;
}

function getLastActiveDate(userId) {
  if (!activityData[userId]) return null;
  const dates = Object.keys(activityData[userId]).filter((d) => d !== "total");
  if (!dates.length) return null;
  return new Date(dates.sort().pop());
}

loadData();
cleanOldData();

module.exports = {
  logMessage,
  logVoice,
  getStats,
  getLastActiveDate,
  loadData,
  saveData
};
