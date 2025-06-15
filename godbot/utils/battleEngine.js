// battleEngine.js

const championData = require('./champion-data');
const passiveSkills = require('./passive-skills');
const fileDb = require('./file-db');

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
        context.passiveLogs[uid] = context.passiveLogs[uid] || [];
        context.passiveLogs[uid].push(log);
      }
    }
  });
}

function applyEffects(user, context, phase) {
  const effects = context.effects?.[user.id] || [];
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

function calculateDamage(attacker, defender, context, ignoreDef = false) {
  let baseAtk = attacker.stats.attack;
  if (context.damage) baseAtk = context.damage;
  let def = ignoreDef ? 0 : (defender.stats.defense || 0);

  if (context.defPenetrate !== undefined) {
    def = def * (1 - context.defPenetrate);
  } else if (context.ignoreDefensePercent) {
    def = def * (1 - context.ignoreDefensePercent);
  }
  if (context.ignoreDef) def = 0;

  let damage = Math.max(1, baseAtk - def);

  // 버프/디버프/상태 적용
  if (context.damageBuff) damage = Math.floor(damage * context.damageBuff);
  if (context.damageUpPercent) damage = Math.floor(damage * (1 + context.damageUpPercent / 100));
  if (context.damageReductionPercent) damage = Math.floor(damage * (1 - context.damageReductionPercent / 100));
  if (context.skillDamageIncrease) damage = Math.floor(damage * (1 + context.skillDamageIncrease));
  if (context.damageIncreasePercent) damage = Math.floor(damage * (1 + context.damageIncreasePercent / 100));
  if (context.damageTakenUpPercent) damage = Math.floor(damage * (1 + context.damageTakenUpPercent / 100));
  if (context.magicResistDebuffPercent) damage = Math.floor(damage * (1 + context.magicResistDebuffPercent / 100));
  if (context.dmgDealtDownPercent) damage = Math.floor(damage * (1 - context.dmgDealtDownPercent / 100));

  // 치명타(야스오/이즈리얼 등)
  let critChance = attacker.critChance || 0;
  let critDamage = attacker.critDamage || 1.5;
  if (Math.random() < critChance) {
    damage = Math.floor(damage * critDamage);
    context.crit = true;
  }

  return { damage, log: `${attacker.name}의 공격! ${defender.name}에게 ${damage} 피해` };
}

function processTurn(userData, battle, actingId, targetId, action) {
  const context = battle.context;
  context.lastAction = action;
  context.turnUser = actingId;

  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (!user) return;
    user._lastMaxHp = user.stats.hp;
    user._lastDamageTaken = user._lastDamageTaken || 0;
  });

  runAllPassives(userData, context, actingId, targetId);

  // === 특수 패시브 상황 엔진 전용 처리 ===

  // 세트
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (user && user.name === "세트" && user._setHealEnemyNextTurn && context.lastAction === "turnStart") {
      const heal = Math.floor(enemy.stats.hp * 0.05);
      enemy.hp = Math.min(enemy.hp + heal, enemy.stats.hp);
      user._setHealEnemyNextTurn = false;
      context.passiveLogs = context.passiveLogs || {};
      context.passiveLogs[uid] = context.passiveLogs[uid] || [];
      context.passiveLogs[uid].push(`🥊 50% 실패! 다음 턴 상대 체력 5% 회복!`);
    }
  });

  // 아무무
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "아무무" && context.lastAction === "turnEnd") {
      user._amumuLastDamage = context.lastDamageReceived || 0;
    }
  });

  // 애니비아
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "애니비아" && user._aniviaAfterRevive && action === "defend" && context.damage > 0) {
      context.damage = Math.floor(context.damage * 1.7);
    }
  });

  // 일라오이
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "일라오이" && user._illaoiDmgBonus && context.lastAction === "attack") {
      context.damage = Math.floor(context.damage * (1 + user._illaoiDmgBonus));
    }
  });

  // 카서스/트린다미어
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user) {
      if (user.name === "카서스" && user._karthusUndyingTurns) {
        if (context.lastAction === "turnEnd" && user._karthusUndyingTurns > 0) {
          user._karthusUndyingTurns -= 1;
          if (user._karthusUndyingTurns === 0 && user.hp > 0) user.hp = 0;
        }
      }
      if (user.name === "트린다미어" && user._tryndUndyingTurns) {
        if (context.lastAction === "turnEnd" && user._tryndUndyingTurns > 0) {
          user._tryndUndyingTurns -= 1;
          if (user._tryndUndyingTurns === 0 && user.hp > 0) user.hp = 0;
        }
      }
    }
  });

  // 케인
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (user && user.name === "케인") {
      enemy._lastDisabled = context.effects[enemy.id]?.some(e => e.type === "skipNextTurn");
    }
  });

  // 탈리야
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "탈리야" && context.lastAction === "defend" && context.isSkill) {
      context.damage = Math.floor(context.damage * 1.4);
    }
  });

  // 샤코(10턴간 회피율 20% 증가)
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "샤코" && !user._shacoDodgeTurnsInit) {
      user._shacoDodgeTurnsInit = true;
      user._shacoDodgeTurns = 10;
    }
    if (user && user.name === "샤코" && user._shacoDodgeTurns > 0 && context.lastAction === "turnStart") {
      context.effects[user.id] = context.effects[user.id] || [];
      context.effects[user.id].push({ type: "dodgeChanceUp", value: 20, turns: 1 });
      user._shacoDodgeTurns -= 1;
    }
  });

  // 피들스틱(공포의 수확: turnStart에 체크)
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (user && user.name === "피들스틱" && context.lastAction === "turnStart") {
      if (user._fiddleNoAction && Math.random() < 0.5) {
        context.effects[enemy.id] = context.effects[enemy.id] || [];
        context.effects[enemy.id].push({ type: "skipNextTurn", turns: 1 });
        context.effects[enemy.id].push({ type: "damageTakenUpPercent", value: 15, turns: 1 });
        context.passiveLogs = context.passiveLogs || {};
        context.passiveLogs[uid] = context.passiveLogs[uid] || [];
        context.passiveLogs[uid].push("👻 상대 1턴 행동불능 + 받는 피해 15% 증가!");
      }
      user._fiddleNoAction = true;
    }
    if (user && user.name === "피들스틱" && (context.lastAction === "attack" || context.lastAction === "skill")) {
      user._fiddleNoAction = false;
    }
  });

  // 나르: 변신 이후 보정
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "나르" && user._gnarTransformed) {
      if (context.lastAction === "attack") {
        context.damage = Math.floor(context.damage * 1.3);
      } else if (context.lastAction === "defend" && context.damage > 0) {
        context.damage = Math.floor(context.damage * 1.1);
      }
    }
  });

  let log = '';
  if (action === 'attack') {
    let result = calculateDamage(userData[actingId], userData[targetId], context);
    userData[targetId].hp = Math.max(0, userData[targetId].hp - result.damage);

    userData[targetId]._lastDamageTaken = result.damage;
    userData[targetId]._lastMaxHp = userData[targetId].stats.hp;

    log = result.log;
    runAllPassives(userData, context, actingId, targetId); // 후처리
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
