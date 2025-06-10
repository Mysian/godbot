// commands/ping.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("🏓 봇의 응답 속도를 확인합니다."),
  async execute(interaction) {
    const start = Date.now();

    // 먼저 임시로 임베드로 대기 메시지!
    const loadingEmbed = new EmbedBuilder()
      .setTitle("📡 핑 측정 중...")
      .setDescription("잠시만 기다려 주세요.")
      .setColor(0x5b96fa)
      .setThumbnail("https://cdn-icons-png.flaticon.com/512/4712/4712035.png")
      .setFooter({ text: "디스코드 봇 상태 체크", iconURL: interaction.client.user.displayAvatarURL() });

    await interaction.reply({ embeds: [loadingEmbed], ephemeral: true });
    const reply = await interaction.fetchReply();

    const end = Date.now();
    const ping = end - start;
    const apiPing = interaction.client.ws.ping;

    // 결과 임베드
    const resultEmbed = new EmbedBuilder()
      .setTitle("🏓 Pong! 봇 응답 속도")
      .addFields(
        { name: "⏱️ 메시지 응답", value: `\`${ping}ms\``, inline: true },
        { name: "🌐 WebSocket 핑", value: `\`${apiPing}ms\``, inline: true },
      )
      .setColor(ping < 150 ? 0x00c896 : 0xff4f4f)
      .setDescription(
        ping < 150
          ? "속도가 아주 좋아요! 🚀"
          : "속도가 살짝 느릴 수 있어요. 서버 상태를 확인해보세요!"
      )
      .setTimestamp()
      .setFooter({ text: `${interaction.user.username}님의 요청`, iconURL: interaction.user.displayAvatarURL() });

    await interaction.editReply({
      embeds: [resultEmbed],
      content: null,
      ephemeral: true,
    });
  },
};
