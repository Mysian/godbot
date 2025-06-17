// battle-system/updateBattleViewWithLogs.js
const { battleEmbed } = require('../embeds/battle-embed');

async function updateBattleViewWithLogs(interaction, battle, logs, activeUserId) {
  // logs: battle.logs 배열 (이미 누적된 로그라면 battle.logs 그대로 사용)
  // activeUserId: 현재 차례인 유저 id
  for (let i = 0; i < logs.length; i++) {
    // 현재 로그까지 누적
    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: logs.slice(0, i + 1),
      isUserTurn: battle.isUserTurn,
      activeUserId
    });
    // 첫 번째는 interaction.update, 이후는 editReply
    if (i === 0) {
      try { await interaction.update(view); }
      catch (e) { await interaction.editReply(view); }
    } else {
      await interaction.editReply(view);
    }
    // 약간의 텀
    await new Promise(r => setTimeout(r, 600));
  }
}

module.exports = updateBattleViewWithLogs;
