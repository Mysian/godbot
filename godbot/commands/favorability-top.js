const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/favorability-data.json");

// 안전한 데이터 로드
function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("호감도순위")
    .setDescription("호감도가 높은 유저 순위 TOP 20을 표시합니다."),

  async execute(interaction) {
    const data = loadData();

    const top = Object.entries(data)
      .filter(([_, v]) => typeof v.score === "number") // score가 숫자인 경우만
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 20);

    const lines = top.map(([id, v], i) => {
      return `${i + 1}. <@${id}>: ${v.score}점`;
    }).filter(Boolean);

    const descriptionText = lines.length > 0
  ? lines.join("\n").slice(0, 4090)
  : "표시할 유저가 없습니다.";

const embed = new EmbedBuilder()
  .setTitle("🏆 호감도 TOP 20")
  .setDescription(descriptionText)
  .setColor(0xffc107)
  .setTimestamp();


    await interaction.reply({ embeds: [embed] });
  }
};
