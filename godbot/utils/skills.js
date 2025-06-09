module.exports = {
  "아리": {
    name: "매혹의 구슬",
    description: "공격 시 추가로 20 주문력 피해를 입힙니다.",
    apply: (attacker, defender, isAttack, baseDamage) => {
      if (!isAttack) return baseDamage;
      return baseDamage + 20;
    }
  },
  "가렌": {
    name: "정의의 심판",
    description: "공격 시 20% 확률로 피해량이 2배가 됩니다.",
    apply: (attacker, defender, isAttack, baseDamage) => {
      if (!isAttack) return baseDamage;
      const double = Math.random() < 0.2;
      return double ? baseDamage * 2 : baseDamage;
    }
  },
  "알리스타": {
    name: "불굴의 의지",
    description: "받는 피해를 15% 확률로 절반으로 줄입니다.",
    apply: (attacker, defender, isAttack, baseDamage) => {
      if (isAttack) return baseDamage;
      const reduce = Math.random() < 0.15;
      return reduce ? Math.floor(baseDamage * 0.5) : baseDamage;
    }
  },
  "애쉬": {
    name: "서리 화살",
    description: "공격 시 상대의 방어력을 3 감소시킵니다. (일시적)",
    apply: (attacker, defender, isAttack, baseDamage) => {
      if (!isAttack) return baseDamage;
      defender.defense = Math.max(0, defender.defense - 3);
      return baseDamage;
    }
  },
  "브라이어": {
    name: "광기의 흡혈",
    description: "공격 시 20%의 피해만큼 체력을 회복합니다.",
    apply: (attacker, defender, isAttack, baseDamage) => {
      if (!isAttack) return baseDamage;
      const heal = Math.floor(baseDamage * 0.2);
      attacker.hp = Math.min(attacker.hp + heal, attacker.stats.hp);
      return baseDamage;
    }
  }
  // ✨ 더 추가 가능!
};
