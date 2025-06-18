const runPassive = require('./passive');
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function pass(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];
  logs = logs || [];

  // 별도의 행동 상태X, 피해X, isDefending/isDodging 등도 X

  // 패시브 (onPass) 트리거: 혹시 패시브 구조화 원하면 이 라인 살려!
  try {
    let passiveLog = runPassive(user, enemy, context, "onPass");
    if (Array.isArray(passiveLog) && passiveLog.length > 0) logs.push(...passiveLog);
    else if (passiveLog) logs.push(passiveLog);
  } catch (e) {}

  logs.push(`😴 ${getChampionNameByUserId(user.id)}가 휴식(턴 넘기기)!`);
  // 체력 변화 없음, 추가 상태 없음
  return logs;
};
