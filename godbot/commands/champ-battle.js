const { SlashCommandBuilder } = require('discord.js');
const { battles, battleRequests, handleBattleCommand, handleBattleButton } = require('../battle-system/battle-controller');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀')
    .setDescription('상대와 롤 챔피언 턴제 배틀을 시작합니다.')
    .addUserOption(option =>
      option.setName('상대').setDescription('대결 상대').setRequired(false)),
  battles,
  battleRequests,

  async execute(interaction) {
    await handleBattleCommand(interaction);
  },
  async handleButton(interaction) {
    await handleBattleButton(interaction);
  }
};
