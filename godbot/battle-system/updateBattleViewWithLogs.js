const { battleEmbed } = require('../embeds/battle-embed');
const LOG_LIMIT = 10;

async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  const baseLogs = (battle.logs || []).slice(-LOG_LIMIT - newLogs.length);
  let replied = false;
  for (let i = 0; i < newLogs.length; i++) {
    const logsView = baseLogs.concat(newLogs.slice(0, i + 1)).slice(-LOG_LIMIT);

    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: logsView,
      isUserTurn: battle.isUserTurn,
      activeUserId,
      disableAllButtons: true
    });

    // 안전하게 update→reply→editReply 순서로 처리
    if (!replied) {
      try {
        await interaction.update(view);
        replied = true;
      } catch (e1) {
        try {
          await interaction.reply(view);
          replied = true;
        } catch (e2) {
          // 마지막 수단: editReply (이미 replied 상태면 이거만 성공)
          try {
            await interaction.editReply(view);
            replied = true;
          } catch (e3) {
            // 다 실패해도 일단 패스
            console.error('❌ [디버그] update/reply/editReply 모두 실패:', e3);
          }
        }
      }
    } else {
      try {
        await interaction.editReply(view);
      } catch (e) {
        // 여기서도 실패시 로깅만
        console.error('❌ [디버그] editReply 실패:', e);
      }
    }
    await new Promise(r => setTimeout(r, 550));
  }
}
module.exports = updateBattleViewWithLogs;
