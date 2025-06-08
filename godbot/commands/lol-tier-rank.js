const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TIER_EMOJIS = {
  아이언: "🥉",
  브론즈: "🥉",
  실버: "🥈",
  골드: "🥇",
  플래티넘: "💠",
  에메랄드: "💚",
  다이아몬드: "💎",
  마스터: "🔥",
  그랜드마스터: "👑",
  챌린저: "🚀",
};

const TIER_SCORES = {
  아이언: 1,
  브론즈: 2,
  실버: 3,
  골드: 4,
  플래티넘: 5,
  에메랄드: 6,
  다이아몬드: 7,
  마스터: 8,
  그랜드마스터: 9,
  챌린저: 10,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("롤티어순위")
    .setDescription("전체 유저 중 평균 티어가 높은 순서대로 정렬합니다."),

  async execute(interaction) {
    const filePath = path.join(__dirname, "../data/lol-tier.json");
    if (!fs.existsSync(filePath)) {
      return interaction.reply("아직 등록된 티어 정보가 없습니다.");
    }

    const raw = fs.readFileSync(filePath, "utf8");
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      return interaction.reply("티어 데이터를 불러오는 중 오류가 발생했어요.");
    }

    const rankings = Object.entries(data)
      .map(([id, info]) => {
        const scores = Object.values(info).map(
          (tier) => TIER_SCORES[tier] || 1
        );
        const avg =
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;
        return { id, avg, info };
      })
      .sort((a, b) => b.avg - a.avg);

    if (rankings.length === 0) {
      return interaction.reply("등록된 유저가 없습니다.");
    }

    const lines = await Promise.all(
      rankings.map(async (entry, index) => {
        const user = await interaction.guild.members.fetch(entry.id).catch(() => null);
        if (!user) return null;

        const tierNames = Object.entries(entry.info)
          .map(([pos, tier]) => `${pos}: ${TIER_EMOJIS[tier] || ""}${tier}`)
          .join(", ");

        return `**${index + 1}. <@${entry.id}>** - ${tierNames}`;
      })
    );

    const output = lines.filter(Boolean).join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🏆 롤 티어 순위표")
      .setDescription(output)
      .setColor(0x3498db)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
