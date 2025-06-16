module.exports = {
"다리우스": {
  name: "녹서스의 단두대",
  description: "공격 시, 상대 체력이 30% 이하라면 30% 확률(공격 적중 5회 성공 시 40%)로 즉시 처형",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 공격 적중 횟수 저장
    if (trigger === "onAttack") {
      user._dariusHits = (user._dariusHits || 0) + 1;
    }
    // 처형 조건
    if (
      trigger === "onAttack" &&
      enemy.hp / enemy.stats.hp <= 0.3
    ) {
      const chance = (user._dariusHits >= 5) ? 0.40 : 0.30;
      if (Math.random() < chance) {
        enemy.hp = 0;
        return `💀 즉사! (확률 ${(chance * 100).toFixed(0)}%)`;
      }
    }
  }
},
"말파이트": {
  name: "멈출 수 없는 힘",
  description: "공격 시 15% 확률로 25% 증가된 피해를 입히고 1턴간 기절시킨다.",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      context.damage = Math.floor(context.damage * 1.25);
      return "🌋 15% 확률 기절+피해 1.25배!";
    }
  }
},
"나미": {
  name: "밀물 썰물",
  description: "체력 50% 초과 시 주문력 5% 증가(1회), 50% 이하 시 2턴마다 체력 5% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 체력 50% 초과 시 주문력 5% 증가 (1회만)
    if (user.hp / user.stats.hp > 0.5 && !user._namiApBuffed) {
      user.stats.ap = Math.round(user.stats.ap * 1.05);
      user._namiApBuffed = true;
      return `🌊 체력 50% 초과! 주문력 5% 증가!`;
    }

    // 체력 50% 이하 시 2턴마다 체력 5% 회복
    if (user.hp / user.stats.hp <= 0.5) {
      user._namiTurn = (user._namiTurn || 0) + 1;
      if (user._namiTurn % 2 === 0) {
        const heal = Math.floor(user.stats.hp * 0.05);
        user.hp = Math.min(user.hp + heal, user.stats.hp);
        return `🌊 2턴마다 체력 ${heal} 회복!`;
      }
    } else {
      user._namiTurn = 0;
    }
  }
},
"나서스": {
  name: "흡수의 일격",
  description: "공격 시마다 공격력 1% 영구 증가하지만 방어/점멸/아이템 사용 시 50% 확률로 쌓인 스택이 초기화",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 최초 공격력 기록
    if (user._baseAtk === undefined) user._baseAtk = user.stats.attack;
    if (user._nasusStacks === undefined) user._nasusStacks = 0;

    // 공격 시: 스택 증가
    if (trigger === "onAttack") {
      user._nasusStacks += 1;
      user.stats.attack = Math.round(user._baseAtk * (1 + 0.01 * user._nasusStacks));
      return `🐕‍🦺 공격력 1% 영구 증가! (누적 +${user._nasusStacks}%)`;
    }

    // 방어, 점멸(회피), 아이템 사용 시: 50% 확률로 초기화
    if (
      ["onDefend", "onDodge", "onItem"].includes(trigger) &&
      user._nasusStacks > 0 &&
      Math.random() < 0.5
    ) {
      user._nasusStacks = 0;
      user.stats.attack = user._baseAtk;
      return "⚠️ 모든 공격력 증가치가 초기화되었습니다!";
    }
  }
},
"나피리": {
  name: "추적자의 본능",
  description: "공격 시 15% 확률(발동마다 1%씩 증가)로 다음 공격 1.5배",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._naafiriChance === undefined) user._naafiriChance = 0.15;
    if (trigger === "onAttack" && Math.random() < user._naafiriChance) {
      context.effects[user.id].push({ type: "damageBuff", value: 1.5, turns: 1 });
      user._naafiriChance += 0.01;
      return `🐺 ${Math.floor(user._naafiriChance * 100)}% 확률로 다음 공격 1.5배!`;
    }
  }
},
"노틸러스": {
  name: "깊은 바다의 일격",
  description: "공격 시 15% 확률로 상대 1턴 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      return "💫 상대 1턴 기절!";
    }
  }
},
"녹턴": {
  name: "공포의 장막",
  description: "방어 시 10% 확률로 1턴 무적, 해당 효과 발동 시 5턴간 공격력 1.25배, 피해량 1.5배 증가 (최대 2회 중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && Math.random() < 0.10) {
      context.effects[user.id].push({ type: "invulnerable", turns: 1 });

      user._nocturneBuffCount = user._nocturneBuffCount || 0;
      if (user._nocturneBuffCount < 2) {
        user._nocturneBuffCount += 1;
        context.effects[user.id].push({ type: "atkBuffPercent", value: 25, turns: 5 });
        context.effects[user.id].push({ type: "damageBuff", value: 1.5, turns: 5 });
        return `🛡️ 10% 확률 1턴 무적 + 공격력 25%, 피해량 1.5배 증가 (중첩 ${user._nocturneBuffCount}/2)`;
      } else {
        return "🛡️ 10% 확률 1턴 무적 + 공격력 50% 및 피해량 3배 증가 (최대 중첩)";
      }
    }
  }
},
"누누와 윌럼프": {
  name: "절대 영도",
  description: "방어 시 2턴간 20% 피해감소, 방어 5회마다 다음 공격 2배 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend") {
      context.effects[user.id].push({ type: "damageReductionPercent", value: 20, turns: 2 });

      user._nunuDefCount = (user._nunuDefCount || 0) + 1;

      if (user._nunuDefCount >= 5) {
        user._nunuDefCount = 0;
        context.effects[user.id].push({ type: "damageBuff", value: 2, turns: 1 });
        return "❄️ 2턴간 피해 20% 감소 + 방어 5회 후 다음 공격 2배 피해!";
      }
      return "❄️ 2턴간 피해 20% 감소!";
    }
  }
},
"니달리": {
  name: "창 투척",
  description: "공격 시 15% 확률로 1.5배 피해, 상대 체력이 자신보다 높을수록 추가 피해(최대 25%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      let damageMultiplier = 1.5;
      const hpRatio = enemy.hp / user.hp;
      if (hpRatio > 1) {
        const extraDamage = Math.min((hpRatio - 1) * 0.25, 0.25);
        damageMultiplier += extraDamage;
      }
      context.damage = Math.floor(context.damage * damageMultiplier);
      return `🗡️ 15% 확률로 ${Math.floor(damageMultiplier * 100)}% 피해!`;
    }
  }
},
"니코": {
  name: "카멜레온 술책",
  description: "공격 시 15% 확률로 상대 다음 공격 무효, 발동 시 50% 확률로 추가 턴 획득",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "missNext", turns: 1 });
      let msg = "🦎 상대 다음 공격 무효!";
      if (Math.random() < 0.5) {
        context.extraTurn = context.extraTurn || {};
        context.extraTurn[user.id] = true;
        msg += " 50% 확률로 추가 턴 획득!";
      }
      return msg;
    }
  }
},
"닐라": {
  name: "형상의 춤",
  description: "공격 시 10% 확률로 본인 1턴 회피 + 1턴 공격력 30% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.effects[user.id].push({ type: "dodgeNextAttack", turns: 1 });
      context.effects[user.id].push({ type: "atkUpPercent", value: 30, turns: 1 });
      return "💃 1턴 회피 + 1턴 공격력 30% 증가!";
    }
  }
},
"다이애나": {
  name: "달빛 낙하",
  description: "공격 시 20% 확률로 피해 35% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.damage = Math.floor(context.damage * 1.35);
      return "🌙 20% 확률로 피해 35% 증가!";
    }
  }
},
"드레이븐": {
  name: "회전 도끼",
  description: "공격 시 피해량 3%씩 증가 (최대 15회 중첩), 공격하지 못하면 중첩 초기화",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      if (user._dravenStacks === undefined) user._dravenStacks = 0;
      if (user._dravenStacks < 15) user._dravenStacks += 1;
      context.damage = Math.floor(context.damage * (1 + 0.03 * user._dravenStacks));
      return `🪓 피해량 3% 증가! (누적 ${user._dravenStacks}회)`;
    }
    if (["onDefend", "onDodge", "onItem", "stunned", "skip"].includes(trigger)) {
      if (user._dravenStacks > 0) {
        user._dravenStacks = 0;
        return "⚠️ 중첩 초기화!";
      }
    }
  }
},
"라이즈": {
  name: "룬 폭발",
  description: "공격 시 15% 확률로 상대 1턴 기절, 발동 시 본인은 주문력의 50% 피해를 입음(리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      const selfDamage = Math.floor(user.stats.ap * 0.5);
      user.hp = Math.max(0, user.hp - selfDamage);
      return `💥 상대 1턴 기절! 자신은 주문력의 50%(${selfDamage}) 피해!`;
    }
  }
},
"라칸": {
  name: "매혹의 돌진",
  description: "공격 시 15% 확률로 상대 1턴 기절, 발동 시 3턴간 자신 방어/스킬 사용 불가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      context.effects[user.id].push({ type: "noDefOrSkill", turns: 3 });
      return "💘 상대 1턴 기절! 자신은 3턴간 방어 및 스킬 사용 불가!";
    }
  }
},
"람머스": {
  name: "가시박힌 몸통",
  description: "받는 피해를 50%(방어 시 최대 70%) 반사하지만 공격 시에는 언제나 50% 감소된 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 상대에게 가하는 피해 50% 감소 (리스크)
    if (trigger === "onAttack") {
      context.damage = Math.floor(context.damage * 0.5);
    }

    // 받는 피해 반사
    if (trigger === "onDefend" && context.damage > 0) {
      // 방어 시 반사량 51%~70%
      const reflectRatio = 0.51 + Math.random() * (0.70 - 0.51);
      const reflect = Math.floor(context.damage * reflectRatio);
      enemy.hp = Math.max(0, enemy.hp - reflect);
      return `🦔 피해 반사! ${Math.floor(reflectRatio * 100)}% 반사 (${reflect})`;
    } else if (trigger === "onDefend" && context.damage <= 0) {
      // 피해 없으면 반사 없음
      return;
    } else if (trigger === "onDefend") {
      // 피해 있을 때, 받는 피해 50% 반사 (비방어 상황일 때 기본)
      const reflect = Math.floor(context.damage * 0.5);
      enemy.hp = Math.max(0, enemy.hp - reflect);
      return `🦔 피해 반사! 50% 반사 (${reflect})`;
    }
  }
},
"럭스": {
  name: "빛의 결속",
  description: "공격 시 20% 확률로 상대 1턴 기절, 발동 시 확률 1%씩 감소 (최대 10%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._luxStunChance === undefined) user._luxStunChance = 0.20;
    if (trigger === "onAttack" && Math.random() < user._luxStunChance) {
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      // 확률 1% 감소, 최저 10%
      user._luxStunChance = Math.max(0.10, user._luxStunChance - 0.01);
      return `✨ 상대 1턴 기절! (확률 ${Math.round(user._luxStunChance * 100)}%)`;
    }
  }
},
"럼블": {
  name: "화염방사기",
  description: "공격 시 45% 확률로 상대 최대 체력의 0.3% 고정 피해 화상 효과 추가, 최대 5회 중첩(최대 1.5%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.45) {
      if (!user._rumbleDotStacks) user._rumbleDotStacks = 0;
      if (user._rumbleDotStacks < 5) user._rumbleDotStacks += 1;

      const damagePercent = 0.003 * user._rumbleDotStacks; // 0.3% * 스택
      const damage = Math.floor(enemy.stats.hp * damagePercent);

      // 추가 도트 효과로 등록
      context.effects[enemy.id].push({ type: "dot", damage: damage, turns: 1 });

      return `🔥 45% 확률 화상 피해 발동! (중첩 ${user._rumbleDotStacks}회, 최대 1.5%) - ${damage} 고정 피해!`;
    }
  }
},
"레나타 글라스크": {
  name: "협상의 기술",
  description: "공격 시 20% 확률로 상대 공격력 10% 감소(3턴, 중첩 가능, 스택당 5% 추가 감소, 최대 50%), 아이템 사용 시 공격력 감소 디버프 자신에게 반사",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      // 공격력 감소 디버프 누적 스택 관리
      if (!enemy._relenaAtkDownStacks) enemy._relenaAtkDownStacks = 0;
      enemy._relenaAtkDownStacks = Math.min(enemy._relenaAtkDownStacks + 1, 10); // 최대 10스택 (5% * 10 = 50%)
      const downValue = 10 + (enemy._relenaAtkDownStacks - 1) * 5;

      context.effects[enemy.id] = context.effects[enemy.id] || [];
      // 중첩된 디버프 추가
      context.effects[enemy.id].push({ type: "atkDownPercent", value: downValue, turns: 3 });

      return `🤝 상대 공격력 3턴간 ${downValue}% 감소 (스택 ${enemy._relenaAtkDownStacks})`;
    }

    // 아이템 사용 시 공격력 감소 디버프 자신에게 반사
    if (trigger === "onItem") {
      if (enemy._relenaAtkDownStacks && enemy._relenaAtkDownStacks > 0) {
        // 상대 디버프 삭제
        context.effects[enemy.id] = context.effects[enemy.id].filter(e => e.type !== "atkDownPercent");
        // 자신에게 같은 디버프 부여
        context.effects[user.id] = context.effects[user.id] || [];
        const downValue = 10 + (enemy._relenaAtkDownStacks - 1) * 5;
        context.effects[user.id].push({ type: "atkDownPercent", value: downValue, turns: 3 });

        // 상대 스택 초기화
        enemy._relenaAtkDownStacks = 0;

        return `⚠️ 아이템 사용! 공격력 감소 디버프 자신에게 반사! (${downValue}%)`;
      }
    }
  }
},
"레넥톤": {
  name: "지배자의 분노",
  description: "피해 입을 때마다 25% 확률로 공격력 10%씩 증가 (최대 50%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.25) {
      if (user._baseAtk === undefined) user._baseAtk = user.stats.attack; // 배틀 시작 시 최초 셋팅
      if (user._atkStacks === undefined) user._atkStacks = 0;
      if (user._atkStacks < 5) { // 최대 5스택 (5 * 10% = 50%)
        user._atkStacks += 1;
        user.stats.attack = Math.round(user._baseAtk * (1 + 0.1 * user._atkStacks));
        return `🐊 공격력 +10% 중첩! (현재 +${user._atkStacks * 10}%)`;
      }
    }
  }
},
"레오나": {
  name: "일식",
  description: "피해 입을 때 10% 확률로 피해를 입지 않고 공격한 상대를 1턴간 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.10) {
      context.damage = 0;
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      return "🌞 피해 0 + 상대 1턴 기절!";
    }
  }
},
"렉사이": {
  name: "땅굴 습격",
  description: "공격 시 20% 확률로 상대 방어력 50% 무시, 발동 시마다 5%씩 감소 (최소 30%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._rekSaiPenetration) user._rekSaiPenetration = 0.5; // 50% 방어력 무시 초기값
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.ignoreDefensePercent = user._rekSaiPenetration;
      user._rekSaiPenetration = Math.max(0.3, user._rekSaiPenetration - 0.05);
      return `🕳️ 상대 방어력 ${Math.floor(context.ignoreDefensePercent * 100)}% 무시!`;
    }
  }
},
"렐": {
  name: "철갑 돌진",
  description: "공격 시 25% 확률로 2턴간 자신의 방어력 10~50% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      // 방어력 증가량 10%~50% 사이 랜덤
      const increaseValue = 10 + Math.floor(Math.random() * 41); 
      context.effects[user.id].push({ type: "defUpPercent", value: increaseValue, turns: 2 });
      return `🐎 2턴간 방어력 ${increaseValue}% 증가!`;
    }
  }
},
"렝가": {
  name: "사냥 개시",
  description: "공격 시 10% 확률로 한 번 더 공격, 발동할 때마다 확률 5% 증가 (최대 30%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._rengarCritChance === undefined) user._rengarCritChance = 0.10; // 기본 10%
    if (trigger === "onAttack") {
      if (Math.random() < user._rengarCritChance) {
        context.extraAttack = true;
        user._rengarCritChance = Math.min(0.30, user._rengarCritChance + 0.05); // 최대 30%까지 증가
        return "🐾 한 번 더 공격! 확률 증가 중!";
      }
    }
  }
},
"루시안": {
  name: "끊임없는 추격",
  description: "공격 성공 시 10% 확률로 연속 공격",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.extraTurn = true;
      return "🔫 연속 공격!";
    }
  }
},
"룰루": {
  name: "변이",
  description: "공격 시 20% 확률로 상대 1턴간 공격력 40% 감소, 자신도 1턴간 공격력 20% 감소 (리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.effects[enemy.id].push({ type: "atkDownPercent", value: 40, turns: 1 });
      context.effects[user.id].push({ type: "atkDownPercent", value: 20, turns: 1 });
      return "🦎 상대 공격력 1턴간 40%↓ + 자신 공격력 1턴간 20%↓ (리스크)";
    }
  }
},
"르블랑": {
  name: "환영 인장",
  description: "공격 시 10% 확률로 2턴 뒤 동일 피해 1회",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.effects[enemy.id].push({ type: "delayedDamage", damage: context.damage, turns: 2 });
      return "🌀 2턴 뒤 동일 피해!";
    }
  }
},
"리 신": {
  name: "용의 분노",
  description: "공격 시 0.5% + (턴마다 0.25% 추가, 최대 30%) 확률로 상대 즉사",
  passive: (user, enemy, context, trigger) => {
    context.effects[enemy.id] = context.effects[enemy.id] || [];
    if (!user._leesin_exileBase) user._leesin_exileBase = 0.005; // 0.5%
    if (!user._leesin_turnCount) user._leesin_turnCount = 0;
    if (trigger === "onAttack") {
      user._leesin_turnCount += 1;
      let chance = user._leesin_exileBase + (user._leesin_turnCount - 1) * 0.0025;
      if (chance > 0.30) chance = 0.30;  // 최대 30% 제한
      if (Math.random() < chance) {
        context.effects[enemy.id].push({ type: "execute", turns: 1 });
        return "🐉 상대를 강제로 탈주시켜 즉사시켰다!";
      }
    }
  }
},
"리븐": {
  name: "폭풍의 검",
  description: "공격 시 항상 10% 증가된 피해를 입히고, 방어 시 공격력의 20% 만큼 자신의 방어력이 감소 (리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      context.damage = Math.floor(context.damage * 1.10);
      return "⚡ 피해 10% 증가!";
    }
    if (trigger === "onDefend") {
      const reduceAmount = Math.floor(user.stats.attack * 0.20);
      user.stats.defense = Math.max(0, (user.stats.defense || 0) - reduceAmount);
      return `⚡ 방어 시 방어력 ${reduceAmount} 감소 (리스크)!`;
    }
  }
},
"리산드라": {
  name: "얼음 감옥",
  description: "공격 시 15% 확률로 상대 1턴 기절, 5% 확률로 자신도 1턴 기절 (리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      if (Math.random() < 0.15) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        let msg = "❄️ 상대 1턴 기절!";
        if (Math.random() < 0.05) {
          context.effects[user.id].push({ type: "stunned", turns: 1 });
          msg += " ⚠️ 5% 확률로 자신도 1턴 기절!";
        }
        return msg;
      }
    }
  }
},
"릴리아": {
  name: "몽환의 일격",
  description: "공격 시 15% 확률로 2턴 뒤 상대 1턴 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "delayedStun", turns: 2, duration: 1 });
      return "🌙 2턴 뒤 1턴 기절!";
    }
  }
},
"마스터 이": {
  name: "알파 스트라이크",
  description: "기본 공격을 5회 분할하여 가하며, 5회 공격마다 10~20% 확률로 다음 피해 회피",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._masterYiAttackCount) user._masterYiAttackCount = 0;
    if (trigger === "onAttack") {
      user._masterYiAttackCount += 1;

      // 피해 5등분 적용 (실제 적용은 배틀엔진에서 baseDamage/5 처리 필요)
      context.damage = Math.floor(context.damage / 5);

      if (user._masterYiAttackCount >= 5) {
        user._masterYiAttackCount = 0;
        // 10~20% 확률 랜덤 적용
        const dodgeChance = 0.1 + Math.random() * 0.1;
        if (Math.random() < dodgeChance) {
          context.effects[user.id].push({ type: "dodgeNextAttack", turns: 1 });
          return `⚡ 5회 공격 후 ${Math.floor(dodgeChance * 100)}% 확률로 다음 피해 회피!`;
        }
      }
    }
  }
},
"마오카이": {
  name: "자연의 복수",
  description: "피해 입을 때 50% 확률로 받은 피해 10% 반사, 그 중 20% 확률로 상대 1턴 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.5) {
      const reflect = Math.floor(context.damage * 0.1);
      enemy.hp = Math.max(0, enemy.hp - reflect);
      let msg = `🌳 반사 피해! ${reflect}`;
      if (Math.random() < 0.2) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        msg += " + 1턴 기절!";
      }
      return msg;
    }
  }
},
"말자하": {
  name: "황혼의 장막",
  description: "공격 시 25% 확률로 다음 받는 자신의 피해 25% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      context.effects[user.id].push({ type: "damageReductionPercent", value: 25, turns: 1 });
      return "🟣 다음 받는 피해 25% 감소!";
    }
  }
},
"멜": {
  name: "정치적 압박",
  description: "전투 시작 시 5턴간 상대 공격력 25% 감소, 방어 시 10% 확률로 모든 피해 반사, 공격할 때마다 공격력 5% 감소 (최대 50%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 전투 시작 시 5턴간 상대 공격력 25% 감소
    if (!user._melDebuffApplied) {
      user._melDebuffApplied = true;
      context.effects = context.effects || {};
      context.effects[enemy.id] = context.effects[enemy.id] || [];
      context.effects[enemy.id].push({ type: "atkDownPercent", value: 25, turns: 5 });
      return "🏛️ 상대 5턴간 공격력 25%↓";
    }

    // 방어 시 10% 확률로 받은 피해 반사
    if (trigger === "onDefend" && Math.random() < 0.10 && context.damage > 0) {
      const reflect = Math.floor(context.damage);
      enemy.hp = Math.max(0, enemy.hp - reflect);
      return `🏛️ 10% 확률로 피해 ${reflect} 반사!`;
    }

    // 공격 시 공격력 5% 감소, 최대 50% 감소
    if (trigger === "onAttack") {
      if (user._melAtkDebuff === undefined) user._melAtkDebuff = 0;
      if (user._melAtkDebuff < 0.5) {
        user._melAtkDebuff = Math.min(0.5, user._melAtkDebuff + 0.05);
        user.stats.attack = Math.round(user.stats.attack * (1 - user._melAtkDebuff));
        return `🏛️ 공격력 5% 감소! (누적 ${Math.round(user._melAtkDebuff * 100)}%)`;
      }
    }
  }
},
"모데카이저": {
  name: "죽음의 세계",
  description: "공격 시 30% 확률로 상대 2턴간 방어 및 회피 불가 + 2턴간 받는 피해 20% 증가 (중첩 없음)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.3) {
      // 방어 불가, 회피 불가 효과 추가
      context.effects[enemy.id] = context.effects[enemy.id] || [];
      context.effects[enemy.id].push({ type: "defendBlocked", turns: 2 });
      context.effects[enemy.id].push({ type: "dodgeBlocked", turns: 2 });

      // 받는 피해 증가 효과 중첩 방지
      const hasDamageIncrease = context.effects[enemy.id].some(
        e => e.type === "damageIncreasePercent"
      );
      if (!hasDamageIncrease) {
        context.effects[enemy.id].push({ type: "damageIncreasePercent", value: 20, turns: 2 });
      }

      return "☠️ 상대 2턴간 방어 및 회피 불가 + 피해 20% 증가!";
    }
  }
},
"모르가나": {
  name: "속박의 어둠",
  description: "공격 시 15% 확률로 상대 2턴간 기절 (발동 후 확률 5%로 감소)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._morganaStunActive) user._morganaStunActive = true;
    if (!user._morganaStunChance) user._morganaStunChance = 0.15;

    if (trigger === "onAttack") {
      if (Math.random() < user._morganaStunChance) {
        context.effects[enemy.id].push({ type: "stunned", turns: 2 });
        // 발동 후 확률을 5%로 낮춤
        user._morganaStunChance = 0.05;
        return "🌑 상대 2턴 기절!";
      }
    }
  }
},
"문도 박사": {
  name: "가고 싶은 대로 간다",
  description: "턴 시작 시마다 최대 체력 5% 회복 + 10턴간 디버프 면역, 단 받는 피해 20% 증가 (리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onTurnStart") {
      const heal = Math.floor(user.stats.hp * 0.05);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      context.effects[user.id].push({ type: "debuffImmune", turns: 10 });
      // 리스크로 받는 피해 20% 증가 효과 추가 (중첩 방지)
      if (!user._mundoRisk) {
        user._mundoRisk = true;
        context.effects[user.id].push({ type: "damageTakenUpPercent", value: 20, turns: 99 });
      }
      return `🩹 체력 ${heal} 회복 + 10턴간 디버프 면역! (받는 피해 20% 증가)`;
    }
  }
},
"미스 포츈": {
  name: "더블 업",
  description: "두 번째 공격마다 20% 추가 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    user._mfAttackCount = (user._mfAttackCount || 0) + 1;
    if (trigger === "onAttack" && user._mfAttackCount % 2 === 0) {
      context.damage = Math.floor(context.damage * 1.2);
      return "🔫 두 번째 공격! 피해 20% 증가!";
    }
  }
},
"밀리오": {
  name: "따뜻한 불꽃",
  description: "피해 입을 때 25% 확률로 받은 피해의 30% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.25) {
      const heal = Math.floor(context.damage * 0.3);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      return `🔥 피해의 30%(${heal}) 회복!`;
    }
  }
},
"바드": {
  name: "신비한 차원문",
  description: "공격 시 20% 확률로 다음 공격 회피(1턴), 방어 시 20% 확률로 공격력, 주문력, 방어력 1% 증가 (최대 20%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.effects[user.id].push({ type: "dodgeNextAttack", turns: 1 });
      return "✨ 다음 공격 회피(1턴)!";
    }
    if (trigger === "onDefend" && Math.random() < 0.20) {
      user._bardAtkBuff = (user._bardAtkBuff || 0);
      user._bardApBuff = (user._bardApBuff || 0);
      user._bardDefBuff = (user._bardDefBuff || 0);
      if (user._bardAtkBuff < 20) user._bardAtkBuff += 1;
      if (user._bardApBuff < 20) user._bardApBuff += 1;
      if (user._bardDefBuff < 20) user._bardDefBuff += 1;
      user.stats.attack = Math.round(user.stats.attack * (1 + 0.01 * user._bardAtkBuff));
      user.stats.ap = Math.round(user.stats.ap * (1 + 0.01 * user._bardApBuff));
      user.stats.defense = Math.round(user.stats.defense * (1 + 0.01 * user._bardDefBuff));
      return `✨ 방어 시 공격력, 주문력, 방어력 1% 증가! (누적 +${user._bardAtkBuff}%)`;
    }
  }
},
"바루스": {
  name: "부패의 화살",
  description: "공격 시 25% 확률로 상대 최대 체력 0.2% 비례 고정 피해 (최대 15 스택 중첩 가능)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      if (!user._barusDotStacks) user._barusDotStacks = 0;
      if (user._barusDotStacks < 15) { // 0.2% * 15 = 3%
        user._barusDotStacks += 1;
      }
      const dotDamage = Math.floor(enemy.stats.hp * 0.002 * user._barusDotStacks);
      // 기존 도트 제거 후 다시 적용 (중첩 도트 유지 위해)
      context.effects[enemy.id] = (context.effects[enemy.id] || []).filter(e => e.type !== "dot" || !e.fromBarus);
      context.effects[enemy.id].push({ type: "dot", damage: dotDamage, turns: 2, fromBarus: true });
      return `☠️ 2턴간 매턴 ${dotDamage} 고정 피해! (중첩 ${user._barusDotStacks})`;
    }
  }
},
"바이": {
  name: "공허의 강타",
  description: "바이는 99턴간 방어력과 체력이 20% 낮아지고, 공격 시 20% 확률로 상대 1턴 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 상대 기절 확률 20%
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      return "👊 상대 1턴 기절!";
    }
    // 자신에게 방어력 20% 감소, 체력 20% 감소 디버프 지속
    if (!user._voidDebuffApplied) {
      user._voidDebuffApplied = true;
      context.effects[user.id].push({ type: "defDownPercent", value: 20, turns: 99 });
      context.effects[user.id].push({ type: "hpDownPercent", value: 20, turns: 99 });
    }
  }
},
"베이가": {
  name: "무한한 악의",
  description: "공격 시 주문력 1% 영구 증가, 방어력은 0.5%씩 감소(리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      if (!user._baseAp) user._baseAp = user.stats.ap;
      if (!user._apStacks) user._apStacks = 0;
      if (!user._baseDef) user._baseDef = user.stats.defense;
      if (!user._defStacks) user._defStacks = 0;

      // 주문력 증가
      user._apStacks += 1;
      user.stats.ap = Math.round(user._baseAp * (1 + 0.01 * user._apStacks));

      // 방어력 감소
      user._defStacks += 1;
      user.stats.defense = Math.round(user._baseDef * (1 - 0.005 * user._defStacks));

      return `🟪 주문력 +1% 중첩! (현재 +${user._apStacks}%), 방어력 -0.5% 중첩! (현재 -${(user._defStacks * 0.5).toFixed(1)}%)`;
    }
  }
},
"베인": {
  name: "은화살",
  description: "공격 시 3번째 공격마다 피해 20% 추가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      user._vayneCount = (user._vayneCount || 0) + 1;
      if (user._vayneCount >= 3) {
        user._vayneCount = 0;
        context.damage = Math.floor(context.damage * 1.2);
        return "🦌 3타마다 피해 20% 추가!";
      }
    }
  }
},
"벡스": {
  name: "우울한 폭발",
  description: "공격 시 상대가 방어 중이면 피해 50% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && context.isDefending) {
      context.damage = Math.floor(context.damage * 1.5);
      return "☁️ 방어 중 상대에 50% 추가 피해!";
    }
  }
},
"벨베스": {
  name: "심연의 돌진",
  description: "공격 시 10% 확률로 추가 공격, 성공 시 최대 20%까지 확률이 오르지만 추가 공격 피해량은 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      if (user._velbesChance === undefined) user._velbesChance = 0.10;

      if (Math.random() < user._velbesChance) {
        context.extraAttack = true;

        // 추가 공격 피해량 감소 설정
        let damageMultiplier = 1;
        if (user._velbesChance >= 0.20) {
          damageMultiplier = 0.5;
        } else if (user._velbesChance >= 0.15) {
          damageMultiplier = 0.75;
        }

        context.extraAttackDamageMultiplier = damageMultiplier;

        // 확률 5% 증가, 최대 20%
        user._velbesChance = Math.min(0.20, user._velbesChance + 0.05);

        return `🐟 추가 공격! 확률 ${Math.floor(user._velbesChance * 100)}%, 추가 공격 피해 ${Math.floor(damageMultiplier * 100)}%`;
      }
    }
  }
},
"벨코즈": {
  name: "에너지 방출",
  description: "공격할 때마다 피해 3%씩 누적되며 증가, 최대 10스택(30% 이후 3%로 리셋)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      user._velkozStacks = (user._velkozStacks || 0) + 1;
      if (user._velkozStacks > 10) user._velkozStacks = 1; // 10스택 넘으면 초기화 후 1부터 다시 쌓음
      context.damage += Math.floor(context.damage * 0.03 * user._velkozStacks);
      return `🔮 누적 피해 +${user._velkozStacks * 3}%! (스택 ${user._velkozStacks}/10)`;
    }
  }
},
"볼리베어": {
  name: "폭풍의 분노",
  description: "공격 시 20% 확률로 피해 15% 추가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.damage = Math.floor(context.damage * 1.15);
      return "⚡️ 20% 확률로 피해 15% 추가!";
    }
  }
},
"브라움": {
  name: "불굴의 의지",
  description: "방어 시 피해 20% 감소, 연속 방어 시 최대 80%까지 피해 감소 (방어 1회당 5% 증가)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._braumDefStacks) user._braumDefStacks = 0;

    if (trigger === "onDefend" && context.damage > 0) {
      // 연속 방어 스택 1 증가, 최대 12스택 (20% + 5% * 12 = 80%)
      user._braumDefStacks = Math.min(user._braumDefStacks + 1, 12);
      const reduction = 0.2 + 0.05 * (user._braumDefStacks - 1);
      context.damage = Math.floor(context.damage * (1 - reduction));
      return `🛡️ 피해 ${Math.floor(reduction * 100)}% 감소! (연속 방어 ${user._braumDefStacks}회)`;
    } else if (context.lastAction !== "defend") {
      // 방어 외 행동 시 스택 초기화
      user._braumDefStacks = 0;
    }
  }
},
"브라이어": {
  name: "광기의 흡혈",
  description: "공격 시 피해의 30%만큼 체력 회복하지만 최대 체력이 3%씩 감소 (매 최대 체력 기준)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && context.damage > 0) {
      // 체력 회복
      const heal = Math.floor(context.damage * 0.30);
      user.hp = Math.min(user.hp + heal, user.stats.hp);

      // 최대 체력 3% 감소 (감소된 최대체력 기준으로 계산)
      user.stats.hp = Math.floor(user.stats.hp * 0.97);
      if (user.hp > user.stats.hp) {
        user.hp = user.stats.hp; // 현재 체력이 최대 체력을 초과하면 맞춰줌
      }

      return `🩸 피해의 30%(${heal}) 흡혈! 최대 체력 3% 감소!`;
    }
  }
},
"브랜드": {
  name: "불꽃의 낙인",
  description: "공격 시 15% 확률로 2턴간 상대 최대 체력 0.3% 비례 고정 피해(도트), 최대 3회 중첩, 도트 중첩 시 추가 피해량 10% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      // 현재 도트 중첩 수 파악
      const currentDots = (context.effects[enemy.id] || []).filter(e => e.type === "dot").length;
      if (currentDots < 3) {
        const dot = Math.floor(enemy.stats.hp * 0.003); // 0.3%
        context.effects[enemy.id].push({ type: "dot", damage: dot, turns: 2 });
        return `🔥 2턴간 매턴 ${dot} 고정 피해! (중첩 ${currentDots + 1}/3)`;
      }
    }

    // 도트 중첩 시 추가 피해량 10% 증가
    const dotCount = (context.effects[enemy.id] || []).filter(e => e.type === "dot").length;
    if (dotCount > 0 && trigger === "onAttack") {
      context.damage = Math.floor(context.damage * (1 + 0.1 * dotCount));
      return `🔥 도트 중첩 ${dotCount}회, 추가 피해량 ${10 * dotCount}% 증가!`;
    }
  }
},
"블라디미르": {
  name: "핏빛 전이",
  description: "공격 시 피해의 10%만큼 체력 회복, 회복 불가 시 주문력 1% 증가 (최대 30%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      if (context.damage > 0) {
        const heal = Math.floor(context.damage * 0.10);
        if (user.hp < user.stats.hp) {
          user.hp = Math.min(user.hp + heal, user.stats.hp);
          return `💉 피해의 10%(${heal}) 흡혈!`;
        }
      }
      // 피해를 입히지 못했거나 체력이 이미 가득 찬 경우
      if (!user._vladApStacks) user._vladApStacks = 0;
      if (user._vladApStacks < 30) {
        user._vladApStacks += 1;
        user.stats.ap = Math.round(user.stats.ap * (1 + 0.01 * user._vladApStacks));
        return `🟪 주문력 1% 증가! (누적 +${user._vladApStacks}%)`;
      }
    }
  }
},
"블리츠크랭크": {
  name: "로켓 손",
  description: "공격 시 1% + (턴마다 0.1% 추가, 최대 5%) 확률로 상대 즉사",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._blitz_exileBase) user._blitz_exileBase = 0.01; // 1%
    if (!user._blitz_turnCount) user._blitz_turnCount = 0;
    if (trigger === "onAttack") {
      user._blitz_turnCount += 1;
      const chance = Math.min(user._blitz_exileBase + (user._blitz_turnCount - 1) * 0.001, 0.05);
      if (Math.random() < chance) {
        enemy.hp = 0;
        return "🤖 로켓 손! 상대 즉사!";
      }
    }
  }
},
"비에고": {
  name: "지배자의 칼날",
  description: "공격 시 10% 확률로 상대 1턴 기절, 상대가 기절 상태라면 피해 40% 증가, 자신은 다음 턴 받는 피해 20% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      let msg = "";
      if (Math.random() < 0.10) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        msg += "⚡️ 10% 확률로 상대 1턴 기절! ";
        context.effects[user.id].push({ type: "damageTakenUpPercent", value: 20, turns: 1 }); // 리스크 효과 추가
        msg += "⚠️ 자신 다음 턴 받는 피해 20% 증가! ";
      }
      if (enemy.stunned) {
        context.damage = Math.floor(context.damage * 1.4);
        msg += "⚔️ 상대 기절시 피해 40% 증가!";
      }
      return msg || undefined;
    }
  }
},
"빅토르": {
  name: "진화된 기술",
  description: "공격 시 주문력 1% 증가(최대 30%), 이후 방어력 1% 증가(최대 30%), 그 후 체력 1% 증가(최대 30%), 그 후 주문력이 오히려 1%씩 감소 (최대 99%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger !== "onAttack") return;
    if (!user._baseAp) user._baseAp = user.stats.ap;
    if (!user._baseDef) user._baseDef = user.stats.defense;
    if (!user._baseHp) user._baseHp = user.stats.hp;

    if (!user._apStacks) user._apStacks = 0;
    if (!user._defStacks) user._defStacks = 0;
    if (!user._hpStacks) user._hpStacks = 0;
    if (!user._decreaseApStacks) user._decreaseApStacks = 0;

    // 우선 주문력 30%까지 증가
    if (user._apStacks < 30) {
      user._apStacks += 1;
      user.stats.ap = Math.round(user._baseAp * (1 + 0.01 * user._apStacks));
      return `⚙️ 주문력 +1% 중첩! (현재 +${user._apStacks}%)`;
    }

    // 그 다음 방어력 30%까지 증가
    if (user._defStacks < 30) {
      user._defStacks += 1;
      user.stats.defense = Math.round(user._baseDef * (1 + 0.01 * user._defStacks));
      return `🛡️ 방어력 +1% 중첩! (현재 +${user._defStacks}%)`;
    }

    // 그 다음 체력 30%까지 증가
    if (user._hpStacks < 30) {
      user._hpStacks += 1;
      user.stats.hp = Math.round(user._baseHp * (1 + 0.01 * user._hpStacks));
      user.hp = Math.min(user.hp + Math.floor(user._baseHp * 0.01), user.stats.hp); // 체력 현재치도 증가
      return `❤️ 최대 체력 +1% 중첩! (현재 +${user._hpStacks}%)`;
    }

    // 체력도 다 올렸으면 주문력 1%씩 감소, 최대 99%
    if (user._decreaseApStacks < 99) {
      user._decreaseApStacks += 1;
      user.stats.ap = Math.round(user._baseAp * (1 + 0.3 - 0.01 * user._decreaseApStacks)); // 30%에서 점차 감소
      return `⚙️ 주문력 -1% 중첩! (현재 -${user._decreaseApStacks}%)`;
    }
  }
},
"뽀삐": {
  name: "불굴의 망치",
  description: "받는 피해 10% 경감, 5번째 공격마다 상대 방어력의 10% 추가 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0) {
      context.damage = Math.floor(context.damage * 0.9);
      return "🔨 받는 피해 10% 경감!";
    }
    if (trigger === "onAttack") {
      user._poppyAttackCount = (user._poppyAttackCount || 0) + 1;
      if (user._poppyAttackCount >= 5) {
        user._poppyAttackCount = 0;
        const extraDamage = Math.floor(enemy.stats.defense * 0.10);
        context.damage += extraDamage;
        return `🔨 5번째 공격! 상대 방어력 10%(${extraDamage}) 추가 피해!`;
      }
    }
  }
},
"사미라": {
  name: "지옥불 연격",
  description: "공격 시 25% 확률로 피해 1.25배",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      context.damage = Math.floor(context.damage * 1.25);
      return "🔥 25% 확률 피해 1.25배!";
    }
  }
},
"사이온": {
  name: "불사의 의지",
  description: "사망 시 체력 100%로 1회 부활. 이후 매 턴마다 최대 체력 20%씩 감소(5턴 내에 자동 사망)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 1회 부활
    if (!user._sionReviveUsed && user.hp <= 0) {
      user._sionReviveUsed = true;
      user._sionReviveTurns = 0;
      user._sionRealMaxHp = user.stats.hp; // 원래 최대 체력 보관
      user.hp = user.stats.hp;
      return "💀 1회 한정! 체력 100%로 부활!";
    }
    // 부활 후 매 턴 최대 체력 20%씩 감소
    if (user._sionReviveUsed && user._sionReviveTurns !== undefined && trigger === "onTurnStart") {
      user._sionReviveTurns += 1;
      user.stats.hp = Math.max(1, Math.floor(user._sionRealMaxHp * (1 - 0.2 * user._sionReviveTurns)));
      // 현재 체력이 새 maxHp보다 많으면 깎기
      if (user.hp > user.stats.hp) user.hp = user.stats.hp;
      // 자동 사망 처리 (최대체력이 1까지 내려오면)
      if (user.stats.hp <= 1) {
        user.hp = 0;
        return "💀 사이온이 완전히 쓰러졌다!";
      }
      return `⏳ 사이온의 최대체력이 줄어듭니다! (잔여: ${user.stats.hp})`;
    }
  }
},
"사일러스": {
  name: "스킬 강탈자",
  description: "공격 시 50% 확률로 상대 스킬 1턴 봉인하고 자신 주문력 1% 증가(최대 20%), 자신은 항상 받는 스킬 피해 50% 증가(리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
if (trigger === "onAttack") {
  let msg = "";
  if (Math.random() < 0.50) {
    context.effects[enemy.id].push({ type: "skillBlocked", turns: 1 });
    msg += "🔗 1턴간 상대 스킬 봉인! ";
    if (!user._silasApStacks) user._silasApStacks = 0;
    if (user._silasApStacks < 20) {
      user._silasApStacks += 1;
      if (!user._baseAp) user._baseAp = user.stats.ap;
      user.stats.ap = Math.round(user._baseAp * (1 + 0.01 * user._silasApStacks));
      msg += `🟪 주문력 +${user._silasApStacks}%! `;
    }
  }
  // 리스크 효과: (턴 제한 없는 버프)
  // 이미 존재하는지 확인해서 중복 push 방지
  const already = (context.effects[user.id] || []).some(e => e.type === "skillDamageTakenUp");
  if (!already) {
    context.effects[user.id].push({ type: "skillDamageTakenUp", value: 0.5, turns: 9999 });
  }
  return msg || undefined;
  } // ← 함수 닫는 괄호
},
"샤코": {
  name: "환영 복제",
  description: "피해를 한 번도 입지 않았다면 모든 피해 무효(1회), 배틀 시작 후 10턴간 회피 확률 20% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 첫 피해 전까지 모든 피해 무효
    if (!user._shacoFirstHit && trigger === "onDefend" && context.damage > 0) {
      user._shacoFirstHit = true; // 최초 피해받은 이후엔 발동 불가
    }
    if (!user._shacoFirstHit && trigger === "onDefend" && context.damage > 0) {
      context.damage = 0;
      return "🎭 피해 무효! (아직 한 번도 피해받지 않음)";
    }
    // 배틀 시작 후 10턴간 무조건 회피 확률 20% 증가
    if (!user._shacoDodgeTurnsInit) {
      user._shacoDodgeTurnsInit = true;
      user._shacoDodgeTurns = 10;
    }
    if (user._shacoDodgeTurns > 0 && trigger === "onTurnStart") {
      context.effects[user.id].push({ type: "dodgeChanceUp", value: 20, turns: 1 });
      user._shacoDodgeTurns -= 1;
      return "🎭 회피 확률 20% 증가!";
    }
  }
},
"세나": {
  name: "어둠 속의 빛",
  description: "공격 시 15% 확률로 자신 체력 10% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      const heal = Math.floor(user.stats.hp * 0.10);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      return `🌒 체력 ${heal} 회복!`;
    }
  }
},
"세라핀": {
  name: "서포트 하모니",
  description: "공격 시 5% + (매 턴마다 5%씩 증가, 최대 50%) 확률로 자신의 체력 10% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._seraphineHealBase) user._seraphineHealBase = 0.05; // 5%
    if (!user._seraphineTurnCount) user._seraphineTurnCount = 0;
    if (trigger === "onAttack") {
      user._seraphineTurnCount += 1;
      let chance = user._seraphineHealBase + (user._seraphineTurnCount - 1) * 0.05;
      chance = Math.min(chance, 0.50); // 최대 50%
      if (Math.random() < chance) {
        const heal = Math.floor(user.stats.hp * 0.10);
        user.hp = Math.min(user.hp + heal, user.stats.hp);
        return `🎶 체력 ${heal} 회복! (확률 ${Math.floor(chance * 100)}%)`;
      }
    }
  }
},
"세주아니": {
  name: "빙결의 낙인",
  description: "공격 시 15% 확률로 상대 2턴 기절, 이후 1턴 기절로 너프",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._sejuaniStunState) user._sejuaniStunState = "full"; // full: 2턴, reduced: 1턴
    if (trigger === "onAttack") {
      if (Math.random() < 0.15) {
        const stunTurns = user._sejuaniStunState === "full" ? 2 : 1;
        context.effects[enemy.id].push({ type: "stunned", turns: stunTurns });
        if (user._sejuaniStunState === "full") user._sejuaniStunState = "reduced";
        return `❄️ ${stunTurns}턴 기절!`;
      }
    }
  }
},
"세트": {
  name: "주먹질의 미학",
  description: "공격 시 50% 확률로 입힌 피해의 10%를 회복, 실패 시 다음 턴 상대 체력 5% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      if (Math.random() < 0.5 && context.damage > 0) {
        const heal = Math.floor(context.damage * 0.1);
        user.hp = Math.min(user.hp + heal, user.stats.hp);
        return `🥊 50% 확률! 피해의 10%(${heal}) 회복!`;
      } else {
        // 실패 시 플래그 설정해서 다음 턴 회복 유도
        user._setHealEnemyNextTurn = true;
      }
    }
    // 다음 턴 처리 (turnStart 시)
    if (trigger === "onTurnStart" && user._setHealEnemyNextTurn) {
      const heal = Math.floor(enemy.stats.hp * 0.05);
      enemy.hp = Math.min(enemy.hp + heal, enemy.stats.hp);
      user._setHealEnemyNextTurn = false;
      return `🥊 50% 실패! 다음 턴 상대 체력 5% 회복!`;
    }
  }
},
"소나": {
  name: "힐링의 선율",
  description: "2턴마다 5% 체력 회복 (지속효과)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._sonaTurnCount) user._sonaTurnCount = 0;
    if (trigger === "onTurnStart") {
      user._sonaTurnCount += 1;
      if (user._sonaTurnCount % 2 === 0) {
        const heal = Math.floor(user.stats.hp * 0.05);
        user.hp = Math.min(user.hp + heal, user.stats.hp);
        return `🎵 2턴마다 체력 ${heal} 회복!`;
      }
    }
  }
},
"소라카": {
  name: "별의 축복",
  description: "3턴마다 최대 체력 9% 회복 (지속효과), 발동시 회복량 1%씩 중첩 증가(최대 15%) 및 자신 주문력 2%씩 감소(최대 10%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._sorakaTurnCount) user._sorakaTurnCount = 0;
    if (!user._sorakaHealBuff) user._sorakaHealBuff = 0; // 누적 회복 증가(%) 
    if (!user._sorakaApDebuff) user._sorakaApDebuff = 0;   // 누적 주문력 감소(%)

    if (trigger === "onTurnStart") {
      user._sorakaTurnCount += 1;

      if (user._sorakaTurnCount % 3 === 0) {
        // 회복 증가량: 기본 9% + 누적 증가 (최대 15%)
        const baseHealRatio = 0.09;
        const maxHealRatio = 0.15;
        user._sorakaHealBuff = Math.min(user._sorakaHealBuff + 0.01, maxHealRatio - baseHealRatio);

        // 주문력 감소 (최대 10%)
        const maxApDebuff = 0.10;
        user._sorakaApDebuff = Math.min(user._sorakaApDebuff + 0.02, maxApDebuff);

        // 주문력 감소 적용
        if (!user._baseAp) user._baseAp = user.stats.ap;
        user.stats.ap = Math.round(user._baseAp * (1 - user._sorakaApDebuff));

        // 회복량 계산 및 적용
        const healRatio = baseHealRatio + user._sorakaHealBuff;
        const heal = Math.floor(user.stats.hp * healRatio);
        user.hp = Math.min(user.hp + heal, user.stats.hp);

        return `✨ 3턴마다 체력 ${heal} 회복! (회복량 +${(user._sorakaHealBuff*100).toFixed(1)}%, 주문력 -${(user._sorakaApDebuff*100).toFixed(1)}%)`;
      }
    }
  }
},
"쉔": {
  name: "정의로운 수호자",
  description: "방어 시 30% 확률로 다음 턴 동안 피해를 모두 무시합니다. (1턴)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "invulnerable", turns: 1 } }
        ],
        log: "🛡️ 다음 턴 무적(1턴)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"쉬바나": {
  name: "화염 숨결",
  description: "공격 시 50% 확률로 10% 추가 피해, 방어 시 50% 확률로 다음 공격에 최대 체력 2% 도트 피해 (중첩 불가)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.5) {
      context.damage = Math.floor(context.damage * 1.1);
      return "🐉 50% 확률로 10% 추가 피해!";
    }
    if (trigger === "onDefend" && Math.random() < 0.5) {
      // 중첩 불가: 이미 효과 있으면 추가 안함
      const hasDot = context.effects[user.id]?.some(e => e.type === "delayedDot");
      if (!hasDot) {
        context.effects[user.id] = context.effects[user.id] || [];
        context.effects[user.id].push({
          type: "delayedDot",
          damage: Math.floor(user.stats.hp * 0.02),
          turns: 1,
          stackable: false
        });
        return "🛡️ 50% 확률로 다음 공격 최대 체력 2% 도트 피해!";
      }
    }
  }
},
"스몰더": {
  name: "화염의 날갯짓",
  description: "피해를 입힐 때마다 공격력/주문력 0.5%↑, 방어력 0.5%↓, 최대체력 0.1%↑ (최대 100회 중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && context.damage > 0) {
      // 최초 배틀 시작 스탯 저장
      if (!user._smolderBaseAtk) user._smolderBaseAtk = user.stats.attack || 0;
      if (!user._smolderBaseAp) user._smolderBaseAp = user.stats.ap || 0;
      if (!user._smolderBaseDef) user._smolderBaseDef = user.stats.defense || 0;
      if (!user._smolderBaseHp) user._smolderBaseHp = user.stats.hp || 0;
      if (!user._smolderStack) user._smolderStack = 0;

      if (user._smolderStack < 100) {
        user._smolderStack += 1;
      }

      user.stats.attack  = Math.round(user._smolderBaseAtk * (1 + 0.005 * user._smolderStack));
      user.stats.ap      = Math.round(user._smolderBaseAp  * (1 + 0.005 * user._smolderStack));
      user.stats.defense = Math.max(1, Math.round(user._smolderBaseDef * (1 - 0.005 * user._smolderStack)));
      user.stats.hp      = Math.round(user._smolderBaseHp  * (1 + 0.001 * user._smolderStack));
      if (user.hp > user.stats.hp) user.hp = user.stats.hp;

      return `🔥 중첩! 공격력/주문력 +0.5%, 방어력 -0.5%, 최대체력 +0.1% (누적 ${user._smolderStack}회)`;
    }
  }
},
"스웨인": {
  name: "악의 시선",
  description: "공격 시 10% 확률로 상대의 다음 공격 무효",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.effects[enemy.id].push({ type: "missNext", turns: 1 });
      return "👁️ 상대의 다음 공격 무효!";
    }
  }
},
"스카너": {
  name: "수정 가시",
  description: "공격 시 15% 확률로 1턴간 상대 스킬 봉인",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "skillBlocked", turns: 1 });
      return "🔗 1턴간 상대 스킬 봉인!";
    }
  }
},
"시비르": {
  name: "주문 방어막",
  description: "항상 상대에게 주는 피해 5% 감소, 방어 시 상대 스킬 피해 완전 무효",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 항상 상대에게 주는 피해 5% 감소 (공격할 때)
    if (trigger === "onAttack" && context.damage > 0) {
      context.damage = Math.floor(context.damage * 0.95);
    }
    // 방어 시 상대 스킬 피해 완전 무효
    if (trigger === "onDefend" && context.isSkillAttack) {
      context.damage = 0;
      return "🛡️ 방어 시 상대 스킬 피해 완전 무효!";
    }
  }
},
"신 짜오": {
  name: "용기백배",
  description: "공격 시 100% 확률로 추가 턴 발생, 이후 확률과 피해량이 절반씩 감소됨",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._shenZhaoStack) user._shenZhaoStack = 0;

    if (trigger === "onAttack") {
      let baseChance = 1.0; // 100%
      // 확률은 100%, 50%, 25%, 12.5%, ...
      const chance = baseChance / (2 ** user._shenZhaoStack);

      if (Math.random() < chance) {
        context.extraTurn = true;

        // 피해량 감소: 기본 100%, 다음은 50%, 25%, ...
        const damageMultiplier = chance;

        context.damage = Math.floor(context.damage * damageMultiplier);

        user._shenZhaoStack = Math.min(user._shenZhaoStack + 1, 4); // 최대 4단계까지 감소

        return `🏇 연속 공격! 확률 ${Math.floor(chance * 100)}%, 피해량 ${Math.floor(damageMultiplier * 100)}%`;
      } else {
        // 실패 시 스택 초기화
        user._shenZhaoStack = 0;
      }
    }
  }
},
"신드라": {
  name: "암흑 구체",
  description: "공격 시 50% 확률로 피해 15% 증가, 그 중 50% 확률로 상대 마법저항 2턴간 50% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.5) {
      context.damage = Math.floor(context.damage * 1.15);
      let msg = "⚫ 피해 15% 증가!";
      if (Math.random() < 0.5) {
        context.effects[enemy.id].push({ type: "magicResistDebuffPercent", value: 50, turns: 2 });
        msg += " + 마법저항 2턴간 50% 감소!";
      }
      return msg;
    }
  }
},
"신지드": {
  name: "맹독 가스",
  description: "공격 시 20% 확률로 3턴간 상대 최대 체력 0.3% 비례 도트 피해, 최대 5중첩 (최대 1.5%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      const baseDotPercent = 0.003; // 0.3%
      enemy._singedDotStacks = enemy._singedDotStacks || 0;
      if (enemy._singedDotStacks < 5) {
        enemy._singedDotStacks += 1;
      }
      const dotPercent = baseDotPercent * enemy._singedDotStacks;
      const dotDamage = Math.floor(enemy.stats.hp * dotPercent);
      context.effects[enemy.id].push({ type: "dot", damage: dotDamage, turns: 3 });
      return `☣️ 3턴간 매턴 ${dotDamage} 중첩 도트 피해! (스택 ${enemy._singedDotStacks})`;
    }
  }
},
"쓰레쉬": {
  name: "사형 선고",
  description: "공격 시 1% + (턴마다 1%씩 추가, 최대 30%) 확률로 단 1회, 상대에게 '30턴 뒤 사망' 디버프 부여",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._threshDeathMarkGiven) return; // 이미 발동됨, 다시는 안 터짐!
    if (!user._threshBaseChance) user._threshBaseChance = 0.01;
    if (!user._threshTurnCount) user._threshTurnCount = 0;
    if (trigger === "onAttack") {
      user._threshTurnCount += 1;
      let chance = user._threshBaseChance + (user._threshTurnCount - 1) * 0.01;
      if (chance > 0.10) chance = 0.30; // 최대 30% 제한
      if (Math.random() < chance) {
        context.effects[enemy.id].push({ type: "deathMark", turns: 30 });
        user._threshDeathMarkGiven = true; // 1회성 플래그!
        return "⚖️ 사형 선고! 상대는 30턴 뒤 사망! (한 번만 발동)";
      }
    }
  }
},
"아리": {
  name: "매혹의 구슬",
  description: "피해를 주거나 받을 때 25% 확률로 상대 주문력(AP) 25% 1회 흡수, 이후로는 1%씩 흡수",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (
      (trigger === "onAttack" && context.damage > 0) ||
      (trigger === "onDefend" && context.damage > 0)
    ) {
      if (Math.random() < 0.25 && enemy.stats.ap > 0) {
        if (!user._ahriFirstAbsorb) {
          user._ahriFirstAbsorb = true;
          const absorb = Math.floor(enemy.stats.ap * 0.25);
          enemy.stats.ap = Math.max(0, enemy.stats.ap - absorb);
          user.stats.ap = (user.stats.ap || 0) + absorb;
          return `💗 최초 발동! 상대 주문력 25% 흡수! (+${absorb})`;
        } else {
          const absorb = Math.max(1, Math.floor(enemy.stats.ap * 0.01));
          enemy.stats.ap = Math.max(0, enemy.stats.ap - absorb);
          user.stats.ap = (user.stats.ap || 0) + absorb;
          return `💗 주문력 1% 흡수! (+${absorb})`;
        }
      }
    }
  }
},
"아무무": {
  name: "절망",
  description: "공격 시 25% 확률로 이전 턴에 받은 피해의 50%를 추가 피해로 줌(중첩X, 이전 턴 데미지 없으면 무효)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && user._amumuLastDamage && Math.random() < 0.25) {
      const bonus = Math.floor(user._amumuLastDamage * 0.5);
      context.damage += bonus;
      return `😢 25% 확률로 이전 턴 피해의 50%(${bonus}) 추가 피해!`;
    }
    // 턴 종료시 받은 피해량 기억
    if (trigger === "onTurnEnd") {
      user._amumuLastDamage = context.lastDamageReceived || 0;
    }
  }
},
"아우렐리온 솔": {
  name: "별의 숨결",
  description: "공격 시 10% 확률로 자신의 주문력 10% 증가 (최대 100%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      if (!user._asolBaseAp) user._asolBaseAp = user.stats.ap || 0;
      if (!user._asolStack) user._asolStack = 0;
      if (user._asolStack < 10) {
        user._asolStack += 1;
        user.stats.ap = Math.round(user._asolBaseAp * (1 + 0.10 * user._asolStack));
        return `✨ 주문력 10% 증가! (총 +${user._asolStack * 10}%)`;
      }
    }
  }
},
"아이번": {
  name: "데이지 소환",
  description: "배틀 시작 후 2턴간 모든 피해 무효, 이후 10턴간 방어력 50% 만큼 주문력 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._ivernShieldTurns === undefined) user._ivernShieldTurns = 2;
    if (user._ivernPostShieldTurns === undefined) user._ivernPostShieldTurns = 0;

    if (user._ivernShieldTurns > 0 && trigger === "onDefend" && context.damage > 0) {
      context.damage = 0;
      user._ivernShieldTurns -= 1;
      // 쉴드 활성 중
      return "🌱 2턴간 피해 완전 무효(쉴드)!";
    }

    // 쉴드 종료 후 10턴간 주문력 증가 버프
    if (user._ivernShieldTurns === 0 && user._ivernPostShieldTurns < 10 && trigger === "onTurnStart") {
      if (user._ivernPostShieldTurns === 0) {
        // 최초 발동 시 주문력 베이스 저장
        user._ivernBaseAp = user.stats.ap;
      }
      user._ivernPostShieldTurns += 1;
      user.stats.ap = Math.round(user._ivernBaseAp + user.stats.defense * 0.5);
      return "🌿 방어력 50% 만큼 주문력 증가 (10턴간)";
    }
  }
},
"아지르": {
  name: "병사 소환",
  description: "공격 시 20% 확률로 피해량 20% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.damage = Math.floor(context.damage * 1.2);
      return "🏜️ 20% 확률로 피해 20% 증가!";
    }
  }
},
"아칼리": {
  name: "황혼의 장막",
  description: "공격 시 25% 확률로 다음 턴 받는 피해 무효(1턴)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      context.effects[user.id].push({ type: "invulnerable", turns: 1 });
      return "🌒 다음 턴 피해 무효(1턴)!";
    }
  }
},
"아크샨": {
  name: "응징의 총격",
  description: "공격 시 10% 확률로 연속 공격(즉시 한 번 더 턴)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.extraTurn = true;
      return "🔫 10% 확률로 연속 공격!";
    }
  }
},
"아트록스": {
  name: "피의 강타",
  description: "공격 시 피해의 12%만큼 체력 회복, 체력이 낮을수록 회복량 최대 50% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && context.damage > 0) {
      const hpRatio = user.hp / user.stats.hp;
      // 체력이 낮을수록 최대 50% 추가 회복 (체력이 0일 때 1.5배, 체력 가득 찼을 때 1배)
      const healMultiplier = 1 + (1 - hpRatio) * 0.5;
      const heal = Math.floor(context.damage * 0.12 * healMultiplier);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      return `🩸 피해의 12% 흡혈! (체력 낮음 보너스 포함 ${heal})`;
    }
  }
},
"아펠리오스": {
  name: "무기 마스터리",
  description: "공격 시 25% 확률로 (추가 피해 25% / 공격력 5% 증가 / 한 번 더 공격) 중 하나 발동",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      const roll = Math.floor(Math.random() * 3);
      if (roll === 0) {
        context.damage = Math.floor(context.damage * 1.25);
        return "💥 추가 피해 25%!";
      } else if (roll === 1) {
        if (!user._apheliosBaseAtk) user._apheliosBaseAtk = user.stats.attack || 0;
        if (!user._apheliosAtkBuff) user._apheliosAtkBuff = 0;
        user._apheliosAtkBuff += 1;
        user.stats.attack = Math.round(user._apheliosBaseAtk * (1 + 0.05 * user._apheliosAtkBuff));
        return `🔫 공격력 5% 증가! (누적 +${user._apheliosAtkBuff * 5}%)`;
      } else {
        context.extraAttack = true;
        return "🌙 한 번 더 공격!";
      }
    }
  }
},
"알리스타": {
  name: "불굴의 의지",
  description: "피해 입을 때 30% 확률로 받는 피해 40% 경감",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.3) {
      const reduce = Math.floor(context.damage * 0.4);
      context.damage -= reduce;
      return `🐮 30% 확률! 피해 ${reduce} 경감!`;
    }
  }
},
"암베사": {
  name: "철혈의 명령",
  description: "공격 시 20% 확률로 2턴간 상대 방어력 20% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.effects[enemy.id].push({ type: "defDownPercent", value: 20, turns: 2 });
      return "🗡️ 2턴간 방어력 20% 감소!";
    }
  }
},
"애니": {
  name: "티버 소환",
  description: "공격 시 10% 확률로 3턴간 상대 최대체력 0.3% 화염 도트",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      const dot = Math.floor(enemy.stats.hp * 0.003);
      context.effects[enemy.id].push({ type: "dot", damage: dot, turns: 3 });
      return `🔥 3턴간 매턴 ${dot} 화염 피해!`;
    }
  }
},
"애니비아": {
  name: "부활의 알",
  description: "사망 시 1회, HP 100%로 부활(부활 후 받는 피해는 70% 증가)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._aniviaRevived && user.hp <= 0) {
      user._aniviaRevived = true;
      user.hp = user.stats.hp;
      user._aniviaAfterRevive = true;
      return "🥚 1회 한정! 체력 100% 부활! (이후 받는 피해 70% 증가)";
    }
    // 부활 후엔 항상 피해 70% 증가 (공격/방어 등 모든 피해 계산 전에 적용)
    if (user._aniviaAfterRevive && trigger === "onDefend" && context.damage > 0) {
      context.damage = Math.floor(context.damage * 1.7);
    }
  }
},
"애쉬": {
  name: "집중된 서리",
  description: "공격 시 10%+(매 턴 0.2%↑, 최대 20%) 확률로 상대 1턴 기절, 기절 시 추가 피해 10%",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._asheBaseStunChance) user._asheBaseStunChance = 0.10;
    if (!user._asheTurnCount) user._asheTurnCount = 0;
    if (trigger === "onAttack") {
      user._asheTurnCount += 1;
      let chance = user._asheBaseStunChance + (user._asheTurnCount - 1) * 0.002;
      if (chance > 0.20) chance = 0.20;  // 최대 확률 20% 제한
      if (Math.random() < chance) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        // 이번 공격에 추가 피해 10%
        context.damage = Math.floor(context.damage * 1.10);
        return `❄️ 기절(1턴)! 추가 피해 10%! (확률 ${(chance*100).toFixed(1)}%)`;
      }
    }
  }
},
"야스오": {
  name: "최후의 숨결",
  description: "공격할 때마다 치명타 확률 1%↑, 피해 입으면 1%↓, 항상 치명타 피해 1.5배",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 최초 세팅
    if (user._yasuoCritChance === undefined) {
      user._yasuoCritChance = (user.crit || 0);
    }

    // 공격 시마다 치명타 확률 +1%
    if (trigger === "onAttack") {
      user._yasuoCritChance += 0.01;
      if (Math.random() < user._yasuoCritChance) {
        context.damage = Math.floor(context.damage * 1.5);
        return `🍃 치명타! 1.5배 피해! (확률 ${(user._yasuoCritChance*100).toFixed(1)}%)`;
      }
    }

    // 피해를 받으면 치명타 확률 -1% (최소 0까지)
    if (trigger === "onDefend" && context.damage > 0) {
      user._yasuoCritChance = Math.max(0, user._yasuoCritChance - 0.01);
    }
  }
},
"에코": {
  name: "시간 왜곡",
  description: "턴 시작 시 20% 확률로 이전 턴에 받은 피해의 10~30% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 턴 시작 시 20% 확률로 회복
    if (trigger === "onTurnStart" && user._lastEchoDamage && Math.random() < 0.2) {
      // 10~30% 중 무작위 회복률
      const ratio = 0.10 + Math.random() * 0.20;
      const heal = Math.floor(user._lastEchoDamage * ratio);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      user._lastEchoDamage = 0;
      return `⏳ 20% 확률! 이전 턴 피해의 ${(ratio * 100).toFixed(1)}%(${heal}) 회복!`;
    }
    // 피해 받은 값 기록
    if (trigger === "onDefend" && context.damage > 0) {
      user._lastEchoDamage = context.damage;
    }
  }
},
"엘리스": {
  name: "거미 여왕",
  description: "공격 시 30% 확률로 2턴간 상대 방어력 15% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "defDownPercent", value: 30, turns: 2 });
      return "🕷️ 2턴간 방어력 30% 감소!";
    }
  }
},
"오공": {
  name: "분신 공격",
  description: "공격 시 20% 확률로 추가 타격(40%), 발동 시 50% 확률로 1턴간 상대 스킬 무적",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      const bonus = Math.floor(context.damage * 0.4);
      context.damage += bonus;
      let msg = `🐵 추가 타격! 피해 +${bonus}`;
      // 패시브 터지면 50% 확률로 무적
      if (Math.random() < 0.5) {
        context.effects[user.id].push({ type: "blockSkill", turns: 1 });
        msg += " + 다음 1턴간 상대 스킬 무적!";
      }
      return msg;
    }
  }
},
"오로라": {
  name: "빛의 가호",
  description: "공격 시 10% 확률로 자신의 체력 10% 회복 또는 1턴간 상대 방어력 20% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      if (Math.random() < 0.5) {
        const heal = Math.floor(user.stats.hp * 0.10);
        user.hp = Math.min(user.hp + heal, user.stats.hp);
        return `🌈 자신의 체력 10%(${heal}) 회복!`;
      } else {
        context.effects[enemy.id].push({ type: "defDownPercent", value: 20, turns: 1 });
        return "🌑 1턴간 상대 방어력 20% 감소!";
      }
    }
  }
},
"오른": {
  name: "대장장이의 분노",
  description: "공격 시 10% 확률로 5턴간 방어력 10% 증가, 이 효과 터지면 25% 확률로 상대 1턴 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.effects[user.id].push({ type: "defUpPercent", value: 10, turns: 5 });
      let msg = "⚒️ 5턴간 방어력 10% 증가!";
      if (Math.random() < 0.25) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        msg += " + 상대 1턴 기절!";
      }
      return msg;
    }
  }
},
"오리아나": {
  name: "명령: 충격파",
  description: "공격 시 20% 확률로 1턴간 상대 기절, 10% 확률로 자신의 주문력 5% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      let msg = "";
      if (Math.random() < 0.20) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        msg += "🔮 1턴간 기절! ";
      }
      if (Math.random() < 0.10) {
        if (!user._oriannaBaseAp) user._oriannaBaseAp = user.stats.ap || 0;
        if (!user._oriannaApBuff) user._oriannaApBuff = 0;
        user._oriannaApBuff += 1;
        user.stats.ap = Math.round(user._oriannaBaseAp * (1 + 0.05 * user._oriannaApBuff));
        msg += `🔵 주문력 5% 증가! (누적 +${user._oriannaApBuff * 5}%)`;
      }
      return msg.trim() || undefined;
    }
  }
},
"올라프": {
  name: "불굴의 돌진",
  description: "체력 비율이 낮을수록 피해 증가(최대 +99%), 공격 시 5% 확률로 체력 5% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      // 1 - (현재체력/최대체력) 비율만큼 피해 증가, 최대 99%
      const ratio = 1 - (user.hp / user.stats.hp);
      const bonus = Math.min(0.99, ratio); // 최대 99%
      context.damage = Math.floor(context.damage * (1 + bonus));
      let msg = `🪓 체력이 낮을수록 피해 증가! (+${Math.round(bonus * 100)}%)`;
      if (Math.random() < 0.05) {
        const heal = Math.floor(user.stats.hp * 0.05);
        user.hp = Math.min(user.hp + heal, user.stats.hp);
        msg += ` + 즉시 체력 5%(${heal}) 회복!`;
      }
      return msg;
    }
  }
},
"요네": {
  name: "영혼 가르기",
  description: "공격 시 20% 확률로 상대 최대 체력 3% 추가 피해 + 1턴간 자신 받는 피해 30% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      const extraDamage = Math.floor(enemy.stats.hp * 0.03);
      context.damage += extraDamage;
      context.effects[user.id].push({ type: "damageReductionPercent", value: 30, turns: 1 });
      return `⚔️ 최대 체력 3% 추가 피해 + 1턴간 받는 피해 30% 감소!`;
    }
  }
},
"요릭": {
  name: "망자의 군대",
  description: "공격 시 10% 확률로 2턴간 공격력 5% & 방어력 3% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.effects[user.id].push({ type: "atkUpPercent", value: 5, turns: 2 });
      context.effects[user.id].push({ type: "defUpPercent", value: 3, turns: 2 });
      return "💀 2턴간 공격력 5% & 방어력 3% 증가!";
    }
  }
},
"우디르": {
  name: "야성의 형태",
  description: "공격 시 1턴간 피해 15% 증가, 방어 시 1턴간 받는 피해 15% 감소, 회피 시 1턴간 회피율 15% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._udyrMode) user._udyrMode = "tiger";
    if (trigger === "onAttack") {
      user._udyrMode = "tiger";
      context.effects[user.id].push({ type: "damageUpPercent", value: 15, turns: 1 });
      return "🐯 1턴간 피해 15% 증가!";
    }
    if (trigger === "onDefend") {
      user._udyrMode = "turtle";
      context.effects[user.id].push({ type: "damageReductionPercent", value: 15, turns: 1 });
      return "🐢 1턴간 받는 피해 15% 감소!";
    }
    if (trigger === "onDodge") {
      context.effects[user.id].push({ type: "dodgeChanceUp", value: 15, turns: 1 });
      return "🐾 1턴간 회피율 15% 증가!";
    }
  }
},
"우르곳": {
  name: "공포의 원형톱",
  description: "상대 체력이 5% 이하라면 처형, 공격 시 입히는 피해 25% 증가 (최대 체력 10% 감소 리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 상대 체력 5% 이하일 때 즉시 처형
    if (trigger === "onAttack" && (enemy.hp / enemy.stats.hp <= 0.05)) {
      enemy.hp = 0;
      return "🪓 상대 체력 5% 이하! 즉시 처형!";
    }
    // 피해 25% 증가 (기절 효과 제외)
    if (trigger === "onAttack") {
      context.damage = Math.floor(context.damage * 1.25);
      // 최대 체력 10% 감소 리스크
      if (!user._urgotHpReduced) {
        user._urgotHpReduced = true;
        user.stats.hp = Math.floor(user.stats.hp * 0.9);
        if (user.hp > user.stats.hp) user.hp = user.stats.hp;
        return "🪓 피해 25% 증가! 최대 체력 10% 감소 리스크!";
      }
      return "🪓 피해 25% 증가!";
    }
  }
},
"워윅": {
  name: "피의 추적자",
  description: "상대 체력이 낮을수록 피해량 증가(최대50%), 자신의 체력이 낮을수록 공격력 증가(최대10%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      // 상대 체력이 낮을수록: 0~50% 증가
      const enemyBonus = Math.min(0.5, 1 - (enemy.hp / enemy.stats.hp));
      context.damage = Math.floor(context.damage * (1 + enemyBonus));
      // 내 체력이 낮을수록: 0~10% 증가 (기본 공격력에만 적용)
      if (!user._baseAtk) user._baseAtk = user.stats.attack;
      const selfBonus = Math.min(0.1, 1 - (user.hp / user.stats.hp));
      user.stats.attack = Math.round(user._baseAtk * (1 + selfBonus));
      let msg = `🐺 상대 체력 비례 피해 +${Math.round(enemyBonus*100)}%, 내 체력 비례 공격력 +${Math.round(selfBonus*100)}%`;
      return msg;
    }
  }
},
"유미": {
  name: "너랑 유미랑!",
  description: "피해를 입었을때, 20% 확률로 받은 피해 50% 회복, 이 효과 발동 시 50% 확률로 상대의 공격력/주문력 증가 버프 해제",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.20) {
      const heal = Math.floor(context.damage * 0.5);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      let msg = `🐱 받은 피해의 50%(${heal}) 회복!`;
      if (Math.random() < 0.5) {
        // 상대 버프 제거: atkUpPercent, apUpPercent (n턴짜리 버프 중 해당하는 것만 제거)
        if (context.effects && context.effects[enemy.id]) {
          context.effects[enemy.id] = context.effects[enemy.id].filter(
            ef => ef.type !== "atkUpPercent" && ef.type !== "apUpPercent"
          );
          msg += " + 상대의 공격력/주문력 증가 효과 해제!";
        }
      }
      return msg;
    }
  }
},
"이렐리아": {
  name: "날카로운 검무",
  description: "공격 시 20% 확률로 2턴간 공격력 10% 증가(중첩, 최대 15회)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      // 현재 중첩 개수 파악 (atkUpPercent 버프만 필터)
      const currentStacks = (context.effects[user.id] || []).filter(e => e.type === "atkUpPercent").length;
      if (currentStacks < 15) {
        context.effects[user.id].push({ type: "atkUpPercent", value: 10, turns: 2 });
        return "🗡️ 2턴간 공격력 10% 증가!(중첩)";
      } else {
        return "🗡️ 공격력 버프 최대 중첩 도달!";
      }
    }
  }
},
"이블린": {
  name: "그림자 기습",
  description: "공격 시 20% 확률로, 30% 증가된 피해량의 방어력 무시 공격. 리스크로 자신은 항상 방어력 30% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 리스크: 항상 방어력 30% 감소 (영구적)
    if (!user._vayneRiskApplied) {
      user._vayneRiskApplied = true;
      user.stats.defense = Math.floor(user.stats.defense * 0.7);
    }

    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.ignoreDef = true;
      context.damage = Math.floor(context.damage * 1.3);
      return "👠 방어력 무시 + 피해 30% 증가!";
    }
  }
},
"이즈리얼": {
  name: "정조준 일격",
  description: "공격 시 30% 확률로 2배의 치명타 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 매 공격마다 30% 치명타 확률, 2배 치명타 배율로 설정
    if (trigger === "onAttack") {
      user.critChance = 0.3;
      user.critDamage = 2.0;
      // 치명타 발동은 배틀엔진에서 처리!
      // 패시브 텍스트 직접 반환 X (치명타 발생 시 엔진에서 안내)
    }
  }
},
"이즈리얼": {
  name: "정조준 일격",
  description: "공격 시 기본 치명타 확률 30%, 치명타 피해 2배. 단, 방어 및 회피(점멸) 시 30% 확률이 2%씩 감소 (최대 10%까지 감소)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 최초 세팅
    if (user._ezrealCritChance === undefined) user._ezrealCritChance = 0.3;
    if (user._ezrealCritChance < 0.1) user._ezrealCritChance = 0.1;

    // 공격 시 치명타 확률/피해 세팅
    if (trigger === "onAttack") {
      user.critChance = user._ezrealCritChance;
      user.critDamage = 2.0;
      // 치명타 발동은 배틀엔진에서 처리
    }

    // 방어 또는 회피(점멸) 시 치명타 확률 감소
    if ((trigger === "onDefend" || trigger === "onDodge") && user._ezrealCritChance > 0.1) {
      user._ezrealCritChance = Math.max(0.1, user._ezrealCritChance - 0.02);
    }
  }
},
"일라오이": {
  name: "촉수 강타",
  description: "공격 시 50% 확률로 자신이 상대에게 입히는 모든 피해 1% 증가 (최대 50회 중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._illaoiDmgBonus) user._illaoiDmgBonus = 0;
    if (trigger === "onAttack" && Math.random() < 0.5 && user._illaoiDmgBonus < 0.5) {
      user._illaoiDmgBonus += 0.01;
      return `🐙 피해 +1% 영구 증가! (누적 +${Math.round(user._illaoiDmgBonus * 100)}%)`;
    }
    // 피해량 보정은 항상 적용
    if (user._illaoiDmgBonus && trigger === "onAttack") {
      context.damage = Math.floor(context.damage * (1 + user._illaoiDmgBonus));
    }
  }
},
"자르반 4세": {
  name: "대장군의 명령",
  description: "공격 시 50% 확률로 공격력이 증가하거나, 방어력이 증가한다. 0.5%씩 증가(중첩 가능)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._jarvanAtkBonus) user._jarvanAtkBonus = 0;
    if (!user._jarvanDefBonus) user._jarvanDefBonus = 0;
    if (trigger === "onAttack") {
      if (Math.random() < 0.5) {
        user._jarvanAtkBonus += 0.005;
        user.stats.attack = Math.round(user.stats.attack * (1 + user._jarvanAtkBonus));
        return `⚔️ 공격력 +0.5% 증가! (누적 +${(user._jarvanAtkBonus * 100).toFixed(1)}%)`;
      } else {
        user._jarvanDefBonus += 0.005;
        user.stats.defense = Math.round(user.stats.defense * (1 + user._jarvanDefBonus));
        return `🛡️ 방어력 +0.5% 증가! (누적 +${(user._jarvanDefBonus * 100).toFixed(1)}%)`;
      }
    }
  }
},
"자야": {
  name: "깃털 폭풍",
  description: "공격 시 20% 확률로 피해 2번",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      context.damage *= 2;
      return "🪶 20% 확률로 피해 2번!";
    }
  }
},
"자이라": {
  name: "덩굴의 속박",
  description: "공격 시 25% 확률로 2턴간 상대 최대 체력의 0.3% 도트 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      // 중복 방지: 이미 같은 유형의 도트가 있으면 추가하지 않음
      const hasDot = (context.effects[enemy.id] || []).some(
        e => e.type === "dot" && e.damageRatio === 0.003
      );
      if (!hasDot) {
        context.effects[enemy.id].push({ type: "dot", damageRatio: 0.003, turns: 2 });
        return "🌿 2턴간 매턴 상대 최대 체력의 0.3% 덩굴 피해!";
      }
    }
  }
},
"자크": {
  name: "세포 분열",
  description: "사망 시 3번까지 부활(50%→25%→10% 체력)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user.hp <= 0) {
      if (!user._zacReviveCount) user._zacReviveCount = 0;
      if (user._zacReviveCount === 0) {
        user._zacReviveCount = 1;
        user.hp = Math.max(1, Math.floor(user.stats.hp * 0.5));
        return "🧪 첫 부활! 최대 체력 50%로 부활!";
      }
      if (user._zacReviveCount === 1) {
        user._zacReviveCount = 2;
        user.hp = Math.max(1, Math.floor(user.stats.hp * 0.25));
        return "🧪 두 번째 부활! 최대 체력 25%로 부활!";
      }
      if (user._zacReviveCount === 2) {
        user._zacReviveCount = 3;
        user.hp = Math.max(1, Math.floor(user.stats.hp * 0.10));
        return "🧪 마지막 부활! 최대 체력 10%로 부활!";
      }
      // 3회 소진 이후엔 추가 부활 없음 (자연사)
    }
  }
},
"잔나": {
  name: "폭풍의 눈",
  description: "공격 시 50% 확률로 상대가 나에게 입히는 피해 25% 감소 (1턴간), 방어 시 50% 확률로 자신이 받는 피해 30% 추가 감소(1턴간)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.5) {
      context.effects[enemy.id].push({ type: "dmgDealtDownPercent", value: 25, turns: 1, target: user.id });
      return "🌪️ 상대가 나에게 주는 피해 1턴간 25% 감소!";
    }
    if (trigger === "onDefend" && Math.random() < 0.5) {
      context.effects[user.id].push({ type: "damageReductionPercent", value: 30, turns: 1 });
      return "🌪️ 자신이 받는 피해 1턴간 30% 추가 감소!";
    }
  }
},
"잭스": {
  name: "무기의 달인",
  description: "공격 시 40% 확률로 2턴간 공격력 2% 증가(중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.4) {
      if (!user._jaxBaseAtk) user._jaxBaseAtk = user.stats.attack;
      if (!user._jaxAtkBuff) user._jaxAtkBuff = 0;
      user._jaxAtkBuff += 1;
      user.stats.attack = Math.round(user._jaxBaseAtk * (1 + 0.02 * user._jaxAtkBuff));
      return `🪓 2턴간 공격력 +2% (누적 +${user._jaxAtkBuff * 2}%)`;
    }
  }
},
"제드": {
  name: "그림자의 일격",
  description: "공격 시 15% 확률로 상대 최대 체력의 5% 추가 피해, 상대 체력이 30% 이하면 30% 확률로 패시브 발동",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      let msg = "";
      // 상대 최대 체력의 5% 추가 피해 15% 확률 발동
      if (Math.random() < 0.15) {
        const extraDamage = Math.floor(enemy.stats.hp * 0.05);
        context.damage += extraDamage;
        msg += `⚔️ 상대 최대 체력의 5%(${extraDamage}) 추가 피해! `;
      }
      // 상대 체력 30% 이하일 때 30% 확률로 패시브 발동
      if (enemy.hp / enemy.stats.hp <= 0.3 && Math.random() < 0.3) {
        msg += "⚔️ 상대 체력 30% 이하! 패시브 발동!";
      }
      return msg.trim() || undefined;
    }
  }
},
"제라스": {
  name: "마력 폭발",
  description: "이전 턴에 상대에게 가한 피해가 상대 최대 체력의 20% 이상의 피해였다면, 이번 턴 본인의 피해량이 20% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 상대에 기록된 이전 턴 받은 피해량이 필요함
    if (
      trigger === "onAttack" &&
      enemy._lastDamageTaken !== undefined &&
      enemy._lastMaxHp !== undefined &&
      enemy._lastDamageTaken / enemy._lastMaxHp >= 0.2
    ) {
      context.damage = Math.floor(context.damage * 1.2);
      return "💥 지난 턴 큰 피해! 이번 턴 피해 20% 증가!";
    }
  }
},
"제리": {
  name: "스파크 서지",
  description: "공격 시 20% 확률로 1회 추가 공격",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      context.extraAttack = true;
      return "⚡ 1회 추가 공격!";
    }
  }
},
"제이스": {
  name: "무기 전환",
  description: "공격 시 20% 확률로 기본 피해에 주문력의 50% 추가 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      const bonus = Math.floor(user.stats.ap * 0.5);
      context.damage += bonus;
      return `🔄 주문력의 50%(${bonus}) 추가 피해!`;
    }
  }
},
"조이": {
  name: "반짝반짝 트러블",
  description: "공격 시 20% 확률로 상대 1턴 기절 + 2턴간 자신 회피 10% 증가, 10% 확률로 본인 1턴 기절 (리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      let msg = "";
      if (Math.random() < 0.20) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        context.effects[user.id].push({ type: "dodgeChanceUp", value: 10, turns: 2 });
        msg += "🌟 1턴 기절 + 2턴간 회피 10% 증가! ";
      }
      if (Math.random() < 0.10) {
        context.effects[user.id].push({ type: "stunned", turns: 1 });
        msg += "⚠️ 10% 확률로 본인 1턴 기절 (리스크)!";
      }
      return msg.trim() || undefined;
    }
  }
},
"직스": {
  name: "지옥폭탄",
  description: "공격 시 10% 확률로 2턴간 매턴 상대 최대체력 0.7% 도트 피해 (중첩 불가)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      const dot = Math.floor(enemy.stats.hp * 0.007);
      // 중첩 불가: 이미 도트 효과 있으면 덮어쓰기 혹은 무시 처리
      const existingDotIndex = (context.effects[enemy.id] || []).findIndex(e => e.type === "dot");
      if (existingDotIndex !== -1) {
        context.effects[enemy.id][existingDotIndex] = { type: "dot", damage: dot, turns: 2 };
      } else {
        context.effects[enemy.id] = context.effects[enemy.id] || [];
        context.effects[enemy.id].push({ type: "dot", damage: dot, turns: 2 });
      }
      return `💣 2턴간 매턴 ${dot} 도트 피해!`;
    }
  }
},
"진": {
  name: "정확한 한발",
  description: "4번째 공격마다 공격력과 피해량이 4%씩 증가, 최대 44.4%까지 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._jhinAtkCount) user._jhinAtkCount = 0;
    if (!user._jhinStack) user._jhinStack = 0; // 0부터 시작, 최대 11 (11*4%=44%)
    if (!user._jhinBaseAtk) user._jhinBaseAtk = user.stats.attack;

    if (trigger === "onAttack") {
      user._jhinAtkCount += 1;

      if (user._jhinAtkCount === 4) {
        if (user._jhinStack < 11) user._jhinStack += 1;

        const increasePercent = 0.04 * user._jhinStack;

        user.stats.attack = Math.round(user._jhinBaseAtk * (1 + increasePercent));
        context.damage = Math.floor(context.damage * (1 + increasePercent));

        user._jhinAtkCount = 0;

        return `💥 4번째 공격! 공격력과 피해량 +${(increasePercent * 100).toFixed(1)}%!`;
      }
    }
  }
},
"질리언": {
  name: "시간 왜곡",
  description: "방어 시 1턴간 상태이상 면역, 회피 시 1턴간 추가 피해 면역, 공격 시 1턴간 받는 피해 20% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    user._zileanImmuneCD = (user._zileanImmuneCD || 0) - 1;
    if (trigger === "onDefend" && user._zileanImmuneCD <= 0) {
      context.effects[user.id].push({ type: "ignoreDebuff", turns: 1 });
      user._zileanImmuneCD = 3;
      return "⏳ 1턴간 상태이상 면역!";
    }
    if (trigger === "onDodge") {
      context.effects[user.id].push({ type: "extraDamageImmune", turns: 1 });
      return "⏳ 1턴간 추가 피해 면역!";
    }
    if (trigger === "onAttack") {
      context.effects[user.id].push({ type: "damageTakenUpPercent", value: 20, turns: 1 });
      return "⚠️ 1턴간 받는 피해 20% 증가!";
    }
  }
},
"징크스": {
  name: "광란의 난사",
  description: "공격 시 30% 확률로 다음 턴 피해 50% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.3) {
      context.effects[user.id].push({ type: "damageBuff", value: 1.5, turns: 1 });
      return "🔫 다음 턴 피해 1.5배!";
    }
  }
},
"초가스": {
  name: "포식",
  description: "공격시 상대 최대 체력의 5%만큼 자신의 최대 체력 증가(중첩), 상대 체력이 5% 이하일 때 처형",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      // 최대 체력 5%씩 증가 (영구, 소수점 버림)
      const hpGain = Math.floor(enemy.stats.hp * 0.05);
      user.stats.hp += hpGain;
      let msg = `🦑 상대 최대 체력의 5%(${hpGain})만큼 최대 체력 증가!`;
      // 상대 체력 5% 이하일 때 무조건 처형
      if ((enemy.hp / enemy.stats.hp) <= 0.05) {
        enemy.hp = 0;
        msg += " + 상대 5% 이하라 즉시 처형!";
      }
      return msg;
    }
  }
},
"카르마": {
  name: "내면의 평화",
  description: "피해 입을 때마다 20% 확률로 현재 체력 7% 회복",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.20) {
      const heal = Math.floor(user.stats.hp * 0.07);
      user.hp = Math.min(user.hp + heal, user.stats.hp);
      return `🧘 피해 후 7% 회복!`;
    }
  }
},
"카밀": {
  name: "정밀 프로토콜",
  description: "공격 시 20% 확률로 이번 공격 방어력 100% 관통",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      context.defPenetrate = 1.0;
      return "🦵 방어력 100% 관통!";
    }
  }
},
"카사딘": {
  name: "공허의 보호막",
  description: "전투 시작 후 10턴간 모든 디버프 면역, 이후 5턴마다 자신에게 걸린 모든 디버프 해제",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._kassadinTurn === undefined) user._kassadinTurn = 1;
    else user._kassadinTurn += 1;

    // 10턴까지 디버프 면역
    if (user._kassadinTurn <= 10 && trigger === "onTurnStart") {
      context.effects[user.id].push({ type: "debuffImmune", turns: 1 });
      return "🛡️ 모든 디버프 면역!";
    }

    // 10턴 이후, 5턴마다 디버프 해제
    if (user._kassadinTurn > 10 && trigger === "onTurnStart" && (user._kassadinTurn - 10) % 5 === 0) {
      context.effects[user.id].push({ type: "removeAllDebuffs" });
      return "🛡️ 모든 디버프 해제!";
    }
  }
},
"카서스": {
  name: "진혼곡",
  description: "사망 시 4턴간 체력 1로 생존(처형 및 즉사기 면역), 해당 턴 동안 피해 50% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 부활 조건: 사망시 1회, 4턴간 체력 1로 지속, 즉사기 및 처형 면역
    if (!user._karthusRevived && user.hp <= 0) {
      user._karthusRevived = true;
      user.hp = 1;
      user._karthusUndyingTurns = 4;
      context.effects[user.id].push({ type: "undying", turns: 4 }); // 즉사기/처형 면역
      return "💀 4턴간 체력 1로 생존! 처형/즉사기 면역!";
    }
    // 부활상태 유지 중일 때: 피해 50% 증가
    if (user._karthusUndyingTurns && user._karthusUndyingTurns > 0 && trigger === "onAttack") {
      context.damage = Math.floor(context.damage * 1.5);
      return "💀 언데드 상태! 피해 50% 증가!";
    }
    // 턴이 지날 때마다 카운트 감소 (배틀엔진에서 관리)
  }
},
"카시오페아": {
  name: "석화의 응시",
  description: "공격 시 5% 확률로 2턴간 상대 기절, 기절 상태의 적에게 30% 추가 피해 (패시브 터질때마다 확률 0.5%씩 증가)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._cassioBaseChance) user._cassioBaseChance = 0.05;
    if (!user._cassioPopped) user._cassioPopped = 0;
    const chance = user._cassioBaseChance + user._cassioPopped * 0.005;
    if (trigger === "onAttack" && Math.random() < chance) {
      context.effects[enemy.id].push({ type: "stunned", turns: 2 });
      user._cassioPopped += 1;
      return `🐍 2턴간 기절! (현재 확률 ${(chance * 100).toFixed(1)}%)`;
    }
    // 기절 상태의 상대에게 30% 추가 피해
    if (trigger === "onAttack" && enemy.stunned) {
      context.damage = Math.floor(context.damage * 1.3);
      return "🐍 기절 상대에게 30% 추가 피해!";
    }
  }
},
"카이사": {
  name: "공허 추적자",
  description: "공격 시 20% 확률로 2턴간 관통력 10% 증가(중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      if (!user._kaisaPenBuff) user._kaisaPenBuff = 0;
      user._kaisaPenBuff += 1;
      user.stats.penetration = Math.round(user.stats.penetration * (1 + 0.1 * user._kaisaPenBuff));
      context.effects[user.id].push({ type: "penetrationBuffPercent", value: 10, turns: 2 });
      return `👾 2턴간 관통력 10% 증가! (누적 +${user._kaisaPenBuff * 10}%)`;
    }
  }
},
"카직스": {
  name: "고립된 사냥감",
  description: "상대가 버프나 디버프 상태일 때마다 자신이 그 상대에게 주는 피해가 1%씩 증가 (최대 중첩 50%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      // 상대가 버프 또는 디버프 상태인지 체크
      const buffsOrDebuffs = (context.effects[enemy.id] || []).length > 0;
      if (!user._khazixDmgBuff) user._khazixDmgBuff = 0;
      // 조건 만족시 최대 50%까지 누적
      if (buffsOrDebuffs && user._khazixDmgBuff < 50) {
        user._khazixDmgBuff += 1;
      }
      if (user._khazixDmgBuff > 0) {
        context.damage = Math.floor(context.damage * (1 + user._khazixDmgBuff / 100));
        return `🦗 상대 버프/디버프! 피해 ${user._khazixDmgBuff}% 증가!`;
      }
    }
  }
},
"카타리나": {
  name: "죽음의 연무",
  description: "공격 시 20% 확률로 추가 1회 공격(총 피해량 120%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      context.damage = Math.floor(context.damage * 1.2);
      return "🔪 20% 확률로 총 피해 120% (2연타)!";
    }
  }
},
"칼리스타": {
  name: "복수의 서약",
  description: "공격 시 50% 확률로 상대 방어력 1% 감소 (중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.5) {
      if (!enemy._kalistaDefDebuff) enemy._kalistaDefDebuff = 0;
      enemy._kalistaDefDebuff += 1;
      if (!enemy._baseDef) enemy._baseDef = enemy.stats.defense;
      enemy.stats.defense = Math.max(0, Math.round(enemy._baseDef * (1 - enemy._kalistaDefDebuff / 100)));
      return `🏹 50% 확률! 상대 방어력 ${enemy._kalistaDefDebuff}% 감소!`;
    }
  }
},
"케넨": {
  name: "천둥의 표창",
  description: "공격 시 15% 확률로 1턴간 상대 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      return "⚡ 1턴간 기절!";
    }
  }
},
"케이틀린": {
  name: "정조준 사격",
  description: "5번째 공격마다 공격력의 25% 추가 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      user._caitAtkCount = (user._caitAtkCount || 0) + 1;
      if (user._caitAtkCount % 5 === 0) {
        const bonus = Math.floor(user.stats.attack * 0.25);
        context.damage += bonus;
        return `🎯 5번째 공격! 공격력의 25%(${bonus}) 추가 피해!`;
      }
    }
  }
},
"케인": {
  name: "그림자의 습격",
  description: "공격 시 10% 확률로 상대 1턴 행동불능. 상대가 행동불능 상태였던 턴마다 자신이 주는 피해 5% 증가(최대 50%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 행동불능 부여 패시브
    let msg = "";
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.effects[enemy.id].push({ type: "skipNextTurn", turns: 1 });
      msg += "🌑 1턴 행동불능(턴 스킵)! ";
    }
    // 행동불능 누적 피해 증가
    enemy._kaynDisableTurns = enemy._kaynDisableTurns || 0;
    // 지난 턴에 행동불능이었으면 누적 증가
    if (enemy._lastDisabled && trigger === "onAttack") {
      enemy._kaynDisableTurns++;
    }
    // 피해 증가량 계산(최대 50%)
    let bonus = Math.min(enemy._kaynDisableTurns * 0.05, 0.5);
    if (bonus > 0 && trigger === "onAttack") {
      context.damage = Math.floor(context.damage * (1 + bonus));
      msg += `누적 행동불능 피해 +${Math.floor(bonus * 100)}%!`;
    }
    // 이번 턴 행동불능 여부 기록 (배틀엔진에서 skipNextTurn 처리 후 플래그 저장 필요)
    enemy._lastDisabled = context.effects[enemy.id]?.some(e => e.type === "skipNextTurn");
    return msg.trim() || undefined;
  }
},
"케일": {
  name: "천상의 심판",
  description: "자신의 체력이 50% 이하일 때 방어 시 50% 확률로 1턴간 무적",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (
      trigger === "onDefend" &&
      user.hp / user.stats.hp <= 0.5 &&
      Math.random() < 0.5
    ) {
      context.effects[user.id].push({ type: "invulnerable", turns: 1 });
      return "👼 체력 50% 이하! 50% 확률로 1턴간 무적!";
    }
  }
},
"코그모": {
  name: "부식성 침",
  description: "공격 시 15% 확률로 2턴간 상대 방어력 10% 감소 (최대 50% 중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      // 중첩 카운트 체크
      if (!enemy._kogmawDefDownStacks) enemy._kogmawDefDownStacks = 0;
      if (enemy._kogmawDefDownStacks < 5) {
        enemy._kogmawDefDownStacks += 1;
        context.effects[enemy.id].push({ type: "defDownPercent", value: 10, turns: 2 });
        return `🦷 2턴간 방어력 10% 감소! (누적: ${enemy._kogmawDefDownStacks * 10}%)`;
      }
    }
  }
},
"코르키": {
  name: "포탄 폭격",
  description: "공격 시 20% 확률로 추가 피해 10%",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      context.damage = Math.floor(context.damage * 1.1);
      return "💥 20% 확률로 추가 피해 10%!";
    }
  }
},
"퀸": {
  name: "발러의 습격",
  description: "공격 시 10% 확률로 1턴간 상대는 공격·스킬 사용 불가(방어만 가능)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.10) {
      context.effects[enemy.id].push({ type: "blockAttackAndSkill", turns: 1 });
      return "🦅 1턴간 상대 공격·스킬 불가(방어만 가능)!";
    }
  }
},
"크산테": {
  name: "해방된 본능",
  description: "자신의 체력이 절반일 때, 체력에 비례하여 받는 피해량이 피해량 감소하고 주는 피해량도 증가한다. (최대 50%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0) {
      const hpRatio = user.hp / user.stats.hp;
      if (hpRatio <= 0.5) {
        const reductionPercent = (0.5 - hpRatio) * 2 * 50; // (0~0.5)*2*50 → 0~50%
        if (reductionPercent > 0) {
          context.damage = Math.floor(context.damage * (1 - reductionPercent / 100));
          user._ksanteLastReduction = reductionPercent;
          return `🦏 피해 ${reductionPercent.toFixed(0)}% 감소!`;
        }
      }
    }
    // 피해 증가(공격)
    if (trigger === "onAttack" && user._ksanteLastReduction && user._ksanteLastReduction > 0) {
      context.damage = Math.floor(context.damage * (1 + user._ksanteLastReduction / 100));
      return `🦏 내 피해 ${user._ksanteLastReduction.toFixed(0)}% 증가!`;
    }
  }
},
"클레드": {
  name: "스칼과 함께!",
  description: "첫 피해 무효, 무효화 발동 시마다 다음 확률이 절반으로 감소 (100%→50%→25%→12.5%...)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0) {
      if (user._kledDamageNullCount === undefined) user._kledDamageNullCount = 0;
      // 발동해야만 확률이 절반씩 감소
      let chance = 1 / Math.pow(2, user._kledDamageNullCount);
      if (Math.random() < chance) {
        context.damage = 0;
        user._kledDamageNullCount += 1;
        return `🐎 피해 무효! (확률 ${(chance * 100).toFixed(1)}%)`;
      }
    }
  }
},
"키아나": {
  name: "원소의 분노",
  description: "공격 시 10%, 방어 시 30%, 아이템 사용 시 50% 확률로 자신의 공격력이 3% 증가(중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    let chance = 0;
    if (trigger === "onAttack") chance = 0.10;
    else if (trigger === "onDefend") chance = 0.30;
    else if (trigger === "onItem") chance = 0.50;

    if (chance > 0 && Math.random() < chance) {
      if (!user._qiyanaBaseAtk) user._qiyanaBaseAtk = user.stats.attack || 0;
      if (!user._qiyanaAtkBuff) user._qiyanaAtkBuff = 0;
      user._qiyanaAtkBuff += 1;
      user.stats.attack = Math.round(user._qiyanaBaseAtk * (1 + 0.03 * user._qiyanaAtkBuff));
      return `🌪️ 공격력 3% 증가! (누적 +${user._qiyanaAtkBuff * 3}%)`;
    }
  }
},
"킨드레드": {
  name: "운명의 양면",
  description: "자신의 체력이 30% 이하로 떨어지면, 30% + (방어시마다 1%씩, 최대 20% 추가) 확률로 상대와 자신의 체력을 맞바꿈 (1회)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._kindredFatedTried) return; // 이미 시도했으면 패스
    if (!user._kindredSwapChance) user._kindredSwapChance = 0.30;
    if (user.hp / user.stats.hp <= 0.3 && trigger === "onDefend") {
      if (!user._kindredDefendCount) user._kindredDefendCount = 0;
      user._kindredDefendCount += 1;
      let extra = Math.min(user._kindredDefendCount * 0.01, 0.20);
      let chance = user._kindredSwapChance + extra;
      user._kindredFatedTried = true; // 시도 기록
      if (Math.random() < chance) {
        const tempHp = user.hp;
        user.hp = Math.min(enemy.hp, user.stats.hp);
        enemy.hp = Math.min(tempHp, enemy.stats.hp);
        return `🐺 체력 맞바꿈 성공! (확률 ${(chance*100).toFixed(1)}%)`;
      } else {
        return `🐺 체력 맞바꿈 실패... (확률 ${(chance*100).toFixed(1)}%)`;
      }
    }
  }
},
"타릭": {
  name: "수호자의 축복",
  description: "방어 시 받은 피해의 최소 10%~최대 50% 반사",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0) {
      // 방어 시마다 10%에서 시작해서, 방어를 반복할수록 5%씩 올라가고 최대 50%로 제한
      user._taricReflectCount = (user._taricReflectCount || 0) + 1;
      let reflectPercent = Math.min(0.1 + 0.05 * (user._taricReflectCount - 1), 0.5);
      const reflect = Math.floor(context.damage * reflectPercent);
      enemy.hp = Math.max(0, enemy.hp - reflect);
      return `💎 피해 ${Math.round(reflectPercent*100)}% 반사! (${reflect})`;
    }
  }
},
"탈론": {
  name: "칼날 폭풍",
  description: "3번째 공격마다 20% 추가 피해, 항상 방어력 5% 감소 (리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._talonAttackCount) user._talonAttackCount = 0;
    if (trigger === "onAttack") {
      user._talonAttackCount += 1;
      // 3번째 공격마다 추가 피해 20%
      if (user._talonAttackCount % 3 === 0) {
        context.damage = Math.floor(context.damage * 1.2);
        // 리턴 로그 포함
        return "🗡️ 3번째 공격! 피해 20% 증가!";
      }
    }
    // 항상 방어력 5% 감소 (리스크)
    if (!user._talonBaseDef) user._talonBaseDef = user.stats.defense || 0;
    user.stats.defense = Math.floor(user._talonBaseDef * 0.95);

    // 리스크 로그는 턴마다 표시할 필요 없으니 패시브 발동 로그 없애거나 다른 곳에서 알리도록
  }
},
"탈리야": {
  name: "지각 변동",
  description: "기절된 상대에게 피해 20% 증가(패시브 발동 시 확률 2%씩 증가, 최대 40%)하지만 받는 스킬 피해 40% 증가, 공격 시 10% 확률로 1턴간 상대 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    user._taliyaBaseChance = user._taliyaBaseChance ?? 0.10;
    user._taliyaChanceBuff = user._taliyaChanceBuff ?? 0;
    // 발동 확률 계산 (최대 40%)
    const chance = Math.min(user._taliyaBaseChance + user._taliyaChanceBuff, 0.40);

    if (trigger === "onAttack" && Math.random() < chance) {
      user._taliyaChanceBuff += 0.02;
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      user._taliyaStun = true;
      return "🌋 1턴간 기절!";
    }
    // 기절된 상대에게 20% 추가 피해
    if (user._taliyaStun && trigger === "onAttack" && enemy.stunned) {
      context.damage = Math.floor(context.damage * 1.2);
      user._taliyaStun = false;
      return "🌋 기절 상대 추가 피해 20%!";
    }
    // 리스크: 자신이 받는 스킬 피해 40% 증가
    if (trigger === "onDefend" && context.isSkill) {
      context.damage = Math.floor(context.damage * 1.4);
      // 로그는 배틀엔진에서 처리하는 게 좋음
    }
  }
},
"탐 켄치": {
  name: "삼켜버리기",
  description: "방어 시 30% 확률로 받는 피해 무효+상대 1턴 기절",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && context.damage > 0 && Math.random() < 0.3) {
      context.damage = 0;
      context.effects[enemy.id].push({ type: "stunned", turns: 1 });
      return "🐸 피해 무효 + 상대 1턴 기절!";
    }
  }
},
"트런들": {
  name: "트롤 월드",
  description: "체력이 절반 이하시 10% 확률로 상대 또는 본인의 공격력/방어력 1로 고정하며 모든 버프 제거, 또는 90% 확률로 자신에게 걸린 모든 디버프 해제",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (user._trundleWorldUsed) return;
    // 체력이 50%를 '넘어가서' 떨어지는 순간 1회만 체크
    if (!user._trundleWorldTriggered && user.hp / user.stats.hp <= 0.5) {
      user._trundleWorldTriggered = true;
      user._trundleWorldUsed = true;
      const rand = Math.random();
      if (rand < 0.10) {
        enemy.stats.attack = 1;
        enemy.stats.defense = 1;
        enemy._buffs = {};
        context.effects[enemy.id] = (context.effects[enemy.id] || []).filter(e => !e.type.endsWith("Buff"));
        return "🦷 상대 공격력/방어력 1로 고정! 모든 버프 제거!";
      }
      if (rand < 0.20) {
        user.stats.attack = 1;
        user.stats.defense = 1;
        user._buffs = {};
        context.effects[user.id] = (context.effects[user.id] || []).filter(e => !e.type.endsWith("Buff"));
        return "🦷 내 공격력/방어력 1로 고정! 모든 버프 제거!";
      }
      context.effects[user.id] = (context.effects[user.id] || []).filter(e => !e.type.endsWith("Debuff") && !e.type.includes("Down"));
      return "🦷 내 모든 디버프 해제!";
    }
  }
},
"트리스타나": {
  name: "폭발 화약",
  description: "공격 시 20% 확률로 2턴간 상대 방어력 5% 감소(중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.effects[enemy.id] = context.effects[enemy.id] || [];
      // 중첩 처리 (최대 25%)
      let current = 0;
      if (context.effects[enemy.id]) {
        context.effects[enemy.id].forEach(eff => {
          if (eff.type === "defDownPercent") current += eff.value || 0;
        });
      }
      if (current < 25) {
        context.effects[enemy.id].push({ type: "defDownPercent", value: 5, turns: 2 });
        return "💥 2턴간 방어력 5% 감소(중첩)!";
      }
    }
  }
},
"트린다미어": {
  name: "불사의 분노",
  description: "사망 시 4턴간 체력 1로 생존(처형·즉사 면역)하며 치명타 확률 100% + 치명타 피해 1.5배 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 사망시 1회, 4턴간 체력 1로 지속, 즉사/처형 면역 + 치명타 100% + 치명타 피해 2배
    if (!user._tryndUndying && user.hp <= 0) {
      user._tryndUndying = true;
      user.hp = 1;
      user._tryndUndyingTurns = 4;
      context.effects[user.id].push({ type: "undying", turns: 4 }); // 처형/즉사기 면역
      context.effects[user.id].push({ type: "critChanceBuff", value: 100, turns: 4 });
      context.effects[user.id].push({ type: "critDamageBuff", value: 150, turns: 4 }); // 치명타 피해 2배(=기존+100%)
      return "🗡️ 4턴간 불사! 처형/즉사기 면역, 치명타 확률 100%+치명타 피해 2배!";
    }
    // 언데드 상태 관리(배틀엔진에서 4턴간 효과 유지, 턴 카운트 감소)
  }
},
"트위스티드 페이트": {
  name: "운명의 카드",
  description: "2번째 공격마다 ♥️레드(최대 체력 5% 추가 피해), 💙블루(주문력 0.5% 증가, 중첩), 💛옐로(최대 50% 확률로 1턴간 기절) 중 무작위 발동",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._tfAttackCount) user._tfAttackCount = 0;
    if (!user._tfYellowChance) user._tfYellowChance = 0.20;

    if (trigger === "onAttack") {
      user._tfAttackCount += 1;
      if (user._tfAttackCount % 2 === 0) {
        const type = Math.floor(Math.random() * 3);
        if (type === 0) {
          // 레드카드: 상대 최대 체력 5% 추가 피해
          const extra = Math.floor(enemy.stats.hp * 0.05);
          context.damage += extra;
          return `♥️ 레드카드! 상대 최대 체력 5%(${extra}) 추가 피해!`;
        } else if (type === 1) {
          // 블루카드: 자신 주문력 0.5% 증가(중첩)
          if (!user._tfApBuff) user._tfApBuff = 0;
          user._tfApBuff += 1;
          user.stats.ap = Math.round(user.stats.ap * (1 + 0.005 * user._tfApBuff));
          return `💙 블루카드! 주문력 0.5% 증가! (누적 +${(user._tfApBuff * 0.5).toFixed(1)}%)`;
        } else {
          // 옐로카드: 20~50% 확률로 1턴 기절, 실패 시 확률 증가
          if (Math.random() < user._tfYellowChance) {
            user._tfYellowChance = 0.20;
            context.effects[enemy.id].push({ type: "stunned", turns: 1 });
            return "💛 옐로카드! 상대 1턴 기절!";
          } else {
            user._tfYellowChance = Math.min(user._tfYellowChance + 0.01, 0.50);
            return `💛 옐로카드! 기절 실패로 다음 기절 확률 증가! (기절 확률 ${(user._tfYellowChance * 100).toFixed(1)}%)`;
          }
        }
      }
    }
  }
},
"트위치": {
  name: "맹독 화살",
  description: "공격 시 2턴간 매턴 상대 최대 체력 0.3% 도트 피해 (중첩 가능)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      const dot = Math.floor(enemy.stats.hp * 0.003); // 0.3%
      context.effects[enemy.id].push({ type: "dot", damage: dot, turns: 2 });
      return `☠️ 2턴간 매턴 ${dot} 도트 피해! (중첩가능)`;
    }
  }
},
"티모": {
  name: "맹독 버섯",
  description: "공격 시 3턴간 매턴 상대 최대 체력 0.2% 도트 피해 (중첩 가능)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      const dot = Math.floor(enemy.stats.hp * 0.002); // 0.2%
      context.effects[enemy.id].push({ type: "dot", damage: dot, turns: 3 });
      return `🍄 3턴간 매턴 ${dot} 도트 피해! (중첩가능)`;
    }
  }
},
"파이크": {
  name: "죽음의 표식",
  description: "상대 체력 10% 이하일 때 공격 시 100% 처형, 공격 시 15% 확률로 2턴간 상대 방어력 50% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack") {
      if ((enemy.hp / enemy.stats.hp) <= 0.10) {
        enemy.hp = 0;
        return "☠️ 처형! 상대 체력 10% 이하 즉사!";
      } else if (Math.random() < 0.15) {
        context.effects[enemy.id].push({ type: "defDownPercent", value: 50, turns: 2 });
        return "☠️ 2턴간 상대 방어력 50% 감소!";
      }
    }
  }
},
"판테온": {
  name: "방패 돌진",
  description: "방어 시 20% 확률로 상대 1턴간 기절, 실패 시 1턴간 자신이 받는 피해 50% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend") {
      if (Math.random() < 0.20) {
        context.effects[enemy.id].push({ type: "stunned", turns: 1 });
        return "🛡️ 20% 확률! 상대 1턴간 기절!";
      } else {
        context.effects[user.id].push({ type: "damageTakenUpPercent", value: 50, turns: 1 });
        return "🛡️ 실패! 1턴간 받는 피해 50% 증가!";
      }
    }
  }
},
"피들스틱": {
  name: "공포의 수확",
  description: "이전 턴에 공격/스킬 미사용 시, 이번 턴 50% 확률로 상대 1턴 행동불능 + 받는 피해 15% 증가",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // user._fiddleNoAction 기록: 전 턴에 공격/스킬 썼는지
    if (trigger === "onAttack" || trigger === "onSkill") {
      user._fiddleNoAction = false;
      return;
    }
    // 공격/스킬 안 썼으면 true
    if (trigger === "onTurnStart") {
      if (user._fiddleNoAction && Math.random() < 0.5) {
        context.effects[enemy.id].push({ type: "skipNextTurn", turns: 1 });
        context.effects[enemy.id].push({ type: "damageTakenUpPercent", value: 15, turns: 1 });
        return "👻 상대 1턴 행동불능 + 받는 피해 15% 증가!";
      }
      user._fiddleNoAction = true;
    }
  }
},
"피오라": {
  name: "찌르기 연격",
  description: "공격 시 15% 확률로 2턴간 자신의 피해량 15% 증가 (중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[user.id].push({ type: "damageUpPercent", value: 15, turns: 2 });
      return "⚔️ 2턴간 피해량 15% 증가!";
    }
  }
},
"피즈": {
  name: "날렵한 회피",
  description: "회피(점멸) 시 50% 확률로 1턴간 무적 (실패시 1%↑, 성공시 2%↓)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    // 피즈 무적 확률 관리
    if (user._fizzInvulnChance === undefined) user._fizzInvulnChance = 0.5;

    if (trigger === "onDodge") { // 점멸(회피) 시에만
      if (Math.random() < user._fizzInvulnChance) {
        context.effects[user.id].push({ type: "invulnerable", turns: 1 });
        user._fizzInvulnChance = Math.max(0, user._fizzInvulnChance - 0.02);
        return `🐟 1턴간 무적! (확률 ${(user._fizzInvulnChance*100).toFixed(1)}%)`;
      } else {
        user._fizzInvulnChance = Math.min(1, user._fizzInvulnChance + 0.01);
      }
    }
  }
},
"하이머딩거": {
  name: "포탑 설치",
  description: "공격 시 15% 확률로 2턴간 매턴 상대 최대 체력의 0.5% 고정 피해 (최대 3회 중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      // 중첩 카운트 관리 (상대 기준, 챔피언별로 관리)
      if (!enemy._heimerDotCount) enemy._heimerDotCount = 0;
      if (enemy._heimerDotCount < 3) {
        const dot = Math.floor(enemy.stats.hp * 0.005);
        context.effects[enemy.id].push({ type: "dot", damage: dot, turns: 2 });
        enemy._heimerDotCount += 1;
        return `🛠️ 2턴간 매턴 ${dot} 포탑 피해! (중첩 ${enemy._heimerDotCount}/3)`;
      }
    }
  }
},
"헤카림": {
  name: "맹공",
  description: "공격 시 20% 확률로 추가 턴 (연속불가)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20 && !user._hecarimExtraTurn) {
      user._hecarimExtraTurn = true;
      context.effects[user.id].push({ type: "extraTurn", turns: 1 });
      return "🐎 20% 확률로 추가 턴!";
    }
    // 추가턴 사용 후 초기화 (배틀엔진에서 턴종료 시 관리)
  }
},
"흐웨이": {
  name: "몽환의 파동",
  description: "공격 시 20% 확률로 2턴간 상대 혼란 (행동 실패 확률 20%)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      context.effects[enemy.id].push({ type: "confused", value: 20, turns: 2 });
      return "🌫️ 2턴간 혼란(행동실패 확률 20%)!";
    }
  }
},
"가렌": {
  name: "정의의 심판",
  description: "공격 시 20% 확률로 2턴간 자신의 피해량 10% 증가 (중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.20) {
      context.effects[user.id].push({ type: "damageUpPercent", value: 10, turns: 2 });
      return "⚔️ 2턴간 피해량 10% 증가!";
    }
  }
},
"갈리오": {
  name: "듀란드의 방패",
  description: "방어 시 20% 확률로 2턴간 받는 피해 40% 감소",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onDefend" && Math.random() < 0.20) {
      context.effects[user.id].push({ type: "damageReductionPercent", value: 40, turns: 2 });
      return "🛡️ 2턴간 받는 피해 40% 감소!";
    }
  }
},
"갱플랭크": {
  name: "화약통 폭발",
  description: "공격 시 15% 확률로 상대 최대 체력의 5% 추가 피해",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      const bonus = Math.floor(enemy.stats.hp * 0.05);
      context.damage += bonus;
      return `💣 15% 확률로 상대 최대 체력의 5%(${bonus}) 추가 피해!`;
    }
  }
},
"그라가스": {
  name: "술통 굴리기",
  description: "공격 시 20% 확률로 상대 방어력 2턴간 10% 감소(최대 5중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.2) {
      enemy._gragasDefDown = (enemy._gragasDefDown || 0) + 1;
      if (enemy._gragasDefDown > 5) enemy._gragasDefDown = 5;
      context.effects[enemy.id].push({ type: "defDownPercent", value: 10, turns: 2 });
      return `🥃 2턴간 방어력 10% 감소! (중첩 ${enemy._gragasDefDown}/5)`;
    }
  }
},
"그레이브즈": {
  name: "연막탄",
  description: "공격 시 15% 확률로 상대 1턴간 실명(피해 100% 회피)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.15) {
      context.effects[enemy.id].push({ type: "blinded", turns: 1 });
      return "💨 1턴간 실명(공격 완전 회피)!";
    }
  }
},
"그웬": {
  name: "신성한 가위질",
  description: "공격 시 25% 확률로 2턴간 본인 공격력 5% 증가(중첩)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (trigger === "onAttack" && Math.random() < 0.25) {
      if (!user._gwenAtkBuff) user._gwenAtkBuff = 0;
      user._gwenAtkBuff += 1;
      user.stats.attack = Math.round(user.stats.attack * (1 + 0.05 * user._gwenAtkBuff));
      return `✂️ 2턴간 공격력 5% 증가! (누적 +${user._gwenAtkBuff * 5}%)`;
    }
  }
},
"나르": {
  name: "변신의 분노",
  description: "총 10회 피해를 받으면 공격력/방어력/체력/피해량 30% 증가, 받는 피해량은 10% 증가(리스크)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._gnarHitCount) user._gnarHitCount = 0;
    if (!user._gnarTransformed) user._gnarTransformed = false;

    // 피해를 받을 때 카운트
    if (trigger === "onDefend" && context.damage > 0 && !user._gnarTransformed) {
      user._gnarHitCount += 1;
      if (user._gnarHitCount >= 10) {
        user._gnarTransformed = true;
        user.stats.attack = Math.round(user.stats.attack * 1.3);
        user.stats.defense = Math.round(user.stats.defense * 1.3);
        user.stats.hp = Math.round(user.stats.hp * 1.3);
        user._gnarDamageBuff = true;
        user._gnarDamageDebuff = true;
        return "🐻 10회 피해 누적! 공격력/방어력/체력 30% 증가, 가하는 피해 30% 증가, 받는 피해 10% 증가!";
      }
    }

    // 변신 이후, 가하는 피해 30% 증가
    if (user._gnarTransformed && trigger === "onAttack") {
      context.damage = Math.floor(context.damage * 1.3);
      return "🐻 변신 상태! 가하는 피해 30% 증가!";
    }

    // 변신 이후, 받는 피해 10% 증가
    if (user._gnarTransformed && trigger === "onDefend" && context.damage > 0) {
      context.damage = Math.floor(context.damage * 1.1);
      return "🐻 변신 상태! 받는 피해 10% 증가! (리스크)";
    }
  }
},
"펭구": {
  name: "뒤집개 후리기",
  description: "공격 시마다 상대의 공격력, 방어력, 최대 체력을 1%씩 훔쳐옴 (최대 15%까지)",
  passive: (user, enemy, context, trigger) => {   context.effects[enemy.id] = context.effects[enemy.id] || [];   context.effects[user.id] = context.effects[user.id] || [];
    if (!user._penguStealCount) user._penguStealCount = 0;
    if (trigger === "onAttack" && user._penguStealCount < 15) {
      user._penguStealCount += 1;

      // 훔칠 수치 계산
      const stealRatio = 0.01;
      const statsToSteal = ["attack", "defense", "hp"];

      statsToSteal.forEach(stat => {
        const stealAmount = Math.floor((enemy.stats[stat] || 0) * stealRatio);
        if (stealAmount > 0) {
          // 본인 증가
          user.stats[stat] = (user.stats[stat] || 0) + stealAmount;
          // 상대 감소 (최소 1까지)
          enemy.stats[stat] = Math.max(1, (enemy.stats[stat] || 0) - stealAmount);
        }
      });

      return `🐧 상대의 공격력, 방어력, 최대 체력을 1%씩 훔쳐옴! (누적 ${user._penguStealCount}%)`;
    }
  }
}
};
