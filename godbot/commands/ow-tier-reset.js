// 📁 commands/ow-tier-reset.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../data/ow-tier.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("옵치티어초기화")
    .setDescription("오버워치 티어 정보를 초기화합니다."),

  async execute(interaction) {
    const userId = interaction.user.id;

    if (!fs.existsSync(filePath)) {
      return await interaction.reply({
        content: "❌ 초기화할 정보가 없습니다.",
        ephemeral: true,
      });
    }

    const db = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!db[userId]) {
      return await interaction.reply({
        content: "❌ 등록된 정보가 없습니다.",
        ephemeral: true,
      });
    }

    delete db[userId];
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2));

    await interaction.reply({
      content: "🧹 오버워치 티어 정보가 초기화되었습니다.",
      ephemeral: true,
    });
  },
};
