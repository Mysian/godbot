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

// 반드시 21개 (0~20)
const STAGE_BARRIER = [
  40, 40, 20, 20, 20, 20, 20, 20, 20, 40, 20, 20,
  40, 20, 20, 40, 20, 20, 60, 60, 60
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

// 20 초과시 "단짝 N.N" 등급 표기
function getRelationshipLevel(score) {
  const raw = score + 6;
  if (raw <= 20) {
    const idx = Math.max(0, Math.floor(raw));
    return RELATIONSHIP_LEVELS[idx];
  } else {
    const over = (raw - 20).toFixed(1);
    return `단짝 ${over}`;
  }
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
  const barrier = STAGE_BARRIER[stage] || 1;
  return parseFloat((stage - 6 + (remain / barrier)).toFixed(4));
}

function setScore(userA, userB, val) {
  setInternal(userA, userB, { stage: Math.floor(val) + 6, remain: 0 });
}

// ★ 핵심 패치: 단짝(20) 이후에도 remain 계속 누적 (score 무제한 증가)
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
        left -= needed;
        remain = 0;
      }
    }
    if (stage >= 20) {
      remain += left; // barrier 이상이 되어도 무한 누적
    }
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
        addScore(userA, userB, -decayAmount);
      }
    }
  }
}

/**
 * ✅ 서버를 나간 유저(길드에 존재하지 않는 ID)와의 관계/교류를 자동 삭제
 * - guild: Discord.Guild 인스턴스 (guild.members.fetch() 사용)
 */
async function cleanupLeftMembers(guild) {
  try {
    const members = await guild.members.fetch();
    const existingIds = new Set(members.map(m => m.id));

    // 관계도 정리
    for (const userA of Object.keys(data)) {
      // userA 자체가 나간 경우 전체 삭제
      if (!existingIds.has(userA)) {
        delete data[userA];
        delete lastInteraction[userA];
        continue;
      }

      // userA는 남아있고, 상대 userB가 나간 경우만 정리
      for (const userB of Object.keys(data[userA])) {
        if (!existingIds.has(userB) || userA === userB) {
          delete data[userA][userB];
        }
      }

      // 비어있으면 가지치기
      if (Object.keys(data[userA]).length === 0) {
        delete data[userA];
      }
    }

    // 마지막 교류 정리 (상대만 사라진 경우)
    for (const userA of Object.keys(lastInteraction)) {
      if (!existingIds.has(userA)) {
        delete lastInteraction[userA];
        continue;
      }
      for (const userB of Object.keys(lastInteraction[userA])) {
        if (!existingIds.has(userB) || userA === userB) {
          delete lastInteraction[userA][userB];
        }
      }
      if (Object.keys(lastInteraction[userA]).length === 0) {
        delete lastInteraction[userA];
      }
    }

    saveData();
    saveLastInteraction();
  } catch (e) {
    console.error("❌ 멤버 정리 실패", e);
  }
}

/**
 * ✅ 유지보수 편의 함수
 * - 길드 기준으로 나간 유저 데이터 정리 → 점수 감소(감쇠) 순서로 실행
 * - 사용 예: setInterval(() => maintainRelationships(guild), 1000 * 60 * 10)
 */
async function maintainRelationships(guild, opts = {}) {
  const { decayAmount = 0.5, thresholdMs = 1000 * 60 * 60 * 24 * 3 } = opts;
  if (guild) {
    await cleanupLeftMembers(guild);
  }
  decayRelationships(decayAmount, thresholdMs);
}

function getRelation(userA, userB) {
  return getRelationshipLevel(getScore(userA, userB));
}

function getTopRelations(userId, n = 3) {
  const entries = data[userId] || {};
  return Object.entries(entries)
    .sort((a, b) => (getScore(userId, b[0]) - getScore(userId, a[0])))
    .slice(0, n)
    .map(([id]) => ({
      userId: id,
      score: getScore(userId, id),
      relation: getRelationshipLevel(getScore(userId, id))
    }));
}

function getAllScores() {
  const results = [];
  for (const userA in data) {
    for (const userB in data[userA]) {
      if (userA === userB) continue;
      const score = getScore(userA, userB);
      results.push({ userA, userB, score });
    }
  }
  return results;
}

function onPositive(userA, userB, value = 1) {
  addScore(userA, userB, value);
  recordInteraction(userA, userB);
}

function onStrongNegative(userA, userB) {
  addScore(userA, userB, -6);
}

function onMute(userA, userB) {
  addScore(userA, userB, -2);
}

function onReport(userA, userB) {}

module.exports = {
  // 점수/등급
  getScore,
  setScore,
  addScore,
  getRelation,
  getRelationshipLevel,
  getTopRelations,
  getAllScores,

  // 이벤트 훅
  onMute,
  onReport,
  onStrongNegative,
  onPositive,

  // 유지보수/저장
  loadData: () => data,
  saveData,
  decayRelationships,
  recordInteraction,
  loadLastInteraction: () => lastInteraction,

  // 🔥 나간 유저 정리 & 통합 유지보수
  cleanupLeftMembers,
  maintainRelationships,
};
