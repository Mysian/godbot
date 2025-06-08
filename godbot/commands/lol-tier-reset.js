// 📁 commands/lol-tier-reset.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataFilePath = path.join(__dirname, "../data/lol-tier.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("롤티어초기화")
    .setDescription("자신의 롤 티어 정보를 초기화합니다."),

  async execute(interaction) {
    const userId = interaction.user.id;

    let data = {};
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, "utf8");
      if (raw.trim() !== "") data = JSON.parse(raw);
    }

    if (!data[userId]) {
      return interaction.reply({
        content: "❗ 등록된 정보가 없습니다. 먼저 `/롤티어등록`을 해주세요!",
        ephemeral: true,
      });
    }

    delete data[userId];

    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));

    return interaction.reply({
      content: "✅ 롤 티어 정보가 초기화되었습니다.",
      ephemeral: true,
    });
  },
};
