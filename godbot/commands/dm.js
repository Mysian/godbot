// commands/dm.js
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('특정 유저에게 DM(쪽지)를 보냅니다.')
    .addUserOption(opt =>
      opt.setName('유저')
        .setDescription('DM을 보낼 유저')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('이어서')
        .setDescription('기존 DM 이어서 진행')
        .addChoices(
          { name: '예(기존 대화 이어서)', value: 'yes' },
          { name: '아니오(새로 시작)', value: 'no' }
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('유저');
    const threadOption = interaction.options.getString('이어서') || 'no';

    // 모달로 메시지 입력받기
    const modal = new ModalBuilder()
      .setCustomId('dm_메시지')
      .setTitle('DM(쪽지) 전송');
    const messageInput = new TextInputBuilder()
      .setCustomId('dm_message')
      .setLabel('보낼 메시지를 입력하세요.')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('내용을 입력하세요.');

    modal.addComponents(
      new ActionRowBuilder().addComponents(messageInput)
    );

    await interaction.showModal(modal);

    // 모달 응답 대기
    const filter = m => m.user.id === interaction.user.id && m.customId === 'dm_메시지';
    interaction.client.once('interactionCreate', async modalInter => {
      if (!filter(modalInter)) return;
      const message = modalInter.fields.getTextInputValue('dm_message');

      try {
        // 기존 DM 이어서 옵션(실제 구현에서는 thread 등 관리 가능, 여기선 DM만 단순 처리)
        // "yes"든 "no"든 그냥 DM으로 전송 (추후 고도화 가능)
        await user.send(`[${interaction.user.displayName || interaction.user.username}님의 DM]\n${message}`);

        await modalInter.reply({
          content: `✅ <@${user.id}>님에게 DM을 전송했습니다.`,
          ephemeral: true
        });
      } catch (err) {
        await modalInter.reply({
          content: `❗ <@${user.id}>님에게 DM을 보낼 수 없습니다.\n(서버 차단 또는 DM 차단/설정 제한 등)`,
          ephemeral: true
        });
      }
    });
  }
};
