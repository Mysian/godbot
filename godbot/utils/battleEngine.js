// battleEngine.js (통파일)
const passiveSkills = require('./passive-skills');
const { cloneDeep } = require('lodash'); // 객체 깊은복사(상태 꼬임 방지)
const { save } = require('./file-db');

// 전투 컨텍스트 초기화
function initBattleContext(battle) {
  battle.context = battle.context || {};
  battle.context.effects = battle.context.effects || {};
  battle.context.hp = battle.context.hp || {};
  // 유저별로 효과/체력 상태 클린업
  for (const id of [battle.challenger, battle.opponent]) {
    battle.context.effects[id] = battle.context.effects[id] || [];
    battle.context.hp[id] = battle.hp[id];
  }
}

// 턴 시작 처리 (패시브 턴 계수 등 관리)
function processTurnStart(userData, battle, userId) {
  // 각종 패시브 턴 카운트(필요 시)
  for (const id of [battle.challenger, battle.opponent]) {
    const champName = userData[id]?.name;
    if (passiveSkills[champName] && typeof passiveSkills[champName].passive === 'function') {
      // 턴 시작시 패시브에 turnStart 입력
      const dummyContext = { ...battle.context, lastAction: 'turnStart' };
      passiveSkills[champName].passive(userData[id], userData[id === battle.challenger ? battle.opponent : battle.challenger], dummyContext);
    }
  }
}

// 효과/버프/디버프 정리 (turn마다 감소/삭제)
function updateEffects(context) {
  for (const uid of Object.keys(context.effects)) {
    context.effects[uid] = (context.effects[uid] || []).map(e => {
      if (e.turns > 0) e.turns -= 1;
      return e;
    }).filter(e => e.turns !== 0); // 0되면 삭제
  }
}

// 패시브 일괄 적용 헬퍼
function applyPassives(action, user, enemy, context) {
  let passiveLog = [];
  const champName = user.name;
  if (passiveSkills[champName] && typeof passiveSkills[champName].passive === 'function') {
    context.lastAction = action;
    context.damage = context.damage ?? 0;
    const msg = passiveSkills[champName].passive(user, enemy, context);
    if (msg) passiveLog.push(msg);
  }
  return passiveLog;
}

// 실제 데미지/효과 계산
function calculateDamage(attacker, defender, isAttack = true, context = {}, attackerChamp, isSkill = false) {
  // 상태 깊은 복사 (원본 불변)
  let user = cloneDeep(attacker);
  let enemy = cloneDeep(defender);
  context.effects = context.effects || { [user.id]: [], [enemy.id]: [] };

  // turn 기반 임시값/기본
  let logMsg = [];
  let baseDamage = isAttack ? (user.stats.attack || 10) : 0;

  // === 행동 처리 전 패시브 및 상태 적용 ===
  // dot, stun, 기타 부여 등 처리 (턴 시작)
  // (단순화/생략)

  // === 행동 처리 ===
  let ctx = {
    ...context,
    lastAction: isAttack ? 'attack' : 'defend',
    damage: baseDamage,
    effects: cloneDeep(context.effects)
  };

  // (1) 공격자 패시브(피해 증가, 추가효과 등)
  logMsg.push(...applyPassives(isAttack ? 'attack' : 'defend', user, enemy, ctx));
  // (2) 피격자 패시브(방어, 반사 등)
  logMsg.push(...applyPassives(isAttack ? 'defend' : 'attack', enemy, user, ctx));

  // (3) 버프/디버프 효과 적용 (방어력/방감/증뎀 등)
  // defense 관련 처리(예시: 효과 목록에 따라 계산)
  let totalDefDown = 0, totalDefUp = 0, totalDmgUp = 0, totalDmgDown = 0;
  (ctx.effects[user.id] || []).forEach(e => {
    if (e.type === 'damageUpPercent') totalDmgUp += e.value || 0;
    if (e.type === 'atkUpPercent') user.stats.attack = Math.floor(user.stats.attack * (1 + (e.value || 0) / 100));
    if (e.type === 'critChanceBuff') user.critChance = (user.critChance || 0) + (e.value || 0) / 100;
  });
  (ctx.effects[enemy.id] || []).forEach(e => {
    if (e.type === 'defDownPercent') totalDefDown += e.value || 0;
    if (e.type === 'defUpPercent') totalDefUp += e.value || 0;
    if (e.type === 'damageReductionPercent') totalDmgDown += e.value || 0;
    if (e.type === 'atkDownPercent') enemy.stats.attack = Math.floor(enemy.stats.attack * (1 - (e.value || 0) / 100));
  });

  // 방어력 적용
  let defense = (enemy.stats.defense || 0);
  defense = Math.max(0, defense * (1 - totalDefDown / 100) + (defense * totalDefUp / 100));

  // 피해량 보정
  let finalDmg = ctx.damage;
  finalDmg = finalDmg * (1 + totalDmgUp / 100);
  finalDmg = finalDmg * (1 - totalDmgDown / 100);

  // 방어력 적용 (관통/방무, ignoreDef 등은 따로 context에 넣어 사용)
  if (!ctx.ignoreDef) {
    finalDmg = Math.max(0, finalDmg - defense);
  }

  // 치명타(critChance/critDamage는 외부에서 패시브에 의해 셋팅됨)
  if (user.critChance && Math.random() < user.critChance) {
    finalDmg = Math.floor(finalDmg * (user.critDamage || 2.0));
    logMsg.push('💥 치명타 발동!');
  }

  // dot, 고정 피해 등 처리(턴 시작시 등에서 별도 계산)
  // (간단화, 여기선 main action만)

  // HP 반영
  let attackerHp = user.hp;
  let defenderHp = enemy.hp;
  if (isAttack) {
    defenderHp = Math.max(0, defenderHp - finalDmg);
  } else {
    attackerHp = Math.max(0, attackerHp - finalDmg);
  }

  // 상태/이펙트 turn 감소
  updateEffects(ctx);

  // 최종 로그/결과
  return {
    attackerHp, defenderHp,
    log: logMsg.filter(Boolean).join('\n'),
    damage: finalDmg,
    context: ctx
  };
}

module.exports = {
  initBattleContext,
  processTurnStart,
  calculateDamage,
  updateEffects,
};
