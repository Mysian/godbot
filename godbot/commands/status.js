// commands/status.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const statusFilePath = path.join(__dirname, "..", "status.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("상태")
    .setDescription("특정 유저의 상태 메시지를 확인합니다.")
    .addUserOption((option) =>
      option
        .setName("유저")
        .setDescription("상태를 확인할 유저를 선택하세요.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("유저");

    if (!fs.existsSync(statusFilePath)) {
      return await interaction.reply({
        content: "❌ 아직 아무도 상태를 설정하지 않았어요.",
        ephemeral: true,
      });
    }

    const statusData = JSON.parse(fs.readFileSync(statusFilePath));
    const statusText = statusData[targetUser.id];

    if (!statusText) {
      return await interaction.reply({
        content: `ℹ️ <@${targetUser.id}> 님은 상태 메시지를 설정하지 않았어요.`,
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: `📌 <@${targetUser.id}> 님의 현재 상태: "${statusText}"`,
      ephemeral: true,
    });
  },
};
