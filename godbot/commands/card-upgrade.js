
const fs = require("fs");
const path = require("path");
const { grades } = require("../config/cardData");

module.exports = {
  data: {
    name: "카드강화",
    description: "중복된 카드를 강화합니다."
  },
  async execute(interaction) {
    const userId = interaction.user.id;
    const userFile = path.join(__dirname, "..", "data", `${userId}.json`);
    if (!fs.existsSync(userFile)) {
      return interaction.reply("❌ 강화할 카드가 없습니다. `/카드뽑기`로 카드를 먼저 모아보세요!");
    }

    const userData = JSON.parse(fs.readFileSync(userFile, "utf8"));
    const cards = userData.cards || [];

    const grouped = {};
    cards.forEach(card => {
      const key = `${card.name}_${card.grade}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(card);
    });

    let upgraded = false;
    for (const key in grouped) {
      const duplicates = grouped[key];
      if (duplicates.length >= 2) {
        const base = duplicates[0];
        const gradeIndex = grades.findIndex(g => g.grade === base.grade);
        if (gradeIndex <= 0) continue;

        const nextGrade = grades[gradeIndex - 1];
        const chance = nextGrade.upgradeChance;
        const success = Math.random() < chance;

        if (success) {
          cards.push({
            name: base.name,
            grade: nextGrade.grade,
            level: 1
          });
          upgraded = true;
          interaction.channel.send(`🎉 **${base.name}** 카드가 **${nextGrade.grade}** 등급으로 강화 성공!`);
        } else {
          interaction.channel.send(`💥 **${base.name}** 카드 강화 실패...`);
        }

        // 두 장 제거
        const index1 = cards.findIndex(c => c === duplicates[0]);
        const index2 = cards.findIndex(c => c === duplicates[1]);
        if (index1 !== -1) cards.splice(index1, 1);
        if (index2 !== -1) cards.splice(index2 > index1 ? index2 - 1 : index2, 1);
        break;
      }
    }

    if (!upgraded) return interaction.reply("⚠️ 강화 가능한 중복 카드를 찾을 수 없습니다.");
    fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
    interaction.reply("🛠️ 강화 처리가 완료되었습니다!");
  }
};
