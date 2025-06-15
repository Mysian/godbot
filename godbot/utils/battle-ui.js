// battle-ui.js

const { processTurn, applyEffects, initBattleContext } = require('./battleEngine');
const fileDb = require('./file-db');

function createBattle(userData, challengerId, opponentId) {
  // 체력 stats.hp로 항상 동기화
  userData[challengerId].hp = userData[challengerId].stats.hp;
  userData[opponentId].hp = userData[opponentId].stats.hp;
  const battle = {
    user1: challengerId,
    user2: opponentId,
    turn: 1,
    context: {},
  };
  initBattleContext(battle);
  return battle;
}

function doTurn(battle, userData, actingId, targetId, action) {
  // 턴 시작 효과
  applyEffects(userData[actingId], battle.context, 'turnStart');
  applyEffects(userData[targetId], battle.context, 'turnStart');

  // 행동
  const log = processTurn(userData, battle, actingId, targetId, action);

  // 턴 종료 효과
  applyEffects(userData[actingId], battle.context, 'turnEnd');
  applyEffects(userData[targetId], battle.context, 'turnEnd');

  // 총 턴 1씩 증가
  battle.turn = (battle.turn || 0) + 1;

  // HP NaN 방지, stats.hp보다 크지 않게 조정
  [actingId, targetId].forEach(uid => {
    if (typeof userData[uid].hp !== 'number' || isNaN(userData[uid].hp) || !isFinite(userData[uid].hp)) userData[uid].hp = userData[uid].stats.hp;
    if (userData[uid].hp > userData[uid].stats.hp) userData[uid].hp = userData[uid].stats.hp;
    if (userData[uid].hp < 0) userData[uid].hp = 0;
  });

  // 패시브 로그: 한 줄만(최신)
  const passiveLogs = {};
  for (const uid of [actingId, targetId]) {
    if (battle.context.passiveLogs?.[uid]?.length) {
      passiveLogs[uid] = battle.context.passiveLogs[uid].slice(-1)[0];
    }
  }
  battle.context.lastPassiveLogs = passiveLogs;

  // 로그 저장
  if (!battle.context.actionLogs) battle.context.actionLogs = [];
  battle.context.actionLogs.push(log);

  return log;
}

function getBattleStatus(userData, battle) {
  return {
    turn: battle.turn,
    user1: {
      name: userData[battle.user1].name,
      hp: userData[battle.user1].hp,
      maxHp: userData[battle.user1].stats.hp,
    },
    user2: {
      name: userData[battle.user2].name,
      hp: userData[battle.user2].hp,
      maxHp: userData[battle.user2].stats.hp,
    },
    lastPassiveLogs: battle.context.lastPassiveLogs || {}
  };
}

module.exports = {
  createBattle,
  doTurn,
  getBattleStatus
};
