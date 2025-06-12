// commands/favor-rank.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const favorPath = path.join(__dirname, "../data/favor.json");

function loadFavor() {
  if (!fs.existsSync(favorPath)) fs.writeFileSync(favorPath, "{}");
  return JSON.parse(fs.readFileSync(favorPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("호감도순위")
    .setDescription("서버 내 호감도가 높은 순서로 TOP 20을 확인합니다."),
  async execute(interaction) {
    await interaction.deferReply();

    const favor = loadFavor();
    const entries = Object.entries(favor);

    if (entries.length === 0) {
      return interaction.editReply({ content: "아직 호감도 정보가 없습니다!" });
    }

    // 호감도 내림차순 정렬
    entries.sort((a, b) => b[1] - a[1]);

    // 상위 20위
    const top20 = entries.slice(0, 20);
    // 1위/꼴찌(최하위)
    const topUser = entries[0];
    const lastUser = entries[entries.length - 1];

    // 유저 태그/닉네임 불러오기 (비동기!)
    async function getName(userId) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        return member.displayName || member.user.username || "Unknown";
      } catch {
        return "Unknown";
      }
    }

    // top20 표기
    const rankLines = await Promise.all(
      top20.map(async ([userId, favor], idx) => {
        const name = await getName(userId);
        return `**${idx + 1}등. ${name}**  :  \`${favor}\`점`;
      })
    );

    // top/bottom 유저명
    const topName = await getName(topUser[0]);
    const lastName = await getName(lastUser[0]);

    const embed = new EmbedBuilder()
      .setTitle("🏆 서버 호감도 TOP 20")
      .setDescription(rankLines.join("\n"))
      .setColor(0xffd700)
      .addFields(
        {
          name: "👑 가장 호감도가 높은 유저",
          value: `**${topName}**  (\`${topUser[1]}\`점)`,
          inline: true
        },
        {
          name: "🐢 가장 호감도가 낮은 유저",
          value: `**${lastName}**  (\`${lastUser[1]}\`점)`,
          inline: true
        }
      )
      .setFooter({ text: "까리한 디스코드" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
