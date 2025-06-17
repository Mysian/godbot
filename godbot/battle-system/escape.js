const runPassive = require('./passive');
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function escape(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];
  logs = logs || [];

  if (user.escaped) {
    logs.push('🏃 이미 탈주 상태입니다.');
    return logs;
  }

  try {
    let passiveLog = runPassive(user, enemy, context, "onEscape");
    if (Array.isArray(passiveLog) && passiveLog.length > 0) logs.push(...passiveLog);
    else if (passiveLog) logs.push(passiveLog);
  } catch (e) {}

  logs.push(`${getChampionNameByUserId(user.id)}가 탈주를 시도합니다!`);
  return logs;
};
