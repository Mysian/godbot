
const generateRandomCard = require("../utils/generateRandomCard");

module.exports = {
  data: {
    name: "카드뽑기",
    description: "카드 한 장을 무작위로 뽑습니다."
  },
  async execute(interaction) {
    const card = generateRandomCard();
    await interaction.reply(`🎴 당신이 뽑은 카드는 **${card.name}** [등급: **${card.grade}**] 입니다!`);
  }
};
