// utils/relationship.js
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

let data = {};
let lastInteraction = {};

// ✅ 최초 로딩
(function init() {
  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, "utf-8").trim();
      if (raw) data = JSON.parse(raw);
    }
  } catch (e) {
    console.error("[관계도 JSON 오류]", e);
    try {
      fs.renameSync(dataPath, dataPath + ".bak_" + Date.now());
    } catch {}
    data = {};
  }

  try {
    if (fs.existsSync(LAST_INTERACTION_PATH)) {
      const raw = fs.readFileSync(LAST_INTERACTION_PATH, "utf-8").trim();
      if (raw) lastInteraction = JSON.parse(raw);
    }
  } catch (e) {
    console.error("[마지막 교류 JSON 오류]", e);
    try {
      fs.renameSync(LAST_INTERACTION_PATH, LAST_INTERACTION_PATH + ".bak_" + Date.now());
    } catch {}
    lastInteraction = {};
  }
})();

function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("❌ 관계도 저장 실패", e);
  }
}

function saveLastInteraction() {
  try {
    fs.writeFileSync(LAST_INTERACTION_PATH, JSON.stringify(lastInteraction, null, 2));
  } catch (e) {
    console.error("❌ 마지막 교류 저장 실패", e);
  }
}

function getRelationshipLevel(score) {
  const idx = Math.max(0, Math.min(20, Math.round(score) + 6));
  return RELATIONSHIP_LEVELS[idx];
}

function getInternal(userA, userB) {
  if (userA === userB) return { stage: 6, remain: 0 };
  return data[userA]?.[userB] ?? { stage: 6, remain: 0 };
}

function setInternal(userA, userB, obj) {
  if (userA === userB) return;
  if (!data[userA]) data[userA] = {};
  const stage = Math.max(0, Math.min(20, obj.stage));
  data[userA][userB] = { stage, remain: obj.remain };
  saveData();
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

function recordInteraction(userA, userB) {
  if (userA === userB) return;
  const now = Date.now();
  if (!lastInteraction[userA]) lastInteraction[userA] = {};
  if (!lastInteraction[userB]) lastInteraction[userB] = {};
  lastInteraction[userA][userB] = now;
  lastInteraction[userB][userA] = now;
  saveLastInteraction();
}

function decayRelationships(decayAmount = 0.5, thresholdMs = 1000 * 60 * 60 * 24 * 3) {
  const now = Date.now();
  for (const userA in data) {
    for (const userB in data[userA]) {
      if (userA === userB) continue;
      const last = lastInteraction?.[userA]?.[userB] || 0;
      if (now - last >= thresholdMs) {
        addScore(userA, userB, -decayAmount * (STAGE_BARRIER[getInternal(userA, userB).stage] || 20));
      }
    }
  }
}

function getRelation(userA, userB) {
  return getRelationshipLevel(getScore(userA, userB));
}

function getTopRelations(userId, n = 3) {
  const entries = data[userId] || {};
  return Object.entries(entries)
    .sort((a, b) => (b[1].stage - a[1].stage) || (b[1].remain - a[1].remain))
    .slice(0, n)
    .map(([id, val]) => ({
      userId: id,
      stage: val.stage,
      remain: val.remain,
      relation: getRelationshipLevel(val.stage - 6)
    }));
}

// ✅ 우정도 보정된 실제 상승 로직
function onPositive(userA, userB, value = 1) {
  const { stage } = getInternal(userA, userB);
  const barrier = STAGE_BARRIER[stage] || 20;
  const actual = value * barrier;
  addScore(userA, userB, actual);
  recordInteraction(userA, userB);
}
function onStrongNegative(userA, userB) {
  const { stage } = getInternal(userA, userB);
  const barrier = STAGE_BARRIER[stage] || 20;
  const actual = -6 * barrier;
  addScore(userA, userB, actual);
  recordInteraction(userA, userB);
}
function onMute(userA, userB) {
  const { stage } = getInternal(userA, userB);
  const barrier = STAGE_BARRIER[stage] || 20;
  const actual = -2 * barrier;
  addScore(userA, userB, actual);
  recordInteraction(userA, userB);
}
function onReport(userA, userB) {}

module.exports = {
  getScore, setScore, addScore, getRelation, getRelationshipLevel,
  getTopRelations,
  onMute, onReport, onStrongNegative, onPositive,
  loadData: () => data,
  saveData,
  decayRelationships,
  recordInteraction,
  loadLastInteraction: () => lastInteraction,
};
