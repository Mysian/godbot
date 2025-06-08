const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TIER_EMOJIS = {
  브론즈: "🥉",
  실버: "🥈",
  골드: "🥇",
  플래티넘: "💠",
  다이아몬드: "💎",
  마스터: "🔥",
  그랜드마스터: "👑",
  챌린저: "🚀",
};

const TIER_SCORES = {
  브론즈: 1,
  실버: 2,
  골드: 3,
  플래티넘: 4,
  다이아몬드: 5,
  마스터: 6,
  그랜드마스터: 7,
  챌린저: 8,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("옵치티어순위")
    .setDescription("전체 유저 중 평균 오버워치 티어 순위를 보여줍니다."),

  async execute(interaction) {
    const filePath = path.join(__dirname, "../data/ow-tier.json");
    if (!fs.existsSync(filePath)) {
      return interaction.reply("아직 등록된 오버워치 티어 정보가 없습니다.");
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
        const user = await interaction.guild.members
          .fetch(entry.id)
          .catch(() => null);
        if (!user) return null;

        const tierNames = Object.entries(entry.info)
          .map(([pos, tier]) => `${pos}: ${TIER_EMOJIS[tier] || ""}${tier}`)
          .join(", ");

        return `**${index + 1}. <@${entry.id}>** - ${tierNames}`;
      })
    );

    const output = lines.filter(Boolean).join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🥇 오버워치 티어 순위표")
      .setDescription(output)
      .setColor(0xf1c40f)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
