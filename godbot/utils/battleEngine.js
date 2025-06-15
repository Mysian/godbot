// battleEngine.js

const championData = require('./champion-data');
const passiveSkills = require('./passive-skills');
const fileDb = require('./file-db');

// 패시브 실행
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
        // 마지막 로그 한 줄만 남기기 (battle-ui에서 가져감)
        if (context.passiveLogs[uid].length > 1) {
          context.passiveLogs[uid] = [context.passiveLogs[uid][context.passiveLogs[uid].length - 1]];
        }
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

// 데미지 계산
function calculateDamage(attacker, defender, context, ignoreDef = false) {
  let baseAtk = attacker.stats.attack;
  if (context.damage) baseAtk = context.damage;
  let def = ignoreDef ? 0 : (defender.stats.defense || 0);

  // 관통 처리(카밀, 카이사 등)
  if (context.defPenetrate !== undefined) {
    def = def * (1 - context.defPenetrate);
  } else if (context.ignoreDefensePercent) {
    def = def * (1 - context.ignoreDefensePercent);
  }

  let damage = Math.max(1, Math.floor(baseAtk - def));

  // 피해 관련 버프/디버프
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
  // 치명타 (이즈리얼, 야스오 등)
  if (attacker.critChance && Math.random() < attacker.critChance) {
    damage = Math.floor(damage * (attacker.critDamage || 1.5));
    context.critHappened = true;
  }

  damage = Math.max(1, damage);
  return { damage, log: `${attacker.name}의 공격! ${defender.name}에게 ${damage} 피해` };
}

// 턴 처리
function processTurn(userData, battle, actingId, targetId, action) {
  const context = battle.context;
  context.lastAction = action;
  context.turnUser = actingId;

  // 개인 턴 카운트 올리기 (battle-ui에서도 1씩 추가)
  context.personalTurns = context.personalTurns || {};
  context.personalTurns[actingId] = (context.personalTurns[actingId] || 0) + 1;

  // 효과 버프 배열 생성
  context.effects[actingId] = context.effects[actingId] || [];
  context.effects[targetId] = context.effects[targetId] || [];

  // 이전 턴 기록(제라스 등)
  [actingId, targetId].forEach(uid => {
    const user = userData[uid];
    if (user) {
      user._lastMaxHp = user.stats.hp;
      user._lastDamageTaken = user._lastDamageTaken || 0;
    }
  });

  runAllPassives(userData, context, actingId, targetId);

  // "세트" 50% 실패시 다음턴 상대 5% 회복
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
      // 마지막 로그만 유지
      if (context.passiveLogs[uid].length > 1) {
        context.passiveLogs[uid] = [context.passiveLogs[uid][context.passiveLogs[uid].length - 1]];
      }
    }
  });

  // "아무무" 받은 피해 기억 (turnEnd)
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "아무무" && context.lastAction === "turnEnd") {
      user._amumuLastDamage = context.lastDamageReceived || 0;
    }
  });

  // "애니비아" 부활 후 피해 70% 증가(방어)
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "애니비아" && user._aniviaAfterRevive && action === "defend" && context.damage > 0) {
      context.damage = Math.floor(context.damage * 1.7);
    }
  });

  // "일라오이" 공격시 피해량 보정
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "일라오이" && user._illaoiDmgBonus && context.lastAction === "attack") {
      context.damage = Math.floor(context.damage * (1 + user._illaoiDmgBonus));
    }
  });

  // 카서스: 언데드 유지 턴 감소
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "카서스" && user._karthusUndyingTurns) {
      if (context.lastAction === "turnEnd" && user._karthusUndyingTurns > 0) {
        user._karthusUndyingTurns -= 1;
        if (user._karthusUndyingTurns === 0 && user.hp > 0) {
          user.hp = 0; // 언데드 해제 시 사망
        }
      }
    }
  });

  // 케인: 행동불능 누적 (실제 skipNextTurn 적용 후 enemy._lastDisabled 처리)
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    const enemy = userData[uid === actingId ? targetId : actingId];
    if (user && user.name === "케인") {
      enemy._lastDisabled = context.effects[enemy.id]?.some(e => e.type === "skipNextTurn");
    }
  });

  // 탈리야: 스킬 피해 40% 증가 (방어 시 스킬 데미지)
  ["user1", "user2"].forEach(uid => {
    const user = userData[uid];
    if (user && user.name === "탈리야" && context.lastAction === "defend" && context.isSkill) {
      context.damage = Math.floor(context.damage * 1.4);
    }
  });

  let log = '';
  if (action === 'attack') {
    let result = calculateDamage(userData[actingId], userData[targetId], context);
    userData[targetId].hp = Math.max(0, Math.floor(userData[targetId].hp - result.damage));
    // 동기화
    userData[targetId].hp = isNaN(userData[targetId].hp) ? 1 : userData[targetId].hp;

    // 제라스: 이번 턴 상대가 받은 피해 저장
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

  // HP 최소 0, NaN 방지
  userData[actingId].hp = isNaN(userData[actingId].hp) ? 1 : Math.max(0, userData[actingId].hp);
  userData[targetId].hp = isNaN(userData[targetId].hp) ? 1 : Math.max(0, userData[targetId].hp);

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
