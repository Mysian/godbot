const { battleEmbed } = require('../embeds/battle-embed');
const LOG_LIMIT = 10;

async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  const logsView = (battle.logs || []).slice(-LOG_LIMIT);
  // 쉬기 테스트
  console.log('[pass debug] interaction', { replied: interaction.replied, deferred: interaction.deferred });
  console.log('[pass debug] battle', battle);
  console.log('[pass debug] newLogs', newLogs);
  // 끝나면 위 3줄 지울거임
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
