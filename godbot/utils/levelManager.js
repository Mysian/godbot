const fs = require("fs");
const path = require("path");

const LEVEL_FILE = path.join(__dirname, "..", "data", "level-data.json");

function loadLevelData() {
  if (!fs.existsSync(LEVEL_FILE)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(LEVEL_FILE, "utf-8"));
}

function saveLevelData(data) {
  fs.writeFileSync(LEVEL_FILE, JSON.stringify(data, null, 2));
}

function getCardKey(card) {
  return `${card.character}_${card.element}_${card.grade}`;
}

function addExperience(userId, card, isWin) {
  const data = loadLevelData();
  const key = getCardKey(card);
  const userData = data[userId] || {};
  const cardData = userData[key] || { exp: 0, level: 1 };

  const expGain = isWin ? 10 : 4; // 승리 시 10exp, 패배 시 4exp
  cardData.exp += expGain;

  const nextLevelExp = cardData.level * 20;

  let leveledUp = false;
  if (cardData.exp >= nextLevelExp) {
    cardData.exp -= nextLevelExp;
    cardData.level += 1;
    leveledUp = true;
  }

  userData[key] = cardData;
  data[userId] = userData;
  saveLevelData(data);

  return { level: cardData.level, exp: cardData.exp, leveledUp };
}

function getCardLevel(userId, card) {
  const data = loadLevelData();
  const key = getCardKey(card);
  const userData = data[userId] || {};
  const cardData = userData[key] || { exp: 0, level: 1 };
  return cardData;
}

module.exports = {
  addExperience,
  getCardLevel,
};
