// utils/battle-engine.js

const passives = require('./passive-skills');
const activeSkills = require('./active-skills');
const items = require('./items');

function applyEffects(user, enemy, context) {
    // 각종 버프/디버프 자동 적용(도트, 기절, deathMark 등)
    context.effects[user.id] = context.effects[user.id] || [];
    context.effects[enemy.id] = context.effects[enemy.id] || [];

    // 예시: 도트 데미지, 기절, deathMark 등
    let logs = [];
    context.effects[user.id] = context.effects[user.id].filter(effect => {
        if (effect.type === 'dot' && effect.turns > 0) {
            user.hp -= effect.damage;
            logs.push(`☠️ ${effect.damage} 도트 피해!`);
            effect.turns -= 1;
        }
        if (effect.type === 'deathMark' && effect.turns > 0) {
            effect.turns -= 1;
            if (effect.turns === 0) {
                user.hp = 0;
                logs.push('⚖️ 사형 선고: 30턴 뒤 사망!');
            }
        }
        if (effect.type === 'stunned' && effect.turns > 0) {
            user.stunned = true;
            effect.turns -= 1;
            logs.push('⚡ 기절!');
        }
        if (effect.type === 'undying' && effect.turns > 0) {
            user.undying = true;
            effect.turns -= 1;
        }
        if (effect.type === 'debuffImmune' && effect.turns > 0) {
            user.debuffImmune = true;
            effect.turns -= 1;
        }
        if (effect.type === 'removeAllDebuffs') {
            // 모든 디버프 제거
            context.effects[user.id] = context.effects[user.id].filter(e => !['stunned', 'dot', 'deathMark'].includes(e.type));
            logs.push('🧹 모든 디버프 해제!');
            return false;
        }
        return effect.turns > 0 || effect.type === 'removeAllDebuffs';
    });
    // 기절, 언데드 등 상태 해제
    if (!context.effects[user.id].some(e => e.type === 'stunned' && e.turns > 0)) user.stunned = false;
    if (!context.effects[user.id].some(e => e.type === 'undying' && e.turns > 0)) user.undying = false;
    if (!context.effects[user.id].some(e => e.type === 'debuffImmune' && e.turns > 0)) user.debuffImmune = false;

    return logs;
}

function calcDamage(user, enemy, context) {
    // 평타: 공격력/주문력 중 더 높은 값 100% + 더 낮은 값 50%
    let atk = user.stats.attack;
    let ap = user.stats.ap;
    let base = Math.max(atk, ap) + Math.floor(Math.min(atk, ap) * 0.5);

    // 관통력 vs 방어력 보정
    let pen = user.stats.penetration || 0;
    let def = enemy.stats.defense || 0;

    let penEffect = 1.0;
    if (pen >= def) {
        // 관통력이 높으면 최대 2배까지
        penEffect = 1.2 + Math.min((pen - def) * 0.008, 0.8); // 대략 200%까지
    } else {
        penEffect = 1 + Math.max((pen - def) * 0.006, -0.3); // 방어력이 높으면 최소 70%까지
    }

    let dmg = Math.floor(base * penEffect);

    context.damage = dmg;
    context.defPenetrate = penEffect;
    return dmg;
}

function resolvePassive(user, enemy, context) {
    // 챔피언 패시브 처리
    let logs = [];
    let champName = user.name;
    if (passives[champName] && typeof passives[champName].passive === 'function') {
        let log = passives[champName].passive(user, enemy, context);
        if (log) logs.push(log);
    }
    return logs;
}

function resolveActiveSkill(user, enemy, skillName, context) {
    // 보유한 액티브 스킬 실행
    if (!skillName) return [];
    if (!user.skills || !user.skills.includes(skillName)) return [];
    if (!activeSkills[skillName]) return [];
    let log = activeSkills[skillName](user, enemy, context);
    if (log) return [log];
    return [];
}

function resolveItem(user, itemName, context) {
    if (!itemName) return [];
    if (!user.items || !user.items[itemName] || user.items[itemName] <= 0) return [];
    if (!items[itemName]) return [];
    let log = items[itemName](user, context);
    if (log) {
        user.items[itemName] -= 1;
        return [log];
    }
    return [];
}

module.exports = {
    applyEffects,
    calcDamage,
    resolvePassive,
    resolveActiveSkill,
    resolveItem
};
