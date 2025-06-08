// /commands/card-battle.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBattle, setBattle, removeBattle } = require('../utils/battleDataManager');
const { getUserCards } = require('../utils/cardDataManager');
const applySkillEffect = require('../utils/applySkillEffect');
const skills = require('../utils/skills');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('카드배틀')
    .setDescription('상대와 카드 배틀을 시작합니다.')
    .addUserOption(option =>
      option.setName('상대')
        .setDescription('배틀할 유저를 선택하세요.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.user;
    const opponent = interaction.options.getUser('상대');

    if (user.id === opponent.id) {
      return interaction.reply({ content: '❌ 자신과는 배틀할 수 없습니다!', ephemeral: true });
    }

    const userCards = getUserCards(user.id);
    const opponentCards = getUserCards(opponent.id);

    if (!userCards.length || !opponentCards.length) {
      return interaction.reply({ content: '❌ 두 유저 모두 카드가 있어야 배틀할 수 있어요!', ephemeral: true });
    }

    const userCard = userCards[0]; // 첫 카드 사용 (임시)
    const opponentCard = opponentCards[0]; // 상대 첫 카드

    const battleState = {
      turn: 0,
      players: [
        {
          id: user.id,
          name: user.username,
          ...userCard,
          silenced: 0,
          tempDefense: false,
        },
        {
          id: opponent.id,
          name: opponent.username,
          ...opponentCard,
          silenced: 0,
          tempDefense: false,
        },
      ],
    };

    setBattle(user.id, battleState);
    setBattle(opponent.id, battleState);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('⚔️ 공격').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 방어').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skill').setLabel('💥 스킬').setStyle(ButtonStyle.Danger),
      );

    await interaction.reply({
      content: `🎮 **${user.username}** vs **${opponent.username}** 카드 배틀이 시작됩니다!\n\n**${user.username}**님의 차례입니다. 아래 버튼을 눌러 행동하세요.`,
      components: [row],
    });
  }
};
