function calculateDamage(attackerStats, defenderStats, isAttack) {
  const mainStat = attackerStats.attack > attackerStats.ap ? attackerStats.attack : attackerStats.ap;
  const type = attackerStats.attack > attackerStats.ap ? "물리" : "마법";

  const effectiveDef =
    defenderStats.defense - attackerStats.penetration < 0
      ? 0
      : defenderStats.defense - attackerStats.penetration;

  let baseDamage = Math.floor(mainStat - effectiveDef);
  if (baseDamage < 5) baseDamage = 5;

  const damage = isAttack ? baseDamage : Math.floor(baseDamage / 2); // 방어 시 절반 피해

  const log = isAttack
    ? `🔪 **${type} 공격** → ${damage} 데미지 입힘!`
    : `🛡️ **방어** → 피해 절반(${damage})으로 감소!`;

  return { damage, log };
}

module.exports = { calculateDamage };
