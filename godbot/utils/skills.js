
const skillData = {
  mouse: [{ name: "치명 찌르기", effect: "공격력 증가" }],
  cow: [{ name: "튼튼한 방어", effect: "방어력 증가" }],
  tiger: [{ name: "맹수의 일격", effect: "강력한 타격" }],
  rabbit: [{ name: "빠른 회피", effect: "회피율 증가" }],
  dragon: [{ name: "파이어볼", effect: "마법 데미지" }],
  snake: [{ name: "중독 물기", effect: "턴마다 데미지" }],
  horse: [{ name: "기습", effect: "선공권" }],
  sheep: [{ name: "마법 보호막", effect: "마법 방어" }],
  monkey: [{ name: "혼란의 외침", effect: "상대 혼란" }],
  chicken: [{ name: "속전속결", effect: "빠른 데미지" }],
  dog: [{ name: "충직의 힘", effect: "체력 회복" }],
  pig: [{ name: "강철 피부", effect: "물리 데미지 감소" }]
};

function getSkillById(id) {
  return skillData[id] || [{ name: "기본 공격", effect: "기본" }];
}
module.exports = getSkillById;
