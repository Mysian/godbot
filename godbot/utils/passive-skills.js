module.exports = {
  "애니비아": {
    description: "죽음에 이를 경우, 1번에 한해 체력 30으로 부활.",
    effect: (user, context, battle) => {
      // 이미 부활했으면 발동 X
      if (user.aniviaRevived) return false;
      // 죽는 순간에만 발동 (1번)
      if (battle.hp[user.id] <= 0) {
        user.aniviaRevived = true;
        battle.hp[user.id] = 30;
        if (context.hp) context.hp[user.id] = 30;
        battle.logs.push(`🥚 ${user.name}의 패시브: 죽음에서 부활! (HP 30)`);
        return true;
      }
      return false;
    }
  },
  // 다른 챔피언들도 이 구조로 추가!
};
