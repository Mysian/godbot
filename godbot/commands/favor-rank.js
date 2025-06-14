const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const favorPath = path.join(__dirname, "../data/favor.json");
const EXCLUDE_ROLE_ID = "1208987442234007582";

function loadFavor() {
  if (!fs.existsSync(favorPath)) fs.writeFileSync(favorPath, "{}");
  return JSON.parse(fs.readFileSync(favorPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("호감도순위")
    .setDescription("서버 내 호감도가 높은 순서로 TOP 10을 확인합니다."),
  async execute(interaction) {
    await interaction.deferReply();

    const favor = loadFavor();
    const entries = Object.entries(favor)
      .filter(([_, score]) => score > 0); // 0점 제거

    if (entries.length === 0) {
      return interaction.editReply({ content: "아직 호감도 정보가 없습니다!" });
    }

    entries.sort((a, b) => b[1] - a[1]); // 내림차순

    const filtered = [];

    for (const [userId, score] of entries) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        if (!member.roles.cache.has(EXCLUDE_ROLE_ID)) {
          filtered.push([member, score]);
        }
      } catch {
        continue;
      }

      if (filtered.length >= 10) break;
    }

    if (filtered.length === 0) {
      return interaction.editReply({ content: "표시할 유저가 없습니다. (제외 대상만 존재)" });
    }

    const rankLines = filtered.map(([member, score], i) => {
      const rank = i + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}등.`;
      return `**${medal} ${member.displayName}**  :  \`${score}\`점`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 서버 호감도 TOP 10")
      .setDescription(rankLines.join("\n"))
      .setColor(0xffd700)
      .setFooter({ text: "➕ /호감도지급 /호감도차감 명령어로 유저마다 호감도 부여 가능" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
