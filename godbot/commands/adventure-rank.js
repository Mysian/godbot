const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const adventureBestPath = path.join(__dirname, "../data/adventure-best.json");
const adventurePath = path.join(__dirname, "../data/adventure.json");

function loadAdventureBest() {
  if (!fs.existsSync(adventureBestPath)) fs.writeFileSync(adventureBestPath, "{}");
  return JSON.parse(fs.readFileSync(adventureBestPath, "utf8"));
}
function loadAdventure() {
  if (!fs.existsSync(adventurePath)) fs.writeFileSync(adventurePath, "{}");
  return JSON.parse(fs.readFileSync(adventurePath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모험순위")
    .setDescription("모험 컨텐츠에서 각 유저별 최고 기록을 보여줍니다."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const best = loadAdventureBest();
    const adv = loadAdventure();

    // 모든 유저ID 집계 (최고기록+진행중 모두)
    const userSet = new Set([
      ...Object.keys(best),
      ...Object.keys(adv)
    ]);
    const allUsers = Array.from(userSet);

    // 집계
    const ranking = allUsers.map(user => ({
      user,
      stage: best[user]?.bestStage || 0,
      clear: best[user]?.totalClear || 0,
      nowStage: adv[user]?.stage || 0
    }))
    // 최고 기록 > 현재 스테이지 내림차순
    .sort((a, b) =>
      b.stage !== a.stage ? b.stage - a.stage : b.nowStage - a.nowStage
    );

    // TOP 20
    const medals = ["🥇", "🥈", "🥉"];
    let desc = ranking.slice(0, 20).map((x, i) => {
      const medal = medals[i] || `#${i + 1}`;
      return `${medal} <@${x.user}> — 최고 ${x.stage}스테이지 [현재 ${x.nowStage}단계] (클리어 ${x.clear}회)`;
    }).join("\n");

    if (!desc) desc = "아직 모험에 참가한 유저가 없습니다.";

    // 본인 순위, 내 최고/현재 단계, 상위 몇퍼
    let myRank = ranking.findIndex(x => x.user === userId) + 1;
    let myBest = ranking.find(x => x.user === userId)?.stage || 0;
    let myCur = ranking.find(x => x.user === userId)?.nowStage || 0;
    let myPercent = ranking.length
      ? Math.ceil((1 - (myRank - 1) / ranking.length) * 100)
      : 0;

    let myLine = myRank
      ? `#${myRank}위  |  최고 ${myBest}스테이지 [현재 ${myCur}단계]  |  상위 ${myPercent}%`
      : "아직 랭킹에 등록된 기록이 없습니다!";

    const embed = new EmbedBuilder()
      .setTitle("🏆 모험 최고 기록 TOP 20")
      .setDescription(desc)
      .setFooter({ text: `당신의 순위: ${myLine}` })
      .setColor(0xffb300);

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
