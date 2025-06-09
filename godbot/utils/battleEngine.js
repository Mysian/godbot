const skills = require("./skills");

function calculateDamage(attackerStats, defenderStats, isAttack) {
  const atk = attackerStats.attack;
  const ap = attackerStats.ap;
  const pen = attackerStats.penetration ?? 0;
  const def = defenderStats.defense;

  const mainStat = atk > ap ? atk : ap;
  const type = atk > ap ? "물리" : "마법";

  // 🔸 데미지 기본 범위: 주요 스탯 × (0.8 ~ 1.2)
  const randomMultiplier = 0.8 + Math.random() * 0.4;
  let rawDamage = Math.floor(mainStat * randomMultiplier);

  // 🔸 방어력 비율에 따른 피해 감소
  const defRatio = def / (def + 100);
  let finalDamage = Math.floor(rawDamage * (1 - defRatio));

  // 🔸 크리티컬 확률: 기본 10% + (관통력 × 0.5%)
  const critChance = 0.10 + (pen * 0.005);
  const isCrit = Math.random() < critChance;
  if (isCrit) {
    finalDamage = Math.floor(finalDamage * 1.5);
  }

  // 🔸 방어력에 따른 완막 확률
  const blockChance = def >= 60 ? 0.1 : 0;
  const isBlock = Math.random() < blockChance;
  if (isBlock) {
    finalDamage = Math.floor(finalDamage * 0.5);
  }

  // 🔸 방어 시 전체 데미지 절반
  if (!isAttack) {
    finalDamage = Math.floor(finalDamage * 0.5);
  }

  // 🔸 최소 데미지 보장
  if (finalDamage < 1) finalDamage = 1;

  // 🔮 스킬 적용
  let skillLog = "";
  const skill = skills[attackerStats.name];
  if (skill && typeof skill.apply === "function") {
    const before = finalDamage;
    finalDamage = skill.apply(attackerStats, defenderStats, isAttack, finalDamage);
    if (finalDamage !== before && skill.description) {
      skillLog = `\n🔮 스킬 발동: **${skill.name}** - ${skill.description}`;
    }
  }

  // 📝 로그 출력
  let log = isAttack
    ? `💥 **${type} 공격** → ${finalDamage} 데미지 입힘!`
    : `🛡️ **방어** → 피해 절반(${finalDamage})으로 감소!`;

  if (isCrit) log += " (⚡크리티컬!)";
  if (isBlock) log += " (🛡️방어 일부 막음)";
  log += skillLog;

  return {
    damage: finalDamage,
    log
  };
}

module.exports = { calculateDamage };
