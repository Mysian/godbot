const skills = require("./skills");

function calculateDamage(attacker, defender, isAttack = true) {
  const attackPower = isAttack ? attacker.attack : 0;
  const apPower = attacker.ap || 0;
  const penetration = attacker.penetration || 0;
  const defense = defender.defense || 0;

  const effectiveDefense = Math.max(0, defense - penetration);
  const baseDamage = Math.max(0, (attackPower + apPower) - effectiveDefense);

  const critChance = 0.1 + (penetration * 0.02);
  const isCrit = Math.random() < critChance;
  const damage = isCrit ? baseDamage * 1.5 : baseDamage;

  const evadeChance = 0.05;
  const isEvaded = Math.random() < evadeChance;
  if (isEvaded) {
    return {
      damage: 0,
      critical: false,
      evaded: true,
      log: `😎 ${defender.name}이(가) 공격을 회피했다!`
    };
  }

  return {
    damage: Math.round(damage),
    critical: isCrit,
    evaded: false,
    log: `${attacker.name}의 공격으로 ${Math.round(damage)} 피해를 입혔습니다.` + (isCrit ? " (💥 크리티컬!)" : "")
  };
}

module.exports = { calculateDamage }; // ✅ 이 줄이 빠졌던 거야!
