const { SlashCommandBuilder } = require("discord.js");
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

    const result = await Promise.all(
      bottom.map(async ([id, v], i) => {
        const user = await interaction.client.users.fetch(id).catch(() => null);
        return `${i + 1}. ${user?.username || "알 수 없음"}: ${v.score}점`;
      })
    );

    await interaction.reply({ content: `😶‍🌫️ **비호감도 TOP 20**\n${result.join("\n")}` });
  }
};
