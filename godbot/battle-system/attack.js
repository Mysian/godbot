// battle-system/attack.js
module.exports = function attack(user, enemy, context) {
  // 평타 공식 (예시: 공격력, 주문력, 관통력, 방어력 계산)
  const atk = user.stats.attack;
  const ap = user.stats.ap;
  const pen = user.stats.penetration || 0;
  const def = enemy.stats.defense || 0;

  // 평타 공식: 가장 높은 스탯 100% + 나머지 50%
  let base = Math.max(atk, ap) + Math.floor(Math.min(atk, ap) * 0.5);

  // 관통력 효과: 방어력 대비로 추가증폭 (최대 2배까지)
  let penEffect = 1.0;
  if (pen >= def) {
    penEffect = 1.2 + Math.min((pen - def) * 0.008, 0.8); // 최대 2배
  } else {
    penEffect = 1 + Math.max((pen - def) * 0.006, -0.3); // 방어력 더 높으면 데미지 감소
  }

  let dmg = Math.floor(base * penEffect);

  context.damage = dmg;
  context.defPenetrate = penEffect;
  return dmg;
};
