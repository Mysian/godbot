// battleEngine.js

const championData = require('./champion-data');
const passiveSkills = require('./passive-skills');
const fileDb = require('./file-db');

// 패시브 실행 (마지막 로그 1줄만)
function runAllPassives(userData, context, actingId, targetId) {
  [actingId, targetId].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (!user || !enemy) return;
    const champName = user.name;
    const passive = passiveSkills[champName]?.passive;
    if (typeof passive === 'function') {
      let log;
      try {
        log = passive(user, enemy, context);
      } catch (e) {
        log = `❗패시브 실행 오류: ${e}`;
      }
      if (log) {
        context.passiveLogs = context.passiveLogs || {};
        context.passiveLogs[uid] = [log]; // 마지막 한 줄만!
      }
    }
  });
}

// 효과 적용(턴 시작/종료시)
function applyEffects(user, context, phase) {
  const effects = context.effects?.[user.id] || [];
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    if (phase === 'turnStart' || phase === 'turnEnd') {
      if (typeof effect.turns === "number") {
        effect.turns--;
        if (effect.turns <= 0) {
          effects.splice(i, 1);
        }
      }
    }
  }
}

// 평타 데미지 계산: 공격력/주문력 더 높은 값 100% + 낮은 값 50%, 관통력에 따라 최대 200%, 패시브 호환
function calculateAttackDamage(attacker, defender, context = {}) {
  // 1. 기본 데미지(공/주 중 더 높은 쪽 100% + 낮은 쪽 50%)
  const atk = attacker.stats.attack || 0;
  const ap = attacker.stats.ap || 0;
  let mainDmg = Math.max(atk, ap);
  let subDmg = Math.min(atk, ap);
  let baseDmg = mainDmg + Math.floor(subDmg * 0.5);

  // 2. 관통력 기반 추가 데미지 (방어력보다 관통력이 높을수록, 최대 200%까지)
  const penetration = attacker.stats.penetration || 0;
  const defense = defender.stats.defense || 0;

  // 관통력 비율 계산 (방어력이 0이면 200%)
  let penRate = defense > 0 ? Math.max(0, Math.min(1, (penetration - defense) / defense)) : 1;
  // 0 이하면 100%, 1(즉 2배)이면 200%
  let penMultiplier = 1 + penRate; // 100%~200%
  baseDmg = Math.floor(baseDmg * penMultiplier);

  // 3. 패시브/버프/디버프/감소 효과 반영
  if (context.damageBuff) baseDmg = Math.floor(baseDmg * context.damageBuff);
  if (context.damageUpPercent) baseDmg = Math.floor(baseDmg * (1 + context.damageUpPercent / 100));
  if (context.damageReductionPercent) baseDmg = Math.floor(baseDmg * (1 - context.damageReductionPercent / 100));
  if (context.skillDamageIncrease) baseDmg = Math.floor(baseDmg * (1 + context.skillDamageIncrease));
  if (context.damageIncreasePercent) baseDmg = Math.floor(baseDmg * (1 + context.damageIncreasePercent / 100));
  if (context.damageTakenUpPercent) baseDmg = Math.floor(baseDmg * (1 + context.damageTakenUpPercent / 100));

  // 치명타 (공격자 기준)
  let critHappened = false;
  if (attacker.critChance && Math.random() < attacker.critChance) {
    baseDmg = Math.floor(baseDmg * (attacker.critDamage || 1.5));
    critHappened = true;
    context.critHappened = true;
  }

  baseDmg = Math.max(1, baseDmg);
  let log = `${attacker.name}의 평타! ${defender.name}에게 ${baseDmg} 피해`;
  if (critHappened) log += " (치명타!)";

  return { damage: baseDmg, log };
}

