const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/relationship-data.json");
const LAST_INTERACTION_PATH = path.join(__dirname, "../data/relationship-last.json");

const RELATIONSHIP_LEVELS = [
  "적대3", "적대2", "적대1",
  "경계3", "경계2", "경계1",
  "무관심",
  "관심1", "관심2", "관심3",
  "우호1", "우호2", "우호3",
  "신뢰1", "신뢰2", "신뢰3",
  "애정1", "애정2", "애정3",
  "단짝"
];

const STAGE_BARRIER = [
  40, 40, 20, 20, 20, 20, 20, 20, 20, 40, 20, 20,
  40, 20, 20, 40, 20, 20, 60
];

// ✅ 관계도 데이터 안전 로딩
function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  const content = fs.readFileSync(dataPath, "utf-8").trim();
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error(`[관계도 JSON 오류] 파일이 깨졌습니다:`, e);
    try {
      fs.renameSync(dataPath, dataPath + ".bak_" + Date.now());
    } catch {}
    return {};
  }
}

// ✅ 마지막 교류 기록 안전 로딩
function loadLastInteraction() {
  if (!fs.existsSync(LAST_INTERACTION_PATH)) return {};
  const raw = fs.readFileSync(LAST_INTERACTION_PATH, "utf-8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("[관계도 마지막 교류 기록 파일 오류]", e);
    try {
      fs.renameSync(LAST_INTERACTION_PATH, LAST_INTERACTION_PATH + ".bak_" + Date.now());
    } catch {}
    return {};
  }
}

// ✅ 관계도 파일 저장 큐
let writeQueue = [];
let writing = false;

function saveData(data) {
  writeQueue.push(JSON.stringify(data, null, 2));
  processQueue();
}
function processQueue() {
  if (writing) return;
  if (writeQueue.length === 0) return;
  writing = true;
  const json = writeQueue.shift();
  fs.writeFile(dataPath, json, (err) => {
    writing = false;
    if (writeQueue.length > 0) processQueue();
  });
}

function getRelationshipLevel(score) {
  const idx = Math.max(0, Math.min(20, Math.round(score) + 6));
  return RELATIONSHIP_LEVELS[idx];
}

function getInternal(userA, userB) {
  if (userA === userB) return { stage: 6, remain: 0 };
  const data = loadData();
  return data[userA]?.[userB] ?? { stage: 6, remain: 0 };
}

function setInternal(userA, userB, obj) {
  if (userA === userB) return;
  const data = loadData();
  if (!data[userA]) data[userA] = {};
  const stage = Math.max(0, Math.min(20, obj.stage));
  data[userA][userB] = { stage, remain: obj.remain };
  saveData(data);
}

function getScore(userA, userB) {
  const { stage, remain } = getInternal(userA, userB);
  return stage - 6 + (remain || 0) / (STAGE_BARRIER[stage] || 1);
}

function setScore(userA, userB, val) {
  setInternal(userA, userB, { stage: Math.floor(val) + 6, remain: 0 });
}

function addScore(userA, userB, diff) {
  if (userA === userB) return;
  let { stage, remain } = getInternal(userA, userB);
  if (diff === 0) return;

  if (diff > 0) {
    let left = diff;
    while (left > 0 && stage < 20) {
      const barrier = STAGE_BARRIER[stage];
      const needed = barrier - remain;
      if (left < needed) {
        remain += left;
        left = 0;
      } else {
        stage += 1;
        left -= needed - remain;
        remain = 0;
      }
    }
    if (stage >= 20) remain = 0;
  } else {
    let left = -diff;
    while (left > 0 && stage > 0) {
      const barrier = STAGE_BARRIER[stage - 1];
      const needed = remain;
      if (left < needed) {
        remain -= left;
        left = 0;
      } else {
        stage -= 1;
        left -= needed;
        remain = barrier;
      }
    }
    if (stage <= 0) remain = 0;
  }

  setInternal(userA, userB, { stage, remain });
}

// ✅ 마지막 교류 기록 저장
function recordInteraction(userA, userB) {
  if (userA === userB) return;
  const log = loadLastInteraction();
  const now = Date.now();
  if (!log[userA]) log[userA] = {};
  if (!log[userB]) log[userB] = {};
  log[userA][userB] = now;
  log[userB][userA] = now;
  fs.writeFileSync(LAST_INTERACTION_PATH, JSON.stringify(log, null, 2));
}

// ✅ 자동 차감: 3일 이상 교류 없을 시
function decayRelationships(decayAmount = 0.5, thresholdMs = 1000 * 60 * 60 * 24 * 3) {
  const now = Date.now();
  const data = loadData();
  const log = loadLastInteraction();

  for (const userA in data) {
    for (const userB in data[userA]) {
      if (userA === userB) continue;
      const last = log?.[userA]?.[userB] || 0;
      if (now - last >= thresholdMs) {
        addScore(userA, userB, -decayAmount);
      }
    }
  }
}

function getRelation(userA, userB) {
  return getRelationshipLevel(getScore(userA, userB));
}

function getTopRelations(userId, n = 3) {
  const data = loadData()[userId] || {};
  return Object.entries(data)
    .sort((a, b) => (b[1].stage - a[1].stage) || (b[1].remain - a[1].remain))
    .slice(0, n)
    .map(([id, val]) => ({
      userId: id,
      stage: val.stage,
      remain: val.remain,
      relation: getRelationshipLevel(val.stage - 6)
    }));
}

function onReport(userA, userB) {}
function onStrongNegative(userA, userB) {
  addScore(userA, userB, -6);
}
function onMute(userA, userB) {
  addScore(userA, userB, -2);
}
function onPositive(userA, userB, value = 1) {
  addScore(userA, userB, value);
  recordInteraction(userA, userB);
}

module.exports = {
  getScore, setScore, addScore, getRelation, getRelationshipLevel,
  getTopRelations,
  onMute, onReport, onStrongNegative, onPositive,
  loadData, saveData,
  decayRelationships,
  recordInteraction,
  loadLastInteraction,
};
