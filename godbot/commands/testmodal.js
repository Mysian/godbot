const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testmodal')
    .setDescription('테스트용 모달'),

  async execute(interaction) {
    // 텍스트채널 아니면 종료
    if (!interaction.guild || !interaction.channel) {
      return await interaction.reply({ content: "서버 텍스트 채널에서만 사용 가능합니다.", ephemeral: true });
    }

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('test_select')
        .setPlaceholder('테스트 선택')
        .addOptions([
          { label: '테스트1', value: 'a' },
          { label: '테스트2', value: 'b' }
        ])
    );

    await interaction.reply({
      content: '테스트 옵션을 고르세요.',
      components: [selectRow],
      ephemeral: true,
    });

    try {
      const select = await interaction.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 120000 });

      const modal = new ModalBuilder()
        .setCustomId('test_modal')
        .setTitle('모달 테스트')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('test_input')
              .setLabel('입력값')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await select.showModal(modal);

      const modalInter = await select.awaitModalSubmit({ filter: i => i.user.id === interaction.user.id, time: 120000 });
      const value = modalInter.fields.getTextInputValue('test_input');

      await modalInter.reply({ content: `입력값: ${value}`, ephemeral: true });
    } catch (e) {
      await interaction.editReply({ content: "시간초과 또는 에러!", components: [], ephemeral: true }).catch(()=>{});
    }
  }
};
