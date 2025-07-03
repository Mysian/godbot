const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const statusPath = path.join(__dirname, '../data/status.json');

function loadStatus() {
  if (!fs.existsSync(statusPath)) fs.writeFileSync(statusPath, '{}');
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}
function saveStatus(status) {
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('상태설정')
    .setDescription('상태 메시지를 설정합니다.'),
  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('status_set')
      .setTitle('상태 메시지 설정')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('status_message')
            .setLabel('상태 메시지 입력')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setPlaceholder('예: 잠시 자리를 비웠어요!')
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
  },
  // 모달 핸들러
  modal: {
    customId: 'status_set',
    async execute(interaction) {
      const msg = interaction.fields.getTextInputValue('status_message');
      const status = loadStatus();
      status[interaction.user.id] = msg;
      saveStatus(status);

      await interaction.reply({
        content: [
          '상태 메시지가 저장되었습니다!',
          '---',
          `누군가 당신을 @멘션하면,`,
          '`-# [상태] 현재 ' + interaction.member.displayName + '님은 ' + msg + '`',
          '이렇게 채팅방에 안내됩니다.'
        ].join('\n'),
        ephemeral: true
      });
    }
  }
};
