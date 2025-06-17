const { battleEmbed } = require('../embeds/battle-embed');
const LOG_LIMIT = 10;

async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  const baseLogs = (battle.logs || []).slice(-LOG_LIMIT - newLogs.length); // 기존 로그에서 앞으로 들어올 로그만큼은 미리 빼줌
  for (let i = 0; i < newLogs.length; i++) {
    const logsView = baseLogs.concat(newLogs.slice(0, i + 1)).slice(-LOG_LIMIT);

    // 모든 버튼 잠금 상태로 embed
    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: logsView,
      isUserTurn: battle.isUserTurn,
      activeUserId,
      disableAllButtons: true
    });

    if (i === 0) {
      try { await interaction.update(view); }
      catch (e) { await interaction.editReply(view); }
    } else {
      await interaction.editReply(view);
    }
    await new Promise(r => setTimeout(r, 550));
  }
}
module.exports = updateBattleViewWithLogs;
