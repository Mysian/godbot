const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/warnings.json");

function loadWarnings() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("경고확인")
    .setDescription("자신이 받은 경고 내용을 확인합니다."),

  async execute(interaction) {
    const warnings = loadWarnings();
    const userWarnings = warnings[interaction.user.id];

    if (!userWarnings || userWarnings.length === 0) {
      await interaction.reply({
        content: "✅ 당신은 현재 받은 경고가 없습니다.",
        ephemeral: true
      });
    } else {
      const embed = new EmbedBuilder()
        .setTitle("🚨 나의 경고 목록")
        .setColor("Red")
        .setDescription(`총 ${userWarnings.length}회의 경고 기록이 있습니다.`)
        .addFields(
          ...userWarnings.map((w, i) => ({
            name: `${i + 1}. [${w.code}${w.desc ? `: ${w.desc}` : ""}]`,
            value:
              `• 사유: ${w.detail}\n` +
              `• 일시: <t:${Math.floor(new Date(w.date).getTime() / 1000)}:f>\n` +
              `• 담당 관리자: <@${638742607861645372}>`
          }))
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
