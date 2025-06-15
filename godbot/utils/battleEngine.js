// battleEngine.js

const championData = require('./champion-data');
const passiveSkills = require('./passive-skills');
const fileDb = require('./file-db');

// HP 보정 유틸
function safeHP(val, fallback = 1) {
  return (typeof val === "number" && !isNaN(val) && val > 0) ? val : fallback;
}

function runAllPassives(userData, context, actingId, targetId) {
  [actingId, targetId].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (!user || !enemy) return;

    // 체력 보정 (모든 연산 직전)
    user.stats = user.stats || {};
    enemy.stats = enemy.stats || {};
    user.stats.hp = safeHP(user.stats.hp, 1);
    user.hp = safeHP(user.hp, user.stats.hp);
    enemy.stats.hp = safeHP(enemy.stats.hp, 1);
    enemy.hp = safeHP(enemy.hp, enemy.stats.hp);

    // 효과 배열 미리 초기화 (패시브에서 push 오류 방지)
    context.effects = context.effects || {};
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[enemy.id] = context.effects[enemy.id] || [];

    const champName = user.name;
    const passive = passiveSkills[champName]?.passive;
    if (typeof passive === 'function') {
      let log;
      try {
        log = passive(user, enemy, context);
      } catch (e) {
        log = `❗패시브 실행 오류: ${e}`;
      }
      // 패시브 로그: 마지막 발동 메시지 한 줄만!
      if (log) {
        context.passiveLogs = context.passiveLogs || {};
        context.passiveLogs[uid] = [log];
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
  attacker.stats = attacker.stats || {};
  defender.stats = defender.stats || {};
  attacker.stats.hp = safeHP(attacker.stats.hp, 1);
  defender.stats.hp = safeHP(defender.stats.hp, 1);

  let baseAtk = attacker.stats.attack;
  if (context.damage) baseAtk = context.damage;
  let def = ignoreDef ? 0 : (defender.stats.defense || 0);

  if (context.defPenetrate !== undefined) {
    def = def * (1 - context.defPenetrate);
  } else if (context.ignoreDefensePercent) {
    def = def * (1 - context.ignoreDefensePercent);
  }

  let damage = Math.max(1, baseAtk - def);

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

function processTurn(userData, battle, actingId, targetId, action) {
  const context = battle.context;
  context.lastAction = action;
  context.turnUser = actingId;

  // 턴 진입 시 체력/스탯 안전보정
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user) {
      user.stats = user.stats || {};
      user.stats.hp = safeHP(user.stats.hp, 1);
      user.hp = safeHP(user.hp, user.stats.hp);
      user._lastMaxHp = user.stats.hp;
      user._lastDamageTaken = user._lastDamageTaken || 0;
    }
  });

  runAllPassives(userData, context, actingId, targetId);

  // 세트 패시브: 50% 실패시 다음 턴 상대 체력 5% 회복
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (user && user.name === "세트" && user._setHealEnemyNextTurn && context.lastAction === "turnStart") {
      const heal = Math.floor(safeHP(enemy.stats.hp) * 0.05);
      enemy.hp = Math.min(safeHP(enemy.hp), safeHP(enemy.stats.hp)) + heal;
      user._setHealEnemyNextTurn = false;
      context.passiveLogs = context.passiveLogs || {};
      context.passiveLogs[uid] = [`🥊 50% 실패! 다음 턴 상대 체력 5% 회복!`];
    }
  });

  // 아무무: 받은 피해 기억
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "아무무" && context.lastAction === "turnEnd") {
      user._amumuLastDamage = context.lastDamageReceived || 0;
    }
  });

  // 애니비아: 부활 후 피해 70% 증가
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "애니비아" && user._aniviaAfterRevive && action === "defend" && context.damage > 0) {
      context.damage = Math.floor(context.damage * 1.7);
    }
  });

  // 일라오이: 공격할 때 항상 피해량 증가
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "일라오이" && user._illaoiDmgBonus && context.lastAction === "attack") {
      context.damage = Math.floor(context.damage * (1 + user._illaoiDmgBonus));
    }
  });

  // 카서스: 언데드 턴 감소
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "카서스" && user._karthusUndyingTurns) {
      if (context.lastAction === "turnEnd" && user._karthusUndyingTurns > 0) {
        user._karthusUndyingTurns -= 1;
        if (user._karthusUndyingTurns === 0 && user.hp > 0) {
          user.hp = 0;
        }
      }
    }
  });

  // 케인: 행동불능 누적
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (user && user.name === "케인") {
      enemy._lastDisabled = context.effects[enemy.id]?.some(e => e.type === "skipNextTurn");
    }
  });

  // 탈리야: 스킬 피해 40% 증가 리스크
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "탈리야" && context.lastAction === "defend" && context.isSkill) {
      context.damage = Math.floor(context.damage * 1.4);
    }
  });

  let log = '';
  if (action === 'attack') {
    let result = calculateDamage(userData[actingId], userData[targetId], context);
    userData[targetId].hp = Math.max(0, safeHP(userData[targetId].hp, userData[targetId].stats.hp) - result.damage);
    userData[targetId]._lastDamageTaken = result.damage;
    userData[targetId]._lastMaxHp = userData[targetId].stats.hp;
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
