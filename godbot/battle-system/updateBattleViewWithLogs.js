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
    // 1. 이미 응답(replied) 또는 defer됐으면 editReply만!
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(view);
    } else {
      // 2. 아직 아무 응답도 안 했으면 update만!
      await interaction.update(view);
    }
  } catch (e) {
    // (진짜 예외상황만 로그, 중복 호출은 절대 없음)
    console.error('❌ [디버그] updateBattleViewWithLogs 실패:', e);
  }
}

module.exports = updateBattleViewWithLogs;
