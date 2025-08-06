// utils/activity-logger.js

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../activity-logs.json');
const MAX_DAYS = 90;

// 메모리 캐시
let cache = {};
let dirty = false;

// 캐시 초기화
function loadCache() {
  if (!fs.existsSync(dataPath)) cache = {};
  else cache = JSON.parse(fs.readFileSync(dataPath));
}
loadCache();

// 90일 초과 데이터 삭제
function pruneOld(data) {
  const now = Date.now();
  for (const userId in data) {
    data[userId] = data[userId].filter(entry => (now - entry.time) < (MAX_DAYS * 24 * 60 * 60 * 1000));
    if (data[userId].length === 0) delete data[userId];
  }
}

// 비동기 저장(버퍼링)
function flush() {
  if (!dirty) return;
  pruneOld(cache);
  fs.writeFileSync(dataPath, JSON.stringify(cache, null, 2));
  dirty = false;
}

// 활동 추가
function addActivity(userId, activityType, details) {
  if (!cache[userId]) cache[userId] = [];
  cache[userId].push({ activityType, details, time: Date.now() });
  dirty = true;
}

// 활동 저장 주기(예: 5초)
setInterval(flush, 5000);

// 유저 활동 조회
function getUserActivities(userId) {
  return cache[userId] || [];
}

function removeUser(userId) {
  if (cache[userId]) {
    delete cache[userId];
    dirty = true;
  }
}

module.exports = {
  addActivity,
  getUserActivities,
  removeUser,
  pruneOld,
  flush, // 필요시 외부에서 강제 flush
};
