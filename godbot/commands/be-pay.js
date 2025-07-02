const { SlashCommandBuilder } = require('discord.js');
const { getBE, addBE } = require('./be-util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수지급')
    .setDescription('파랑 정수(BE)를 지급하거나 차감합니다.')
    .addUserOption(opt => opt.setName('유저').setDescription('대상 유저').setRequired(true))
    .addRoleOption(opt => opt.setName('역할').setDescription('지급/차감할 역할(선택)').setRequired(false))
    .addIntegerOption(opt => opt.setName('금액').setDescription('지급/차감할 금액').setRequired(true))
    .addStringOption(opt => opt.setName('사유').setDescription('이력에 남길 메시지(선택)').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('유저');
    const role = interaction.options.getRole('역할');
    const amount = interaction.options.getInteger('금액');
    const reasonInput = interaction.options.getString('사유');
    if (amount === 0) return interaction.reply({ content: '0 BE는 지급/차감할 수 없습니다.', ephemeral: true });

    // reason 기본값
    const reasonGive = reasonInput || `관리자 지급 by <@${interaction.user.id}>`;
    const reasonTake = reasonInput || `관리자 차감 by <@${interaction.user.id}>`;
    const reasonGiveRole = reasonInput || `역할관리자 지급 by <@${interaction.user.id}>`;
    const reasonTakeRole = reasonInput || `역할관리자 차감 by <@${interaction.user.id}>`;

    // 역할 지급/차감 (유저 옵션과 무관하게 역할이 있으면 역할 우선)
    if (role) {
      await interaction.deferReply({ ephemeral: false }); // 응답 미리 연장
      await interaction.guild.members.fetch();
      const members = interaction.guild.members.cache.filter(m => m.roles.cache.has(role.id) && !m.user.bot);
      if (members.size === 0)
        return interaction.editReply({ content: '해당 역할을 가진 멤버가 없습니다.' });

      let msg = [];
      for (const member of members.values()) {
        if (amount < 0) {
          const current = getBE(member.user.id);
          if (current > 0) {
            const minus = Math.min(current, Math.abs(amount));
            await addBE(member.user.id, -minus, reasonTakeRole);
            msg.push(`<@${member.user.id}> - **${minus} BE 차감**`);
          }
        } else {
          await addBE(member.user.id, amount, reasonGiveRole);
          msg.push(`<@${member.user.id}> - **${amount} BE 지급**`);
        }
      }
      if (msg.length === 0) {
        return interaction.editReply({ content: '차감/지급할 멤버가 없습니다.' });
      } else {
        let txt = `**역할 지급/차감 결과 (${members.size}명):**\n` + msg.join('\n');
        if (txt.length > 1800) txt = txt.slice(0, 1800) + '\n(생략)';
        return interaction.editReply({ content: txt });
      }
    }

    // 유저만
    if (amount < 0) {
      const current = getBE(target.id);
      if (current <= 0) return interaction.reply({ content: '해당 유저는 차감할 BE가 없습니다.', ephemeral: true });
      const minus = Math.min(current, Math.abs(amount));
      await addBE(target.id, -minus, reasonTake);
      return interaction.reply({ content: `<@${target.id}>의 파랑 정수(BE)에서 **${minus} BE** 차감됨!`, ephemeral: false });
    } else {
      await addBE(target.id, amount, reasonGive);
      return interaction.reply({ content: `<@${target.id}>에게 **${amount} BE** 지급 완료! (/정수확인)`, ephemeral: false });
    }
  }
};
