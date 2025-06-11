// utils/battleEngine.js
const skills = require('./skills');
const skillCd = require('./skills-cooldown');

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

// 매 턴 시작: 이펙트 처리 및 턴 감소, 스탯/상태 반영, 부활/처형도 여기서 처리
function processTurnStart(userData, battle, actingUserId) {
  [battle.challenger, battle.opponent].forEach(id => {
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
        case 'atkDown':
          atkModifier = -e.value;
          break;
        case 'defDown':
          defModifier = -e.value;
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
          // 부활 조건: 아직 미적용, HP 0 이하
          if (!e.applied && battle.hp[id] <= 0) {
            battle.hp[id] = e.amount || Math.floor(userData[id].stats?.hp || 600) * 0.4 || 200; // 부활 HP
            battle.context.reviveFlags[id] = true;
            e.applied = true;
            justRevived = true;
            battle.logs.push(`🔁 ${userData[id].name}이(가) 기사회생! (HP ${Math.round(battle.hp[id])}로 부활)`);
          }
          break;
        case 'execute':
          // 처형 조건: HP 0 이하시 revive 무시하고 사망
          if (battle.hp[id] <= 0) {
            executed = true;
            battle.hp[id] = 0;
            battle.logs.push(`⚔️ ${userData[id].name}이(가) 처형 당했습니다!`);
          }
          break;
      }
      if (e.turns > 1 && !e.applied && !executed) next.push({ ...e, turns: e.turns - 1 });
    }
    // revive 효과 중복 적용 방지
    battle.context.effects[id] = next;

    // 스탯 변화 반영
    if (atkModifier !== 0 && userData[id].stats) {
      userData[id].stats.attack = Math.max(0, userData[id].stats.attack + atkModifier);
    }
    if (defModifier !== 0 && userData[id].stats) {
      userData[id].stats.defense = Math.max(0, userData[id].stats.defense + defModifier);
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
    return { damage: 0, critical: false, log: msg };
  }

  // 다음 공격 무효
  if (context.missNext && context.missNext[attacker.id] > 0) {
    context.missNext[attacker.id]--;
    return { damage: 0, critical: false, log: `${attacker.name}의 공격은 무효화됩니다!` };
  }
  // 실명 상태
  if (context.blind && context.blind[attacker.id] > 0) {
    context.blind[attacker.id]--;
    return { damage: 0, critical: false, log: `${attacker.name}은(는) 실명 상태로 공격에 실패했습니다!` };
  }
  // 회피
  if (context.dodgeNextAttack?.[defender.id]) {
    context.dodgeNextAttack[defender.id] = false;
    return { damage: 0, critical: false, log: `${defender.name}이(가) 완벽히 회피!` };
  }
  // 무적
  if (context.invulnerable?.[defender.id]) {
    context.invulnerable[defender.id] = false;
    return { damage: 0, critical: false, log: `${defender.name}이(가) 무적! 피해 0` };
  }
  // 스킬 피해 무효
  if (asSkill && context.blockSkill && context.blockSkill[defender.id] > 0) {
    context.blockSkill[defender.id]--;
    return { damage: 0, critical: false, log: `${defender.name}은(는) 스킬 피해를 무효화했습니다!` };
  }

  // 스탯 추출
  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  const atkName = attacker.name ?? '공격자';
  const defName = defender.name ?? '방어자';
  let ad = isAttack ? (atkStats.attack || 0) : 0;
  let ap = isAttack ? (atkStats.ap || 0) : 0;
  let pen = atkStats.penetration || 0;

  // 1. 마법방어력 디버프 계산
  let magicResistDebuff = 0;
  if (context.magicResistDebuff && context.magicResistDebuff[defender.id]) {
    magicResistDebuff = context.magicResistDebuff[defender.id];
    // magicResist 값 자체에 더하지 않고, 방어력 감소에만 사용 (아래서 반영)
  }

  // 2. 일반 방어력 10%씩 추가 감소 적용
  let defense = defStats.defense || 0;
  if (magicResistDebuff) {
    defense = defense * Math.max(0, 1 - 0.1 * Math.abs(magicResistDebuff));
  }
  let defVal = Math.max(0, defense - pen);

  // 3. AD/AP중 더 높은 쪽 1배, 낮은 쪽 0.5배로 데미지 공식
  let main = Math.max(ad, ap);
  let sub = Math.min(ad, ap);
  let base = Math.max(0, main * 1 + sub * 0.5 - defVal);

  // 회피/치명타
  const evade = Math.random() < 0.05;
  if (evade) return { damage: 0, critical: false, log: `${defName}이(가) 회피!` };
  const crit = Math.random() < 0.1;
  if (crit) base = Math.floor(base * 1.5);

  // 데미지 분산
  const variance = Math.floor(base * 0.15);
  const minD = Math.max(0, base - variance);
  const maxD = base + variance;
  base = minD + Math.floor(Math.random() * (maxD - minD + 1));

  // doubleDamage
  if (isAttack && context.doubleDamage?.[attacker.id]) {
    base *= 2;
    context.doubleDamage[attacker.id] = false;
  }
  base = Math.max(0, base - (context.flatReduction[defender.id] || 0));
  base = Math.floor(
    base * (1 - ((context.percentReduction[defender.id] || 0) / 100))
  );

  // 스킬 effect 적용
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
      return { damage: 0, critical: false, log: `❌ 스킬 사용 불가: ${check.reason}` };
    }
    skillName = skills[championName].name;
    skillDesc = skills[championName].description;
    usedSkill = true;

    let skillResult = skills[championName].effect(
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

  // addEffect 처리
  if (addEffectArr.length && context.effects) {
    for (const eff of addEffectArr) {
      if (eff.target === 'attacker') {
        context.effects[attacker.id].push(eff.effect);
      } else {
        context.effects[defender.id].push(eff.effect);
      }
    }
  }

  // HP/스탯 변화 즉시 반영
  if (context && context.hp) {
    if (attacker.hp !== undefined && context.hp[attacker.id] !== undefined) {
      context.hp[attacker.id] = attacker.hp;
    }
    if (defender.hp !== undefined && context.hp[defender.id] !== undefined) {
      context.hp[defender.id] = defender.hp;
    }
  }
  if (context && context.userData) {
    if (attacker.hp !== undefined && context.userData[attacker.id]) {
      context.userData[attacker.id].hp = attacker.hp;
    }
    if (defender.hp !== undefined && context.userData[defender.id]) {
      context.userData[defender.id].hp = defender.hp;
    }
  }

  // 부활: 실제 적용은 processTurnStart에서 실행됨

  let log = '';
  if (usedSkill) {
    log += `\n✨ **${atkName}가 「${skillName}」를 사용합니다!**\n`;
    log += `> _${skillDesc}_\n`;
  }
  if (effectMsg) {
    log += `➡️ **${effectMsg}**\n`;
  }
  log += `${atkName}의 공격: ${Math.round(base)}${crit ? ' 💥크리티컬!' : ''}`;

  return { damage: Math.round(base), critical: crit, log, extraAttack, extraTurn };
}

module.exports = {
  initBattleContext,
  processTurnStart,
  calculateDamage,
  canUseSkill
};
