// utils/activity-logger.js

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../activity-logs.json');

// 90일만 기록
const MAX_DAYS = 90;

// 데이터 로드
function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath));
}

// 데이터 저장
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// 90일 초과 데이터 삭제
function pruneOld(data) {
  const now = Date.now();
  for (const userId in data) {
    data[userId] = data[userId].filter(entry => {
      return (now - entry.time) < (MAX_DAYS * 24 * 60 * 60 * 1000);
    });
    if (data[userId].length === 0) delete data[userId];
  }
}

// 활동 추가 (game/music 등)
function addActivity(userId, activityType, details) {
  const data = loadData();
  if (!data[userId]) data[userId] = [];
  data[userId].push({
    activityType, // 'game', 'music'
    details,      // {name, song, artist, ...}
    time: Date.now()
  });
  pruneOld(data);
  saveData(data);
}

// 유저의 모든 활동 내역 조회 (90일 내)
function getUserActivities(userId) {
  const data = loadData();
  return data[userId] || [];
}

// 유저가 서버 나갈 때 호출해서 데이터 삭제
function removeUser(userId) {
  const data = loadData();
  if (data[userId]) {
    delete data[userId];
    saveData(data);
  }
}

module.exports = {
  addActivity,
  getUserActivities,
  removeUser,
  pruneOld, // 필요하면 외부에서 호출 가능
};
