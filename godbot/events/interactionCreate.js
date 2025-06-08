const { Events } = require('discord.js');
const { getBattle, setBattle, removeBattle } = require('../utils/battleDataManager');
const applySkillEffect = require('../utils/applySkillEffect');
const skills = require('../utils/skills');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const battle = getBattle(userId);
    if (!battle) return interaction.reply({ content: '❌ 현재 참여 중인 배틀이 없습니다.', ephemeral: true });

    const turnIndex = battle.turn % 2;
    const player = battle.players[turnIndex];
    const opponent = battle.players[1 - turnIndex];

    if (player.id !== userId) {
      return interaction.reply({ content: `❌ 아직 당신의 턴이 아닙니다!`, ephemeral: true });
    }

    let log = [];

    switch (interaction.customId) {
      case 'attack':
        const damage = player.attack;
        const reduced = opponent.tempDefense ? Math.floor(damage / 2) : damage;
        opponent.hp -= reduced;
        log.push(`⚔️ ${player.name}의 일반 공격! ${reduced} 피해를 입혔습니다.`);
        break;

      case 'defend':
        player.tempDefense = true;
        log.push(`🛡️ ${player.name}는 방어 자세를 취해 다음 턴 피해를 절반으로 감소시킵니다.`);
        break;

      case 'skill':
        if (player.silenced > 0) {
          log.push(`🤐 ${player.name}는 스킬 봉인 상태입니다!`);
          player.silenced -= 1;
          break;
        }

        const skillKey = player.skill;
        const result = applySkillEffect(player, opponent, skillKey);
        Object.assign(player, result.attacker);
        Object.assign(opponent, result.defender);
        log.push(...result.log);
        break;
    }

    // 턴 종료 처리
    player.tempDefense = false;
    battle.turn += 1;

    // 전투 종료 체크
    const winner = battle.players.find(p => p.hp > 0);
    const loser = battle.players.find(p => p.hp <= 0);

    if (loser) {
      removeBattle(player.id);
      removeBattle(opponent.id);
      return interaction.update({
        content: `🏆 **${winner.name}** 승리!\n\n${log.join('\n')}`,
        components: [],
      });
    }

    // 저장 및 다음 턴 안내
    setBattle(player.id, battle);
    setBattle(opponent.id, battle);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('attack').setLabel('⚔️ 공격').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 방어').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('skill').setLabel('💥 스킬').setStyle(ButtonStyle.Danger),
    );

    await interaction.update({
      content: `${log.join('\n')}\n\n🔄 이제 **${opponent.name}**님의 차례입니다.`,
      components: [row],
    });
  },
};
