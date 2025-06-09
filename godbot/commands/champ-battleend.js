const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const battlePath = path.join(__dirname, "../data/battle-active.json");

function loadBattleData() {
  if (!fs.existsSync(battlePath)) fs.writeFileSync(battlePath, "{}");
  return JSON.parse(fs.readFileSync(battlePath));
}

function saveBattleData(data) {
  fs.writeFileSync(battlePath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언배틀종료")
    .setDescription("진행 중인 챔피언 배틀을 강제로 종료합니다."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const battleData = loadBattleData();

    const battleId = Object.keys(battleData).find(
      key => battleData[key].challenger === userId || battleData[key].opponent === userId
    );

    if (!battleId) {
      return interaction.reply({
        content: "❌ 현재 참여 중인 배틀이 없습니다.",
        ephemeral: true
      });
    }

    delete battleData[battleId];
    saveBattleData(battleData);

    await interaction.reply({
      content: `🛑 챔피언 배틀이 강제 종료되었습니다.`,
      ephemeral: true
    });
  }
};
