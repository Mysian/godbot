// commands/lunch.js
const { SlashCommandBuilder } = require("discord.js");

const lunchList = [
  "김치찌개",
  "된장찌개",
  "비빔밥",
  "불고기",
  "제육볶음",
  "순두부찌개",
  "돈까스",
  "냉면",
  "칼국수",
  "쫄면",
  "떡볶이",
  "라면",
  "짜장면",
  "짬뽕",
  "우동",
  "김밥",
  "참치마요덮밥",
  "비빔국수",
  "삼겹살",
  "치킨마요",
  "햄버거",
  "샌드위치",
  "파스타",
  "피자",
  "햄볶밥",
  "육개장",
  "곰탕",
  "설렁탕",
  "순대국",
  "콩나물국밥",
  "감자탕",
  "부대찌개",
  "마라탕",
  "쌀국수",
  "돈부리",
  "초밥",
  "회덮밥",
  "연어덮밥",
  "덮밥류",
  "스테이크덮밥",
  "치즈돈까스",
  "치킨텐더",
  "고로케",
  "오므라이스",
  "카레라이스",
  "불닭볶음면",
  "비빔냉면",
  "메밀국수",
  "육회비빔밥",
  "차돌된장찌개",
  "모밀소바",
  "잔치국수",
  "우삼겹덮밥",
  "닭갈비",
  "닭볶음탕",
  "닭칼국수",
  "닭개장",
  "찜닭",
  "불백",
  "버섯덮밥",
  "양념치킨",
  "간장치킨",
  "반반치킨",
  "치즈라면",
  "콩국수",
  "냉콩국수",
  "초계국수",
  "비빔만두",
  "군만두",
  "냉만두",
  "샤브샤브",
  "라멘",
  "스시롤",
  "유부초밥",
  "치즈떡볶이",
  "떡갈비",
  "육전",
  "제육덮밥",
  "소불고기덮밥",
  "순살치킨",
  "연어샐러드",
  "불향제육",
  "마요네즈볶음밥",
  "김치볶음밥",
  "참치김밥",
  "소고기무국",
  "계란찜",
  "계란말이",
  "오징어볶음",
  "쭈꾸미볶음",
  "매운탕",
  "해물파전",
  "낙지덮밥",
  "해물찜",
  "굴국밥",
  "우렁된장",
  "햄김치볶음밥",
  "연근조림",
  "두부조림",
  "멸치볶음",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("점메추")
    .setDescription("점심 메뉴를 추천해드립니다."),

  async execute(interaction) {
    const food = lunchList[Math.floor(Math.random() * lunchList.length)];
    await interaction.reply(`🍱 오늘 점심은 **${food}** 어때요?`);
  },
};
