
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "battle-state.json");

function loadBattleState() {
  if (!fs.existsSync(DATA_FILE)) {
    return {};
  }
  const data = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(data);
}

function saveBattleState(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getBattle(userId) {
  const data = loadBattleState();
  return data[userId];
}

function setBattle(userId, battleData) {
  const data = loadBattleState();
  data[userId] = battleData;
  saveBattleState(data);
}

function removeBattle(userId) {
  const data = loadBattleState();
  delete data[userId];
  saveBattleState(data);
}

module.exports = {
  getBattle,
  setBattle,
  removeBattle,
  loadBattleState,
  saveBattleState,
};
