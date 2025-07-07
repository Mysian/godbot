// ==== commands/advertise-close.js ====
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('모집종료')
    .setDescription('모집글을 강제 마감해요.')
    .addStringOption(opt =>
      opt.setName('메시지id')
        .setDescription('마감할 모집글 메시지 ID')
        .setRequired(true)),
  async execute(interaction) {
    const msgId = interaction.options.getString('메시지id');
    const 모집채널 = await interaction.guild.channels.fetch('1209147973255036959');
    try {
      const msg = await 모집채널.messages.fetch(msgId);
      if (!msg) throw new Error('메시지 없음');
      const embed = EmbedBuilder.from(msg.embeds[0]);
      if (!embed) throw new Error('임베드 없음');

      // 모집자만 종료 가능
      const recruiterId = embed.data.fields.find(f => f.name === '모집자')?.value?.replace(/[<@>]/g, '');
      if (recruiterId && recruiterId !== interaction.user.id) {
        return await interaction.reply({ content: '❌ 모집글 작성자만 종료할 수 있습니다.', ephemeral: true });
      }

      embed.setFields(
        embed.data.fields.map(f =>
          f.name === '마감까지'
            ? { name: '마감까지', value: '마감됨', inline: true }
            : f
        )
      );
      // 버튼 비활성화
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('disabled2')
          .setLabel('참여 의사 밝히기')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      await msg.edit({ embeds: [embed], components: [disabledRow] });
      await interaction.reply({ content: '✅ 모집글이 강제 마감됐어요!', ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: '❌ 모집글을 찾을 수 없어요. 메시지ID를 확인해 주세요.', ephemeral: true });
    }
  }
};
