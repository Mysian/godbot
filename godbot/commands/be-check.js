const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBE } = require('./be-util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수확인')
    .setDescription('내 파랑 정수(BE) 잔액을 확인합니다.'),
  async execute(interaction) {
    const be = getBE(interaction.user.id);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('파랑 정수 잔액')
          .setDescription(`<@${interaction.user.id}>님의 보유 파랑 정수(BE)는 **${be} BE** 입니다.`)
          .setColor(0x3399ff)
      ],
      ephemeral: true
    });
  }
};
