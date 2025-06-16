// battle-system/skill.js
const activeSkills = require('../utils/active-skills'); // 반드시 active-skills.js에 등록!
const { applyPassive } = require('../passive'); // 패시브 효과 적용

module.exports = function useSkill(user, enemy, skillName, context) {
  // skillName 유효성
  if (!skillName) return [];
  if (!user.skills || !user.skills.includes(skillName)) return [`${skillName} 스킬이 없습니다.`];
  if (!activeSkills[skillName]) return [`${skillName} 효과를 찾을 수 없습니다.`];

  // context 구조 보장
  context = context || {};
  context.logs = context.logs || [];
  context.effects = context.effects || {};

  // 패시브 (스킬 사용 시 발동형) - user/적 모두
  // 스킬 사용 트리거 ("onSkill")
  const passiveLogUser = applyPassive(user, enemy, context, "onSkill");
  if (passiveLogUser) context.logs.push(passiveLogUser);
  const passiveLogEnemy = applyPassive(enemy, user, context, "onSkillByEnemy");
  if (passiveLogEnemy) context.logs.push(passiveLogEnemy);

  // 스킬 효과 적용
  const skillLog = activeSkills[skillName](user, enemy, context);
  if (skillLog) context.logs.push(skillLog);

  // 기타 예외/후처리 등 (추가 필요시 여기에!)
  // 예: 스킬 피해 시 context.damage, context.isSkill 등 세팅

  // 로그 배열 반환 (string[])
  return context.logs;
};
