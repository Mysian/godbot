// utils/battleDataManager.js
const fs = require("fs");
const path = require("path");

const BATTLE_DATA_PATH = path.join(__dirname, "../data/battleData.json");

function loadBattleData() {
  try {
    if (!fs.existsSync(BATTLE_DATA_PATH)) {
      fs.writeFileSync(BATTLE_DATA_PATH, JSON.stringify({}), "utf-8");
    }
    return JSON.parse(fs.readFileSync(BATTLE_DATA_PATH, "utf-8"));
  } catch (err) {
    console.error("❌ 배틀 데이터 로딩 오류:", err);
    return {};
  }
}

function saveBattleData(data) {
  try {
    fs.writeFileSync(BATTLE_DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ 배틀 데이터 저장 오류:", err);
  }
}

function getCardBattleInfo(userId, cardId) {
  const data = loadBattleData();
  if (!data[userId]) data[userId] = {};
  if (!data[userId][cardId]) {
    data[userId][cardId] = {
      level: 1,
      exp: 0,
      wins: 0,
      losses: 0,
    };
    saveBattleData(data);
  }
  return data[userId][cardId];
}

function updateBattleResult(userId, cardId, isWin) {
  const data = loadBattleData();
  if (!data[userId]) data[userId] = {};
  if (!data[userId][cardId]) {
    data[userId][cardId] = {
      level: 1,
      exp: 0,
      wins: 0,
      losses: 0,
    };
  }

  const card = data[userId][cardId];
  card.exp += isWin ? 30 : 10;
  if (isWin) card.wins += 1;
  else card.losses += 1;

  // 레벨업 조건: 현재 레벨 * 100 이상 경험치일 경우
  const requiredExp = card.level * 100;
  if (card.exp >= requiredExp) {
    card.level += 1;
    card.exp = 0;
  }

  saveBattleData(data);
}

module.exports = {
  getCardBattleInfo,
  updateBattleResult,
};
