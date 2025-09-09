// utils/activity-logger.js (hardened)

const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../activity-logs.json');
const MAX_DAYS = 90;

// 메모리 캐시
let cache = {};
let dirty = false;

// 안전 로드(손상 파일 대비)
function loadCache() {
  try {
    if (!fs.existsSync(dataPath)) { cache = {}; return; }
    const raw = fs.readFileSync(dataPath, 'utf8');
    cache = raw && raw.trim() ? JSON.parse(raw) : {};
    if (typeof cache !== 'object' || cache === null) cache = {};
  } catch (e) {
    // 손상 파일 백업 후 초기화
    try { fs.renameSync(dataPath, dataPath + `.corrupt.${Date.now()}`); } catch {}
    cache = {};
  }
}
loadCache();

// 90일 초과 데이터 삭제(배열 보장)
function pruneOld(data) {
  const now = Date.now();
  for (const userId in data) {
    if (!Array.isArray(data[userId])) { delete data[userId]; continue; }
    data[userId] = data[userId].filter(entry => {
      const t = Number(entry?.time);
      return Number.isFinite(t) && (now - t) < (MAX_DAYS * 24 * 60 * 60 * 1000);
    });
    if (data[userId].length === 0) delete data[userId];
  }
}

// 원자적 쓰기: tmp → rename
function atomicWrite(filePath, jsonStr) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, jsonStr);
  fs.renameSync(tmp, filePath);
}

// 1분마다 비동기 저장(버퍼링)
function flush() {
  if (!dirty) return;
  try {
    pruneOld(cache);
    atomicWrite(dataPath, JSON.stringify(cache, null, 2));
    dirty = false;
  } catch (e) {
    // 실패 시 다음 주기에 재시도되도록 dirty 유지
  }
}

// 활동 추가
function addActivity(userId, activityType, details) {
  if (!userId || typeof userId !== 'string') return; // 방어
  if (!cache[userId]) cache[userId] = [];
  cache[userId].push({ activityType, details, time: Date.now() });
  dirty = true;
}

// 1분(60,000ms)마다 저장
setInterval(flush, 60000).unref?.();

// 유저 활동 조회
function getUserActivities(userId) {
  return Array.isArray(cache[userId]) ? cache[userId] : [];
}

// 유저 데이터 삭제
function removeUser(userId) {
  if (cache[userId]) {
    delete cache[userId];
    dirty = true;
  }
}

// 서버 종료/재시작 시 강제 저장(동기)
process.on('exit', () => { try { flush(); } catch {} });
process.on('SIGINT', () => { try { flush(); } finally { process.exit(); } });
process.on('SIGTERM', () => { try { flush(); } finally { process.exit(); } });

module.exports = {
  addActivity,
  getUserActivities,
  removeUser,
  pruneOld,
  flush,
};
