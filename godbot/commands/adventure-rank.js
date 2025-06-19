const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const adventureBestPath = path.join(__dirname, "../data/adventure-best.json");

function loadAdventureBest() {
  if (!fs.existsSync(adventureBestPath)) fs.writeFileSync(adventureBestPath, "{}");
  return JSON.parse(fs.readFileSync(adventureBestPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모험순위")
    .setDescription("모험 컨텐츠에서 각 유저별 최고 기록을 보여줍니다."),
  async execute(interaction) {
    const best = loadAdventureBest();
    const sorted = Object.entries(best)
      .map(([user, dat]) => ({ user, stage: dat.bestStage || 0, clear: dat.totalClear || 0 }))
      .sort((a, b) => b.stage - a.stage);
    let desc = sorted.slice(0, 20).map((x, i) =>
      `#${i + 1} <@${x.user}> — ${x.stage}스테이지 (클리어 ${x.clear}회)`
    ).join("\n");
    if (!desc) desc = "아직 모험에 참가한 유저가 없습니다.";
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🏆 모험 최고 기록 랭킹").setDescription(desc)],
      ephemeral: false
    });
  }
};
