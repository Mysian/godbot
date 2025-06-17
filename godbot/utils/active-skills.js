// utils/active-skills.js
module.exports = {
  "섬광": {
    name: "섬광",
    desc: "1회 사용 시 상대의 다음 공격 100% 회피 (3턴 쿨타임)",
    icon: "⚡",
    price: 700,
    effect: (user, enemy, context, battle) => {
      user._flashCooldown = user._flashCooldown || 0;
      if (user._flashCooldown > 0) {
        return "⚡ 섬광은 아직 쿨타임입니다!";
      }
      context.effects[user.id] = context.effects[user.id] || [];
      context.effects[user.id].push({ type: "dodgeNext", turns: 1 });
      user._flashCooldown = 3;
      return "⚡ 섬광! 이번 턴 상대의 공격을 100% 회피합니다. (3턴 쿨타임)";
    }
  },
  "일격": {
    name: "일격",
    desc: "상대에게 공격력의 200% 피해 (5턴 쿨타임)",
    icon: "💥",
    price: 1000,
    effect: (user, enemy, context, battle) => {
      user._powerStrikeCooldown = user._powerStrikeCooldown || 0;
      if (user._powerStrikeCooldown > 0) {
        return "💥 일격은 아직 쿨타임입니다!";
      }
      const damage = user.stats.attack * 2;
      enemy.hp = Math.max(0, enemy.hp - damage);
      user._powerStrikeCooldown = 5;
      return `💥 일격! ${enemy.nickname}에게 ${damage} 피해 (5턴 쿨타임)`;
    }
  },
  // ★ 필요한 스킬만 추가
};
