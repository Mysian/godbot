// battle-system/defend.js
const applyPassives = require('./passive');

module.exports = function defend(user, enemy, context) {
  // 기본 방어 상태 플래그
  user.isDefending = true;
  context.defending = true;

  // effect 적용 준비 (없으면 초기화)
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];

  const logs = [];
  
  // 1. 'onDefend' 트리거로 패시브 처리 (ex: 람머스, 알리스타, 유미 등)
  //    passive.js는 모든 챔피언 패시브를 context.js 구조로 갖고 있다고 가정
  let passiveLog = applyPassives(user, enemy, context, 'onDefend');
  if (passiveLog) logs.push(passiveLog);

  // 2. 방어시 자동 적용되는 효과 (피해 50% 경감 등)
  //    - context에 맞춰 효과를 push (ex: 기본 방어효과)
  //    - 이 값은 실제 피해 계산 시 context.damage에 곱해짐
  context.effects[user.id].push({ type: 'damageReductionPercent', value: 50, turns: 1 });
  logs.push('🛡️ 방어자세! 다음 피해 50% 감소');

  // 3. 기타 패시브/효과 후처리 hook (유저 상태, 무적, 반사 등)
  //    예) 유저가 무적(effect.invulnerable) 등 상태라면 이후 판정에서 damage 0
  
  // 4. 이펙트/상태 로그 반환 (배틀엔진에서 logs 누적 사용)
  return logs.join('\n');
};
