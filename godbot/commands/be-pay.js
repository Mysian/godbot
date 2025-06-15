const { SlashCommandBuilder } = require('discord.js');
const { getBE, addBE } = require('./be-util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수지급')
    .setDescription('파랑 정수(BE)를 지급하거나 차감합니다.')
    .addUserOption(opt => opt.setName('유저').setDescription('대상 유저').setRequired(true))
    .addIntegerOption(opt => opt.setName('금액').setDescription('지급/차감할 금액').setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('유저');
    const amount = interaction.options.getInteger('금액');
    if (amount === 0) return interaction.reply({ content: '0 BE는 지급/차감할 수 없습니다.', ephemeral: true });
    if (amount < 0) {
      // 차감
      const current = getBE(target.id);
      if (current <= 0) return interaction.reply({ content: '해당 유저는 차감할 BE가 없습니다.', ephemeral: true });
      const minus = Math.min(current, Math.abs(amount));
      addBE(target.id, -minus, `관리자 차감 by <@${interaction.user.id}>`);
      return interaction.reply({ content: `<@${target.id}>의 파랑 정수(BE)에서 **${minus} BE** 차감됨!`, ephemeral: false });
    } else {
      // 지급
      addBE(target.id, amount, `관리자 지급 by <@${interaction.user.id}>`);
      return interaction.reply({ content: `<@${target.id}>에게 **${amount} BE** 지급 완료!`, ephemeral: false });
    }
  }
};
