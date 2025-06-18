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
    // 항상 editReply만 사용 (update/reply 꼬임 방지)
    await interaction.editReply(view);
  } catch (e) {
    console.error('❌ [디버그] updateBattleViewWithLogs 실패:', e);
    try { await interaction.reply({ content: '❌ 배틀 임베드 갱신 오류!', ephemeral: true }); } catch {}
  }
}

module.exports = updateBattleViewWithLogs;
