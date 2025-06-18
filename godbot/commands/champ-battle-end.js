// commands/champ-battle-end.js

const { SlashCommandBuilder } = require('discord.js');
const { battles } = require('./champ-battle');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀종료')
    .setDescription('진행중인 챔피언배틀을 강제 종료합니다.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    if (!battles.has(userId))
      return interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true });

    const battle = battles.get(userId);
    battles.delete(battle.user.id);
    battles.delete(battle.enemy.id);

    return interaction.reply({ content: '배틀이 강제로 종료되었습니다.', ephemeral: true });
  }
};
