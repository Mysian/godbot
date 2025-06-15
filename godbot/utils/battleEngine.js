// utils/battleEngine.js
const passiveSkills = require('./passive-skills.js');

// 상태효과 체크 등 보조 함수 기존 구조 유지 (중요)
function applyEffectsOnTurnStart(battle, champion, championId, effects, logArr) {
    // 매턴 시작 시 지속효과/버프/디버프 적용 등
    if (!effects[championId]) return;
    for (const effect of effects[championId]) {
        if (effect.type === "dot") {
            const dotDmg = effect.damage || 0;
            champion.hp = Math.max(1, champion.hp - dotDmg);
            logArr.push(`💥 [${champion.name}] 지속피해: ${dotDmg}`);
        }
        // 기타 효과(스턴, 방어력, 데미지감소 등등) 그대로
    }
}

function processPassiveSkills({ user, enemy, context, logArr }) {
    // passiveSkills.js에서 챔피언별 패시브 함수 실행
    const champPassive = passiveSkills[user.name];
    if (champPassive && champPassive.passive) {
        const result = champPassive.passive(user, enemy, context);
        if (typeof result === "string" && result.trim().length > 0) {
            logArr.push(`🟢 [${user.name}] 패시브: ${result}`);
        }
    }
}

// 실제 전투 턴 진행
function processTurn(battle, action, logArr) {
    // 각종 상태 및 턴 정보
    const { player, enemy, effects } = battle;
    let attacker = action === 'attack' ? player : enemy;
    let defender = action === 'attack' ? enemy : player;
    let attackerId = action === 'attack' ? 'player' : 'enemy';
    let defenderId = action === 'attack' ? 'enemy' : 'player';

    // 턴 시작 시 패시브/효과 적용
    applyEffectsOnTurnStart(battle, attacker, attackerId, effects, logArr);
    applyEffectsOnTurnStart(battle, defender, defenderId, effects, logArr);

    // 공격/방어/아이템/점멸/등등 구분해서 패시브 발동 처리
    let context = {
        lastAction: action,
        damage: attacker.stats.attack,
        effects: effects,
        logArr: logArr
    };

    // 1. 공격자 패시브 발동
    processPassiveSkills({ user: attacker, enemy: defender, context, logArr });
    // 2. 수비자 패시브 발동 (ex: 방어, 맞을 때 적용되는 패시브)
    processPassiveSkills({ user: defender, enemy: attacker, context: { ...context, lastAction: 'defend' }, logArr });

    // 데미지 적용 (방어/디버프/버프 다 처리 후)
    let trueDamage = Math.max(0, context.damage);
    defender.hp = Math.max(0, defender.hp - trueDamage);
    logArr.push(`🔴 [${attacker.name}]의 공격! [${defender.name}]에게 ${trueDamage}의 피해!`);

    // 각종 효과(기절, 무적, 도트 등)는 effect 시스템으로 관리 (별도 함수로 쌓기)
    // effect 만료 등은 아래에서 후처리
    cleanUpExpiredEffects(effects, attackerId, defenderId);

    // 턴 종료 시 턴카운트/상태 등 증가
    if (!battle.turnCount) battle.turnCount = 1;
    else battle.turnCount += 1;
}

// 효과 만료시 제거 (n턴 지난 버프/디버프 제거)
function cleanUpExpiredEffects(effects, ...ids) {
    for (const id of ids) {
        if (!effects[id]) continue;
        effects[id] = effects[id].filter(eff => {
            if (!eff.turns) return true;
            eff.turns -= 1;
            return eff.turns > 0;
        });
    }
}

// 내보내기
module.exports = {
    processTurn,
    applyEffectsOnTurnStart,
    cleanUpExpiredEffects,
};
