const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBE, loadConfig, transferBE } = require('./be-util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수송금')
    .setDescription('다른 유저에게 파랑 정수(BE)를 송금합니다. (수수료 10%) ')
    .addUserOption(opt => opt.setName('유저').setDescription('받을 유저').setRequired(true))
    .addIntegerOption(opt => opt.setName('금액').setDescription('송금할 금액').setRequired(true)),
  async execute(interaction) {
    const to = interaction.options.getUser('유저');
    const amount = interaction.options.getInteger('금액');
    if (to.id === interaction.user.id) return interaction.reply({ content: '자기 자신에게는 송금할 수 없습니다.', ephemeral: true });
    if (amount <= 0) return interaction.reply({ content: '1 BE 이상만 송금할 수 있습니다.', ephemeral: true });
    const config = loadConfig();
    const fromBalance = getBE(interaction.user.id);
    if (fromBalance < amount) return interaction.reply({ content: '잔액이 부족합니다.', ephemeral: true });

    const { ok, fee, sendAmount, reason } = await transferBE(interaction.user.id, to.id, amount, config.fee || 0);
    if (!ok) return interaction.reply({ content: `송금 실패: ${reason}`, ephemeral: true });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔷 파랑 정수 송금')
          .setDescription([
            `**${amount} 🔷 BE**를 <@${to.id}>에게 송금 완료!`,
            `수수료: **${fee} 🔷 BE**`,
            `실제 입금액: **${sendAmount} 🔷 BE**`
          ].join('\n'))
          .setColor(0x3399ff)
          .setTimestamp()
      ]
    });
  }
};
