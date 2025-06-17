const { battleEmbed } = require('../embeds/battle-embed');
const LOG_LIMIT = 10;

// 버튼 disableAllButtons 완전 삭제
async function updateBattleViewWithLogs(interaction, battle, newLogs, activeUserId) {
  const baseLogs = (battle.logs || []).slice(-LOG_LIMIT - newLogs.length);
  let replied = false;
  for (let i = 0; i < newLogs.length; i++) {
    const logsView = baseLogs.concat(newLogs.slice(0, i + 1)).slice(-LOG_LIMIT);

    // disableAllButtons: true 옵션 제거!
    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: logsView,
      isUserTurn: battle.isUserTurn,
      activeUserId
      // disableAllButtons 없이, 기본값 false로만 남김!
    });

    if (!replied) {
      try {
        await interaction.update(view);
        replied = true;
      } catch (e1) {
        try {
          await interaction.reply(view);
          replied = true;
        } catch (e2) {
          try {
            await interaction.editReply(view);
            replied = true;
          } catch (e3) {
            console.error('❌ [디버그] update/reply/editReply 모두 실패:', e3);
          }
        }
      }
    } else {
      try {
        await interaction.editReply(view);
      } catch (e) {
        console.error('❌ [디버그] editReply 실패:', e);
      }
    }
    await new Promise(r => setTimeout(r, 550));
  }
}
module.exports = async () => {};
