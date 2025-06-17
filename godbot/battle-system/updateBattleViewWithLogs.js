const { battleEmbed } = require('../embeds/battle-embed');
const LOG_LIMIT = 10;

async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  // battle.logs는 이미 최신 로그로 갱신되어 있으므로, 그대로 사용
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
    await interaction.update(view);
  } catch (e1) {
    try {
      await interaction.reply(view);
    } catch (e2) {
      try {
        await interaction.editReply(view);
      } catch (e3) {
        console.error('❌ [디버그] update/reply/editReply 모두 실패:', e3);
      }
    }
  }
}

module.exports = updateBattleViewWithLogs;
