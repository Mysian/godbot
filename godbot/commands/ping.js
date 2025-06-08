// commands/ping.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 봇의 응답 속도를 확인합니다."),
  async execute(interaction) {
    const start = Date.now();

    await interaction.reply({ content: "📡 핑 측정 중..." });
    const reply = await interaction.fetchReply();

    const end = Date.now();
    const ping = end - start;
    const apiPing = interaction.client.ws.ping;

    await interaction.editReply({
      content: `🏓 Pong! 응답 속도: **${ping}ms**, WebSocket 핑: **${apiPing}ms**`,
    });
  },
};
