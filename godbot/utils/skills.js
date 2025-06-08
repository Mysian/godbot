
const skillData = {
  mouse: [{ name: "도트 댄스", effect: "회피율 증가" }],
  cow: [{ name: "강철 뿔", effect: "방어력 증가" }],
  tiger: [{ name: "맹수의 포효", effect: "공격력 증가" }],
  rabbit: [{ name: "달빛 회복", effect: "HP 회복" }],
  // ... 추가 예정
};

function getSkillById(id) {
  return skillData[id] || [{ name: "기본 공격", effect: "기본 공격" }];
}
module.exports = getSkillById;
