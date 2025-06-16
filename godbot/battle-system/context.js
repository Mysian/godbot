// battle-system/context.js
module.exports = {
  applyEffects(user, enemy, context) {
    const logs = [];
    const myEffects = context.effects[user.id] || [];
    for (let i = myEffects.length - 1; i >= 0; i--) {
      const effect = myEffects[i];

      // 도트(고정 피해) - damageRatio 우선 처리 (자이라 등)
      if (effect.type === 'dot' && effect.turns > 0) {
        let dmg = effect.damage;
        if (effect.damageRatio) dmg = Math.floor(user.stats.hp * effect.damageRatio);
        user.hp = Math.max(0, user.hp - dmg);
        logs.push(`☠️ 도트 피해! (${dmg})`);
        effect.turns--;
      }
      // 힐/회복
      else if (effect.type === 'heal' && effect.turns > 0) {
        user.hp = Math.min(user.stats.hp, user.hp + effect.value);
        logs.push(`💚 회복 효과! (+${effect.value})`);
        effect.turns--;
      }
      // 스턴/기절
      else if (effect.type === 'stunned' && effect.turns > 0) {
        user.stunned = true;
        logs.push('😵 기절 상태!');
        effect.turns--;
      }
      // 무적/피해무효
      else if (effect.type === 'invulnerable' && effect.turns > 0) {
        user.invulnerable = true;
        logs.push('🛡️ 무적 상태!');
        effect.turns--;
      }
      // 처형/즉사
      else if (effect.type === 'execute' && effect.turns > 0) {
        user.hp = 0;
        logs.push('💀 처형!');
        effect.turns = 0;
      }
      // 지연 데미지
      else if (effect.type === 'delayedDamage' && effect.turns > 0) {
        effect.turns--;
        if (effect.turns === 0) {
          user.hp = Math.max(0, user.hp - effect.damage);
          logs.push(`💥 지연 피해! (${effect.damage})`);
        }
      }
      // 공격력 % 증가
      else if (effect.type === "atkBuffPercent" && effect.turns > 0) {
        user.stats.attack = Math.round(user.stats.attack * (1 + (effect.value / 100)));
        logs.push(`🟩 공격력 ${effect.value}% 증가!`);
        effect.turns--;
      }
      // 공격력 % 감소
      else if (effect.type === "atkDownPercent" && effect.turns > 0) {
        user.stats.attack = Math.round(user.stats.attack * (1 - (effect.value / 100)));
        logs.push(`🟥 공격력 ${effect.value}% 감소!`);
        effect.turns--;
      }
      // 방어력 % 증가
      else if (effect.type === "defUpPercent" && effect.turns > 0) {
        user.stats.defense = Math.round(user.stats.defense * (1 + (effect.value / 100)));
        logs.push(`🟦 방어력 ${effect.value}% 증가!`);
        effect.turns--;
      }
      // 방어력 % 감소
      else if (effect.type === "defDownPercent" && effect.turns > 0) {
        user.stats.defense = Math.round(user.stats.defense * (1 - (effect.value / 100)));
        logs.push(`🟥 방어력 ${effect.value}% 감소!`);
        effect.turns--;
      }
      // 피해감소 %
      else if (effect.type === "damageReductionPercent" && effect.turns > 0) {
        context.damage = Math.floor(context.damage * (1 - (effect.value / 100)));
        logs.push(`🛡️ 피해 ${effect.value}% 감소!`);
        effect.turns--;
      }
      // 피해증가 %
      else if (effect.type === "damageIncreasePercent" && effect.turns > 0) {
        context.damage = Math.floor(context.damage * (1 + (effect.value / 100)));
        logs.push(`🔥 받는 피해 ${effect.value}% 증가!`);
        effect.turns--;
      }
      // 데미지 버프
      else if (effect.type === "damageBuff" && effect.turns > 0) {
        context.damage = Math.floor(context.damage * effect.value);
        logs.push(`🔸 데미지 ${effect.value}배 증가!`);
        effect.turns--;
      }
      // 데미지 디버프
      else if (effect.type === "damageDebuff" && effect.turns > 0) {
        context.damage = Math.floor(context.damage * (1 - effect.value));
        logs.push(`🔻 데미지 ${Math.round(effect.value * 100)}% 감소!`);
        effect.turns--;
      }
      // 다음 공격 회피
      else if (effect.type === "dodgeNextAttack" && effect.turns > 0) {
        user.dodgeNext = true;
        logs.push(`💨 다음 공격 회피!`);
        effect.turns--;
      }
      // 방어/스킬 차단
      else if (effect.type === "noDefOrSkill" && effect.turns > 0) {
        user.noDefOrSkill = true;
        logs.push(`🚫 방어/스킬 사용 불가!`);
        effect.turns--;
      }
      // 스킬 봉인
      else if (effect.type === "skillBlocked" && effect.turns > 0) {
        user.skillBlocked = true;
        logs.push(`🔒 스킬 봉인!`);
        effect.turns--;
      }
      // 디버프 면역
      else if (effect.type === "debuffImmune" && effect.turns > 0) {
        user.debuffImmune = true;
        logs.push(`🛡️ 디버프 면역!`);
        effect.turns--;
      }
      // 방어불가
      else if (effect.type === "defendBlocked" && effect.turns > 0) {
        user.defendBlocked = true;
        logs.push(`🟥 방어 불가!`);
        effect.turns--;
      }
      // 회피불가
      else if (effect.type === "dodgeBlocked" && effect.turns > 0) {
        user.dodgeBlocked = true;
        logs.push(`🟥 회피 불가!`);
        effect.turns--;
      }
      // 체력 % 감소
      else if (effect.type === "hpDownPercent" && effect.turns > 0) {
        user.stats.hp = Math.round(user.stats.hp * (1 - effect.value / 100));
        if (user.hp > user.stats.hp) user.hp = user.stats.hp;
        logs.push(`🟥 최대 체력 ${effect.value}% DOWN!`);
        effect.turns--;
      }
      // 죽음의 표식
      else if (effect.type === "deathMark" && effect.turns > 0) {
        effect.turns--;
        if (effect.turns === 0) {
          user.hp = 0;
          logs.push("⚖️ 사형 선고 발동! 즉사");
        }
      }
      // 미스넥스트
      else if (effect.type === "missNext" && effect.turns > 0) {
        user.missNext = true;
        logs.push("😶‍🌫️ 다음 공격 무효!");
        effect.turns--;
      }
      // 스킬피해증가
      else if (effect.type === "skillDamageTakenUp" && effect.turns > 0) {
        user.skillDamageTakenUp = effect.value;
        logs.push(`⚠️ 스킬 피해 ${Math.round(effect.value * 100)}% UP (리스크)`);
        effect.turns--;
      }
      // 회피확률 증가
      else if (effect.type === "dodgeChanceUp" && effect.turns > 0) {
        user.dodgeChanceUp = (user.dodgeChanceUp || 0) + effect.value;
        logs.push(`💨 회피확률 ${effect.value}% UP`);
        effect.turns--;
      }
      // 받는 피해 % 증가
      else if (effect.type === "damageTakenUpPercent" && effect.turns > 0) {
        user.damageTakenUpPercent = (user.damageTakenUpPercent || 0) + effect.value;
        logs.push(`🔻 받는 피해 ${effect.value}% UP`);
        effect.turns--;
      }
      // delayedDot (쉬바나 등)
      else if (effect.type === "delayedDot" && effect.turns > 0) {
        effect.turns--;
        if (effect.turns === 0) {
          context.effects[user.id].push({
            type: "dot",
            damage: effect.damage,
            turns: effect.stackable === false ? 1 : (effect.turns || 1)
          });
          logs.push(`🔥 도트 효과 적용!`);
        }
      }
      // delayedStun (릴리아 등)
      else if (effect.type === 'delayedStun' && effect.turns > 0) {
        effect.turns--;
        if (effect.turns === 0) {
          user.stunned = true;
          logs.push('🌙 2턴 뒤 1턴 기절!');
        }
      }
      // 마법저항 % 감소
      else if (effect.type === "magicResistDebuffPercent" && effect.turns > 0) {
        user.magicResist = Math.round((user.magicResist || 0) * (1 - effect.value / 100));
        logs.push(`🟣 마법저항 ${effect.value}% 감소!`);
        effect.turns--;
      }
      // 스킬 무적
      else if (effect.type === "blockSkill" && effect.turns > 0) {
        user.blockSkill = true;
        logs.push("🛡️ 스킬 무적 상태!");
        effect.turns--;
      }
      // 상대가 나에게 주는 피해 감소
      else if (effect.type === "dmgDealtDownPercent" && effect.turns > 0 && context.attacker?.id === effect.target) {
        context.damage = Math.floor(context.damage * (1 - effect.value / 100));
        logs.push(`🌀 상대의 대미지 ${effect.value}% 감소!`);
        effect.turns--;
      }
      // 모든 디버프 해제
      else if (effect.type === "removeAllDebuffs") {
        context.effects[user.id] = (context.effects[user.id] || []).filter(
          e => !["defDownPercent", "atkDownPercent", "damageTakenUpPercent"].includes(e.type)
        );
        logs.push("🧹 모든 디버프 해제!");
      }
      // 언데드(불사/처형면역)
      else if (effect.type === "undying" && effect.turns > 0) {
        user.undying = true;
        logs.push("💀 언데드 상태! 처형 면역!");
        effect.turns--;
      }
      // extraDamageImmune (질리언 등)
      else if (effect.type === "extraDamageImmune" && effect.turns > 0) {
        user.extraDamageImmune = true;
        logs.push("🛡️ 추가 피해 면역!");
        effect.turns--;
      }
      // skipNextTurn (케인 등)
      else if (effect.type === "skipNextTurn" && effect.turns > 0) {
        user.skipNextTurn = true;
        logs.push("⏩ 다음 턴 행동불능!");
        effect.turns--;
      }
      // penetrationBuffPercent (카이사)
      else if (effect.type === "penetrationBuffPercent" && effect.turns > 0) {
        user.stats.penetration = Math.round(user.stats.penetration * (1 + effect.value / 100));
        logs.push(`🔵 관통력 ${effect.value}% 증가!`);
        effect.turns--;
      }
      // ignoreDefensePercent (카밀, 렉사이 등)
      else if (effect.type === "ignoreDefensePercent" && effect.turns > 0) {
        context.ignoreDefensePercent = effect.value;
        logs.push(`🔸 상대 방어력 ${Math.round(effect.value * 100)}% 무시!`);
        effect.turns--;
      }
      // blockAttackAndSkill (퀸 등)
      else if (effect.type === "blockAttackAndSkill" && effect.turns > 0) {
        user.blockAttackAndSkill = true;
        logs.push("🦅 공격/스킬 불가(방어만 가능)!");
        effect.turns--;
      }
      // critChanceBuff (트린다 등)
      else if (effect.type === "critChanceBuff" && effect.turns > 0) {
        user.critChance = 1.0;
        logs.push("🎯 치명타 확률 100%!");
        effect.turns--;
      }
      // critDamageBuff (트린다 등)
      else if (effect.type === "critDamageBuff" && effect.turns > 0) {
        user.critDamage = (user.critDamage || 2.0) * (effect.value / 100);
        logs.push(`💥 치명타 피해 ${effect.value}% UP!`);
        effect.turns--;
      }
      // confused (흐웨이 등)
      else if (effect.type === "confused" && effect.turns > 0) {
        user.confused = effect.value;
        logs.push(`🌫️ 혼란! (${effect.value}% 확률로 행동 실패)`);
        effect.turns--;
      }

      // 만료된 효과 삭제
      if (effect.turns !== undefined && effect.turns <= 0) {
        myEffects.splice(i, 1);
      }
    }
    // 턴 종료 후 상태 초기화
    if (!myEffects.some(e => e.type === 'stunned' && e.turns > 0)) user.stunned = false;
    if (!myEffects.some(e => e.type === 'invulnerable' && e.turns > 0)) user.invulnerable = false;
    context.effects[user.id] = myEffects;
    return logs;
  }
};
