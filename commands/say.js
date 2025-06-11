const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("할말")
    .setDescription("입력한 메시지를 갓봇이 대신 말하게 해요.")
    .addStringOption((option) =>
      option
        .setName("내용")
        .setDescription("갓봇이 대신 말할 내용")
        .setRequired(true),
    ),
  async execute(interaction) {
    const input = interaction.options.getString("내용");

    // 채널에서 봇이 메시지 보내기
    await interaction.channel.send(input);

    // 유저에겐 반응만 보내고 실제 메시지는 안 보이게
    await interaction.reply({ content: "✅ 전송 완료!", ephemeral: true });
  },
};
