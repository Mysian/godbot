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

  // 이미 처리된 interaction이면 무시
  if (interaction.replied || interaction.deferred) {
    try {
      await interaction.editReply(view);
    } catch (e) {
      // 만료 등으로 또 실패하면 아예 무시
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
