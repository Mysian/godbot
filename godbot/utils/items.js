// utils/items.js
module.exports = {
  "체력물약": {
    name: "체력물약",
    desc: "5턴간 매턴 HP 5% 회복 (최대 25%까지 중첩 가능)",
    icon: "🧃",
    price: 120,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      // 현재 내 회복효과(healOverTime) 중첩 갯수 체크
      const count = context.effects[user.id].filter(e => e.type === "healOverTime").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 체력 물약 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "healOverTime", value: Math.floor(user.stats.hp * 0.05), turns: 10 });
      return `🧃 체력 물약! 5턴간 매턴 HP 5% 회복 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "투명와드": {
    name: "투명와드",
    desc: "다음 턴 적의 회피 확률 1% 감소 (최대 5%까지 중첩)",
    icon: "👁️",
    price: 100,
    effect: (user, context) => {
      const enemyId = context.enemyId;
      if (!enemyId) return "상대 정보가 없습니다.";
      context.effects[enemyId] = context.effects[enemyId] || [];
      const count = context.effects[enemyId].filter(e => e.type === "dodgeDown").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 투명 와드 효과가 적용중입니다!";
      context.effects[enemyId].push({ type: "dodgeDown", value: 0.01, turns: 2 });
      return `👁️ 투명 와드! 다음 턴 적 회피 확률 1% 감소 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "마법의영약": {
    name: "마법의영약",
    desc: "3턴간 주문력 5% 상승 (최대 25%까지 중첩)",
    icon: "🔮",
    price: 150,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "apBuff" && e.from === "마법의영약").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 마법의 영약 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "apBuff", value: user.stats.ap * 0.05, turns: 6, from: "마법의영약" });
      return `🔮 마법의 영약! 3턴간 주문력 5% 상승 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "분노의영약": {
    name: "분노의영약",
    desc: "3턴간 공격력 5% 상승 (최대 25%까지 중첩)",
    icon: "🔥",
    price: 150,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "atkBuff" && e.from === "분노의영약").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 분노의 영약 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "atkBuff", value: user.stats.attack * 0.05, turns: 6, from: "분노의영약" });
      return `🔥 분노의 영약! 3턴간 공격력 5% 상승 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "강철의영약": {
    name: "강철의영약",
    desc: "3턴간 최대체력 5% 상승 (최대 25%까지 중첩)",
    icon: "🪙",
    price: 150,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "maxHpBuff" && e.from === "강철의영약").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 강철의 영약 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "maxHpBuff", value: user.stats.hp * 0.05, turns: 6, from: "강철의영약" });
      return `🪙 강철의 영약! 3턴간 최대체력 5% 상승 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "도란의검": {
    name: "도란의검",
    desc: "3턴간 상대에게 입힌 피해량의 5%를 회복 (최대 25%까지 중첩)",
    icon: "🗡️",
    price: 180,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "lifesteal" && e.from === "도란의검").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 도란의 검 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "lifesteal", value: 0.05, turns: 6, from: "도란의검" });
      return `🗡️ 도란의 검! 3턴간 흡혈 5% (현재 중첩 ${count + 1}/5)`;
    }
  },
  "도란의방패": {
    name: "도란의방패",
    desc: "3턴간 상대에게서 받는 피해 2% 감소 (최대 10%까지 중첩)",
    icon: "🛡️",
    price: 180,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "damageReduce" && e.from === "도란의방패").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 도란의 방패 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "damageReduce", value: 0.02, turns: 6, from: "도란의방패" });
      return `🛡️ 도란의 방패! 3턴간 피해 2% 감소 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "천갑옷": {
    name: "천갑옷",
    desc: "1턴간 방어력 2% 상승 (최대 10%까지 중첩)",
    icon: "🪖",
    price: 90,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "defBuff" && e.from === "천갑옷").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 천 갑옷 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "defBuff", value: user.stats.defense * 0.02, turns: 2, from: "천갑옷" });
      return `🪖 천 갑옷! 1턴간 방어력 2% 상승 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "민첩성의망토": {
    name: "민첩성의망토",
    desc: "3턴간 치명타 확률 2% 상승 (최대 10%까지 중첩)",
    icon: "🎩",
    price: 130,
    effect: (user, context) => {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "critUp" && e.from === "민첩성의망토").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 민첩성의 망토 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "critUp", value: 0.02, turns: 6, from: "민첩성의망토" });
      return `🎩 민첩성의 망토! 3턴간 치명타 확률 2% 상승 (현재 중첩 ${count + 1}/5)`;
    }
  },
  "펭구의뒤집개": {
  name: "펭구의뒤집개",
  desc: "공격력,주문력,최대체력,방어력,관통력,피해량 0.1% 상승 (최대 0.5%까지 중첩)",
  icon: "🥄",
  price: 220,
  effect: (user, context) => {
    try {
      context.effects[user.id] = context.effects[user.id] || [];
      const count = context.effects[user.id].filter(e => e.type === "penguBuff").length;
      if (count >= 5) return "🚫 이미 최대(5중첩) 펭구의 뒤집개 효과가 적용중입니다!";
      context.effects[user.id].push({ type: "penguBuff", value: 0.001, turns: 6 }); // 0.1% = 0.001
      return `🥄 펭구의 뒤집개! 모든 주요 스탯 0.1% 상승 (현재 중첩 ${count + 1}/5)`;
    } catch (e) {
      console.error('펭구의뒤집개 effect 에러', e);
      return '❌ 펭구의 뒤집개 효과 실행 중 오류!';
    }
  }
}
};
