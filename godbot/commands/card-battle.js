
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: {
    name: "카드배틀",
    description: "턴제 카드 배틀을 시작합니다."
  },
  async execute(interaction) {
    const player = interaction.user;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("attack")
        .setLabel("💥 공격")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("defend")
        .setLabel("🛡️ 방어")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("skill")
        .setLabel("✨ 스킬")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      content: `🎮 **${player.username}**님의 카드 배틀을 시작합니다!
👉 버튼을 눌러 행동을 선택하세요.`,
      components: [row]
    });
  }
};
