// dodge.js
const runPassive = require('./passive');
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function dodge(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];

  user.isDodging = true;
  context.dodging = true;

  // 회피 불가 상태 체크
  if (user.dodgeBlocked) {
    logs.push("❌ 회피 불가 상태!");
    user.isDodging = false;
    context.dodging = false;
    return `${user.nickname || user.name}는 회피 불가 상태로 점멸 실패!`;
  }

  // 패시브 트리거 (회피자)
  let passiveLog = runPassive(user, enemy, context, "onDodge");
  if (passiveLog) logs.push(passiveLog);

  logs.push(`${getChampionNameByUserId(user.id)} 점멸(회피) 시도!`);
  return `${user.nickname || user.name} 점멸(회피) 시도!`;
};
