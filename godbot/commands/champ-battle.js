const { SlashCommandBuilder } = require('discord.js');
const { startBattleRequest } = require('../utils/battle-ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀')
    .setDescription('지정한 유저와 챔피언을 배틀합니다.')
    .addUserOption(o =>
      o.setName('상대')
       .setDescription('대전 상대')
       .setRequired(true)
    ),
  async execute(interaction) {
    await startBattleRequest(interaction);
  }
};
