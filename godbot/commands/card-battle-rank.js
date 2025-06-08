
const fs = require("fs");
const path = require("path");

module.exports = {
  data: {
    name: "카드배틀순위",
    description: "가장 많이 승리한 유저를 확인합니다."
  },
  async execute(interaction) {
    const dataDir = path.join(__dirname, "..", "data");
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));

    const rankings = files.map(file => {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, file)));
      return {
        id: file.replace(".json", ""),
        win: data.battles?.win || 0
      };
    }).sort((a, b) => b.win - a.win).slice(0, 10);

    const msg = rankings.map((r, i) => `#${i + 1} <@${r.id}> - **${r.win}**승`).join("\n") || "⚠️ 데이터가 없습니다.";
    interaction.reply(`🏆 **카드배틀 순위**
${msg}`);
  }
};
