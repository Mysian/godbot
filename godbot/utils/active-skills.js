// utils/active-skills.js

module.exports = {
  "섬광": (user, enemy, context) => {
    // 점멸(섬광): 1회 사용 시 상대의 다음 공격 100% 회피, 3턴 쿨타임
    if (user._flashCooldown && user._flashCooldown > 0) {
      return "⚡ 섬광은 아직 쿨타임입니다!";
    }
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[user.id].push({ type: "evade", turns: 1 });
    user._flashCooldown = 3;
    return "⚡ 섬광! 이번 턴 상대의 공격을 100% 회피합니다. (3턴 쿨타임)";
  },
  "흡혈": (user, enemy, context) => {
    // 흡혈: 이번 공격이 명중하면 피해량의 30%만큼 체력 회복, 2턴 쿨타임
    if (user._leechCooldown && user._leechCooldown > 0) {
      return "🧛 흡혈은 아직 쿨타임입니다!";
    }
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[user.id].push({ type: "leech", value: 0.3, turns: 1 });
    user._leechCooldown = 2;
    return "🧛 흡혈! 다음 공격 피해량의 30%만큼 체력을 회복합니다. (2턴 쿨타임)";
  },
  "방어전환": (user, enemy, context) => {
    // 방어전환: 2턴간 받는 피해 40% 감소, 5턴 쿨타임
    if (user._guardCooldown && user._guardCooldown > 0) {
      return "🛡️ 방어전환은 아직 쿨타임입니다!";
    }
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[user.id].push({ type: "guard", value: 0.4, turns: 2 });
    user._guardCooldown = 5;
    return "🛡️ 2턴간 받는 피해 40% 감소! (5턴 쿨타임)";
  },
  // 예시 추가: "재생의 바람"
  "재생의 바람": (user, enemy, context) => {
    // 3턴에 걸쳐 턴 시작마다 최대체력의 10% 회복 (4턴 쿨타임)
    if (user._regenCooldown && user._regenCooldown > 0) {
      return "💨 재생의 바람은 아직 쿨타임입니다!";
    }
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[user.id].push({ type: "regen", value: 0.10, turns: 3 });
    user._regenCooldown = 4;
    return "💨 3턴간 매턴 최대체력 10% 회복! (4턴 쿨타임)";
  },
};
