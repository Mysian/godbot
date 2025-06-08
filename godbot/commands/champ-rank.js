const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/champion-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}

module.exports = {
  data: new SlashCommandBuilder().setName("챔피언강화순위").setDescription("강화 성공 횟수가 많은 순으로 20위 표시"),
  async execute(interaction) {
    const data = loadData();
    const sorted = Object.entries(data)
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => b.success - a.success)
      .slice(0, 20);

    if (sorted.length === 0) {
      return interaction.reply("아직 강화 기록이 없습니다!");
    }

    const ranking = sorted
      .map((entry, index) => `**${index + 1}위** - <@${entry.id}>: ${entry.name} (${entry.level}강, ✅ ${entry.success}회 성공)`)
      .join("\n");

    return interaction.reply(`🏆 **챔피언 강화 순위 Top 20**\n\n${ranking}`);
  },
};
