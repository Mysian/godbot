// battle-system/battle-storage.js
const fs = require('fs');
const path = require('path');

const usersPath = path.join(__dirname, '../data/champion-users.json');
const recordsPath = path.join(__dirname, '../data/champion-records.json');
const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

// JSON 데이터 안전 로드/저장 함수
function loadJson(p, isArray = false) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, isArray ? "[]" : "{}");
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// 챔피언 유저 데이터 불러오기
function loadChampionUser(userId) {
  const users = loadJson(usersPath);
  return users[userId] || null;
}

// 챔피언 유저 데이터 저장/업데이트
function saveChampionUser(userId, champObj) {
  const users = loadJson(usersPath);
  users[userId] = champObj;
  saveJson(usersPath, users);
}

// 전적 불러오기/저장 (승/무/패)
function loadRecord(userId) {
  const records = loadJson(recordsPath);
  return records[userId] || { win: 0, draw: 0, lose: 0 };
}
function updateRecord(userId, update = {}) {
  const records = loadJson(recordsPath);
  if (!records[userId]) records[userId] = { win: 0, draw: 0, lose: 0 };
  records[userId] = { ...records[userId], ...update };
  saveJson(recordsPath, records);
}

// 인벤토리(아이템) 불러오기/저장
function loadInventory(userId) {
  const items = loadJson(itemsPath);
  return items[userId] || {};
}
function saveInventory(userId, invObj) {
  const items = loadJson(itemsPath);
  items[userId] = invObj;
  saveJson(itemsPath, items);
}

// 스킬 보유 불러오기/저장
function loadSkillInventory(userId) {
  const skills = loadJson(skillsPath);
  return skills[userId] || {};
}
function saveSkillInventory(userId, skillsObj) {
  const skills = loadJson(skillsPath);
  skills[userId] = skillsObj;
  saveJson(skillsPath, skills);
}

// 모든 유저 챔피언 리스트 불러오기
function getAllChampionUsers() {
  return loadJson(usersPath);
}

// 모든 전적 리스트 불러오기
function getAllRecords() {
  return loadJson(recordsPath);
}

// 모든 아이템/스킬 인벤토리 리스트
function getAllInventories() {
  return loadJson(itemsPath);
}
function getAllSkillInventories() {
  return loadJson(skillsPath);
}

// 전적 초기화/유저 삭제 등
function removeChampionUser(userId) {
  const users = loadJson(usersPath);
  if (users[userId]) {
    delete users[userId];
    saveJson(usersPath, users);
  }
}
function removeRecord(userId) {
  const records = loadJson(recordsPath);
  if (records[userId]) {
    delete records[userId];
    saveJson(recordsPath, records);
  }
}
function removeInventory(userId) {
  const items = loadJson(itemsPath);
  if (items[userId]) {
    delete items[userId];
    saveJson(itemsPath, items);
  }
}
function removeSkillInventory(userId) {
  const skills = loadJson(skillsPath);
  if (skills[userId]) {
    delete skills[userId];
    saveJson(skillsPath, skills);
  }
}

// 전체 삭제(관리자 전용 등)
function resetAllChampionUsers() { saveJson(usersPath, {}); }
function resetAllRecords() { saveJson(recordsPath, {}); }
function resetAllInventories() { saveJson(itemsPath, {}); }
function resetAllSkillInventories() { saveJson(skillsPath, {}); }

module.exports = {
  loadChampionUser,
  saveChampionUser,
  loadRecord,
  updateRecord,
  loadInventory,
  saveInventory,
  loadSkillInventory,
  saveSkillInventory,
  getAllChampionUsers,
  getAllRecords,
  getAllInventories,
  getAllSkillInventories,
  removeChampionUser,
  removeRecord,
  removeInventory,
  removeSkillInventory,
  resetAllChampionUsers,
  resetAllRecords,
  resetAllInventories,
  resetAllSkillInventories,
};
