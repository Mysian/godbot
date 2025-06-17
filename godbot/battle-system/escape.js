// battle-system/escape.js
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
    if (Array.isArray(passiveLog)) logs.push(...passiveLog);
    else if (passiveLog) logs.push(passiveLog);
  } catch (e) {}

  // (탈주 성공/실패 여부 처리 로직 네 게임 엔진 쪽에 추가해야 함)
  logs.push(`${getChampionNameByUserId(user.id)}가 탈주 시도!`);
  return logs;
};
