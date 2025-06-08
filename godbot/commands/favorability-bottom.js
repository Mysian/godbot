const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/favorability-data.json");

function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("비호감도순위")
    .setDescription("호감도가 낮은 유저 순위 TOP 20을 표시합니다."),
  async execute(interaction) {
    const data = loadData();
    const bottom = Object.entries(data)
      .filter(([id, v]) => v.score !== undefined)
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 20);

    const lines = bottom.map(([id, v], i) => {
      return `${i + 1}. <@${id}>: ${v.score}점`;
    });

    const embed = new EmbedBuilder()
      .setTitle("😶‍🌫️ 비호감도 TOP 20")
      .setDescription(lines.join("\n"))
      .setColor(0x888888)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
