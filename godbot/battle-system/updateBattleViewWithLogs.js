const { battleEmbed } = require('../embeds/battle-embed');
const LOG_LIMIT = 10;

async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  const logsView = (battle.logs || []).slice(-LOG_LIMIT);

  const view = await battleEmbed({
    user: battle.user,
    enemy: battle.enemy,
    turn: battle.turn,
    logs: logsView,
    isUserTurn: battle.isUserTurn,
    activeUserId
  });

  try {
    await interaction.editReply(view);
  } catch (e) {
    console.error('❌ [디버그] updateBattleViewWithLogs 실패:', e);
    try { await interaction.reply({ content: '❌ 배틀 임베드 갱신 오류!', ephemeral: true }); } catch {}
  }
}

module.exports = updateBattleViewWithLogs;
