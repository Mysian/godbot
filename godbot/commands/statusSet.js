// commands/statusSet.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const statusFilePath = path.join(__dirname, "..", "status.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("상태설정")
    .setDescription("본인의 상태 메시지를 설정합니다.")
    .addStringOption((option) =>
      option
        .setName("상태")
        .setDescription("설정할 상태 메시지를 입력하세요.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const statusText = interaction.options.getString("상태");
    const userId = interaction.user.id;

    let statusData = {};
    if (fs.existsSync(statusFilePath)) {
      statusData = JSON.parse(fs.readFileSync(statusFilePath));
    }

    statusData[userId] = statusText;

    fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2));

    await interaction.reply({
      content: `✅ 상태 메시지가 설정되었습니다: "${statusText}"`,
      ephemeral: true,
    });
  },
};
