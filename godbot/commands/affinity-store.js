// commands/affinity-store.js (or lib/affinity-store.js)
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/affinity.json');
const LOG_PATH = path.join(__dirname, '../data/affinity-logs.json');
const LOG_LIMIT = 100;

// 메모리 캐시
let affinity = {};
let logs = {};

// 데이터 로드
function loadAll() {
  if (fs.existsSync(DATA_PATH)) affinity = JSON.parse(fs.readFileSync(DATA_PATH));
  else affinity = {};
  if (fs.existsSync(LOG_PATH)) logs = JSON.parse(fs.readFileSync(LOG_PATH));
  else logs = {};
}
loadAll();

// 배치 저장 (5초 간격)
function saveAll() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(affinity, null, 2));
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2));
}
setInterval(saveAll, 5000); // 5초마다 한 번만 저장

// affinity 레벨, 경험치, 로그 관리
function addExp(userId, amount, reason) {
  if (!affinity[userId]) affinity[userId] = { level: 0, exp: 0 };
  affinity[userId].exp += amount;
  if (affinity[userId].exp >= 100 && affinity[userId].level < 10) {
    affinity[userId].level += 1;
    affinity[userId].exp = 0;
  }
  // 로그 기록
  if (!logs[userId]) logs[userId] = [];
  logs[userId].push({
    ts: Date.now(),
    type: reason,
    desc: reason,
  });
  if (logs[userId].length > LOG_LIMIT) logs[userId] = logs[userId].slice(-LOG_LIMIT);
}

function addAction(userId, type, desc) {
  if (!logs[userId]) logs[userId] = [];
  logs[userId].push({ ts: Date.now(), type, desc });
  if (logs[userId].length > LOG_LIMIT) logs[userId] = logs[userId].slice(-LOG_LIMIT);
}

function getAffinity(userId) {
  return affinity[userId] || { level: 0, exp: 0 };
}

function getLogs(userId, n = 50) {
  return logs[userId] ? logs[userId].slice(-n).reverse() : [];
}

function getAll() {
  return affinity;
}

module.exports = {
  addExp,
  addAction,
  getAffinity,
  getLogs,
  getAll,
  // (테스트용) 강제저장
  saveAll,
};
