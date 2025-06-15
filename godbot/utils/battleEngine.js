const passiveSkills = require('./passive-skills');

// 컨텍스트 초기화 (버프, 쿨타임 등)
function initBattleContext(battle) {
  battle.context = {
    effects: {},
    cooldowns: {},
    skillTurn: {},
    skillUsed: {},
    flatReduction: {},
    percentReduction: {},
    doubleDamage: {},
    invulnerable: {},
    dodgeNextAttack: {},
    missNext: {},
    skillBlocked: {},
    blockSkill: {},
    magicResistDebuff: {},
    userData: battle.userData || {},
    reviveFlags: {},
    blind: {},
    fear: {},
    confused: {},
    hp: Object.assign({}, battle.hp),
    guardMode: {},
    turn: 1,
  };
  [battle.challenger, battle.opponent].forEach(id => {
    battle.context.effects[id] = [];
    battle.context.cooldowns[id] = 0;
    battle.context.skillTurn[id] = 1;
    battle.context.skillUsed[id] = null;
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
    battle.context.doubleDamage[id] = false;
    battle.context.invulnerable[id] = false;
    battle.context.dodgeNextAttack[id] = false;
    battle.context.missNext[id] = 0;
    battle.context.skillBlocked[id] = 0;
    battle.context.blockSkill[id] = 0;
    battle.context.magicResistDebuff[id] = 0;
    battle.context.blind[id] = 0;
    battle.context.fear[id] = 0;
    battle.context.confused[id] = 0;
    battle.context.reviveFlags[id] = false;
    battle.context.guardMode[id] = false;
  });
  battle.context.turn = 1;
}

// 턴 시작 시 상태, 패시브, 버프 등 처리
function processTurnStart(userData, battle, actingUserId) {
  [battle.challenger, battle.opponent].forEach(id => {
    const champName = userData[id]?.name;
    if (
      champName &&
      passiveSkills[champName] &&
      typeof passiveSkills[champName].effect === 'function'
    ) {
      passiveSkills[champName].effect(userData[id], battle.context, battle);
    }

    if (id === actingUserId) {
      battle.context.skillTurn[id]++;
      if (battle.context.cooldowns[id] > 0) battle.context.cooldowns[id]--;
    }
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
    battle.context.doubleDamage[id] = false;
    battle.context.invulnerable[id] = false;
    battle.context.dodgeNextAttack[id] = false;
    let atkModifier = 0, defModifier = 0;

    const next = [];
    let justRevived = false;
    let executed = false;
    for (const e of battle.context.effects[id]) {
      switch (e.type) {
        case 'dot':
          battle.hp[id] = Math.max(0, battle.hp[id] - e.damage);
          battle.logs.push(`☠️ ${userData[id].name}은(는) 독 ${e.damage} 피해`);
          break;
        case 'stunned':
          battle.logs.push(`💫 ${userData[id].name}은(는) 기절 상태!`);
          break;
        case 'damageReduction':
          battle.context.flatReduction[id] += e.value;
          break;
        case 'damageReductionPercent':
          battle.context.percentReduction[id] += e.value;
          break;
        case 'doubleDamage':
          battle.context.doubleDamage[id] = true;
          break;
        case 'invulnerable':
          battle.context.invulnerable[id] = true;
          break;
        case 'dodgeNextAttack':
          battle.context.dodgeNextAttack[id] = true;
          break;
        case 'atkBuff':
          atkModifier += e.value;
          break;
        case 'atkDown':
          atkModifier -= e.value;
          break;
        case 'defBuff':
          defModifier += e.value;
          break;
        case 'defDown':
          defModifier -= e.value;
          break;
        case 'missNext':
          battle.context.missNext[id] += (e.turns || 1);
          break;
        case 'skillBlocked':
          battle.context.skillBlocked[id] += (e.turns || 1);
          break;
        case 'blockSkill':
          battle.context.blockSkill[id] += (e.turns || 1);
          break;
        case 'magicResistBuff':
          break;
        case 'magicResistDebuff':
          battle.context.magicResistDebuff[id] += (e.value || 0);
          break;
        case 'blinded':
          battle.context.blind[id] += (e.turns || 1);
          break;
        case 'feared':
          battle.context.fear[id] += (e.turns || 1);
          break;
        case 'confused':
          battle.context.confused[id] += (e.turns || 1);
          break;
        case 'revive':
          if (!e.applied && battle.hp[id] <= 0) {
            battle.hp[id] = e.amount || Math.floor(userData[id].stats?.hp || 600) * 0.4 || 200;
            battle.context.reviveFlags[id] = true;
            e.applied = true;
            justRevived = true;
            battle.logs.push(`🔁 ${userData[id].name}이(가) 기사회생! (HP ${Math.round(battle.hp[id])}로 부활)`);
          }
          break;
        case 'execute':
          if (battle.hp[id] <= 0) {
            executed = true;
            battle.hp[id] = 0;
            battle.logs.push(`⚔️ ${userData[id].name}이(가) 처형 당했습니다!`);
          }
          break;
      }
      if (e.turns > 1 && !e.applied && !executed) next.push({ ...e, turns: e.turns - 1 });
    }
    battle.context.effects[id] = next;

    if (userData[id].stats) {
      if (atkModifier !== 0) {
        userData[id].stats.attack = Math.max(0, userData[id].stats.attack + atkModifier);
      }
      if (defModifier !== 0) {
        userData[id].stats.defense = Math.max(0, userData[id].stats.defense + defModifier);
      }
    }
  });

  // 턴 카운트 증가
  battle.context.turn = (battle.context.turn || 1) + 1;

  // 상태효과(턴 감소)
  ['missNext', 'skillBlocked', 'blockSkill', 'blind', 'fear', 'confused'].forEach(type => {
    const ctx = battle.context[type];
    if (ctx) {
      Object.keys(ctx).forEach(uid => {
        if (ctx[uid] > 0) ctx[uid]--;
        if (ctx[uid] <= 0) delete ctx[uid];
      });
    }
  });
}