// 기존 스킬/아이템 등 기타 데미지
function calculateDamage(attacker, defender, context, ignoreDef = false) {
  let baseAtk = attacker.stats.attack;
  if (context.damage) baseAtk = context.damage;
  let def = ignoreDef ? 0 : (defender.stats.defense || 0);

  // 관통 처리
  if (context.defPenetrate !== undefined) {
    def = def * (1 - context.defPenetrate);
  } else if (context.ignoreDefensePercent) {
    def = def * (1 - context.ignoreDefensePercent);
  }

  let damage = Math.max(1, Math.floor(baseAtk - def));
  if (context.damageBuff) damage = Math.floor(damage * context.damageBuff);
  if (context.damageUpPercent) damage = Math.floor(damage * (1 + context.damageUpPercent / 100));
  if (context.damageReductionPercent) damage = Math.floor(damage * (1 - context.damageReductionPercent / 100));
  if (context.skillDamageIncrease) damage = Math.floor(damage * (1 + context.skillDamageIncrease));
  if (context.damageIncreasePercent) damage = Math.floor(damage * (1 + context.damageIncreasePercent / 100));
  if (context.damageTakenUpPercent) damage = Math.floor(damage * (1 + context.damageTakenUpPercent / 100));

  if (attacker.critChance && Math.random() < attacker.critChance) {
    damage = Math.floor(damage * (attacker.critDamage || 1.5));
    context.critHappened = true;
  }

  damage = Math.max(1, damage);
  return { damage, log: `${attacker.name}의 공격! ${defender.name}에게 ${damage} 피해` };
}

// 턴 처리 (HP 동기화, 총 턴 증가)
function processTurn(userData, battle, actingId, targetId, action) {
  const context = battle.context;
  context.lastAction = action;
  context.turnUser = actingId;

  // === 총 턴 증가 ===
  battle.turn = (battle.turn || 0) + 1;
  context.globalTurn = battle.turn;

  // 효과 버프 배열 생성
  context.effects[actingId] = context.effects[actingId] || [];
  context.effects[targetId] = context.effects[targetId] || [];

  // HP 동기화: userData <-> battle.hp
  Object.keys(userData).forEach(uid => {
    if (userData[uid] && typeof battle.hp?.[uid] === "number") {
      userData[uid].hp = battle.hp[uid];
    }
  });

  // 턴 별 로그 기록용
  [actingId, targetId].forEach(uid => {
    const user = userData[uid];
    if (user) {
      user._lastMaxHp = user.stats.hp;
      user._lastDamageTaken = user._lastDamageTaken || 0;
    }
  });

  runAllPassives(userData, context, actingId, targetId);

  // 개별 챔피언 특수 처리 (생략, 기존 그대로)

  let log = '';
  if (action === 'attack') {
    let result = calculateAttackDamage(userData[actingId], userData[targetId], context);
    userData[targetId].hp = Math.max(0, Math.floor(userData[targetId].hp - result.damage));
    battle.hp[actingId] = userData[actingId].hp;
    battle.hp[targetId] = userData[targetId].hp;
    if (isNaN(battle.hp[actingId]) || battle.hp[actingId] === undefined) battle.hp[actingId] = userData[actingId].stats.hp;
    if (isNaN(battle.hp[targetId]) || battle.hp[targetId] === undefined) battle.hp[targetId] = userData[targetId].stats.hp;
    log = result.log;
    runAllPassives(userData, context, actingId, targetId);
  } else if (action === 'defend') {
    context.effects[actingId] = context.effects[actingId] || [];
    context.effects[actingId].push({ type: "damageReductionPercent", value: 50, turns: 1 });
    log = `${userData[actingId].name} 방어!`;
    runAllPassives(userData, context, actingId, targetId);
  } else if (action === 'dodge') {
    log = `${userData[actingId].name} 점멸!`;
    runAllPassives(userData, context, actingId, targetId);
  } else if (action === 'item') {
    log = `${userData[actingId].name} 아이템 사용!`;
    runAllPassives(userData, context, actingId, targetId);
  }

  applyEffects(userData[actingId], context, 'turnEnd');
  applyEffects(userData[targetId], context, 'turnEnd');

  // HP 최소 0, NaN 방지, battle.hp <-> userData 동기화
  [actingId, targetId].forEach(uid => {
    userData[uid].hp = isNaN(userData[uid].hp) ? userData[uid].stats.hp : Math.max(0, userData[uid].hp);
    battle.hp[uid]   = userData[uid].hp;
  });

  return log;
}

function initBattleContext(cur) {
  cur.context = cur.context || {};
  cur.context.effects = cur.context.effects || {};
  cur.context.passiveLogs = cur.context.passiveLogs || {};
  cur.context.actionLogs = cur.context.actionLogs || [];
  cur.context.passiveLogLines = cur.context.passiveLogLines || [];
  cur.context.skillLogLines = cur.context.skillLogLines || [];
  cur.context.personalTurns = cur.context.personalTurns || {};
}

module.exports = {
  runAllPassives,
  processTurn,
  calculateDamage,
  applyEffects,
  initBattleContext
};
