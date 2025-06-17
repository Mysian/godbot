// utils/items.js
module.exports = {
  "회복포션": {
    name: "회복포션",
    desc: "HP의 20%를 회복합니다.",
    icon: "🧪",
    price: 300,
    effect: (user, context) => {
      user._itemUsedCount = user._itemUsedCount || 0;
      if (user._itemUsedCount >= 3) {
        return "🚫 이번 전투에서는 아이템을 더 이상 사용할 수 없습니다! (최대 3회)";
      }
      user._itemUsedCount += 1;
      const heal = Math.floor(user.stats.hp * 0.2);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      return `🧪 회복포션 사용! 체력 ${heal} 회복 (아이템 사용 ${user._itemUsedCount}/3)`;
    }
  },
  "마나포션": {
    name: "마나포션",
    desc: "주문력의 15%만큼 2턴 주문력 버프",
    icon: "🔮",
    price: 250,
    effect: (user, context) => {
      user._itemUsedCount = user._itemUsedCount || 0;
      if (user._itemUsedCount >= 3) {
        return "🚫 이번 전투에서는 아이템을 더 이상 사용할 수 없습니다! (최대 3회)";
      }
      user._itemUsedCount += 1;
      const bonus = Math.floor(user.stats.ap * 0.15);
      context.effects[user.id] = context.effects[user.id] || [];
      context.effects[user.id].push({ type: "apBuff", value: bonus, turns: 2 });
      return `🔮 마나포션 사용! 주문력 +${bonus} (2턴) (아이템 사용 ${user._itemUsedCount}/3)`;
    }
  },
  // ★ 필요한 아이템만 추가
};
