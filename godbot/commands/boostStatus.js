// commands/boostStatus.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("서버부스트현황")
    .setDescription("서버의 부스트 현황과 부스트한 유저 목록을 보여줍니다."),

  async execute(interaction) {
    const guild = interaction.guild;

    await guild.members.fetch(); // 모든 멤버 정보 불러오기

    const boosters = guild.members.cache.filter(
      (member) => member.premiumSince,
    );
    const boosterList = boosters.map(
      (member) => `• <@${member.id}> (${member.user.tag})`,
    );

    const embed = new EmbedBuilder()
      .setTitle("🚀 서버 부스트 현황")
      .setColor(0xf47fff)
      .addFields(
        {
          name: "📈 총 부스트 수",
          value: `${guild.premiumSubscriptionCount}회`,
          inline: true,
        },
        {
          name: "💎 부스트 레벨",
          value: `레벨 ${guild.premiumTier}`,
          inline: true,
        },
        {
          name: "✨ 부스트한 유저",
          value: boosterList.length > 0 ? boosterList.join("\n") : "없습니다.",
        },
      );

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral, // ✅ 권장 방식으로 수정
    });
  },
};
