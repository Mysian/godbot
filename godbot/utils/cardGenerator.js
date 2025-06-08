const { getAllCards } = require("../config/cardData");

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomGrade() {
  const rand = Math.random() * 100;
  if (rand < 0.1) return "SS";
  if (rand < 0.5) return "S";
  if (rand < 1.5) return "A";
  if (rand < 5.0) return "B";
  if (rand < 10.0) return "C";
  if (rand < 20.0) return "D";
  if (rand < 50.0) return "E";
  return "F";
}

function generateRandomCard() {
  const allCards = getAllCards();
  const baseCard = getRandomElement(allCards);
  const grade = getRandomGrade();

  const card = {
    ...baseCard,
    id: `${baseCard.key}-${grade}-${Date.now()}`,
    grade,
    level: 1,
    isEnhanced: false,
    stats: {}, // 추후 계산해서 설정
  };

  return card;
}

module.exports = {
  generateRandomCard,
};
