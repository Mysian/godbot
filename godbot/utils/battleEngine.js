// utils/battleEngine.js
const skills = require('./skills');
const skillCd = require('./skills-cooldown');

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
    userData: battle.userData || {},
  };
  [battle.challenger, battle.opponent].forEach(id => {
    battle.context.effects[id] = [];
    battle.context.cooldowns[id] = 0;
    battle.context.skillTurn[id] = 0;
    battle.context.skillUsed[id] = null;
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
    battle.context.doubleDamage[id] = false;
    battle.context.invulnerable[id] = false;
    battle.context.dodgeNextAttack[id] = false;
  });
}

// processTurnStart에서 context.effects를 실제 스탯 및 임시상태에 반영
function processTurnStart(userData, battle, actingUserId) {
  [battle.challenger, battle.opponent].forEach(id => {
    // 내 턴 + 쿨감
    if (id === actingUserId) {
      battle.context.skillTurn[id]++;
      if (battle.context.cooldowns[id] > 0) battle.context.cooldowns[id]--;
    }
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
    battle.context.doubleDamage[id] = false;
    battle.context.invulnerable[id] = false;
    battle.context.dodgeNextAttack[id] = false;
    // 임시상태 초기화
    battle.context.missNext = battle.context.missNext || {};
    battle.context.skillBlocked = battle.context.skillBlocked || {};
    battle.context.blockSkill = battle.context.blockSkill || {};
    battle.context.magicResistDebuff = battle.context.magicResistDebuff || {};

    let atkModifier = 0, defModifier = 0;
    const next = [];
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
          battle.logs.push(`🛡️ ${userData[id].name}의 피해가 ${e.value}만큼 감소!`);
          break;
        case 'damageReductionPercent':
          battle.context.percentReduction[id] += e.value;
          battle.logs.push(`🛡️ ${userData[id].name}의 피해가 ${e.value}% 감소!`);
          break;
        case 'doubleDamage':
          battle.context.doubleDamage[id] = true;
          battle.logs.push(`🔥 ${userData[id].name}의 다음 공격 피해가 2배!`);
          break;
        case 'invulnerable':
          battle.context.invulnerable[id] = true;
          battle.logs.push(`🛡️ ${userData[id].name}은(는) 무적 상태!`);
          break;
        case 'dodgeNextAttack':
          battle.context.dodgeNextAttack[id] = true;
          battle.logs.push(`💨 ${userData[id].name}은(는) 다음 공격을 회피!`);
          break;
        case 'atkDown':
          atkModifier = -e.value;
          battle.logs.push(`🔻 ${userData[id].name}의 공격력이 0이 됩니다!`);
          break;
        case 'defDown':
          defModifier = -e.value;
          battle.logs.push(`🔻 ${userData[id].name}의 방어력이 절반으로 감소!`);
          break;
        case 'missNext':
          battle.context.missNext[id] = (battle.context.missNext[id] || 0) + (e.turns || 1);
          battle.logs.push(`💫 ${userData[id].name}의 다음 공격이 무효화됩니다!`);
          break;
        case 'skillBlocked':
          battle.context.skillBlocked[id] = (battle.context.skillBlocked[id] || 0) + (e.turns || 1);
          battle.logs.push(`⛔️ ${userData[id].name}의 스킬이 봉인됩니다!`);
          break;
        case 'blockSkill':
          battle.context.blockSkill[id] = (battle.context.blockSkill[id] || 0) + (e.turns || 1);
          battle.logs.push(`🛡️ ${userData[id].name}의 다음 스킬 피해가 무효화됩니다!`);
          break;
        case 'magicResistDebuff':
          battle.context.magicResistDebuff[id] = (battle.context.magicResistDebuff[id] || 0) + (e.value || 0);
          battle.logs.push(`💫 ${userData[id].name}의 마법 방어력이 ${e.value}만큼 감소!`);
          break;
      }
      if (e.turns > 1) next.push({ ...e, turns: e.turns - 1 });
    }
    battle.context.effects[id] = next;

    // 실제로 userData 스탯에 반영
    if (atkModifier !== 0 && userData[id].stats) {
      userData[id].stats.attack = Math.max(0, userData[id].stats.attack + atkModifier);
    }
    if (defModifier !== 0 && userData[id].stats) {
      userData[id].stats.defense = Math.max(0, userData[id].stats.defense + defModifier);
    }
  });

  // 임시상태(턴감소) 관리
  ['missNext', 'skillBlocked', 'blockSkill'].forEach(type => {
    const ctx = battle.context[type];
    if (ctx) {
      Object.keys(ctx).forEach(uid => {
        if (ctx[uid] > 0) ctx[uid]--;
        if (ctx[uid] <= 0) delete ctx[uid];
      });
    }
  });
}

