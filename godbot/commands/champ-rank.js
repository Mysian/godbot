const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const userPath = path.join(__dirname, "../data/champion-users.json");
const historyPath = path.join(__dirname, "../data/champion-enhance-history.json");

function loadData() {
  if (!fs.existsSync(userPath)) fs.writeFileSync(userPath, "{}");
  return JSON.parse(fs.readFileSync(userPath, "utf8"));
}
function loadHistory() {
  if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, "{}");
  return JSON.parse(fs.readFileSync(historyPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화순위")
    .setDescription("강화 현황과 역대 최대 강화 랭킹을 확인합니다."),

  async execute(interaction) {
    await interaction.deferReply();

    const data = loadData();
    const history = loadHistory();
    const TIMEOUT_SECONDS = 60;

    // 현재 강화 현황 집계
    const currentList = [];
    for (const [id, info] of Object.entries(data)) {
      if ((info.level ?? 0) > 0) {
        currentList.push({
          userId: id,
          userName: info.name || "알 수 없음",
          champion: info.name || "챔피언 미상",
          level: info.level ?? 0
        });
      }
    }
    currentList.sort((a, b) => b.level - a.level);

    let top = currentList.length > 0 ? currentList[0] : null;
    const lines = currentList.slice(0, 20).map((entry, idx) =>
      `**${idx + 1}위** - <@${entry.userId}>: ${entry.userName} (${entry.level}강)`
    );

    const page1 = new EmbedBuilder()
      .setTitle("🏆 챔피언 강화 순위 Top 20")
      .setDescription(
        (top ? `🥇 **현재 최고 강화**\n<@${top.userId}>: ${top.userName} (${top.level}강)\n\n` : '') +
        `**현재 강화 순위**\n` +
        (lines.length > 0 ? lines.join("\n") : "기록 없음")
      )
      .setColor(0xf39c12)
      .setFooter({ text: `1/2 페이지 | ▶️ 역대 최대 강화 랭킹 | ${TIMEOUT_SECONDS}초 후 버튼 비활성화` })
      .setTimestamp();

    // 2페이지: 역대 최대 강화 랭킹(성공률)
    const maxList = Object.entries(history)
      .filter(([userId, info]) => typeof info.max === "number" && (info.success + info.fail) > 0)
      .map(([userId, info]) => ({
        userId,
        max: info.max,
        success: info.success,
        fail: info.fail,
        total: info.success + info.fail,
        rate: info.total > 0 ? Math.round((info.success / (info.success + info.fail)) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.max - a.max)
      .slice(0, 20);

    const maxLines = maxList.map((entry, idx) => {
      return `**${idx + 1}위** - <@${entry.userId}>: ${entry.max}강 (성공률: ${entry.rate}%)`;
    });

    const page2 = new EmbedBuilder()
      .setTitle("🏅 역대 최대 강화 랭킹 Top 20")
      .setDescription(
        maxLines.length > 0 ? maxLines.join("\n") : "기록 없음"
      )
      .setColor(0x47a7f5)
      .setFooter({ text: `2/2 페이지 | ◀️ 현재 강화 순위 | ${TIMEOUT_SECONDS}초 후 버튼 비활성화` })
      .setTimestamp();

    const nextBtn = new ButtonBuilder()
      .setCustomId("champ-rank-next")
      .setLabel("▶️ 역대 최대 강화 랭킹")
      .setStyle(ButtonStyle.Primary);
    const prevBtn = new ButtonBuilder()
      .setCustomId("champ-rank-prev")
      .setLabel("◀️ 현재 강화 순위")
      .setStyle(ButtonStyle.Secondary);

    // 메시지 별도 생성(유저별)
    const reply = await interaction.editReply({
      embeds: [page1],
      components: [
        new ActionRowBuilder().addComponents(nextBtn)
      ]
    });

    // interaction id로 콜렉터 분리
    const collector = reply.createMessageComponentCollector({
      filter: i => ["champ-rank-next", "champ-rank-prev"].includes(i.customId) && i.user.id === interaction.user.id,
      time: TIMEOUT_SECONDS * 1000
    });

    let curPage = 1;

    collector.on("collect", async i => {
      if (i.customId === "champ-rank-next" && curPage === 1) {
        curPage = 2;
        await i.update({
          embeds: [page2],
          components: [
            new ActionRowBuilder().addComponents(prevBtn)
          ]
        });
      } else if (i.customId === "champ-rank-prev" && curPage === 2) {
        curPage = 1;
        await i.update({
          embeds: [page1],
          components: [
            new ActionRowBuilder().addComponents(nextBtn)
          ]
        });
      }
    });

    collector.on("end", () => {
      reply.edit({
        components: []
      }).catch(() => {});
    });
  }
};
