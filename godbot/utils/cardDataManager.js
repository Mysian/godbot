// utils/cardDataManager.js
const fs = require("fs");
const path = require("path");

// 카드 데이터 저장 경로
const dataPath = path.join(__dirname, "../data/cards.json");

// JSON 파일을 불러옴
function loadCardData() {
  if (!fs.existsSync(dataPath)) return {};
  const jsonData = fs.readFileSync(dataPath, "utf-8");
  return JSON.parse(jsonData);
}

// JSON 파일을 저장
function saveCardData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");
}

// 유저 카드 데이터 가져오기
function getUserCardData(userId) {
  const data = loadCardData();
  return data[userId] || { cards: [], drawCount: 0, lastDrawDate: null };
}

// 유저 카드 데이터 저장하기
function saveUserCardData(userId, userData) {
  const data = loadCardData();
  data[userId] = userData;
  saveCardData(data);
}

module.exports = {
  getUserCardData,
  saveUserCardData,
};
