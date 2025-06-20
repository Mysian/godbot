const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/genji-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("겐지키우기순위")
    .setDescription("겐지키우기 게임에서 각 유저별 최고 기록을 보여줍니다."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const data = loadData();

    // 모든 유저 집계 (기록이 있는 유저)
    const allUsers = Object.keys(data);

    // 집계: 스테이지 > 클리어 > 보상순
    const ranking = allUsers.map(user => ({
      user,
      stage: data[user]?.stage || 1,
      clear: data[user]?.clear || 0,
      reward: data[user]?.reward || 0
    }))
    .sort((a, b) =>
      b.stage !== a.stage ? b.stage - a.stage :
      b.clear !== a.clear ? b.clear - a.clear :
      b.reward - a.reward
    );

    // TOP 20
    const medals = ["🥇", "🥈", "🥉"];
    let desc = ranking.slice(0, 20).map((x, i) => {
      const medal = medals[i] || `#${i + 1}`;
      return `${medal} <@${x.user}> — 최고 ${x.stage}스테이지 (클리어 ${x.clear}회, 누적 보상 ${x.reward})`;
    }).join("\n");

    if (!desc) desc = "아직 겐지키우기 게임에 참가한 유저가 없습니다.";

    // 본인 순위, 내 최고 단계, 상위 %
    let myRank = ranking.findIndex(x => x.user === userId) + 1;
    let myBest = ranking.find(x => x.user === userId)?.stage || 1;
    let myClear = ranking.find(x => x.user === userId)?.clear || 0;
    let myPercent = ranking.length
      ? Math.ceil(myRank / ranking.length * 100)
      : 0;

    let myLine = myRank
      ? `#${myRank}위  |  최고 ${myBest}스테이지 (클리어 ${myClear}회)  |  상위 ${myPercent}%`
      : "아직 랭킹에 등록된 기록이 없습니다!";

    const embed = new EmbedBuilder()
      .setTitle("🏆 겐지키우기 랭크 TOP 20")
      .setDescription(desc)
      .setFooter({ text: `당신의 순위: ${myLine}` })
      .setColor(0x15c6e5);

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
