// defend.js
const runPassive = require('./passive'); // 기본 export라 이렇게 임포트
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function defend(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];

  // 상태 체크 (기절 등)
  if (user.stunned) {
    logs.push('😵 행동 불가! (기절)');
    user.stunned = false;
    return;
  }
  if (user.escaped) {
    logs.push('🏃 이미 탈주 상태입니다.');
    return;
  }
  if (user.invulnerable) {
    logs.push('🛡️ 무적! 피해 없음.');
    return;
  }

  // 패시브 효과 트리거 (방어자, 수비시)
  let passiveLog = runPassive(user, enemy, context, "onDefend");
  if (passiveLog) logs.push(passiveLog);

  // 추가로, 공격자 패시브 중 방어에 영향 주는 것도 트리거
  passiveLog = runPassive(enemy, user, context, "onAttackDefend");
  if (passiveLog) logs.push(passiveLog);

  // 기타 상태/버프 처리(필요하면 추가)

  logs.push(`${getChampionNameByUserId(user.id)}가 방어 행동을 취함!`);
  return;
};
