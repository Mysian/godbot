const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/draw-limits.json");

// 파일 읽기
function loadDrawData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}), "utf-8");
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

// 파일 저장
function saveDrawData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// 현재 뽑기 횟수 가져오기
function getCurrentDrawCount(userId) {
  const data = loadDrawData();
  const entry = data[userId];

  if (!entry) return 0;

  const now = Date.now();
  if (now - entry.lastReset > 24 * 60 * 60 * 1000) {
    return 0;
  }

  return entry.count;
}

// 뽑기 가능 여부
function canDraw(userId, maxDraws) {
  return getCurrentDrawCount(userId) < maxDraws;
}

// 뽑기 횟수 증가
function incrementDrawCount(userId) {
  const data = loadDrawData();
  const now = Date.now();

  if (!data[userId] || now - data[userId].lastReset > 24 * 60 * 60 * 1000) {
    data[userId] = {
      count: 1,
      lastReset: now,
    };
  } else {
    data[userId].count += 1;
  }

  saveDrawData(data);
}

module.exports = {
  getCurrentDrawCount,
  canDraw,
  incrementDrawCount,
};
