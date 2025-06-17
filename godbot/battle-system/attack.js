const runPassive = require('./passive');
const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function attack(user, enemy, context, logs) {
  context.effects = context.effects || {};
  context.effects[user.id] = context.effects[user.id] || [];
  context.effects[enemy.id] = context.effects[enemy.id] || [];
  logs = logs || [];

  if (user.stunned) {
    logs.push('😵 행동 불가! (기절)');
    user.stunned = false;
    context.damage = 0;
    return logs;
  }
  if (user.noAttack) {
    logs.push('🚫 공격 불가 상태!');
    user.noAttack = false;
    context.damage = 0;
    return logs;
  }
  if (user.escaped) {
    logs.push('🏃 이미 탈주 상태입니다.');
    context.damage = 0;
    return logs;
  }
  if (enemy.invulnerable) {
    logs.push('🛡️ 상대 무적! 피해를 줄 수 없음.');
    context.damage = 0;
    return logs;
  }
  if (enemy.missNext) {
    logs.push('😶‍🌫️ 상대의 공격 무효(회피/실명 등)!');
    enemy.missNext = false;
    context.damage = 0;
    return logs;
  }
  if (enemy.dodgeNext) {
    logs.push('💨 상대가 회피했습니다!');
    enemy.dodgeNext = false;
    context.damage = 0;
    return logs;
  }

  // 1. 기본 데미지(±15% 변동)
  let damage = 0;
  const atk = user.stats.attack || 0;
  const ap = user.stats.ap || 0;
  if (atk >= ap) damage = atk + Math.floor(ap * 0.5);
  else damage = ap + Math.floor(atk * 0.5);
  // ±15% 랜덤 변동 (0.85 ~ 1.15)
  const variation = 0.85 + Math.random() * 0.3;
  damage = Math.round(damage * variation);

  // 2. 관통/방어력 (너프!)
  let finalPen = user.stats.penetration || 0;
  let finalDef = enemy.stats.defense || 0;
  if (context.defPenetrate !== undefined) finalDef = Math.floor(finalDef * (1 - context.defPenetrate));
  if (context.ignoreDefensePercent !== undefined) finalDef = Math.floor(finalDef * (1 - context.ignoreDefensePercent));
  let penRatio = 0;
  if (finalDef > 0) penRatio = Math.min(finalPen / finalDef, 0.5); // ★ 최대 0.5까지만(1.5배)
  let bonusAmp = 1 + penRatio;
  damage = Math.floor(damage * bonusAmp);

  // 3. 패시브
  context.damage = damage;
  let passiveLog = runPassive(user, enemy, context, "onAttack");
  if (Array.isArray(passiveLog)) logs.push(...passiveLog);
  else if (passiveLog) logs.push(passiveLog);

  passiveLog = runPassive(enemy, user, context, "onDefend");
  if (Array.isArray(passiveLog)) logs.push(...passiveLog);
  else if (passiveLog) logs.push(passiveLog);

  // 4. 치명타
  if (user.critChance && Math.random() < user.critChance) {
    const cd = user.critDamage || 1.5;
    context.damage = Math.floor(context.damage * cd);
    logs.push(`💥 치명타! 피해 ${cd}배!`);
  }

  context.damage = Math.max(0, context.damage);

  logs.push(`🗡️ ${getChampionNameByUserId(user.id)}의 공격! → ${getChampionNameByUserId(enemy.id)}에게 ${context.damage} 피해`);
  return logs;
};
