const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('풀석')
    .setDescription('풀썩 쓰러지는 RP!'),
  async execute(interaction) {
    const nickname = interaction.member?.nickname || interaction.user.username;
    await interaction.reply({
      content: `헉! '${nickname}' 님이 풀썩 쓰러지고 말았습니다!`,
      ephemeral: false
    });
  }
};
