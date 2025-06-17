// battle-system/updateBattleViewWithLogs.js
const { battleEmbed } = require('../embeds/battle-embed');

async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  // newLogs: 이번 액션으로 추가될 logs 배열 (길이 N)
  // battle.logs: 기존 누적된 logs (이전 턴까지)
  const baseLogs = (battle.logs || []).slice(-LOG_LIMIT); // 이전까지의 로그 N줄
  for (let i = 0; i < newLogs.length; i++) {
    // 기존 로그 + 이번 액션 신규 로그 1줄씩 차례로
    const logsView = baseLogs.concat(newLogs.slice(0, i + 1)).slice(-LOG_LIMIT);

    // 버튼 모두 비활성화(누르는 동안)
    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: logsView,
      isUserTurn: battle.isUserTurn,
      activeUserId,
      disableAllButtons: true // 버튼 전부 disabled (battleEmbed에서 적용)
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
