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
    .setName("챔피언배틀전적")
    .setDescription("유저의 챔피언 배틀 전적을 확인합니다.")
    .addUserOption(opt =>
      opt.setName("유저")
        .setDescription("전적을 확인할 유저를 선택하세요.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("유저");
    const records = loadRecords();

    const r = records[user.id];

    if (!r) {
      return interaction.reply({
        content: `📉 ${user.username}님의 전적이 없습니다.`,
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📜 ${user.username}님의 챔피언 전적`)
      .setDescription(`🏷️ 챔피언: **${r.name || "알 수 없음"}**
🥇 승리: **${r.win}**
🤝 무승부: **${r.draw}**
💀 패배: **${r.lose}**`)
      .setColor(0x95a5a6);

    await interaction.reply({ embeds: [embed] });
  }
};
