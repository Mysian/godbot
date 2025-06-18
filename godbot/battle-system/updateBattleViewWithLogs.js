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
    // 먼저 update 시도 (버튼 등에서 바로 갱신)
    await interaction.update(view);
  } catch (e1) {
    try {
      // update가 안 되면 editReply 시도 (이미 응답된 상태)
      await interaction.editReply(view);
    } catch (e2) {
      // 둘 다 실패하면 그냥 무시 (Interaction expired 등)
      console.error('❌ [디버그] updateBattleViewWithLogs 완전실패:', e2);
    }
  }
}

module.exports = updateBattleViewWithLogs;
