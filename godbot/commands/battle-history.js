
const { getUserData } = require("../utils/battleDataManager");

module.exports = {
  data: {
    name: "배틀기록",
    description: "전투 기록과 카드 레벨을 확인합니다."
  },
  async execute(interaction) {
    const userId = interaction.user.id;
    const userData = getUserData(userId);
    const cards = userData.cards || [];
    const battles = userData.battles || { win: 0, lose: 0 };

    let msg = `📜 **${interaction.user.username}님의 전투 기록**
`;
    msg += `🏆 승리: **${battles.win}**회 | ❌ 패배: **${battles.lose}**회

`;
    msg += `📛 **카드 레벨 정보**:
`;

    cards.forEach((card, i) => {
      msg += `
${i + 1}. ${card.name} [등급: ${card.grade}] - Lv.${card.level || 1} / Exp: ${card.exp || 0}`;
    });

    interaction.reply(msg || "⚠️ 기록된 카드가 없습니다.");
  }
};
