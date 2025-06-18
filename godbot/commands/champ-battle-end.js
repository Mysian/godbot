// commands/champ-battle-end.js

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { battles } = require('./champ-battle');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀종료')
    .setDescription('진행중인 챔피언배틀을 강제 종료합니다.'),

  async execute(interaction) {
    // 모든 배틀 중 유니크(중복X)하게 1개만 가져오기(양방향 매핑)
    const shownBattleSet = new Set();
    const battleOptions = [];
    for (const [userId, battle] of battles.entries()) {
      // 배틀 종료/중복 방지
      const key = [battle.user.id, battle.enemy.id].sort().join('-');
      if (shownBattleSet.has(key)) continue;
      shownBattleSet.add(key);

      battleOptions.push({
        label: `${battle.user.nickname} (${battle.user.name}) vs ${battle.enemy.nickname} (${battle.enemy.name})`,
        value: key
      });
    }

    if (battleOptions.length === 0) {
      return interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('end_battle_select')
      .setPlaceholder('종료할 배틀을 선택하세요!')
      .addOptions(battleOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '강제로 종료할 챔피언배틀을 선택하세요.',
      components: [row],
      ephemeral: true,
    });
  },

  // 버튼/셀렉트 핸들러 분기(아래 코드 챔피언배틀 메인 컨트롤러 쪽에 넣거나, 여기서 interactionCreate로 분리 가능)
  async handleSelect(interaction) {
    if (interaction.customId !== 'end_battle_select') return;
    const value = interaction.values[0];
    const [idA, idB] = value.split('-');

    // 두 유저의 배틀이 존재하면 강제 삭제
    if (battles.has(idA)) battles.delete(idA);
    if (battles.has(idB)) battles.delete(idB);

    await interaction.update({
      content: `선택한 챔피언배틀을 강제로 종료했습니다.`,
      components: [],
    });
  }
};
