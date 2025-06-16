// attack.js
const { runPassive } = require('./passive');
const { getChampionNameByUserId } = require('./champion-utils');
const { getUserStatus } = require('./user-utils');

// attack(user, enemy, context, logs) 형식 가정
module.exports = async function attack(user, enemy, context, logs) {
  // 1. 사전 체크
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];

  // 2. 패시브/상태: 기절/무적/도주상태 등 판정
  if (user.stunned) {
    logs.push('😵 행동 불가! (기절)');
    user.stunned = false; // 1회성
    return;
  }
  if (user.noAttack) {
    logs.push('🚫 공격 불가 상태!');
    user.noAttack = false;
    return;
  }
  if (user.escaped) {
    logs.push('🏃 이미 탈주 상태입니다.');
    return;
  }
  if (enemy.invulnerable) {
    logs.push('🛡️ 상대 무적! 피해를 줄 수 없음.');
    return;
  }
  if (enemy.missNext) {
    logs.push('😶‍🌫️ 상대의 공격 무효(회피/실명 등)!');
    enemy.missNext = false;
    return;
  }
  if (enemy.dodgeNext) {
    logs.push('💨 상대가 회피했습니다!');
    enemy.dodgeNext = false;
    return;
  }

  // 3. 기본 데미지 계산
  let damage = 0;
  // 공격력/주문력 높은 값 + 낮은 값*0.5 방식 (네 요구대로)
  const atk = user.stats.attack || 0;
  const ap = user.stats.ap || 0;
  if (atk >= ap) damage = atk + Math.floor(ap * 0.5);
  else damage = ap + Math.floor(atk * 0.5);

  // 관통 적용
  let finalPen = user.stats.penetration || 0;
  let finalDef = enemy.stats.defense || 0;
  // 패시브에서 관통버프, ignoreDef 등 조작 가능
  if (context.defPenetrate !== undefined) {
    // 0~1, 예: 1.0이면 100%관통
    finalDef = Math.floor(finalDef * (1 - context.defPenetrate));
  }
  if (context.ignoreDefensePercent !== undefined) {
    finalDef = Math.floor(finalDef * (1 - context.ignoreDefensePercent));
  }

  let penRatio = 0;
  if (finalDef > 0) penRatio = Math.min(finalPen / finalDef, 1);
  let bonusAmp = 1 + penRatio; // 관통이 방어보다 높을수록 최대 2배(200%)
  damage = Math.floor(damage * bonusAmp);

  // 4. 패시브 효과 적용(공격자)
  context.damage = damage;
  let passiveLog = runPassive(user, enemy, context, "onAttack");
  if (passiveLog) logs.push(passiveLog);

  // 5. 효과/디버프 적용 (context.effects[user.id], context.effects[enemy.id])
  // 턴별 효과 실행 (ex. atkBuffPercent, damageBuff, ... - 네가 만든 if문 목록 순서대로)
  // (여기서는 데미지/버프/디버프 위주로 처리)
  for (const effect of [...(context.effects[user.id] || []), ...(context.effects[enemy.id] || [])]) {
    if (effect.turns <= 0) continue;
    // 필요한 if문 구조로 쭉 돌려서 처리 (네가 context.js에 만든 구조)
    // (여기서 다 돌리기엔 길어서, 실제론 별도의 effectProcessor.js 분리 추천)
  }

  // 6. 수비자 패시브
  passiveLog = runPassive(enemy, user, context, "onDefend");
  if (passiveLog) logs.push(passiveLog);

  // 7. 치명타 판정 (이즈리얼/트린다미어/야스오 등, passive.js에서 critChance/critDamage 등 세팅됨)
  if (user.critChance && Math.random() < user.critChance) {
    const cd = user.critDamage || 1.5;
    context.damage = Math.floor(context.damage * cd);
    logs.push(`💥 치명타! 피해 ${cd}배!`);
  }

  // 8. 최종 데미지 적용
  context.damage = Math.max(0, context.damage);
  enemy.hp = Math.max(0, enemy.hp - context.damage);
  logs.push(`🗡️ ${getChampionNameByUserId(user.id)}의 공격! → ${getChampionNameByUserId(enemy.id)}에게 ${context.damage} 피해`);

  // 9. 도트/추가효과, 턴종료 후 적용은 battle-controller에서 별도로 처리
  // (ex. dot, heal, delayedDamage 등은 턴종료 or onTurnStart에서)
  
  // 10. 상태값/로그 정리
  // (상태: stun, invulnerable 등은 passive.js에서 적용됐으면 여기선 처리 X)

  // 11. 결과 반환
  return;
};
