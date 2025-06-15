const passiveSkills = require('./passive-skills');

// 컨텍스트/런타임 상태 초기화
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
    extraAttacks: {},
    bonusDamage: {},
    passiveVars: {} // 스택, 부활, 영구버프 등 자유롭게
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
    battle.context.extraAttacks[id] = 0;
    battle.context.bonusDamage[id] = 0;
    battle.context.passiveVars[id] = {};
  });
  battle.context.turn = 1;
}

// 모든 패시브 트리거별 실행
function runAllPassives(trigger, userData, battle, actingUserId, extra = {}) {
  [battle.challenger, battle.opponent].forEach(id => {
    const champName = userData[id]?.name;
    if (!champName) return;
    const skill = passiveSkills[champName];
    if (!skill) return;
    if (typeof skill.effect === 'function') {
      const user = userData[id];
      const enemy = userData[[battle.challenger, battle.opponent].find(eid => eid !== id)];
      // (user, enemy, context, battle, trigger, extra)
      skill.effect(user, enemy, battle.context, battle, trigger, extra);
    }
  });
}

// dot/회복/버프/디버프 등 지속효과 적용(매턴)
function applyEffectsBeforeTurn(userData, battle) {
  [battle.challenger, battle.opponent].forEach(id => {
    const effects = battle.context.effects[id] || [];
    let next = [];
    effects.forEach(e => {
      // 도트/회복/반사/스택/추가피해 등 효과 확장 가능
      if (e.type === 'dot' && e.turns > 0) {
        battle.hp[id] = Math.max(0, battle.hp[id] - e.damage);
        battle.logs.push(`☠️ ${userData[id].name} 독 피해(${e.damage})`);
        runAllPassives('dot', userData, battle, id, { dotEffect: e });
      }
      if (e.type === 'heal' && e.turns > 0) {
        battle.hp[id] = Math.min((userData[id].stats?.hp || 600), battle.hp[id] + e.amount);
        battle.logs.push(`💚 ${userData[id].name} 회복(${e.amount})`);
        runAllPassives('heal', userData, battle, id, { healEffect: e });
      }
      // turns 없으면 영구, 1 이상이면 줄이기
      if (e.turns > 1 && !e.applied) next.push({ ...e, turns: e.turns - 1 });
      else if (e.turns === undefined) next.push(e);
    });
    battle.context.effects[id] = next;
  });
}

