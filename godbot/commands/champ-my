const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/champion-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언")
    .setDescription("해당 유저가 보유한 챔피언을 확인합니다.")
    .addUserOption(option =>
      option.setName("유저").setDescription("확인할 유저를 선택하세요").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const data = loadData();
    const champInfo = data[target.id];

    if (!champInfo || !champInfo.name) {
      return interaction.reply({
        content: `❌ <@${target.id}>님은 아직 챔피언을 보유하고 있지 않습니다.`,
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🧙‍♂️ ${target.username}님의 챔피언`)
      .setDescription(`• 이름: **${champInfo.name}**\n• 레벨: ${champInfo.level ?? 0}\n• 강화 성공: ${champInfo.success ?? 0}회`)
      .setColor(0x9b59b6)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
