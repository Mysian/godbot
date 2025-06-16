// utils/items.js

module.exports = {
  "회복포션": (user, context) => {
    user._itemUsedCount = user._itemUsedCount || 0;
    if (user._itemUsedCount >= 3) {
      return "🚫 이번 전투에서는 아이템을 더 이상 사용할 수 없습니다! (최대 3회)";
    }
    user._itemUsedCount += 1;
    const heal = Math.floor(user.stats.hp * 0.2);
    user.hp = Math.min(user.hp + heal, user.stats.hp);
    return `🧪 회복포션 사용! 체력 ${heal} 회복 (아이템 사용 ${user._itemUsedCount}/3)`;
  },
  "마나포션": (user, context) => {
    user._itemUsedCount = user._itemUsedCount || 0;
    if (user._itemUsedCount >= 3) {
      return "🚫 이번 전투에서는 아이템을 더 이상 사용할 수 없습니다! (최대 3회)";
    }
    user._itemUsedCount += 1;
    const bonus = Math.floor(user.stats.ap * 0.15);
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[user.id].push({ type: "apBuff", value: bonus, turns: 2 });
    return `🔮 마나포션 사용! 주문력 +${bonus} (2턴) (아이템 사용 ${user._itemUsedCount}/3)`;
  },
  "석화방패": (user, context) => {
    user._itemUsedCount = user._itemUsedCount || 0;
    if (user._itemUsedCount >= 3) {
      return "🚫 이번 전투에서는 아이템을 더 이상 사용할 수 없습니다! (최대 3회)";
    }
    user._itemUsedCount += 1;
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[user.id].push({ type: "block", turns: 1 });
    return `🛡️ 석화방패 사용! 1턴간 받는 모든 피해 무효! (아이템 사용 ${user._itemUsedCount}/3)`;
  },
  "무적구슬": (user, context) => {
    user._itemUsedCount = user._itemUsedCount || 0;
    if (user._itemUsedCount >= 3) {
      return "🚫 이번 전투에서는 아이템을 더 이상 사용할 수 없습니다! (최대 3회)";
    }
    user._itemUsedCount += 1;
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[user.id].push({ type: "debuffImmune", turns: 2 });
    return `🟣 무적구슬 사용! 2턴간 모든 디버프 무효화! (아이템 사용 ${user._itemUsedCount}/3)`;
  },
  "강화제": (user, context) => {
    user._itemUsedCount = user._itemUsedCount || 0;
    if (user._itemUsedCount >= 3) {
      return "🚫 이번 전투에서는 아이템을 더 이상 사용할 수 없습니다! (최대 3회)";
    }
    user._itemUsedCount += 1;
    user.stats.attack += 10;
    return `💉 강화제 사용! 공격력 +10 영구 증가! (아이템 사용 ${user._itemUsedCount}/3)`;
  },
};