function canUseSkill(userId, championName, context) {
  const cdInfo = skillCd[championName];
  if (!cdInfo) return { ok: false, reason: '쿨타임 정보 없음' };
  const minTurn = cdInfo.minTurn || 1;
  const cooldown = cdInfo.cooldown || 1;
  const nowTurn = context.skillTurn[userId] || 0;
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

// 공격/스킬 데미지 계산 및 스킬 효과 적용
function calculateDamage(
  attacker,
  defender,
  isAttack = true,
  context = {},
  championName = null,
  asSkill = false
) {
  // 1. 기절 체크
  if (context.effects?.[attacker.id]?.some(e => e.type === 'stunned') || attacker.stunned) {
    return {
      damage: 0,
      critical: false,
      log: `${attacker.name}은(는) 기절 상태라 공격 불가!`
    };
  }
  // 2. 무효화(다음 공격 무효)
  if (context.missNext && context.missNext[attacker.id] > 0) {
    context.missNext[attacker.id]--;
    return {
      damage: 0,
      critical: false,
      log: `${attacker.name}의 공격은 무효화됩니다!`
    };
  }
  // 3. 회피
  if (context.dodgeNextAttack?.[defender.id]) {
    context.dodgeNextAttack[defender.id] = false;
    return {
      damage: 0,
      critical: false,
      log: `${defender.name}이(가) 완벽히 회피!`
    };
  }
  // 4. 무적
  if (context.invulnerable?.[defender.id]) {
    context.invulnerable[defender.id] = false;
    return {
      damage: 0,
      critical: false,
      log: `${defender.name}이(가) 무적! 피해 0`
    };
  }
  // 5. 스킬 피해 무효
  if (
    asSkill &&
    context.blockSkill &&
    context.blockSkill[defender.id] > 0
  ) {
    context.blockSkill[defender.id]--;
    return {
      damage: 0,
      critical: false,
      log: `${defender.name}은(는) 스킬 피해를 무효화했습니다!`
    };
  }

  // 6. 스탯 추출 및 상태 반영
  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  const atkName = attacker.name ?? '공격자';
  const defName = defender.name ?? '방어자';
  let ad = isAttack ? (atkStats.attack || 0) : 0;
  let ap = isAttack ? (atkStats.ap || 0) : 0;
  let pen = atkStats.penetration || 0;

  // 마법방어력 감소
  if (context.magicResistDebuff && context.magicResistDebuff[defender.id]) {
    if (defStats.magicResist !== undefined) {
      defStats.magicResist += context.magicResistDebuff[defender.id]; // debuff 값은 음수
    }
  }

  let defVal = Math.max(0, (defStats.defense || 0) - pen);
  let base = Math.max(0, ad + ap * 0.5 - defVal);

  // 회피/치명
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

  // addEffect로 받은 효과 context.effects에 추가
  if (addEffectArr.length && context.effects) {
    for (const eff of addEffectArr) {
      if (eff.target === 'attacker') {
        context.effects[attacker.id].push(eff.effect);
      } else {
        context.effects[defender.id].push(eff.effect);
      }
    }
  }

  // effect 내 hp 변화가 실제로 반영되도록!
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

  let log = '';
  if (usedSkill) {
    log += `\n✨ **${atkName}가 「${skillName}」를 사용합니다!**\n`;
    log += `> _${skillDesc}_\n`;
  }
  if (effectMsg) {
    log += `➡️ **${effectMsg}**\n`;
  }
  log += `${atkName}의 공격: ${Math.round(base)}${crit ? ' 💥크리티컬!' : ''}`;

  // extraAttack/extraTurn 정보도 반환
  return { damage: Math.round(base), critical: crit, log, extraAttack, extraTurn };
}

module.exports = {
  initBattleContext,
  processTurnStart,
  calculateDamage,
  canUseSkill
};
