const passiveSkills = require('./passive-skills'); // ★ 패시브 불러오기

// 전투 시작 시 컨텍스트 초기화
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
    hp: Object.assign({}, battle.hp), // ★ hp 미러링(패시브 대응)
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
  });
}

// 매 턴 시작: 패시브 효과도 자동 발동
function processTurnStart(userData, battle, actingUserId) {
  [battle.challenger, battle.opponent].forEach(id => {

    // ★★★ 패시브 체크: (예) 애니비아 부활 등
    const champName = userData[id]?.name;
    if (
      champName &&
      passiveSkills[champName] &&
      typeof passiveSkills[champName].effect === 'function'
    ) {
      // passive effect(user, context, battle)
      passiveSkills[champName].effect(userData[id], battle.context, battle);
      // passive effect에서 직접 hp, revive, 로그 등 조작 가능!
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

  // 상태(턴감소)
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

// 데미지 계산 (상태효과 반영)
function calculateDamage(
  attacker,
  defender,
  isAttack = true,
  context = {},
  championName = null,
  asSkill = false
) {
  // 행동불능 (기절, 공포, 혼란)
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
  if (context.dodgeNextAttack?.[defender.id]) {
    context.dodgeNextAttack[defender.id] = false;
    return { damage: 0, critical: false, log: `${defender.name}이(가) 완벽히 회피!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }
  if (context.invulnerable?.[defender.id]) {
    context.invulnerable[defender.id] = false;
    return { damage: 0, critical: false, log: `${defender.name}이(가) 무적! 피해 0`, attackerHp: attacker.hp, defenderHp: defender.hp };
  }

  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  const atkName = attacker.name ?? '공격자';
  const defName = defender.name ?? '방어자';
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
  let base = Math.max(0, main * 1 + sub * 0.5 - defVal);

  const evade = Math.random() < 0.05;
  if (evade) return { damage: 0, critical: false, log: `${defName}이(가) 회피!`, attackerHp: attacker.hp, defenderHp: defender.hp };
  const crit = Math.random() < 0.1;
  if (crit) base = Math.floor(base * 1.5);

  const variance = Math.floor(base * 0.15);
  const minD = Math.max(0, base - variance);
  const maxD = base + variance;
  base = minD + Math.floor(Math.random() * (maxD - minD + 1));

  if (isAttack && context.doubleDamage?.[attacker.id]) {
    base *= 2;
    context.doubleDamage[attacker.id] = false;
  }
  base = Math.max(0, base - (context.flatReduction[defender.id] || 0));
  base = Math.floor(
    base * (1 - ((context.percentReduction[defender.id] || 0) / 100))
  );

  // 상태효과: 점멸, 쉴드, execute 등 addEffect 등도 남겨둠 (패시브 대비)
  // 스킬 호출은 없음

  if (context && context.hp) {
    if (attacker.hp !== undefined) context.hp[attacker.id] = attacker.hp;
    if (defender.hp !== undefined) context.hp[defender.id] = defender.hp;
  }
  if (context && context.userData) {
    if (attacker.hp !== undefined && context.userData[attacker.id]) {
      context.userData[attacker.id].hp = attacker.hp;
    }
    if (defender.hp !== undefined && context.userData[defender.id]) {
      context.userData[defender.id].hp = defender.hp;
    }
  }

  let log = '';
  if (base > 0) {
    log += `${atkName}의 공격: ${Math.round(base)}${crit ? ' 💥크리티컬!' : ''}`;
  }

  return {
    damage: Math.round(base),
    critical: crit,
    log,
    attackerHp: attacker.hp,
    defenderHp: defender.hp
  };
}

module.exports = {
  initBattleContext,
  processTurnStart,
  calculateDamage
};