// 턴 시작 처리 (지속효과/상태이상/패시브/스택/부활/처형 등)
function processTurnStart(userData, battle, actingUserId) {
  runAllPassives('turnStart', userData, battle, actingUserId);
  applyEffectsBeforeTurn(userData, battle);

  [battle.challenger, battle.opponent].forEach(id => {
    if (id === actingUserId) {
      battle.context.skillTurn[id]++;
      if (battle.context.cooldowns[id] > 0) battle.context.cooldowns[id]--;
    }
    let atkModifier = 0, defModifier = 0, bonusHp = 0;
    const effects = battle.context.effects[id];
    let next = [];
    let revived = false, executed = false, killed = false, extraAttack = 0, bonusDmg = 0;
    effects.forEach(e => {
      switch (e.type) {
        case 'dot': case 'heal': break; // 위에서 처리
        case 'stunned': battle.logs.push(`💫 ${userData[id].name} 기절!`); break;
        case 'damageReduction': battle.context.flatReduction[id] += e.value; break;
        case 'damageReductionPercent': battle.context.percentReduction[id] += e.value; break;
        case 'doubleDamage': battle.context.doubleDamage[id] = true; break;
        case 'invulnerable': battle.context.invulnerable[id] = true; break;
        case 'dodgeNextAttack': battle.context.dodgeNextAttack[id] = true; break;
        case 'atkBuff': atkModifier += e.value; break;
        case 'atkDown': atkModifier -= e.value; break;
        case 'defBuff': defModifier += e.value; break;
        case 'defDown': defModifier -= e.value; break;
        case 'hpBuff': bonusHp += e.value; break;
        case 'missNext': battle.context.missNext[id] += (e.turns || 1); break;
        case 'skillBlocked': battle.context.skillBlocked[id] += (e.turns || 1); break;
        case 'blockSkill': battle.context.blockSkill[id] += (e.turns || 1); break;
        case 'magicResistBuff': break;
        case 'magicResistDebuff': battle.context.magicResistDebuff[id] += (e.value || 0); break;
        case 'blinded': battle.context.blind[id] += (e.turns || 1); break;
        case 'feared': battle.context.fear[id] += (e.turns || 1); break;
        case 'confused': battle.context.confused[id] += (e.turns || 1); break;
        case 'revive':
          if (!e.applied && battle.hp[id] <= 0) {
            battle.hp[id] = e.amount || Math.floor(userData[id].stats?.hp || 600) * 0.4 || 200;
            battle.context.reviveFlags[id] = true;
            e.applied = true;
            revived = true;
            battle.logs.push(`🔁 ${userData[id].name} 부활! (HP ${Math.round(battle.hp[id])})`);
            runAllPassives('revive', userData, battle, id, { reviveEffect: e });
          }
          break;
        case 'execute':
          if (battle.hp[id] <= 0) {
            executed = true;
            battle.hp[id] = 0;
            battle.logs.push(`⚔️ ${userData[id].name} 처형됨!`);
            runAllPassives('execute', userData, battle, id, { executeEffect: e });
          }
          break;
        case 'kill': // 즉사
          if (battle.hp[id] > 0 && e.chance && Math.random() < e.chance) {
            killed = true;
            battle.hp[id] = 0;
            battle.logs.push(`💀 ${userData[id].name} 즉사!`);
            runAllPassives('kill', userData, battle, id, { killEffect: e });
          }
          break;
        case 'extraAttack':
          battle.context.extraAttacks[id] += (e.amount || 1);
          break;
        case 'bonusDamage':
          battle.context.bonusDamage[id] += (e.amount || 0);
          break;
      }
      if (e.turns > 1 && !e.applied && !executed && !revived && !killed) next.push({ ...e, turns: e.turns - 1 });
      else if (e.turns === undefined) next.push(e);
    });
    battle.context.effects[id] = next;
    if (userData[id].stats) {
      if (atkModifier !== 0) userData[id].stats.attack = Math.max(0, userData[id].stats.attack + atkModifier);
      if (defModifier !== 0) userData[id].stats.defense = Math.max(0, userData[id].stats.defense + defModifier);
      if (bonusHp !== 0) userData[id].stats.hp = Math.max(1, userData[id].stats.hp + bonusHp);
    }
  });

  // 턴 카운트
  battle.context.turn = (battle.context.turn || 1) + 1;

  // 상태이상 카운트 다운
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

// 데미지/스킬/부가피해/추가공격/회피/처형/부활 등 모든 분기 포함
function calculateDamage(
  attacker,
  defender,
  isAttack = true,
  context = {},
  championName = null,
  asSkill = false
) {
  // 사전 패시브
  if (championName) {
    runAllPassives('preDamage', { [attacker.id]: attacker, [defender.id]: defender }, { ...context, attacker, defender }, attacker.id, { asSkill });
  }
  // 상태이상/실명/혼란/공포/미스
  if (
    context.effects?.[attacker.id]?.some(e => e.type === 'stunned') ||
    attacker.stunned ||
    context.fear?.[attacker.id] > 0 ||
    (context.confused?.[attacker.id] > 0 && Math.random() < 0.5)
  ) {
    let msg = `${attacker.name} `;
    if (context.fear?.[attacker.id] > 0) msg += '공포로 ';
    if (context.confused?.[attacker.id] > 0) msg += '혼란으로 ';
    msg += '행동 불가!';
    runAllPassives('failAct', { [attacker.id]: attacker, [defender.id]: defender }, context, attacker.id, { asSkill });
    return { damage: 0, critical: false, log: msg, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  if (context.missNext && context.missNext[attacker.id] > 0) {
    context.missNext[attacker.id]--;
    runAllPassives('miss', { [attacker.id]: attacker, [defender.id]: defender }, context, attacker.id, { asSkill });
    return { damage: 0, critical: false, log: `${attacker.name}의 공격은 무효화!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  if (context.blind && context.blind[attacker.id] > 0) {
    context.blind[attacker.id]--;
    runAllPassives('blind', { [attacker.id]: attacker, [defender.id]: defender }, context, attacker.id, { asSkill });
    return { damage: 0, critical: false, log: `${attacker.name} 실명 상태!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  // === 회피 ===
  let dodgeRate = 0.2 + (defender.stats?.dodge || 0);
  let dodgeFlag = false;
  if (context.dodgeNextAttack?.[defender.id]) {
    context.dodgeNextAttack[defender.id] = false;
    if (Math.random() < dodgeRate) dodgeFlag = true;
  }
  if (dodgeFlag) {
    runAllPassives('dodge', { [attacker.id]: attacker, [defender.id]: defender }, context, defender.id, { asSkill });
    return { damage: 0, critical: false, log: `${defender.name}이(가) 회피!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  // 무적
  if (context.invulnerable?.[defender.id]) {
    context.invulnerable[defender.id] = false;
    runAllPassives('invulnerable', { [attacker.id]: attacker, [defender.id]: defender }, context, defender.id, { asSkill });
    return { damage: 0, critical: false, log: `${defender.name} 무적 발동!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  // === 기본 피해 공식 ===
  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  let ad = isAttack ? (atkStats.attack || 0) : 0;
  let ap = isAttack ? (atkStats.ap || 0) : 0;
  let pen = atkStats.penetration || 0;

  let magicResistDebuff = context.magicResistDebuff?.[defender.id] || 0;
  let defense = defStats.defense || 0;
  if (magicResistDebuff) defense = defense * Math.max(0, 1 - 0.1 * Math.abs(magicResistDebuff));
  let defVal = Math.max(0, defense - pen);

  let main = Math.max(ad, ap);
  let sub = Math.min(ad, ap);
  let base = main * 1.0 + sub * 0.5;
  base = Math.max(0, base - defVal);
  let ratio = 0.5 + Math.random();
  base = Math.floor(base * ratio);

  // 부가피해
  if (context.bonusDamage?.[attacker.id]) {
    base += context.bonusDamage[attacker.id];
    context.bonusDamage[attacker.id] = 0;
  }
  // 치명타
  const crit = Math.random() < 0.1;
  if (crit) base = Math.floor(base * 1.5);
  if (isAttack && context.doubleDamage?.[attacker.id]) {
    base *= 2;
    context.doubleDamage[attacker.id] = false;
  }
  base = Math.max(0, base - (context.flatReduction[defender.id] || 0));
  base = Math.floor(base * (1 - ((context.percentReduction[defender.id] || 0) / 100)));

  let log = '';
  if (base > 0) log += `${attacker.name}의 공격: ${Math.round(base)}${crit ? ' 💥크리티컬!' : ''}`;

  // 후처리 패시브(추가타, 도트, 즉사, 반사, 흡수 등)
  runAllPassives('postDamage', { [attacker.id]: attacker, [defender.id]: defender }, context, attacker.id, { baseDamage: base, asSkill });

  // 추가공격
  let extraAttackLog = '';
  if (context.extraAttacks?.[attacker.id]) {
    for (let n = 0; n < context.extraAttacks[attacker.id]; n++) {
      const result = calculateDamage(attacker, defender, isAttack, context, championName, asSkill);
      base += result.damage;
      if (result.log) extraAttackLog += `\n추가타: ${result.log}`;
    }
    context.extraAttacks[attacker.id] = 0;
  }

  // 즉사/처형/부활(패시브에서 effect로 관리)
  // (실제 사망 체크, 부활, 처형 등은 processTurnStart에서 처리함)

  return {
    damage: Math.round(base),
    critical: crit,
    log: log + (extraAttackLog ? `\n${extraAttackLog}` : ''),
    attackerHp: attacker.hp,
    defenderHp: defender.hp
  };
}

// 방어(피해감소)
function activateGuard(context, userId, userStats = {}) {
  let defense = userStats.defense || 0;
  let penetration = userStats.penetration || 0;
  let guardPercent = 0.3 + Math.random() * 0.4;
  if (defense > 0) guardPercent *= Math.max(0.2, 1 - penetration / (defense * 2));
  context.percentReduction[userId] = Math.round(guardPercent * 100);
  context.guardMode[userId] = true;
  return guardPercent;
}

// 탈주
function tryEscape(context) {
  const turn = context.turn || 1;
  if (turn < 10 || turn > 30) return { success: false, log: '❌ 점멸 쿨타임! 10턴에서 30턴 사이에만 가능하다!' };
  if (Math.random() < 0.5) return { success: true, log: '🏃‍♂️ 탈주 성공! 무사히 귀환했다!' };
  return { success: false, log: '💥 탈주 실패! 벽에 박았다!' };
}

module.exports = {
  initBattleContext,
  processTurnStart,
  calculateDamage,
  activateGuard,
  tryEscape,
  runAllPassives
};