// ▶ 평타/스킬 데미지 계산 (상태효과, 회피, 방어 등 반영)
function calculateDamage(
  attacker,
  defender,
  isAttack = true,
  context = {},
  championName = null,
  asSkill = false
) {
  // 상태: 기절/혼란/공포/실명/미스 등
  if (
    context.effects?.[attacker.id]?.some(e => e.type === 'stunned') ||
    attacker.stunned ||
    context.fear?.[attacker.id] > 0 ||
    (context.confused?.[attacker.id] > 0 && Math.random() < 0.5)
  ) {
    let msg = `${attacker.name}은(는) `;
    if (context.fear?.[attacker.id] > 0) msg += '공포로 ';
    if (context.confused?.[attacker.id] > 0) msg += '혼란으로 ';
    msg += '행동 불가!';
    return { damage: 0, critical: false, log: msg, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  if (context.missNext && context.missNext[attacker.id] > 0) {
    context.missNext[attacker.id]--;
    return { damage: 0, critical: false, log: `${attacker.name}의 공격은 무효화됩니다!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  if (context.blind && context.blind[attacker.id] > 0) {
    context.blind[attacker.id]--;
    return { damage: 0, critical: false, log: `${attacker.name}은(는) 실명 상태로 공격에 실패했습니다!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }

  // === 회피 확률 계산 ===
  let dodgeRate = 0.2; // 기본 20%
  if (defender.stats && defender.stats.dodge) dodgeRate += defender.stats.dodge;
  let dodgeFlag = false;

  // [점멸 효과가 있다면] → 회피율로 dodge 시도, 사용 후 효과 해제
  if (context.dodgeNextAttack?.[defender.id]) {
    context.dodgeNextAttack[defender.id] = false;
    if (Math.random() < dodgeRate) {
      dodgeFlag = true;
    }
  } else {
    // [버튼X, 평소 회피] → 회피율로 dodge 시도
    if (Math.random() < dodgeRate) {
      dodgeFlag = true;
    }
  }

  if (dodgeFlag) {
    return {
      damage: 0,
      critical: false,
      log: `${defender.name}이(가) 회피 성공!`,
      attackerHp: attacker.hp,
      defenderHp: defender.hp
    };
  }

  // 무적
  if (context.invulnerable?.[defender.id]) {
    context.invulnerable[defender.id] = false;
    return { damage: 0, critical: false, log: `${defender.name}이(가) 무적! 피해 0`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }

  // === 실제 피해 공식 ===
  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  let ad = isAttack ? (atkStats.attack || 0) : 0;
  let ap = isAttack ? (atkStats.ap || 0) : 0;
  let pen = atkStats.penetration || 0;

  let magicResistDebuff = 0;
  if (context.magicResistDebuff && context.magicResistDebuff[defender.id]) {
    magicResistDebuff = context.magicResistDebuff[defender.id];
  }
  let defense = defStats.defense || 0;
  if (magicResistDebuff) {
    defense = defense * Math.max(0, 1 - 0.1 * Math.abs(magicResistDebuff));
  }
  let defVal = Math.max(0, defense - pen);

  let main = Math.max(ad, ap);
  let sub = Math.min(ad, ap);
  let base = main * 1.0 + sub * 0.5;
  base = Math.max(0, base - defVal);

  let ratio = 0.5 + Math.random();
  base = Math.floor(base * ratio);

  const crit = Math.random() < 0.1;
  if (crit) base = Math.floor(base * 1.5);

  if (isAttack && context.doubleDamage?.[attacker.id]) {
    base *= 2;
    context.doubleDamage[attacker.id] = false;
  }

  base = Math.max(0, base - (context.flatReduction[defender.id] || 0));
  base = Math.floor(
    base * (1 - ((context.percentReduction[defender.id] || 0) / 100))
  );

  let log = '';
  if (base > 0) {
    log += `${attacker.name}의 공격: ${Math.round(base)}${crit ? ' 💥크리티컬!' : ''}`;
  }
  return {
    damage: Math.round(base),
    critical: crit,
    log,
    attackerHp: attacker.hp,
    defenderHp: defender.hp
  };
}

// ▶ 방어(Guard) 기능: 사용 시 다음 턴만 피해 30~70% 감소
function activateGuard(context, userId, userStats = {}) {
  let defense = userStats.defense || 0;
  let penetration = userStats.penetration || 0;
  let guardPercent = 0.3 + Math.random() * 0.4; // 30~70%
  if (defense > 0) {
    guardPercent *= Math.max(0.2, 1 - penetration / (defense * 2));
  }
  context.percentReduction[userId] = Math.round(guardPercent * 100);
  context.guardMode[userId] = true;
  return guardPercent;
}

// ▶ 탈주(도망): 10턴~30턴만 사용 가능, 50% 확률 성공
function tryEscape(context) {
  const turn = context.turn || 1;
  if (turn < 10 || turn > 30) {
    return { success: false, log: '❌ 도망은 10~30턴에만 시도 가능!' };
  }
  if (Math.random() < 0.5) {
    return { success: true, log: '🏃‍♂️ 탈주 성공! 전투에서 도망쳤다.' };
  } else {
    return { success: false, log: '💥 탈주 실패! 빈틈을 보였다.' };
  }
}

module.exports = {
  initBattleContext,
  processTurnStart,
  calculateDamage,
  activateGuard,
  tryEscape
};
