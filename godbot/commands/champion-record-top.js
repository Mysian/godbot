const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const recordPath = path.join(__dirname, "../data/champion-records.json");

function loadRecords() {
  if (!fs.existsSync(recordPath)) fs.writeFileSync(recordPath, "{}");
  return JSON.parse(fs.readFileSync(recordPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언배틀전적순위")
    .setDescription("챔피언 배틀 승리 순위를 보여줍니다."),

  async execute(interaction) {
    const records = loadRecords();

    const sorted = Object.entries(records)
      .filter(([_, v]) => typeof v.win === "number")
      .sort((a, b) => b[1].win - a[1].win)
      .slice(0, 10);

    if (sorted.length === 0) {
      return interaction.reply({
        content: "📉 아직 기록된 전적이 없습니다.",
        ephemeral: true
      });
    }

    const lines = sorted.map(([id, v], i) =>
      `${i + 1}. <@${id}> (${v.name || "??"}) - **${v.win}승**`
    );

    const embed = new EmbedBuilder()
      .setTitle("🏆 챔피언 배틀 승리 순위 TOP 10")
      .setDescription(lines.join("\n"))
      .setColor(0xf39c12)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
