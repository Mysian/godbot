const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const userPath = path.join(__dirname, "../data/champion-users.json");
const historyPath = path.join(__dirname, "../data/champion-enhance-history.json");

function loadData() {
  if (!fs.existsSync(userPath)) fs.writeFileSync(userPath, "{}");
  return JSON.parse(fs.readFileSync(userPath, "utf8"));
}
function loadHistory() {
  if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify({ highest: {} }, null, 2)); // Ensure highest is initialized
  return JSON.parse(fs.readFileSync(historyPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화순위")
    .setDescription("강화 성공 횟수가 많은 순으로 20위 표시"),

  async execute(interaction) {
    const data = loadData();
    const history = loadHistory();

    // champion-users.json 기준: 유저마다 1챔피언 단일 구조, info.level 사용!
    const currentList = [];
    for (const [id, info] of Object.entries(data)) {
      if ((info.level ?? 0) > 0) {
        currentList.push({
          userId: id,
          userName: interaction.client.users.cache.get(id)?.username || info.name || "알 수 없음", // Fetch username from cache
          champion: info.name || "챔피언 미상",
          level: info.level ?? 0
        });
      }
    }

    currentList.sort((a, b) => b.level - a.level);

    // 역대 최고 강화 기록 찾기
    let overallHighest = null;
    if (history.highest) {
      for (const userId in history.highest) {
        const record = history.highest[userId];
        if (!overallHighest || record.level > overallHighest.level) {
          overallHighest = {
            userId: userId,
            userName: interaction.client.users.cache.get(userId)?.username || "알 수 없음",
            champion: record.champion,
            level: record.level
          };
        }
      }
    }

    if (!overallHighest && currentList.length === 0) {
      return interaction.reply({
        content: "아직 강화 기록이 없습니다!",
        ephemeral: true
      });
    }

    const lines = currentList.slice(0, 20).map((entry, idx) =>
      `**${idx + 1}위** - <@${entry.userId}>: ${entry.userName} (${entry.level}강)`
    );

    const embed = new EmbedBuilder()
      .setTitle("🏆 챔피언 강화 순위 Top 20")
      .setColor(0xf39c12)
      .setTimestamp();

    let description = '';

    if (overallHighest) {
      description += `🥇 **역대 최고 강화 기록**\n<@${overallHighest.userId}>: ${overallHighest.userName} - ${overallHighest.champion} (${overallHighest.level}강)\n\n`;
    }

    description += `**현재 강화 순위**\n` +
                   (lines.length > 0 ? lines.join("\n") : "기록 없음");

    embed.setDescription(description);

    await interaction.reply({ embeds: [embed] });
  }
};


