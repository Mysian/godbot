const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const relationship = require("../utils/relationship");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관계순위")
    .setDescription("서버 내 우정(호감도) 순위 TOP300을 확인합니다."),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // 서버 전체 관계 점수 쿼리
    let scores = [];
    try {
      scores = relationship.getAllScores(); // [{userA, userB, score}]
    } catch (e) {
      return interaction.editReply({ content: "❌ 관계 데이터를 불러오지 못했습니다." });
    }

    if (!scores || scores.length === 0) {
      return interaction.editReply({ content: "❌ 관계 데이터가 없습니다." });
    }

    // 내림차순 정렬 및 300개 제한
    scores = scores
      .filter(r => r.userA !== r.userB)
      .sort((a, b) => b.score - a.score)
      .slice(0, 300);

    // 페이지 분할(20개씩)
    const PAGE_SIZE = 20;
    const MAX_PAGE = Math.ceil(scores.length / PAGE_SIZE);

    const makePageEmbed = async (page) => {
      const start = page * PAGE_SIZE;
      const pageItems = scores.slice(start, start + PAGE_SIZE);
      const descArr = await Promise.all(
        pageItems.map(async ({ userA, userB, score }, idx) => {
          const nameA = await interaction.guild.members.fetch(userA).then(m => m.displayName).catch(() => `알수없음(${userA})`);
          const nameB = await interaction.guild.members.fetch(userB).then(m => m.displayName).catch(() => `알수없음(${userB})`);
          const level = relationship.getRelationshipLevel(score);
          return `**${start + idx + 1}.** 👥 ${nameA} ↔ ${nameB} | 점수: \`${score.toFixed(2)}\` (${level})`;
        })
      );
      return new EmbedBuilder()
        .setTitle("🏅 서버 우정(호감도) 순위 TOP 300")
        .setDescription(descArr.join("\n") || "표시할 데이터가 없습니다.")
        .setColor(0x3eb489)
        .setFooter({ text: `페이지 ${page + 1} / ${MAX_PAGE}` });
    };

    // 버튼 그룹
    const makeRow = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prev").setLabel("◀ 이전").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("next").setLabel("다음 ▶").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("refresh").setLabel("🔄 새로고침").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("top").setLabel("🏆 1위 보기").setStyle(ButtonStyle.Success)
      );

    // 첫페이지
    let page = 0;
    let embed = await makePageEmbed(page);
    const reply = await interaction.editReply({ embeds: [embed], components: [makeRow()] });

    // 콜렉터
    const collector = reply.createMessageComponentCollector({ time: 1000 * 120 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ 당신만 사용할 수 있습니다.", ephemeral: true });

      if (i.customId === "prev") {
        if (page > 0) page--;
        embed = await makePageEmbed(page);
        await i.update({ embeds: [embed], components: [makeRow()] });
      } else if (i.customId === "next") {
        if (page < MAX_PAGE - 1) page++;
        embed = await makePageEmbed(page);
        await i.update({ embeds: [embed], components: [makeRow()] });
      } else if (i.customId === "refresh") {
        // 새로고침
        try {
          scores = relationship.getAllScores().filter(r => r.userA !== r.userB).sort((a, b) => b.score - a.score).slice(0, 300);
        } catch (e) { return i.update({ content: "❌ 데이터 새로고침 실패!", embeds: [], components: [] }); }
        page = 0;
        embed = await makePageEmbed(page);
        await i.update({ embeds: [embed], components: [makeRow()] });
      } else if (i.customId === "top") {
        // 1위 임베드
        const top = scores[0];
        if (!top) return i.update({ content: "❌ 순위 데이터가 없습니다.", embeds: [], components: [] });
        const nameA = await interaction.guild.members.fetch(top.userA).then(m => m.displayName).catch(() => `알수없음(${top.userA})`);
        const nameB = await interaction.guild.members.fetch(top.userB).then(m => m.displayName).catch(() => `알수없음(${top.userB})`);
        const level = relationship.getRelationshipLevel(top.score);
        const topEmbed = new EmbedBuilder()
          .setTitle("🏆 서버 우정(호감도) 1위")
          .setDescription(`👥 ${nameA} ↔ ${nameB}\n💚 점수: \`${top.score.toFixed(2)}\`\n등급: ${level}`)
          .setColor(0xffd700);
        await i.update({ embeds: [topEmbed], components: [makeRow()] });
      }
    });

    collector.on("end", async () => {
      try { await reply.edit({ components: [] }); } catch {}
    });
  }
};
