const { battleEmbed } = require('../embeds/battle-embed');
const LOG_LIMIT = 10;

async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  let logsView = (battle.logs || []).slice(-LOG_LIMIT);

  // ★ 연속 중복 로그 자동 제거
  const filteredLogsView = [];
  let lastLog = null;
  for (const log of logsView) {
    if (log !== lastLog) filteredLogsView.push(log);
    lastLog = log;
  }
  // ----

  const view = await battleEmbed({
    user: battle.user,
    enemy: battle.enemy,
    turn: battle.turn,
    logs: filteredLogsView,   // ← 여기!
    isUserTurn: battle.isUserTurn,
    activeUserId
  });

  if (interaction.replied || interaction.deferred) {
    try {
      await interaction.editReply(view);
    } catch (e) {
      console.error('❌ [디버그] updateBattleViewWithLogs 실패(editReply):', e);
    }
    return;
  }

  try {
    await interaction.update(view);
  } catch (e) {
    console.error('❌ [디버그] updateBattleViewWithLogs 실패(update):', e);
  }
}

module.exports = updateBattleViewWithLogs;
