
const { getAllCards } = require("../config/cardData");

function getRandomByRate(rates) {
  const total = rates.reduce((acc, r) => acc + r.rate, 0);
  const rand = Math.random() * total;
  let sum = 0;
  for (const r of rates) {
    sum += r.rate;
    if (rand <= sum) return r.value;
  }
  return rates[rates.length - 1].value;
}

function generateRandomCard() {
  const { getAllCards, grades } = require("../config/cardData");
  const gradeRates = [
    { value: "F", rate: 50 },
    { value: "E", rate: 30 },
    { value: "D", rate: 10 },
    { value: "C", rate: 5 },
    { value: "B", rate: 3.5 },
    { value: "A", rate: 1 },
    { value: "S", rate: 0.4 },
    { value: "SS", rate: 0.1 }
  ];

  const grade = getRandomByRate(gradeRates);
  const all = getAllCards();
  const filtered = all.filter(c => c.grade === grade);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

module.exports = generateRandomCard;
