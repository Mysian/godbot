// config/cardData.js
module.exports = {
  grades: ["Z", "SSS", "SS", "S", "A", "B", "C", "D", "E", "F"],

  gradeChances: {
    F: 0.5,
    E: 0.3,
    D: 0.1,
    C: 0.05,
    B: 0.035,
    A: 0.01,
    S: 0.004,
    SS: 0.001,
    SSS: 0,
    Z: 0,
  },

  elements: [
    { name: "불", emoji: "🔥", beats: "나무", weakTo: "물", type: "basic" },
    { name: "물", emoji: "💧", beats: "불", weakTo: "나무", type: "basic" },
    { name: "나무", emoji: "🌿", beats: "물", weakTo: "불", type: "basic" },
    { name: "어둠", emoji: "🌑", beats: "빛", weakTo: "빛", type: "special" },
    { name: "빛", emoji: "🌟", beats: "어둠", weakTo: "어둠", type: "special" },
  ],
};
