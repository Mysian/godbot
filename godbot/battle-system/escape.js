// escape.js
const runPassive = require('./passive');
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function escape(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];

  if (user.escaped) {
    logs.push('🏃 이미 탈주 상태입니다.');
    return;
  }

  // 패시브 트리거 (탈주 시도자)
  let passiveLog = runPassive(user, enemy, context, "onEscape");
  if (passiveLog) logs.push(passiveLog);

  // 탈주 성공 여부 판정은 별도 처리
  logs.push(`${getChampionNameByUserId(user.id)}가 탈주를 시도합니다!`);
  return;
};
