const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/relationship-data.json");

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
  40,40,20,20,20,20,20,20,20,40,20,20,40,20,20,40,20,20,60,
];

function getRelationshipLevel(score) {
  const idx = Math.max(0, Math.min(20, Math.round(score) + 6));
  return RELATIONSHIP_LEVELS[idx];
}

function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath));
}

// 락파일 기반 직렬 저장
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

// 무관심(0) 기준: 정보가 없으면 stage=6, remain=0 리턴
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
  return getInternal(userA, userB).stage - 6 + (getInternal(userA, userB).remain || 0) / (STAGE_BARRIER[getInternal(userA, userB).stage] || 1);
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

function getRelation(userA, userB) {
  return getRelationshipLevel(getScore(userA, userB));
}
function getTopRelations(userId, n = 3) {
  const data = loadData()[userId] || {};
  const arr = Object.entries(data)
    .sort((a, b) => (b[1].stage - a[1].stage) || (b[1].remain - a[1].remain))
    .slice(0, n)
    .map(([id, val]) => ({
      userId: id,
      stage: val.stage,
      remain: val.remain,
      relation: getRelationshipLevel(val.stage - 6)
    }));
  return arr;
}
function decayRelationships(decayAmount = 0.3) {
  const data = loadData();
  let changed = false;
  for (const userA in data) {
    for (const userB in data[userA]) {
      if (data[userA][userB].stage > 6) {
        let { stage, remain } = data[userA][userB];
        let left = decayAmount;
        while (left > 0 && stage > 6) {
          const barrier = STAGE_BARRIER[stage - 1];
          if (remain < left) {
            left -= remain;
            stage -= 1;
            remain = barrier;
          } else {
            remain -= left;
            left = 0;
          }
        }
        data[userA][userB] = { stage, remain };
        changed = true;
      }
    }
  }
  if (changed) saveData(data);
}
function onReport(userA, userB) {
  /* 강퇴/잠수투표 등은 하락 없음! */
}
function onStrongNegative(userA, userB) {
  addScore(userA, userB, -6);
}
function onMute(userA, userB) {
  addScore(userA, userB, -2);
}
function onPositive(userA, userB, value = 1) {
  addScore(userA, userB, value);
}

module.exports = {
  getScore, setScore, addScore, getRelation, getRelationshipLevel,
  getTopRelations, decayRelationships,
  onMute, onReport, onStrongNegative, onPositive,
  loadData, saveData
};
