
const { SlashCommandBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("배틀기록")
    .setDescription("전투 기록과 카드 레벨을 확인합니다."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const userPath = path.join(__dirname, "..", "data", `${userId}.json`);

    if (!fs.existsSync(userPath)) {
      return interaction.reply("❌ 유저 데이터가 없습니다. `/카드뽑기`로 카드를 먼저 획득해보세요.");
    }

    const data = JSON.parse(fs.readFileSync(userPath, "utf8"));
    const cards = data.cards || [];
    const battles = data.battles || { win: 0, lose: 0 };

    let msg = `📜 **${interaction.user.username}님의 전투 기록**
`;
    msg += `🏆 승리: **${battles.win || 0}**회 | ❌ 패배: **${battles.lose || 0}**회

`;

    if (cards.length === 0) {
      msg += `⚠️ 보유 중인 카드가 없습니다.`;
    } else {
      msg += `📛 **카드 레벨 정보**:
`;
      cards.forEach((card, i) => {
        msg += `\n${i + 1}. ${card.name} [등급: ${card.grade}] - Lv.${card.level || 1} / Exp: ${card.exp || 0}`;
      });
    }

    interaction.reply(msg);
  }
};
