const { SlashCommandBuilder } = require('discord.js');
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
    .setName('상태해제')
    .setDescription('상태 메시지를 삭제합니다.'),
  async execute(interaction) {
    const status = loadStatus();
    if (status[interaction.user.id]) {
      delete status[interaction.user.id];
      saveStatus(status);
      await interaction.reply({ content: '상태 메시지가 해제되었습니다.', ephemeral: true });
    } else {
      await interaction.reply({ content: '저장된 상태 메시지가 없습니다.', ephemeral: true });
    }
  }
};
