module.exports = {
"다리우스": {
  name: "녹서스의 단두대",
  description: "상대 체력이 30% 이하일 경우 공격이 즉시 처형됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const ratio = defender.hp / defender.stats.hp;
    if (ratio <= 0.3) {
      defender.hp = 0;
      return { baseDamage: 0, log: "💀 상대가 즉시 처형되었습니다!" };
    }
    return { baseDamage: 0, log: "🪓 처형 조건이 아닙니다. 피해 없음!" };
  }
},
"말파이트": {
  name: "멈출 수 없는 힘",
  description: "공격 시 상대를 1턴 동안 기절시키고, 피해를 1.5배로 증가시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: Math.floor(baseDamage * 1.5),
      addEffect: [
        { target: 'defender', effect: { type: "stunned", turns: 1 } }
      ],
      log: "🌋 상대를 1턴 기절시키고, 피해 1.5배!"
    };
  }
},
"나미": {
  name: "밀물 썰물",
  description: "공격 시 아군 체력을 10 회복시키고, 2턴간 받는 피해를 5 줄입니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const heal = 10;
    attacker.hp = Math.min(attacker.hp + heal, attacker.stats.hp);
    return {
      baseDamage: 0,
      addEffect: [{ target: 'attacker', effect: { type: "damageReduction", value: 5, turns: 2 } }],
      log: `🌊 ${attacker.name}이(가) 체력 ${heal} 회복, 2턴간 피해 5 감소!`
    };
  }
},
"나서스": {
  name: "흡수의 일격",
  description: "공격 시 매턴 공격력이 2 증가합니다. (영구)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker.stats.attack += 2;
    return {
      baseDamage: 0,
      log: `🐕‍🦺 ${attacker.name}의 공격력이 2 증가!`
    };
  }
},
"나피리": {
  name: "추적자의 본능",
  description: "공격 시 30% 확률로 다음 공격에 피해 2배 (1턴간 지속)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "doubleDamage", turns: 1 } }
        ],
        log: "🐺 다음 공격이 2배 피해! (1턴)"
      };
    }
    return { baseDamage: 0 };
  }
},
"노틸러스": {
  name: "깊은 바다의 일격",
  description: "공격 시 20% 확률로 상대를 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "💫 상대가 1턴간 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"녹턴": {
  name: "공포의 장막",
  description: "방어 시 1턴 동안 무적 상태가 됩니다. (1회 발동)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "invulnerable", turns: 1 } }
      ],
      log: "🛡️ 1턴간 무적!"
    };
  }
},
"누누와 윌럼프": {
  name: "절대 영도",
  description: "방어 시 2턴 동안 받는 피해를 50% 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "damageReductionPercent", value: 50, turns: 2 } }
      ],
      log: "❄️ 2턴간 받는 피해 50% 감소!"
    };
  }
},
"니달리": {
  name: "창 투척",
  description: "공격 시 25% 확률로 피해를 2배로 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return { baseDamage: baseDamage * 2, log: "🗡️ 2배 피해!" };
    }
    return { baseDamage: 0 };
  }
},
"니코": {
  name: "카멜레온 술책",
  description: "스킬 사용 시 1턴간 상대의 다음 공격을 무효화합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "missNext", turns: 1 } }
      ],
      log: "🦎 상대의 다음 공격이 무효화됩니다! (1턴)"
    };
  }
},
"닐라": {
  name: "형상의 춤",
  description: "공격 시 20% 확률로 자신과 상대 모두 피해를 무시하고 1턴간 회피 상태가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack || Math.random() >= 0.2) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'attacker', effect: { type: "dodgeNextAttack", turns: 1 } },
        { target: 'defender', effect: { type: "dodgeNextAttack", turns: 1 } }
      ],
      log: "💃 양쪽 모두 1턴간 회피! (피해 무시)"
    };
  }
},
"다이애나": {
  name: "달빛 낙하",
  description: "공격 시 30% 확률로 추가로 10의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: baseDamage + 10,
        log: "🌙 추가로 10 고정 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"드레이븐": {
  name: "회전 도끼",
  description: "공격 시 피해량이 항상 20% 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: Math.floor(baseDamage * 1.2),
      log: "🪓 피해량 20% 증가!"
    };
  }
},
"라이즈": {
  name: "룬 폭발",
  description: "공격 시 25% 확률로 상대에게 1턴간 '기절'을 겁니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "💥 상대 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"라칸": {
  name: "매혹의 돌진",
  description: "공격 시 20% 확률로 상대의 다음 턴을 무력화합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "💘 상대 1턴 무력화(기절)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"람머스": {
  name: "가시박힌 몸통",
  description: "방어 시 공격자에게 10의 반사 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    attacker.hp = Math.max(0, attacker.hp - 10);
    return {
      baseDamage: 0,
      log: "🦔 상대에게 10 반사 피해!"
    };
  }
},
"럭스": {
  name: "빛의 결속",
  description: "공격 시 25% 확률로 상대를 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "✨ 상대 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"럼블": {
  name: "화염방사기",
  description: "공격 시 3턴간 매 턴 6의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 6, turns: 3 } }
      ],
      log: "🔥 3턴간 매턴 6의 고정 피해!"
    };
  }
},
"레나타 글라스크": {
  name: "협상의 기술",
  description: "공격 시 20% 확률로 상대의 공격력을 1턴간 5 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage,
        addEffect: [
          { target: 'defender', effect: { type: "atkDown", value: 5, turns: 1 } }
        ],
        log: "🤝 상대 공격력 1턴간 5 감소!"
      };
    }
    return { baseDamage: 0 };
  }
},
"레넥톤": {
  name: "지배자의 분노",
  description: "피해를 받을 때 30% 확률로 공격자에게 15의 반사 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      attacker.hp = Math.max(0, attacker.hp - 15);
      return {
        baseDamage: 0,
        log: "🐊 30% 확률로 공격자에게 15 반사 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"레오나": {
  name: "일식",
  description: "방어 시 20% 확률로 받은 피해를 0으로 만들고 1턴간 상대를 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🌞 피해 0 + 상대 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"렉사이": {
  name: "땅굴 습격",
  description: "공격 시 30% 확률로 상대 방어력을 무시하고 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      const tempDef = defender.stats.defense;
      defender.stats.defense = 0;
      let ad = attacker.stats.attack || 0;
      let ap = attacker.stats.ap || 0;
      let pen = attacker.stats.penetration || 0;
      let main = Math.max(ad, ap);
      let sub = Math.min(ad, ap);
      let newBase = Math.max(0, main * 1 + sub * 0.5 - pen);
      defender.stats.defense = tempDef;

      return {
        baseDamage: newBase,
        log: "🕳️ 상대 방어력 무시! 방깎 데미지 적용"
      };
    }
    return { baseDamage: 0 };
  }
},
"렐": {
  name: "철갑 돌진",
  description: "공격 시 1턴 동안 상대의 방어력을 절반으로 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "defDown", value: defender.stats.defense / 2, turns: 1 } }
      ],
      log: "🐎 상대 방어력 1턴간 절반!"
    };
  }
},
"렝가": {
  name: "사냥 개시",
  description: "공격 시 20% 확률로 한 번 더 공격합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        extraAttack: true,
        log: "🐾 20% 확률로 한 번 더 공격!"
      };
    }
    return { baseDamage: 0 };
  }
},
"루시안": {
  name: "끊임없는 추격",
  description: "공격 성공 시 다음 턴에 턴을 한 번 더 가집니다. (1회)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      extraTurn: true,
      log: "🔫 다음 턴 한 번 더 연속 공격!"
    };
  }
},
"룰루": {
  name: "변이",
  description: "공격 시 15% 확률로 상대의 공격력을 1턴간 0으로 만듭니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "atkDown", value: defender.stats.attack, turns: 1 } }
        ],
        log: "🦎 상대 공격력 1턴간 0!"
      };
    }
    return { baseDamage: 0 };
  }
},
"르블랑": {
  name: "환영 인장",
  description: "공격 시 2턴 뒤에 동일한 피해를 한 번 더 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "delayedDamage", damage: baseDamage, turns: 2 } }
      ],
      log: "🌀 2턴 뒤 동일 피해 한 번 더!"
    };
  }
},
"리 신": {
  name: "용의 분노",
  description: "공격 시 10% 확률로 상대를 밀쳐내며 1턴 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.1) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🐉 상대 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"리신": {
  name: "용의 분노",
  description: "공격 시 10% 확률로 상대를 밀쳐내며 1턴 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.1) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🐉 상대 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"리븐": {
  name: "폭풍의 검",
  description: "공격 시 피해량이 15% 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: Math.floor(baseDamage * 1.15),
      log: "⚡ 피해량 15% 증가!"
    };
  }
},
"리산드라": {
  name: "얼음 감옥",
  description: "공격 시 20% 확률로 상대를 1턴 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "❄️ 상대 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"릴리아": {
  name: "몽환의 일격",
  description: "공격 시 2턴 뒤 상대를 1턴 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "delayedStun", turns: 2, duration: 1 } }
      ],
      log: "🌙 2턴 뒤 1턴 기절!"
    };
  }
},
"마스터 이": {
  name: "알파 스트라이크",
  description: "공격 시 30% 확률로 다음 피해를 회피합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "dodgeNextAttack", turns: 1 } }
        ],
        log: "⚡ 다음 피해 회피(1턴)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"마오카이": {
  name: "자연의 복수",
  description: "방어 시 2턴 동안 받는 피해가 20% 감소합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "damageReductionPercent", value: 20, turns: 2 } }
      ],
      log: "🌳 2턴간 피해 20% 감소!"
    };
  }
},
"말자하": {
  name: "황혼의 장막",
  description: "공격 시 15% 확률로 상대의 다음 스킬을 무효화시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "skillBlocked", turns: 1 } }
        ],
        log: "🟣 상대 다음 스킬 무효화(1턴)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"멜": {
  name: "정치적 압박",
  description: "전투 시작 시 3턴간 상대의 모든 공격력이 10% 감소합니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (isAttack && !context.debuffApplied) {
      context.debuffApplied = true;
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "damageReductionPercent", value: 10, turns: 3 } }
        ],
        log: "🏛️ 상대 공격력 10% 감소(3턴)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"모데카이저": {
  name: "죽음의 세계",
  description: "공격 시 상대의 회복을 2턴간 봉인합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "healBlocked", turns: 2 } }
      ],
      log: "☠️ 상대 회복 봉인(2턴)!"
    };
  }
},
"모르가나": {
  name: "속박의 어둠",
  description: "공격 시 20% 확률로 상대를 2턴간 행동불능(기절) 상태로 만듭니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 2 } }
        ],
        log: "🌑 상대 2턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"문도 박사": {
  name: "가고 싶은 대로 간다",
  description: "턴 시작 시 체력을 15 회복하고, 2턴간 디버프 면역 상태가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    // 공격/방어 구분 없이 내 턴 시작마다 발동
    attacker.hp = Math.min(attacker.hp + 15, attacker.stats.hp);
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'attacker', effect: { type: "debuffImmune", turns: 2 } }
      ],
      log: "🩹 체력 15 회복 + 2턴간 디버프 면역!"
    };
  }
},
"미스 포츈": {
  name: "더블 업",
  description: "공격 시 30% 확률로 2번 타격하며, 두 번째 타격은 절반 피해를 줍니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: Math.floor(baseDamage * 1.5),
        log: "🔫 더블 업! 추가타 피해 50%!"
      };
    }
    return { baseDamage: 0 };
  }
},
"밀리오": {
  name: "따뜻한 불꽃",
  description: "아군이 피해를 입으면 20% 확률로 피해량의 50%를 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      const heal = Math.floor(baseDamage * 0.5);
      defender.hp = Math.min(defender.hp + heal, defender.stats.hp);
      return {
        baseDamage: 0,
        log: `🔥 피해의 50%(${heal}) 회복!`
      };
    }
    return { baseDamage: 0 };
  }
},
"바드": {
  name: "신비한 차원문",
  description: "턴 종료 시 25% 확률로 다음 공격을 피합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "dodgeNextAttack", turns: 1 } }
        ],
        log: "✨ 다음 공격 회피(1턴)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"바루스": {
  name: "부패의 화살",
  description: "3턴간 상대에게 매턴 8의 고정 피해를 입히는 중독 효과를 겁니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 8, turns: 3 } }
      ],
      log: "☠️ 3턴간 중독(매턴 8 피해)!"
    };
  }
},
"바이": {
  name: "공허의 강타",
  description: "공격 시 20% 확률로 적을 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "👊 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"베이가": {
  name: "무한한 악의",
  description: "공격 시 주문력이 2씩 영구 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker.stats.ap += 2;
    return {
      baseDamage: 0,
      log: "🟪 주문력 +2 영구 증가!"
    };
  }
},
"베인": {
  name: "은화살",
  description: "공격 시 3번째 공격마다 15의 고정 피해를 추가로 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker._vayneCount = (attacker._vayneCount || 0) + 1;
    if (attacker._vayneCount >= 3) {
      attacker._vayneCount = 0;
      return {
        baseDamage: baseDamage + 15,
        log: "🦌 3타마다 15 추가 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"벡스": {
  name: "우울한 폭발",
  description: "공격 시 상대가 방어 중이면 피해량이 50% 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    if (context?.isDefending) {
      return {
        baseDamage: Math.floor(baseDamage * 1.5),
        log: "☁️ 방어 중 상대에 50% 추가 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"벨베스": {
  name: "심연의 돌진",
  description: "공격 시 15% 확률로 즉시 한 번 더 공격합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: baseDamage * 2,
        log: "🐟 15% 확률로 한 번 더 공격!"
      };
    }
    return { baseDamage: 0 };
  }
},
"벨코즈": {
  name: "에너지 방출",
  description: "공격 시 매턴마다 피해량이 5씩 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker._velkozStacks = (attacker._velkozStacks || 0) + 1;
    return {
      baseDamage: baseDamage + 5 * attacker._velkozStacks,
      log: `🔮 누적스택! 추가 피해 ${5 * attacker._velkozStacks}`
    };
  }
},
"볼리베어": {
  name: "폭풍의 분노",
  description: "공격 시 25% 확률로 번개가 튀어 추가 피해를 줍니다 (고정 10).",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: baseDamage + 10,
        log: "⚡️ 25% 확률로 번개 피해 +10!"
      };
    }
    return { baseDamage: 0 };
  }
},
"브라움": {
  name: "불굴의 의지",
  description: "방어 시 피해를 30% 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: Math.floor(baseDamage * 0.7),
      log: "🛡️ 피해 30% 감소!"
    };
  }
},
"브라이어": {
  name: "광기의 흡혈",
  description: "공격 시 20%의 피해량만큼 체력을 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const heal = Math.floor(baseDamage * 0.2);
    attacker.hp = Math.min(attacker.hp + heal, attacker.stats.hp);
    return {
      baseDamage,
      log: `🩸 ${heal} 흡혈!`
    };
  }
},
"브랜드": {
  name: "불꽃의 낙인",
  description: "공격 시 3턴간 매턴 6의 고정 피해를 줍니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 6, turns: 3 } }
      ],
      log: "🔥 3턴간 매턴 6의 고정 피해!"
    };
  }
},
"블라디미르": {
  name: "핏빛 전이",
  description: "공격 시 피해량의 15%만큼 체력을 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const heal = Math.floor(baseDamage * 0.15);
    attacker.hp = Math.min(attacker.hp + heal, attacker.stats.hp);
    return {
      baseDamage,
      log: `💉 피해의 15%(${heal}) 흡혈!`
    };
  }
},
"블리츠크랭크": {
  name: "로켓 손",
  description: "공격 시 10% 확률로 상대를 전투에서 즉시 탈락시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.1) {
      defender.hp = 0;
      return {
        baseDamage: 0,
        log: "🤖 10% 확률로 즉사!"
      };
    }
    return { baseDamage: 0 };
  }
},
"비에고": {
  name: "지배자의 칼날",
  description: "상대가 기절 상태일 경우 피해량이 50% 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return defender.stunned
      ? { baseDamage: Math.floor(baseDamage * 1.5), log: "⚔️ 상대 기절시 1.5배 피해!" }
      : { baseDamage: 0 };
  }
},
"빅토르": {
  name: "진화된 기술",
  description: "공격할 때마다 공격력이 1 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker.stats.attack += 1;
    return {
      baseDamage,
      log: "⚙️ 공격력 +1 영구 증가!"
    };
  }
},
"뽀삐": {
  name: "불굴의 망치",
  description: "받는 피해가 10 이하일 경우, 모두 무효화됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return baseDamage <= 10
      ? { baseDamage: 0, log: "🔨 10 이하 피해 완전 무효!" }
      : { baseDamage, log: "🔨 10 초과 피해만 적용!" };
  }
},
"사미라": {
  name: "지옥불 연격",
  description: "공격 시 30% 확률로 두 번 공격합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return Math.random() < 0.3
      ? { baseDamage: baseDamage * 2, log: "🔥 2연타! 피해 2배!" }
      : { baseDamage: 0 };
  }
},
"사이온": {
  name: "불사의 의지",
  description: "사망 시 1턴간 체력 1로 부활합니다. (1회)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack && defender.hp - baseDamage <= 0 && !defender.reviveUsed) {
      defender.reviveUsed = true;
      defender.hp = 1;
      return { baseDamage: 0, log: "💀 1턴간 HP 1로 부활!" };
    }
    return { baseDamage: 0 };
  }
},
"사일러스": {
  name: "적의 기술 도둑",
  description: "공격 시 20% 확률로 상대의 스킬 효과를 무효화합니다. (1턴)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "skillBlocked", turns: 1 } }
        ],
        log: "🪄 상대 스킬 봉인(1턴)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"샤코": {
  name: "환영 복제",
  description: "첫 피해를 1회 무효화하며, 이후 2턴간 회피 확률이 20% 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (!defender.shieldUsed) {
      defender.shieldUsed = true;
      defender.dodgeTurns = 2;
      return { baseDamage: 0, log: "🎭 첫 피해 1회 무효! 이후 2턴간 회피 확률 20% 증가!" };
    }
    return { baseDamage: 0 };
  }
},
"세나": {
  name: "어둠 속의 빛",
  description: "공격 시 20% 확률로 아군 체력을 15 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      attacker.hp = Math.min(attacker.hp + 15, attacker.stats.hp);
      return { baseDamage: 0, log: "🌒 자신 체력 15 회복!" };
    }
    return { baseDamage: 0 };
  }
},
"세라핀": {
  name: "서포트 하모니",
  description: "공격 시 자신의 체력을 10 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack || !context) return { baseDamage: 0 };
    for (const id in context.userData) {
      context.userData[id].hp = Math.min(
        context.userData[id].hp + 10,
        context.userData[id].stats.hp
      );
    }
    return { baseDamage: 0, log: "🎶 모든 아군 체력 10 회복!" };
  }
},
"세주아니": {
  name: "빙결의 낙인",
  description: "공격 시 30% 확률로 상대를 2턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 2 } }
        ],
        log: "❄️ 2턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"세트": {
  name: "주먹질의 미학",
  description: "공격 시 자신의 체력을 10 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker.hp = Math.min(attacker.hp + 10, attacker.stats.hp);
    return { baseDamage: 0, log: "🥊 자신 체력 10 회복!" };
  }
},
"소나": {
  name: "힐링의 선율",
  description: "턴 시작 시 체력을 5 회복합니다. (지속 효과)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    attacker.hp = Math.min(attacker.hp + 5, attacker.stats.hp);
    return { baseDamage: 0, log: "🎵 턴 시작마다 5 힐!" };
  }
},
"소라카": {
  name: "별의 축복",
  description: "피격 시 20% 확률로 받은 피해의 절반을 무시합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: Math.floor(baseDamage * 0.5),
        log: "✨ 20% 확률로 피해 절반 무시!"
      };
    }
    return { baseDamage: 0 };
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
  description: "공격 시 2턴 동안 매턴 10의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 10, turns: 2 } }
      ],
      log: "🐉 2턴간 매턴 10의 고정 피해!"
    };
  }
},
"스몰더": {
  name: "화염의 날갯짓",
  description: "공격 시 20% 확률로 상대의 방어력을 5 감소시킵니다. (3턴)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "defDown", value: 5, turns: 3 } }
        ],
        log: "🔥 상대 방어력 3턴간 5 감소!"
      };
    }
    return { baseDamage: 0 };
  }
},
"스웨인": {
  name: "악의 시선",
  description: "공격 시 25% 확률로 상대의 다음 공격을 무효화합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "missNext", turns: 1 } }
        ],
        log: "👁️ 상대의 다음 공격 무효!"
      };
    }
    return { baseDamage: 0 };
  }
},
"스카너": {
  name: "수정 가시",
  description: "공격 시 1턴 동안 상대의 스킬 사용을 봉인합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "skillBlocked", turns: 1 } }
      ],
      log: "🔗 상대 스킬 사용 봉인(1턴)!"
    };
  }
},
"시비르": {
  name: "주문 방어막",
  description: "방어 시 1턴 동안 스킬 피해를 무효화합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "blockSkill", turns: 1 } }
      ],
      log: "🛡️ 1턴간 스킬 피해 무효!"
    };
  }
},
"신 짜오": {
  name: "용기백배",
  description: "공격 시 30% 확률로 다음 턴에 다시 공격할 수 있습니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        extraTurn: true,
        log: "🏇 30% 확률로 연속 공격!"
      };
    }
    return { baseDamage: 0 };
  }
},
"신드라": {
  name: "암흑 구체",
  description: "공격 시 20의 추가 피해를 입히고 상대의 마법 방어를 3 감소시킵니다. (2턴)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: baseDamage + 20,
      addEffect: [
        { target: 'defender', effect: { type: "magicResistDebuff", value: -3, turns: 2 } }
      ],
      log: "⚫ 20 추가 피해 + 마법방어 2턴간 3 감소!"
    };
  }
},
"신지드": {
  name: "맹독 가스",
  description: "공격 시 3턴 동안 매턴 6의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 6, turns: 3 } }
      ],
      log: "☣️ 3턴간 매턴 6 중독!"
    };
  }
},
"쓰레쉬": {
  name: "사형 선고",
  description: "공격 시 15% 확률로 상대를 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "⚖️ 15% 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"아리": {
  name: "매혹의 구슬",
  description: "공격 시 25% 확률로 상대를 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "💗 25% 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"아무무": {
  name: "절망",
  description: "공격 시 2턴 동안 매턴 4의 고정 피해를 줍니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 4, turns: 2 } }
      ],
      log: "😢 2턴간 매턴 4 고정 피해!"
    };
  }
},
"아우렐리온 솔": {
  name: "별의 숨결",
  description: "공격 시 고정 피해 30을 추가로 줍니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: baseDamage + 30,
      log: "✨ 추가 피해 30!"
    };
  }
},
"아이번": {
  name: "데이지 소환",
  description: "첫 피해를 무효화하는 보호막을 2턴간 얻습니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "invulnerable", turns: 2 } }
      ],
      log: "🌱 2턴간 피해 완전 무효(쉴드)!"
    };
  }
},
"아지르": {
  name: "병사 소환",
  description: "공격 시 2턴 동안 매턴 10의 고정 피해를 입히는 병사를 소환합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 10, turns: 2 } }
      ],
      log: "🏜️ 2턴간 매턴 10 피해!"
    };
  }
},
"아칼리": {
  name: "황혼의 장막",
  description: "공격 시 20% 확률로 다음 턴에 받는 피해를 무효화합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "invulnerable", turns: 1 } }
        ],
        log: "🌒 다음 턴 피해 무효(1턴)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"아크샨": {
  name: "응징의 총격",
  description: "공격 시 15% 확률로 즉시 한 번 더 공격합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: baseDamage * 2,
        log: "🔫 15% 확률로 한 번 더 공격!"
      };
    }
    return { baseDamage: 0 };
  }
},
"아트록스": {
  name: "피의 강타",
  description: "공격 시 피해량의 20%만큼 체력을 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const heal = Math.floor(baseDamage * 0.2);
    attacker.hp = Math.min(attacker.hp + heal, attacker.stats.hp);
    return {
      baseDamage,
      log: `🩸 피해의 20%(${heal}) 흡혈!`
    };
  }
},
"아펠리오스": {
  name: "무기 마스터리",
  description: "공격 시 30% 확률로 치명타, 30% 확률로 고정 피해 20 추가.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    let damage = baseDamage;
    let log = "";
    if (Math.random() < 0.3) {
      damage = Math.floor(damage * 1.5);
      log += "💥 치명타! ";
    }
    if (Math.random() < 0.3) {
      damage += 20;
      log += "+20 고정 피해!";
    }
    return { baseDamage: damage, log: log.trim() || "피해 없음!" };
  }
},
"알리스타": {
  name: "불굴의 의지",
  description: "방어 시 25% 확률로 받는 피해를 절반으로 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: Math.floor(baseDamage * 0.5),
        log: "🐮 25% 확률로 피해 절반!"
      };
    }
    return { baseDamage: 0 };
  }
},
"암베사": {
  name: "철혈의 명령",
  description: "공격 시 20% 확률로 상대의 방어력을 5 감소시킵니다. (2턴)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "defDown", value: 5, turns: 2 } }
        ],
        log: "🗡️ 상대 방어력 2턴간 5 감소!"
      };
    }
    return { baseDamage: 0 };
  }
},
"애니": {
  name: "티버 소환",
  description: "공격 시 15% 확률로 3턴간 추가 피해 10의 화염 피해를 부여합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "dot", damage: 10, turns: 3 } }
        ],
        log: "🔥 15% 확률로 3턴간 화염 피해(10)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"애니비아": {
  name: "부활의 알",
  description: "죽음에 이를 경우, 1번에 한해 체력 30으로 부활합니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!defender.aniviaRevived) {
      defender.aniviaRevived = true;
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "revive", amount: 30, turns: 99 } }
        ],
        log: "🥚 죽음에 이를 시 1번 부활(HP 30)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"애쉬": {
  name: "집중된 서리",
  description: "공격 시 30% 확률로 상대를 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "❄️ 30% 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"야스오": {
  name: "최후의 숨결",
  description: "치명타 확률이 30% 증가하고, 치명타 시 피해가 1.5배가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const critChance = (attacker.crit || 0) + 0.3;
    if (Math.random() < critChance) {
      return {
        baseDamage: Math.floor(baseDamage * 1.5),
        log: "🍃 치명타! 1.5배 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"에코": {
  name: "시간 왜곡",
  description: "1턴에 한해 받은 피해의 50%를 다음 턴 시작 시 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    context.healNext = context.healNext || {};
    context.healNext[attacker.id] = Math.floor(baseDamage * 0.5);
    return {
      baseDamage: 0,
      log: "⏳ 다음 턴 시작 시 받은 피해의 50% 회복!"
    };
  }
},
"엘리스": {
  name: "거미 여왕",
  description: "공격 시 20% 확률로 2턴간 방어력을 4 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "defDown", value: 4, turns: 2 } }
        ],
        log: "🕷️ 2턴간 방어력 4 감소!"
      };
    }
    return { baseDamage: 0 };
  }
},
"오공": {
  name: "분신 공격",
  description: "공격 시 25% 확률로 1회 추가 타격(기본 피해의 50%)을 가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: baseDamage + Math.floor(baseDamage * 0.5),
        log: "🐵 25% 확률로 추가 타격(50%)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"오로라": {
  name: "빛의 가호",
  description: "공격 시 15% 확률로 아군 체력을 20 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      attacker.hp = Math.min(attacker.hp + 20, attacker.stats.hp);
      return {
        baseDamage: 0,
        log: "🌈 15% 확률로 자신 체력 20 회복!"
      };
    }
    return { baseDamage: 0 };
  }
},
"오른": {
  name: "대장장이의 분노",
  description: "공격 시 10% 확률로 1턴 동안 피해를 무시하는 보호막을 생성합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.1) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "invulnerable", turns: 1 } }
        ],
        log: "⚒️ 1턴간 무적 보호막!"
      };
    }
    return { baseDamage: 0 };
  }
},
"오리아나": {
  name: "명령: 충격파",
  description: "공격 시 25% 확률로 1턴간 상대를 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🔮 25% 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"올라프": {
  name: "불굴의 돌진",
  description: "자신의 체력이 30% 이하일 경우 피해량이 1.5배 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const isLowHp = attacker.hp <= Math.floor(attacker.stats.hp * 0.3);
    if (isLowHp) {
      return {
        baseDamage: Math.floor(baseDamage * 1.5),
        log: "🪓 체력 30% 이하! 피해 1.5배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"요네": {
  name: "영혼 가르기",
  description: "공격 시 20% 확률로 2턴 간 고정 피해(10)를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "dot", damage: 10, turns: 2 } }
        ],
        log: "⚔️ 2턴간 매턴 10 고정 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"요릭": {
  name: "망자의 군대",
  description: "공격 시 10% 확률로 추가 유닛이 소환되어 피해량이 2배가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.1) {
      return {
        baseDamage: baseDamage * 2,
        log: "💀 10% 확률로 피해 2배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"우디르": {
  name: "야성의 형태",
  description: "공격 또는 방어 시 번갈아가며 다음 스킬 효과가 적용됩니다. (피해 +10 또는 받는 피해 -10)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    attacker.form = (attacker.form || "tiger") === "tiger" ? "turtle" : "tiger";
    if (attacker.form === "tiger" && isAttack) {
      return {
        baseDamage: baseDamage + 10,
        log: "🐯 공격 턴! 피해 +10!"
      };
    }
    if (attacker.form === "turtle" && !isAttack) {
      return {
        baseDamage: Math.max(0, baseDamage - 10),
        log: "🐢 방어 턴! 피해 -10!"
      };
    }
    return { baseDamage: 0 };
  }
},
"우르곳": {
  name: "공포의 원형톱",
  description: "공격 시 15% 확률로 상대를 1턴간 기절시키고, 피해량이 1.5배가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: Math.floor(baseDamage * 1.5),
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🪓 15% 확률 1턴 기절 + 1.5배 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"워윅": {
  name: "피의 추적자",
  description: "상대의 체력이 30% 이하일 경우 피해량이 1.8배 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const isLowHp = defender.hp <= Math.floor(defender.stats.hp * 0.3);
    if (isLowHp) {
      return {
        baseDamage: Math.floor(baseDamage * 1.8),
        log: "🐺 상대 체력 30% 이하! 피해 1.8배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"유미": {
  name: "너랑 함께라면!",
  description: "방어 시 20% 확률로 받은 피해의 절반만 입습니다. (즉시)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: Math.floor(baseDamage * 0.5),
        log: "🐱 20% 확률로 피해 절반!"
      };
    }
    return { baseDamage: 0 };
  }
},
"이렐리아": {
  name: "날카로운 검무",
  description: "공격 시 25% 확률로 다음 턴 공격력이 10 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "atkBuff", value: 10, turns: 1 } }
        ],
        log: "🗡️ 25% 확률로 1턴간 공격력 +10!"
      };
    }
    return { baseDamage: 0 };
  }
},
"이블린": {
  name: "그림자 기습",
  description: "공격 시 20% 확률로 적의 방어력을 무시하고 피해를 1.3배로 가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: Math.floor(baseDamage * 1.3),
        log: "👠 20% 확률로 방어력 무시, 피해 1.3배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"이즈리얼": {
  name: "정조준 일격",
  description: "공격 시 30% 확률로 치명타로 2배 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: baseDamage * 2,
        log: "🏹 30% 확률로 2배 피해(치명타)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"일라오이": {
  name: "촉수 강타",
  description: "공격 시 추가로 10의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: baseDamage + 10,
      log: "🐙 추가 고정 피해 10!"
    };
  }
},
"자르반 4세": {
  name: "대장군의 명령",
  description: "공격 시 1턴 동안 자신의 방어력을 5 증가시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage,
      addEffect: [
        { target: 'attacker', effect: { type: "defBuff", value: 5, turns: 1 } }
      ],
      log: "🛡️ 1턴간 방어력 +5!"
    };
  }
},
"자야": {
  name: "깃털 폭풍",
  description: "공격 시 20% 확률로 같은 피해를 두 번 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: baseDamage * 2,
        log: "🪶 20% 확률로 피해 2번!"
      };
    }
    return { baseDamage: 0 };
  }
},
"자이라": {
  name: "덩굴의 속박",
  description: "공격 시 25% 확률로 상대를 2턴간 3의 고정 피해를 입히는 덩굴 상태로 만듭니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "dot", damage: 3, turns: 2 } }
        ],
        log: "🌿 2턴간 매턴 3 덩굴 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"자크": {
  name: "세포 분열",
  description: "피해를 받아 체력이 0이 되면, 한 번에 한해 체력을 1로 남기고 부활합니다. (1회)",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!defender.zacRevived) {
      defender.zacRevived = true;
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "revive", amount: 1, turns: 99 } }
        ],
        log: "🧪 세포 분열! 죽음 시 HP 1로 한 번 부활!"
      };
    }
    return { baseDamage: 0 };
  }
},
"잔나": {
  name: "폭풍의 눈",
  description: "방어 시 다음 공격 피해를 50% 감소시킵니다. (1턴 지속)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "damageReductionPercent", value: 50, turns: 1 } }
      ],
      log: "🌪️ 다음 피해 50% 감소(1턴)!"
    };
  }
},
"잭스": {
  name: "무기의 달인",
  description: "매 공격마다 공격력이 2씩 증가합니다. (전투 중 지속)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker.stats.attack += 2;
    return {
      baseDamage,
      log: "🪓 공격력 +2 영구 증가!"
    };
  }
},
"제드": {
  name: "그림자의 일격",
  description: "공격 시 25% 확률로 상대에게 2턴 동안 매턴 7의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "dot", damage: 7, turns: 2 } }
        ],
        log: "⚔️ 2턴간 매턴 7 고정 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"제라스": {
  name: "마력 폭발",
  description: "공격 시 주문력이 50 이상이면 피해량이 25% 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (attacker.stats.ap >= 50) {
      return {
        baseDamage: Math.floor(baseDamage * 1.25),
        log: "💥 주문력 50 이상! 피해 25% 증가!"
      };
    }
    return { baseDamage: 0 };
  }
},
"제리": {
  name: "스파크 서지",
  description: "공격 시 20% 확률로 즉시 추가 공격을 1회 더 가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: baseDamage * 2,
        log: "⚡ 20% 확률로 추가 공격 1회!"
      };
    }
    return { baseDamage: 0 };
  }
},
"제이스": {
  name: "무기 전환",
  description: "공격 시 50% 확률로 공격력 대신 주문력 기반으로 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.5) {
      return {
        baseDamage: attacker.stats.ap,
        log: "🔄 50% 확률로 주문력 기반 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"조이": {
  name: "반짝반짝 트러블",
  description: "공격 시 20% 확률로 상대를 1턴 동안 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🌟 20% 확률로 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"직스": {
  name: "지옥폭탄",
  description: "공격 시 2턴에 걸쳐 총 20의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 10, turns: 2 } }
      ],
      log: "💣 2턴간 매턴 10 고정 피해!"
    };
  }
},
"진": {
  name: "정확한 한발",
  description: "공격 시 44% 확률로 치명타, 4.4% 확률로 고정 피해 44 추가.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    let damage = baseDamage;
    let log = "";
    if (Math.random() < 0.44) {
      damage = Math.floor(damage * 1.5);
      log += "💥 치명타! ";
    }
    if (Math.random() < 0.044) {
      damage += 44;
      log += "+44 고정 피해!";
    }
    return { baseDamage: damage, log: log.trim() || "피해 없음!" };
  }
},
"질리언": {
  name: "시간 왜곡",
  description: "방어 시 1턴간 모든 상태이상을 무효화합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "ignoreDebuff", turns: 1 } }
      ],
      log: "⏳ 1턴간 상태이상 무효!"
    };
  }
},
"징크스": {
  name: "광란의 난사",
  description: "공격 시 25% 확률로 다음 턴 피해가 1.5배 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "damageBuff", value: 1.5, turns: 1 } }
        ],
        log: "🔫 다음 턴 피해 1.5배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"초가스": {
  name: "포식",
  description: "공격 시 상대 체력이 20 이하일 경우 즉시 처치합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (defender.hp <= 20) {
      return {
        baseDamage: defender.hp,
        log: "🦑 상대가 20 이하라 즉시 처치!"
      };
    }
    return { baseDamage: 0 };
  }
},
"카르마": {
  name: "내면의 평화",
  description: "피해를 받을 때마다 15% 확률로 10 체력을 회복합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      defender.hp = Math.min(defender.hp + 10, defender.stats.hp);
      return {
        baseDamage: 0,
        log: "🧘 15% 확률로 10 회복!"
      };
    }
    return { baseDamage: 0 };
  }
},
"카밀": {
  name: "정밀 프로토콜",
  description: "공격 시 방어력을 무시하고 공격합니다. (관통력 100%)",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    const realPen = attacker.stats.penetration || 0;
    attacker.stats.penetration = realPen + (defender.stats.defense || 0);
    return {
      baseDamage,
      log: "🦵 방어력 100% 관통(완전 무시)!"
    };
  }
},
"카사딘": {
  name: "공허의 보호막",
  description: "받는 마법 피해를 2턴간 50% 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "magicResistBuff", value: 0.5, turns: 2 } }
      ],
      log: "🛡️ 2턴간 마법 피해 50% 감소!"
    };
  }
},
"카서스": {
  name: "진혼곡",
  description: "사망 시 1턴간 살아있으며, 그 턴 동안 공격력이 2배가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!defender.karthusRevived) {
      defender.karthusRevived = true;
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "revive", amount: 100, turns: 1 } },
          { target: 'defender', effect: { type: "doubleDamage", turns: 1 } }
        ],
        log: "💀 진혼곡! 1턴 부활 + 공격력 2배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"카시오페아": {
  name: "석화의 응시",
  description: "공격 시 20% 확률로 적을 2턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 2 } }
        ],
        log: "🐍 2턴간 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"카이사": {
  name: "공허 추적자",
  description: "공격 시 관통력이 10 증가하고, 2턴간 유지됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'attacker', effect: { type: "penetrationBuff", value: 10, turns: 2 } }
      ],
      log: "👾 관통력 +10 (2턴)!"
    };
  }
},
"카직스": {
  name: "고립된 사냥감",
  description: "상대가 디버프 상태일 때 피해가 1.5배로 증가합니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    const debuffed = context?.effects?.[defender.id]?.length > 0;
    if (debuffed) {
      return {
        baseDamage: Math.floor(baseDamage * 1.5),
        log: "🦗 상대 디버프! 피해 1.5배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"카타리나": {
  name: "죽음의 연무",
  description: "공격 시 2회 연속 공격 (총 피해량의 120%)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: Math.floor(baseDamage * 1.2),
      log: "🔪 피해 120% (2연타)"
    };
  }
},
"칼리스타": {
  name: "복수의 서약",
  description: "공격 시 50% 확률로 즉시 다시 공격 (피해 50%)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.5) {
      return {
        baseDamage: baseDamage + Math.floor(baseDamage * 0.5),
        log: "🏹 50% 확률로 추가 공격(50%)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"케넨": {
  name: "천둥의 표창",
  description: "공격 시 15% 확률로 적에게 감전 효과 부여 (1턴 기절)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "⚡ 1턴 감전(기절)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"케이틀린": {
  name: "정조준 사격",
  description: "2턴에 한 번씩 다음 공격의 피해가 2배가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker.precisionTurn = (attacker.precisionTurn || 0) + 1;
    if (attacker.precisionTurn >= 2) {
      attacker.precisionTurn = 0;
      return {
        baseDamage: baseDamage * 2,
        log: "🎯 정조준! 피해 2배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"케인": {
  name: "그림자의 습격",
  description: "공격 시 25% 확률로 상대의 다음 턴을 건너뜁니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "skipNextTurn", turns: 1 } }
        ],
        log: "🌑 25% 확률로 상대 턴 스킵!"
      };
    }
    return { baseDamage: 0 };
  }
},
"케일": {
  name: "천상의 심판",
  description: "방어 시 1턴 동안 무적 상태가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "invulnerable", turns: 1 } }
      ],
      log: "👼 1턴간 무적!"
    };
  }
},
"코그모": {
  name: "부식성 침",
  description: "공격 시 방어력을 5 무시합니다. (즉시 적용)",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    const ignore = Math.min(defender.stats.defense || 0, 5);
    if (ignore > 0) defender.stats.defense -= ignore;
    return {
      baseDamage: baseDamage + ignore,
      log: `🦷 방어력 5 무시!`
    };
  }
},
"코르키": {
  name: "포탄 폭격",
  description: "공격 시 20% 확률로 적에게 10의 고정 피해 추가",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: baseDamage + 10,
        log: "💥 추가 10 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"퀸": {
  name: "발러의 습격",
  description: "공격 시 15% 확률로 다음 턴에 선공권을 가집니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "firstMoveNextTurn", turns: 1 } }
        ],
        log: "🦅 다음 턴 선공권!"
      };
    }
    return { baseDamage: 0 };
  }
},
"크산테": {
  name: "해방된 본능",
  description: "체력이 30% 이하일 때 받는 피해를 50% 감소",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    const hpRatio = defender.hp / defender.stats.hp;
    if (hpRatio <= 0.3) {
      return {
        baseDamage: Math.floor(baseDamage * 0.5),
        log: "🦏 30% 이하 피해 50% 감소!"
      };
    }
    return { baseDamage: 0 };
  }
},
"클레드": {
  name: "스칼과 함께!",
  description: "첫 피해를 무효화하고 대신 스칼이 대신 받습니다. (1회)",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (isAttack) return { baseDamage: 0 };
    if (!context.kladShieldUsed) {
      context.kladShieldUsed = true;
      return {
        baseDamage: 0,
        log: "🐎 첫 피해 완전 무효!"
      };
    }
    return { baseDamage: 0 };
  }
},
"키아나": {
  name: "원소의 분노",
  description: "공격 시 30% 확률로 방어력과 관통력을 무시합니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "defDown", value: defender.stats.defense || 0, turns: 1 } },
          { target: 'attacker', effect: { type: "penetrationBuff", value: defender.stats.defense || 0, turns: 1 } }
        ],
        log: "🌪️ 30% 확률로 방어력/관통력 무시!"
      };
    }
    return { baseDamage: 0 };
  }
},
"킨드레드": {
  name: "운명의 양면",
  description: "피해를 받아 체력이 10% 이하가 될 경우, 1회 체력 1로 생존",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (isAttack) return { baseDamage: 0 };
    const predictedHp = defender.hp - baseDamage;
    if (predictedHp <= 0 && !context.kindredCheatDeathUsed) {
      context.kindredCheatDeathUsed = true;
      defender.hp = 1;
      return {
        baseDamage: 0,
        log: "🐺 1회 체력 1로 생존!"
      };
    }
    return { baseDamage: 0 };
  }
},
"타릭": {
  name: "수호자의 축복",
  description: "방어 시 1턴 동안 받는 피해의 50%를 반사합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    attacker.hp = Math.max(0, attacker.hp - Math.floor(baseDamage * 0.5));
    return {
      baseDamage: 0,
      log: "💎 피해 50% 반사!"
    };
  }
},
"탈론": {
  name: "칼날 폭풍",
  description: "공격 시 3턴 동안 매턴 7의 고정 피해를 부여",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 7, turns: 3 } }
      ],
      log: "🗡️ 3턴간 매턴 7 피해!"
    };
  }
},
"탈리야": {
  name: "지각 변동",
  description: "공격 시 20% 확률로 상대를 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🌋 20% 확률로 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"탐 켄치": {
  name: "삼켜버리기",
  description: "방어 시 15% 확률로 받는 피해를 무효화하고 상대를 기절시킴 (1턴)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "stunned", turns: 1 } }
        ],
        log: "🐸 15% 확률로 피해 무효 + 상대 1턴 기절!"
      };
    }
    return { baseDamage: 0 };
  }
},
"트런들": {
  name: "지속되는 분노",
  description: "공격 시마다 공격력이 2씩 증가합니다. (영구)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    attacker.stats.attack += 2;
    return {
      baseDamage,
      log: "🦷 공격력 +2 영구 증가!"
    };
  }
},
"트리스타나": {
  name: "폭발 화약",
  description: "공격 시 30% 확률로 추가 피해 15를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: baseDamage + 15,
        log: "💥 30% 확률로 추가 피해 15!"
      };
    }
    return { baseDamage: 0 };
  }
},
"트린다미어": {
  name: "불사의 분노",
  description: "1턴에 한 번, 치명타 확률이 100%가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage, context) => {
    if (!isAttack) return { baseDamage: 0 };
    if (!context.trynCritUsed) {
      context.trynCritUsed = true;
      return {
        baseDamage: baseDamage * 2,
        log: "🗡️ 치명타! (1턴 1회)"
      };
    }
    return { baseDamage: 0 };
  }
},
"트위스티드 페이트": {
  name: "운명의 카드",
  description: "공격 시 3종의 카드 중 하나가 무작위 발동되어 다양한 효과를 줍니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const type = Math.floor(Math.random() * 3);
    if (type === 0) {
      return {
        baseDamage: baseDamage + 10,
        log: "♥️ 레드 카드! +10 고정 피해!"
      };
    } else if (type === 1) {
      return {
        baseDamage: baseDamage + 5,
        log: "💙 블루 카드! +5 고정 피해!"
      };
    } else {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "stunned", turns: 1 } }
        ],
        log: "💛 옐로 카드! 1턴 기절!"
      };
    }
  }
},
"트위치": {
  name: "맹독",
  description: "공격 시 2턴 동안 매턴 7의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 7, turns: 2 } }
      ],
      log: "☠️ 2턴간 매턴 7 중독!"
    };
  }
},
"티모": {
  name: "맹독 다트",
  description: "공격 시 3턴 동안 매턴 5의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 5, turns: 3 } }
      ],
      log: "🍄 3턴간 매턴 5 중독!"
    };
  }
},
"파이크": {
  name: "죽음의 표식",
  description: "상대 체력이 30% 이하일 경우, 공격 시 즉시 처치할 확률 25%",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    const hpRate = defender.hp / defender.stats.hp;
    if (hpRate <= 0.3 && Math.random() < 0.25) {
      return {
        baseDamage: defender.hp,
        log: "☠️ 25% 확률로 즉사!"
      };
    }
    return { baseDamage: 0 };
  }
},
"판테온": {
  name: "방패 돌진",
  description: "방어 시 20% 확률로 다음 턴 상대의 공격을 무효화시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "missNext", turns: 1 } }
        ],
        log: "🛡️ 20% 확률로 상대 공격 무효!"
      };
    }
    return { baseDamage: 0 };
  }
},
"피들스틱": {
  name: "공포의 수확",
  description: "공격 시 25% 확률로 상대를 1턴간 공포 상태로 만들어 행동 불능에 빠트립니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "feared", turns: 1 } }
        ],
        log: "👻 1턴 공포!"
      };
    }
    return { baseDamage: 0 };
  }
},
"피오라": {
  name: "찌르기 연격",
  description: "공격 시 2회 연속 공격을 하며, 두 번째 타격은 피해가 절반입니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: Math.floor(baseDamage * 1.5),
      log: "⚔️ 연격! 1.5배 피해!"
    };
  }
},
"피즈": {
  name: "날렵한 회피",
  description: "방어 시 30% 확률로 다음 공격을 완전히 회피합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "dodgeNextAttack", turns: 1 } }
        ],
        log: "🐟 30% 확률로 다음 공격 완전 회피!"
      };
    }
    return { baseDamage: 0 };
  }
},
"하이머딩거": {
  name: "포탑 설치",
  description: "매턴 추가로 5의 고정 피해를 가하는 포탑을 설치합니다. (3턴 지속)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    return {
      baseDamage: 0,
      addEffect: [
        { target: 'defender', effect: { type: "dot", damage: 5, turns: 3 } }
      ],
      log: "🛠️ 3턴간 매턴 5 피해(포탑)!"
    };
  }
},
"헤카림": {
  name: "맹공",
  description: "공격 시 20% 확률로 즉시 추가 턴을 얻습니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        extraTurn: true,
        log: "🐎 20% 확률로 즉시 추가 턴!"
      };
    }
    return { baseDamage: 0 };
  }
},
"흐웨이": {
  name: "몽환의 파동",
  description: "공격 시 20% 확률로 상대에게 2턴간 혼란을 부여합니다. (혼란 상태: 행동 실패 확률 증가)",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "confused", turns: 2 } }
        ],
        log: "🌫️ 2턴간 혼란 부여!"
      };
    }
    return { baseDamage: 0 };
  }
},
"가렌": {
  name: "정의의 심판",
  description: "공격 시 20% 확률로 피해량이 2배가 됩니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: baseDamage * 2,
        log: "⚔️ 20% 확률로 피해 2배!"
      };
    }
    return { baseDamage: 0 };
  }
},
"갈리오": {
  name: "듀란드의 방패",
  description: "방어 시 30% 확률로 2턴 동안 받는 피해를 50% 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "damageReductionPercent", value: 50, turns: 2 } }
        ],
        log: "🛡️ 2턴간 받는 피해 50% 감소!"
      };
    }
    return { baseDamage: 0 };
  }
},
"갱플랭크": {
  name: "화약통 폭발",
  description: "공격 시 25% 확률로 추가로 15의 고정 피해를 입힙니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: baseDamage + 15,
        log: "💣 25% 확률로 15 고정 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"그라가스": {
  name: "술통 굴리기",
  description: "공격 시 20% 확률로 상대의 방어력을 2턴 동안 5 감소시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.2) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "defDown", value: 5, turns: 2 } }
        ],
        log: "🥃 2턴간 방어력 5 감소!"
      };
    }
    return { baseDamage: 0 };
  }
},
"그레이브즈": {
  name: "연막탄",
  description: "공격 시 15% 확률로 상대를 1턴간 실명시켜 다음 공격을 100% 회피시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.15) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'defender', effect: { type: "blinded", turns: 1 } }
        ],
        log: "💨 1턴간 실명(다음 공격 회피)!"
      };
    }
    return { baseDamage: 0 };
  }
},
"그웬": {
  name: "신성한 가위질",
  description: "공격 시 25% 확률로 고정 피해 12를 두 번 연속 가합니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.25) {
      return {
        baseDamage: baseDamage + 24,
        log: "✂️ 25% 확률로 12+12 추가 피해!"
      };
    }
    return { baseDamage: 0 };
  }
},
"나르": {
  name: "변신의 분노",
  description: "공격 시 30% 확률로 거대로 변해 2턴간 공격력과 방어력을 5 증가시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    if (Math.random() < 0.3) {
      return {
        baseDamage: 0,
        addEffect: [
          { target: 'attacker', effect: { type: "atkBuff", value: 5, turns: 2 } },
          { target: 'attacker', effect: { type: "defBuff", value: 5, turns: 2 } }
        ],
        log: "🐻 2턴간 공격력/방어력 +5!"
      };
    }
    return { baseDamage: 0 };
  }
},
"펭구": {
  name: "뒤집개 후리기",
  description: "공격 시 100% 확률로 7의 고정 피해 + 10% 확률로 상대를 1턴간 기절시킵니다.",
  effect: (attacker, defender, isAttack, baseDamage) => {
    if (!isAttack) return { baseDamage: 0 };
    let stunLog = "";
    let stunEffect = [];
    if (Math.random() < 0.1) {
      stunEffect.push({ target: 'defender', effect: { type: "stunned", turns: 1 } });
      stunLog = " + 10% 기절!";
    }
    return {
      baseDamage: baseDamage + 7,
      addEffect: stunEffect,
      log: "🐧 7 고정 피해" + stunLog
    };
  }
}
};

