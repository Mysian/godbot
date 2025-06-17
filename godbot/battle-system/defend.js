const runPassive = require('./passive');
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function defend(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];
  logs = logs || [];

  if (user.stunned) {
    logs.push('😵 행동 불가! (기절)');
    user.stunned = false;
    return logs;
  }
  if (user.escaped) {
    logs.push('🏃 이미 탈주 상태입니다.');
    return logs;
  }
  if (user.invulnerable) {
    logs.push('🛡️ 무적! 피해 없음.');
    return logs;
  }

  try {
    let passiveLog = runPassive(user, enemy, context, "onDefend");
    if (Array.isArray(passiveLog) && passiveLog.length > 0) logs.push(...passiveLog);
    else if (passiveLog) logs.push(passiveLog);
  } catch (e) {
    // 패시브 오류 무시
  }

  logs.push(`${getChampionNameByUserId(user.id)}가 방어 행동을 취함!`);
  return logs;
};
