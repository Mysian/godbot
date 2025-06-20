// godbot/commands/voice-notify.js
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/voice-notify.json');

function loadVoiceNotify() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, '{}');
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}
function saveVoiceNotify(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('음성채널알림')
    .setDescription('음성채널 입장/퇴장 알림을 ON/OFF합니다.')
    .addStringOption(option =>
      option.setName('설정')
        .setDescription('알림 상태 (on/off)')
        .setRequired(true)
        .addChoices(
          { name: 'ON', value: 'on' },
          { name: 'OFF', value: 'off' }
        )
    ),
  async execute(interaction) {
    const setting = interaction.options.getString('설정');
    const guildId = interaction.guildId;
    const notifyData = loadVoiceNotify();

    notifyData[guildId] = (setting === 'on');
    saveVoiceNotify(notifyData);

    await interaction.reply({
      content: `음성채널 입장/퇴장 알림이 **${setting === 'on' ? '켜졌어!' : '꺼졌어!'}**`,
      ephemeral: true
    });
  }
};
