const skills = require('./skills');
const skillCd = require('./skills-cooldown');
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

// 쿨다운, 최소 턴 체크 로직
function canUseSkill(userId, championName, context) {
  const cdInfo = skillCd[championName];
  if (!cdInfo) return { ok: false, reason: '쿨타임 정보 없음' };
  const minTurn = cdInfo.minTurn || 1;
  const cooldown = cdInfo.cooldown || 1;
  const nowTurn = context.skillTurn[userId] || 1;
  if (context.skillBlocked && context.skillBlocked[userId] > 0) {
    return { ok: false, reason: `스킬 봉인 효과로 스킬 사용 불가!` };
  }
  if (nowTurn < minTurn) {
    return { ok: false, reason: `최소 ${minTurn}턴 이후 사용 가능! (현재: ${nowTurn}턴)` };
  }
  if (context.cooldowns[userId] > 0) {
    return { ok: false, reason: `쿨다운 ${context.cooldowns[userId]}턴 남음!` };
  }
  return { ok: true };
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
  let skillResult = undefined;

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
  if (asSkill && context.blockSkill && context.blockSkill[defender.id] > 0) {
    context.blockSkill[defender.id]--;
    return { damage: 0, critical: false, log: `${defender.name}은(는) 스킬 피해를 무효화했습니다!`, attackerHp: attacker.hp, defenderHp: defender.hp };
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

  let skillLog = '';
  let skillName = '';
  let skillDesc = '';
  let effectMsg = '';
  let usedSkill = false;
  let addEffectArr = [];
  let extraAttack = false;
  let extraTurn = false;

  if (
    championName &&
    skills[championName] &&
    typeof skills[championName].effect === 'function' &&
    asSkill
  ) {
    const check = canUseSkill(attacker.id, championName, context);
    if (!check.ok) {
      return { damage: 0, critical: false, log: `❌ 스킬 사용 불가: ${check.reason}`, attackerHp: attacker.hp, defenderHp: defender.hp };
    }
    skillName = skills[championName].name;
    skillDesc = skills[championName].description;
    usedSkill = true;

    skillResult = skills[championName].effect(
      attacker, defender, isAttack, base, context
    );
    if (typeof skillResult === 'object' && skillResult !== null) {
      base = skillResult.baseDamage ?? base;
      if (skillResult.log) effectMsg = skillResult.log;
      if (Array.isArray(skillResult.addEffect)) addEffectArr = skillResult.addEffect;
      if (skillResult.extraAttack) extraAttack = true;
      if (skillResult.extraTurn) extraTurn = true;
    } else {
      base = skillResult;
    }
    const cdInfo = skillCd[championName] || {};
    context.cooldowns[attacker.id] = cdInfo.cooldown || 1;
    context.skillUsed[attacker.id] = context.skillTurn[attacker.id];
  }

  // addEffect 처리 (ex: 점멸, 쉴드 등 신규 상태 자연스럽게 지원)
  if (addEffectArr.length && context.effects) {
    for (const eff of addEffectArr) {
      if (eff.target === 'attacker') {
        context.effects[attacker.id].push(eff.effect);
      } else {
        context.effects[defender.id].push(eff.effect);
        if (eff.effect.type === 'execute') {
          defender.hp = 0;
          if (context.hp) context.hp[defender.id] = 0;
        }
      }
    }
  }

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
  if (usedSkill) {
    log += `\n✨ **${atkName}가 「${skillName}」를 사용합니다!**\n`;
    log += `> _${skillDesc}_\n`;
  }
  if (effectMsg) {
    log += `➡️ **${effectMsg}**\n`;
  }
  if (base > 0 && (!skillResult || skillResult.baseDamage > 0)) {
    log += `${atkName}의 공격: ${Math.round(base)}${crit ? ' 💥크리티컬!' : ''}`;
  }

  return {
    damage: Math.round(base),
    critical: crit,
    log,
    extraAttack,
    extraTurn,
    attackerHp: attacker.hp,
    defenderHp: defender.hp
  };
}

module.exports = {
  initBattleContext,
  processTurnStart,
  calculateDamage,
  canUseSkill
};
