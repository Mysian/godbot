
function applySkillEffect(attacker, defender, skill) {
  let result = "";
  switch (skill.name) {
    case "파이어볼":
      const dmg = Math.floor(attacker.stats.magic * 1.5);
      defender.hp -= dmg;
      result = `🔥 **파이어볼**! ${defender.name}에게 **${dmg}**의 마법 피해!`;
      break;
    default:
      result = "스킬이 정의되지 않았습니다.";
  }
  return result;
}
module.exports = applySkillEffect;
