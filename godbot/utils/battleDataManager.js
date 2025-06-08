
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data");

function getUserData(userId) {
  const file = path.join(dataPath, `${userId}.json`);
  if (!fs.existsSync(file)) {
    return { id: userId, cards: [], battles: { win: 0, lose: 0 } };
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveUserData(userId, data) {
  const file = path.join(dataPath, `${userId}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function recordBattle(userId, result, cardId) {
  const data = getUserData(userId);
  if (!data.battles) data.battles = { win: 0, lose: 0 };
  if (result === "win") data.battles.win += 1;
  else if (result === "lose") data.battles.lose += 1;

  const card = data.cards.find(c => c.id === cardId);
  if (card) {
    if (!card.exp) card.exp = 0;
    if (!card.level) card.level = 1;
    card.exp += result === "win" ? 50 : 20;
    const required = card.level * 100;
    if (card.exp >= required) {
      card.level += 1;
      card.exp = 0;
    }
  }
  saveUserData(userId, data);
}

module.exports = { recordBattle, getUserData };
