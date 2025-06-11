const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("잠수함태우기")
    .setDescription("지정한 유저를 잠수방으로 이동시킵니다.")
    .addUserOption((option) =>
      option
        .setName("유저명")
        .setDescription("잠수방으로 이동시킬 유저")
        .setRequired(true),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("유저명");

    if (!user) {
      return await interaction.reply({
        content: "❌ 유저를 찾을 수 없어요.",
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(user.id);
    const AFK_CHANNEL_ID = "1202971727915651092";

    if (!member.voice || !member.voice.channel) {
      return await interaction.reply({
        content: "⚠️ 해당 유저는 현재 음성 채널에 접속 중이 아닙니다.",
        ephemeral: true,
      });
    }

    try {
      await member.voice.setChannel(AFK_CHANNEL_ID);
      await interaction.reply({
        content: `✅ <@${member.id}>님을 잠수함으로 이동시켰습니다.`,
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: "❌ 유저를 이동시키는 도중 오류가 발생했어요.",
        ephemeral: true,
      });
    }
  },
};
