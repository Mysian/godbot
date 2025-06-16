// battle-system/skill.js
const activeSkills = require('../utils/active-skills'); // 반드시 active-skills.js에 등록!

module.exports = function useSkill(user, enemy, skillName, context) {
  if (!skillName) return [];
  if (!user.skills || !user.skills.includes(skillName)) return [`${skillName} 스킬이 없습니다.`];
  if (!activeSkills[skillName]) return [`${skillName} 효과를 찾을 수 없습니다.`];
  const log = activeSkills[skillName](user, enemy, context);
  if (log) return [log];
  return [];
};
