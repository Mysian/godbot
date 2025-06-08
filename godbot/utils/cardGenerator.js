const { getAllCards } = require("../config/cardData");

function generateRandomCard() {
  const cards = getAllCards();
  const randomIndex = Math.floor(Math.random() * cards.length);
  return cards[randomIndex];
}

module.exports = generateRandomCard;
