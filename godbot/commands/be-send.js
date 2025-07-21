const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBE, loadConfig, addBE } = require('./be-util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수송금')
    .setDescription('유저에게 정수(BE)를 송금(수수료 5%)')
    .addUserOption(opt => opt.setName('유저').setDescription('받을 유저').setRequired(true))
    .addIntegerOption(opt => opt.setName('금액').setDescription('송금할 금액').setRequired(true))
    .addStringOption(opt => opt.setName('사유').setDescription('송금 목적/사유를 입력하세요').setRequired(true)),
  async execute(interaction) {
    const to = interaction.options.getUser('유저');
    let amount = interaction.options.getInteger('금액');
    const reason = interaction.options.getString('사유') || '';
    if (to.id === interaction.user.id) return interaction.reply({ content: '자기 자신에게는 송금할 수 없습니다.', ephemeral: true });
    if (amount <= 0) return interaction.reply({ content: '1 BE 이상만 송금할 수 있습니다.', ephemeral: true });

    const config = loadConfig();
    const feeRate = config.fee || 10; // 기본 10%
    let fromBalance = getBE(interaction.user.id);

    let maxAmount = Math.floor(fromBalance / (1 + feeRate / 100));
    if (amount > maxAmount) amount = maxAmount;

    const fee = Math.floor(amount * (feeRate / 100));
    const outgo = amount + fee;

    if (fromBalance < outgo || amount <= 0) {
      return interaction.reply({ content: `송금 가능한 잔액이 없습니다.`, ephemeral: true });
    }

    await addBE(interaction.user.id, -outgo, `[송금] -> <@${to.id}> | ${reason}`);
    await addBE(to.id, amount, `[송금입금] <- <@${interaction.user.id}> | ${reason}`);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔷 파랑 정수 송금')
          .setDescription([
            `**${amount.toLocaleString('ko-KR')} 🔷 BE**를 <@${to.id}>에게 송금 완료!`,
            `\`사유:\` ${reason}`,
            `||수수료: **${fee.toLocaleString('ko-KR')} 🔷 BE**`,
            `실제 출금액: **${outgo.toLocaleString('ko-KR')} 🔷 BE**||`
          ].join('\n'))
          .setColor(0x3399ff)
          .setTimestamp()
      ]
    });
  }
};
