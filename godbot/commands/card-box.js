
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("카드상자")
    .setDescription("보유한 카드를 확인합니다."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const userFile = path.join(__dirname, "..", "data", `${userId}.json`);
    if (!fs.existsSync(userFile)) {
      return interaction.reply("❌ 아직 보유한 카드가 없습니다. `/카드뽑기`로 시작해보세요!");
    }
    const userData = JSON.parse(fs.readFileSync(userFile, "utf8"));
    const cardList = userData.cards || [];
    if (cardList.length === 0) {
      return interaction.reply("📦 카드상자가 비어 있습니다.");
    }
    let msg = `📦 **당신의 카드상자** (${cardList.length}장 보유)
`;
    cardList.forEach((card, i) => {
      msg += `\n${i + 1}. **${card.name}** [등급: ${card.grade}] | Lv.${card.level || 1}`;
    });
    interaction.reply(msg);
  }
};
