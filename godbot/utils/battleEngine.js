// battleEngine.js

const championData = require('./champion-data');
const passiveSkills = require('./passive-skills');
const fileDb = require('./file-db');

// 패시브 한 줄만 로그로
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
        context.passiveLogs[uid] = [log];
      }
    }
  });
}

// 지속효과/버프/디버프 감소 및 만료 처리
function applyEffects(user, context, phase) {
  if (!context.effects) context.effects = {};
  if (!context.effects[user.id]) context.effects[user.id] = [];
  const effects = context.effects[user.id];
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    if (phase === 'turnStart' || phase === 'turnEnd') {
      effect.turns--;
      if (effect.turns <= 0) {
        effects.splice(i, 1);
      }
    }
  }
}

// 기본 공격 데미지 계산(관통 포함, 기본 평타 기준)
function calculateDamage(attacker, defender, context, ignoreDef = false) {
  let baseAtk = attacker.stats.attack;
  if (context.damage !== undefined) baseAtk = context.damage;
  let def = ignoreDef ? 0 : (defender.stats.defense || 0);

  if (context.defPenetrate !== undefined) {
    def = def * (1 - context.defPenetrate);
  } else if (context.ignoreDefensePercent) {
    def = def * (1 - context.ignoreDefensePercent);
  }

  let damage = Math.max(1, Math.floor(baseAtk - def));

  if (context.damageBuff) {
    damage = Math.floor(damage * context.damageBuff);
  }
  if (context.damageUpPercent) {
    damage = Math.floor(damage * (1 + context.damageUpPercent / 100));
  }
  if (context.damageReductionPercent) {
    damage = Math.floor(damage * (1 - context.damageReductionPercent / 100));
  }
  if (context.skillDamageIncrease) {
    damage = Math.floor(damage * (1 + context.skillDamageIncrease));
  }
  if (context.damageIncreasePercent) {
    damage = Math.floor(damage * (1 + context.damageIncreasePercent / 100));
  }
  if (context.damageTakenUpPercent) {
    damage = Math.floor(damage * (1 + context.damageTakenUpPercent / 100));
  }
  return { damage, log: `${attacker.name}의 공격! ${defender.name}에게 ${damage} 피해` };
}

// 턴 처리(턴+1 없음)
function processTurn(userData, battle, actingId, targetId, action) {
  const context = battle.context;
  context.lastAction = action;
  context.turnUser = actingId;

  // HP NaN 보정 (실전에서 stats.hp가 진짜 체력)
  Object.values(userData).forEach(u => {
    if (typeof u.hp !== 'number' || isNaN(u.hp) || !isFinite(u.hp) || u.hp === undefined) {
      u.hp = u.stats.hp;
    }
  });

  runAllPassives(userData, context, actingId, targetId);

  let log = '';
  if (action === 'attack') {
    let result = calculateDamage(userData[actingId], userData[targetId], context);
    userData[targetId].hp = Math.max(0, userData[targetId].hp - result.damage);

    // 패시브로 인한 추가 데미지/부가효과 재반영
    runAllPassives(userData, context, actingId, targetId);

    log = result.log;
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
