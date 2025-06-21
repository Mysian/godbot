const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const relationship = require("../utils/relationship");

const LAST_INTERACTION_PATH = path.join(__dirname, "../data/relationship-last.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관계현황")
    .setDescription("서버 내 전체 유저 간 최근 우정도 교류 현황을 확인합니다. (관리자 전용)"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply({ content: "❌ 이 명령어는 관리자만 사용할 수 있습니다." });
    }

    const buildPages = async () => {
      if (!fs.existsSync(LAST_INTERACTION_PATH)) {
        return { error: "❌ 아직 교류한 기록이 없습니다." };
      }

      let log = {};
      try {
        const raw = fs.readFileSync(LAST_INTERACTION_PATH, "utf-8").trim();
        if (raw) log = JSON.parse(raw);
      } catch (e) {
        return { error: "❌ 교류 기록을 불러오는 데 실패했습니다." };
      }

      const recent = [];
      for (const userA in log) {
        for (const userB in log[userA]) {
          if (userA === userB) continue;
          const timestamp = log[userA][userB];
          recent.push({ userA, userB, timestamp });
        }
      }

      const seen = new Set();
      const filtered = recent.filter(({ userA, userB }) => {
        const key = [userA, userB].sort().join("-");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const sorted = filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);

      const pages = [];
      for (let i = 0; i < sorted.length; i += 10) {
        const chunk = sorted.slice(i, i + 10);
        const description = (
          await Promise.all(
            chunk.map(async ({ userA, userB, timestamp }) => {
              const nameA = await interaction.guild.members.fetch(userA).then(m => m.displayName).catch(() => `알수없음(${userA})`);
              const nameB = await interaction.guild.members.fetch(userB).then(m => m.displayName).catch(() => `알수없음(${userB})`);
              const timeStr = `<t:${Math.floor(timestamp / 1000)}:R>`;
              const rel = relationship.getRelation(userA, userB);
              return `👥 ${nameA} → ${nameB} | ${rel} (${timeStr})`;
            })
          )
        ).join("\n");

        const embed = new EmbedBuilder()
          .setTitle("📘 최근 교류 현황 (서버 전체)")
          .setDescription(description || "표시할 교류 정보가 없습니다.")
          .setColor(0x33cc99)
          .setFooter({ text: `페이지 ${Math.floor(i / 10) + 1} / ${Math.ceil(sorted.length / 10)}` });

        pages.push(embed);
      }

      return { pages };
    };

    let { pages, error } = await buildPages();
    if (error) return interaction.editReply({ content: error });
    if (!pages || pages.length === 0) return interaction.editReply({ content: "❌ 최근 교류 기록이 없습니다." });

    let page = 0;
    const makeRow = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prev").setLabel("◀ 이전").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("next").setLabel("다음 ▶").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("refresh").setLabel("🔄 새로고침").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("top").setLabel("🏆 가장 우정 높은 관계").setStyle(ButtonStyle.Success)
      );

    const reply = await interaction.editReply({ embeds: [pages[page]], components: [makeRow()] });

    const collector = reply.createMessageComponentCollector({ time: 1000 * 120 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: "❌ 당신은 이 버튼을 사용할 수 없습니다.", ephemeral: true });
      }

      if (i.customId === "prev" && page > 0) page--;
      else if (i.customId === "next" && page < pages.length - 1) page++;
      else if (i.customId === "refresh") {
        const refreshed = await buildPages();
        if (refreshed.error) return i.update({ content: refreshed.error, embeds: [], components: [] });
        pages = refreshed.pages;
        page = 0;
        return i.update({ embeds: [pages[page]], components: [makeRow()] });
      } else if (i.customId === "top") {
        const scores = relationship.getAllScores(); // flat list
        const top = scores.sort((a, b) => b.score - a.score)[0];

        if (!top) return i.update({ content: "❌ 우정 정보가 없습니다.", embeds: [], components: [] });

        const nameA = await interaction.guild.members.fetch(top.userA).then(m => m.displayName).catch(() => `알수없음(${top.userA})`);
        const nameB = await interaction.guild.members.fetch(top.userB).then(m => m.displayName).catch(() => `알수없음(${top.userB})`);

        const embed = new EmbedBuilder()
          .setTitle("🏆 가장 우정 높은 관계")
          .setDescription(`👥 ${nameA} → ${nameB}\n💚 호감도 점수: ${top.score.toFixed(2)}\n등급: ${relationship.getRelationshipLevel(top.score)}`)
          .setColor(0xffd700);

        return i.update({ embeds: [embed], components: [makeRow()] });
      }

      await i.update({ embeds: [pages[page]], components: [makeRow()] });
    });

    collector.on("end", async () => {
      try {
        await reply.edit({ components: [] });
      } catch {}
    });
  }
};
