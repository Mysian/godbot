
const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");
const generateRandomCard = require("../utils/generateRandomCard");
const { checkAndUpdateDrawLimit } = require("../utils/drawLimitManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("카드뽑기")
    .setDescription("카드 한 장을 무작위로 뽑습니다."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const isAllowed = checkAndUpdateDrawLimit(userId, interaction.member);
    if (!isAllowed) {
      return interaction.reply("⏳ 하루 뽑기 횟수를 초과했어요! 24시간 후 다시 시도해주세요.");
    }

    const card = generateRandomCard();
    const dataDir = path.join(__dirname, "..", "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

    const userPath = path.join(dataDir, `${userId}.json`);
    let userData = { cards: [] };

    if (fs.existsSync(userPath)) {
      userData = JSON.parse(fs.readFileSync(userPath, "utf8"));
    }

    card.level = 1;
    card.exp = 0;

    userData.cards.push(card);
    fs.writeFileSync(userPath, JSON.stringify(userData, null, 2));

    await interaction.reply(`🎴 당신이 뽑은 카드는 **${card.name}** [등급: **${card.grade}**] 입니다!`);
  }
};
