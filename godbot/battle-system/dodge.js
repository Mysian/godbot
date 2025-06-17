const runPassive = require('./passive');
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function dodge(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];
  logs = logs || [];

  user.isDodging = true;
  context.dodging = true;

  if (user.dodgeBlocked) {
    logs.push("❌ 회피 불가 상태!");
    user.isDodging = false;
    context.dodging = false;
    return logs;
  }

  try {
    let passiveLog = runPassive(user, enemy, context, "onDodge");
    if (Array.isArray(passiveLog) && passiveLog.length > 0) logs.push(...passiveLog);
    else if (passiveLog) logs.push(passiveLog);
  } catch (e) {}

  logs.push(`${getChampionNameByUserId(user.id)} 점멸(회피) 시도!`);
  return logs;
};
