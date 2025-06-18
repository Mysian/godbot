module.exports = {
  "점멸": {
    name: "점멸",
    desc: "다음 상대의 공격을 100% 회피 (4턴 쿨타임)",
    icon: "⚡",
    price: 5000,
    effect: (user, enemy, context, battle) => {
      user._flashCooldown = user._flashCooldown || 0;
      if (user._flashCooldown > 0) return "⚡ 점멸은 아직 쿨타임입니다!";
      context.effects[user.id] = context.effects[user.id] || [];
      context.effects[user.id].push({ type: "dodgeNext", turns: 1 });
      user._flashCooldown = 4;
      return "⚡ 점멸! 다음 상대 공격 완전 회피 (4턴 쿨타임)";
    }
  },
  "회복": {
    name: "회복",
    desc: "HP 25% 즉시 회복, 1턴간 받는 피해 20% 감소 (5턴 쿨타임)",
    icon: "💚",
    price: 3000,
    effect: (user, enemy, context, battle) => {
      user._healCooldown = user._healCooldown || 0;
      if (user._healCooldown > 0) return "💚 회복은 아직 쿨타임입니다!";
      const heal = Math.floor(user.stats.hp * 0.25);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      context.effects[user.id] = context.effects[user.id] || [];
      context.effects[user.id].push({ type: "damageReduce", value: 0.2, turns: 1 });
      user._healCooldown = 5;
      return `💚 회복! HP ${heal} 회복, 1턴간 받는 피해 20% 감소 (5턴 쿨타임)`;
    }
  },
  "점화": {
    name: "점화",
    desc: "상대 2턴간 매턴 HP 15% 고정 피해 (회복효과 50% 감소, 4턴 쿨타임)",
    icon: "🔥",
    price: 2000,
    effect: (user, enemy, context, battle) => {
      user._igniteCooldown = user._igniteCooldown || 0;
      if (user._igniteCooldown > 0) return "🔥 점화는 아직 쿨타임입니다!";
      context.effects[enemy.id] = context.effects[enemy.id] || [];
      context.effects[enemy.id].push({ type: "burn", value: Math.floor(enemy.stats.hp * 0.15), turns: 2 });
      context.effects[enemy.id].push({ type: "healReduce", value: 0.5, turns: 2 });
      user._igniteCooldown = 4;
      return "🔥 점화! 2턴간 매턴 15% 고정 피해+회복효과 50% 감소 (4턴 쿨타임)";
    }
  },
  "탈진": {
    name: "탈진",
    desc: "상대 2턴간 공격력/주문력 40% 감소 (5턴 쿨타임)",
    icon: "🥵",
    price: 2000,
    effect: (user, enemy, context, battle) => {
      user._exhaustCooldown = user._exhaustCooldown || 0;
      if (user._exhaustCooldown > 0) return "🥵 탈진은 아직 쿨타임입니다!";

      // 즉시 stats 감소 (원래 수치 저장)
      enemy._origAttack = enemy._origAttack ?? enemy.stats.attack;
      enemy._origAp = enemy._origAp ?? enemy.stats.ap;
      enemy.stats.attack = Math.floor(enemy.stats.attack * 0.6);
      enemy.stats.ap = Math.floor(enemy.stats.ap * 0.6);

      context.effects[enemy.id] = context.effects[enemy.id] || [];
      context.effects[enemy.id].push({ type: "exhaust", turns: 2 }); // 복구용 버프
      user._exhaustCooldown = 5;
      return "🥵 탈진! 상대 공격력/주문력 40% 즉시 감소 (2턴), 이후 원상복구 (5턴 쿨타임)";
    }
  },
  "정화": {
    name: "정화",
    desc: "모든 디버프 해제, 1턴간 상태이상 면역 (6턴 쿨타임)",
    icon: "🧼",
    price: 2000,
    effect: (user, enemy, context, battle) => {
      user._cleanseCooldown = user._cleanseCooldown || 0;
      if (user._cleanseCooldown > 0) return "🧼 정화는 아직 쿨타임입니다!";
      // 디버프 효과만 제거
      context.effects[user.id] = (context.effects[user.id] || []).filter(e => e.type.endsWith('Buff'));
      context.effects[user.id].push({ type: "immune", turns: 1 });
      user._cleanseCooldown = 6;
      return "🧼 정화! 모든 디버프 해제+1턴간 상태이상 면역 (6턴 쿨타임)";
    }
  },
  "유체화": {
    name: "유체화",
    desc: "3턴간 회피 확률 25% 증가 (6턴 쿨타임)",
    icon: "👻",
    price: 1000,
    effect: (user, enemy, context, battle) => {
      user._ghostCooldown = user._ghostCooldown || 0;
      if (user._ghostCooldown > 0) return "👻 유체화는 아직 쿨타임입니다!";
      context.effects[user.id] = context.effects[user.id] || [];
      context.effects[user.id].push({ type: "dodgeUp", value: 0.25, turns: 3 });
      user._ghostCooldown = 6;
      return "👻 유체화! 3턴간 회피 확률 25% 증가 (6턴 쿨타임)";
    }
  }
};
