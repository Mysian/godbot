const cards = [
  {
    id: "tiger001",
    name: "🐯 타이거 (Tiger)",
    grade: "A",
    attribute: "불",
    stats: {
      attack: 110,
      defense: 90,
      hp: 100,
      magic: 50,
      luck: 60,
    },
    skill: "heavy-attack",
  },
  {
    id: "rabbit001",
    name: "🐰 래빗 (Rabbit)",
    grade: "B",
    attribute: "물",
    stats: {
      attack: 80,
      defense: 70,
      hp: 95,
      magic: 100,
      luck: 75,
    },
    skill: "self-heal",
  },
  {
    id: "dragon001",
    name: "🐉 드래곤 (Dragon)",
    grade: "S",
    attribute: "빛",
    stats: {
      attack: 120,
      defense: 110,
      hp: 140,
      magic: 130,
      luck: 90,
    },
    skill: "aoe-magic",
  },
  {
    id: "snake001",
    name: "🐍 스네이크 (Snake)",
    grade: "C",
    attribute: "어둠",
    stats: {
      attack: 70,
      defense: 60,
      hp: 85,
      magic: 95,
      luck: 80,
    },
    skill: "attack-silence",
  },
  {
    id: "monkey001",
    name: "🐵 몽키 (Monkey)",
    grade: "D",
    attribute: "나무",
    stats: {
      attack: 85,
      defense: 65,
      hp: 100,
      magic: 60,
      luck: 95,
    },
    skill: "lucky-attack",
  }
];

function getAllCards() {
  return cards;
}

function getCardById(cardId) {
  return cards.find(card => card.id === cardId);
}

module.exports = {
  getAllCards,
  getCardById,
};
