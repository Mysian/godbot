const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/favorability-data.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("호감도초기화")
    .setDescription("해당 유저의 호감도를 0으로 초기화합니다. (관리자 전용)")
    .addUserOption(option =>
      option.setName("유저").setDescription("초기화할 대상 유저").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // 관리자 전용 설정

  async execute(interaction) {
    const targetUser = interaction.options.getUser("유저");
    const data = loadData();

    if (!data[targetUser.id] || data[targetUser.id].score === undefined) {
      return interaction.reply({
        content: `⚠️ ${targetUser.username}님의 호감도 기록이 존재하지 않습니다.`,
        ephemeral: true,
      });
    }

    data[targetUser.id].score = 0;
    saveData(data);

    return interaction.reply({
      content: `✅ ${targetUser.username}님의 호감도가 **0으로 초기화**되었습니다.`,
      ephemeral: true,
    });
  }
};
