const skills = require('./skills');

function applySkillEffect(attacker, defender, skillKey) {
  const skill = skills[skillKey];
  const log = [];

  switch (skill.type) {
    case "attack-debuff":
      const dmg1 = Math.floor(attacker.attack * 1.2);
      defender.hp -= dmg1;
      defender.defense = Math.floor(defender.defense * 0.9);
      log.push(`💥 ${skill.name} 발동! ${dmg1} 피해 + 방어력 10% 감소!`);
      break;

    case "heavy-attack":
      const dmg2 = Math.floor(attacker.attack * 1.5);
      defender.hp -= dmg2;
      log.push(`⚔️ ${skill.name} 발동! ${dmg2} 강력한 피해!`);
      break;

    case "defense-buff":
      attacker.tempDefense = true;
      log.push(`🛡️ ${skill.name} 발동! 다음 턴 피해 50% 감소!`);
      break;

    case "aoe-magic":
      const dmg3 = Math.floor(attacker.magic * 0.8);
      defender.hp -= dmg3; // 단일 상대 기준
      log.push(`🌪️ ${skill.name} 발동! 마법 폭풍으로 ${dmg3} 피해!`);
      break;

    case "self-heal":
      const heal = Math.floor(attacker.magic * 0.8);
      attacker.hp += heal;
      log.push(`💖 ${skill.name} 발동! 체력 ${heal} 회복!`);
      break;

    case "attack-silence":
      const dmg4 = Math.floor(attacker.attack);
      defender.hp -= dmg4;
      defender.silenced = 1; // 1턴 스킬 사용 불가
      log.push(`🤫 ${skill.name}! ${dmg4} 피해 + 1턴 스킬 봉인!`);
      break;

    case "lucky-attack":
      const isCrit = Math.random() < 0.3;
      const dmg5 = Math.floor(attacker.attack * (isCrit ? 2 : 1));
      defender.hp -= dmg5;
      log.push(`🍀 ${skill.name}! ${dmg5} ${isCrit ? '크리티컬!!' : '피해'}!`);
      break;

    default:
      log.push(`❓ 알 수 없는 스킬 타입: ${skill.type}`);
  }

  return { attacker, defender, log };
}

module.exports = applySkillEffect;
