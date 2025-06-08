
const baseStats = {
  attack: 10,
  defense: 10,
  hp: 100,
  magic: 5,
  luck: 5,
};

const animals = [
  { name: "🐭 마우스", id: "mouse", stats: { attack: 10, defense: 12, hp: 90, magic: 7, luck: 6 } },
  { name: "🐮 카우", id: "cow", stats: { attack: 12, defense: 14, hp: 100, magic: 5, luck: 4 } },
  { name: "🐯 타이거", id: "tiger", stats: { attack: 15, defense: 10, hp: 95, magic: 6, luck: 5 } },
  { name: "🐰 래빗", id: "rabbit", stats: { attack: 8, defense: 9, hp: 85, magic: 9, luck: 8 } },
  { name: "🐲 드래곤", id: "dragon", stats: { attack: 14, defense: 13, hp: 110, magic: 10, luck: 5 } },
  { name: "🐍 스네이크", id: "snake", stats: { attack: 11, defense: 10, hp: 90, magic: 12, luck: 6 } },
  { name: "🐴 홀스", id: "horse", stats: { attack: 13, defense: 12, hp: 100, magic: 6, luck: 7 } },
  { name: "🐑 쉽", id: "sheep", stats: { attack: 9, defense: 11, hp: 95, magic: 7, luck: 10 } },
  { name: "🐵 몽키", id: "monkey", stats: { attack: 10, defense: 10, hp: 90, magic: 8, luck: 9 } },
  { name: "🐔 치킨", id: "chicken", stats: { attack: 8, defense: 9, hp: 85, magic: 9, luck: 10 } },
  { name: "🐶 독", id: "dog", stats: { attack: 12, defense: 12, hp: 100, magic: 6, luck: 6 } },
  { name: "🐷 피그", id: "pig", stats: { attack: 11, defense: 13, hp: 105, magic: 5, luck: 5 } },
];

const elements = ["🔥", "💧", "🌲", "🌑", "🌕"];

const grades = [
  { grade: "Z", multiplier: 7.59, upgradeChance: 0.1 },
  { grade: "SSS", multiplier: 5.06, upgradeChance: 0.2 },
  { grade: "SS", multiplier: 3.37, upgradeChance: 0.4 },
  { grade: "S", multiplier: 2.25, upgradeChance: 0.5 },
  { grade: "A", multiplier: 1.5, upgradeChance: 0.6 },
  { grade: "B", multiplier: 1.0, upgradeChance: 0.7 },
  { grade: "C", multiplier: 0.66, upgradeChance: 0.8 },
  { grade: "D", multiplier: 0.44, upgradeChance: 0.9 },
  { grade: "E", multiplier: 0.29, upgradeChance: 1.0 },
  { grade: "F", multiplier: 0.19, upgradeChance: 1.0 },
];

function getAllCards() {
  const cards = [];
  for (const element of elements) {
    for (const animal of animals) {
      for (const grade of grades) {
        const stats = {};
        for (const key in animal.stats) {
          stats[key] = Math.floor(animal.stats[key] * grade.multiplier);
        }
        cards.push({
          name: `${element} ${animal.name}`,
          id: `${element}_${animal.id}_${grade.grade}`,
          element,
          animal: animal.name,
          grade: grade.grade,
          stats
        });
      }
    }
  }
  return cards;
}

module.exports = {
  getAllCards,
  grades,
  elements,
  animals
};
