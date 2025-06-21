const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const relationship = require("../utils/relationship");

const LAST_INTERACTION_PATH = path.join(__dirname, "../data/relationship-last.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관계현황")
    .setDescription("서버 내 전체 유저 간 최근 우정도 교류 현황을 확인합니다. (관리자 전용)"),
  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has("Administrator")) {
      return interaction.reply({ content: "❌ 이 명령어는 관리자만 사용할 수 있습니다.", ephemeral: true });
    }

    if (!fs.existsSync(LAST_INTERACTION_PATH)) {
      return interaction.reply({ content: "아직 교류한 기록이 없습니다.", ephemeral: true });
    }

    const log = JSON.parse(fs.readFileSync(LAST_INTERACTION_PATH));
    const recent = [];

    for (const userA in log) {
      for (const userB in log[userA]) {
        if (userA === userB) continue;
        const timestamp = log[userA][userB];
        recent.push({ userA, userB, timestamp });
      }
    }

    // 중복 제거 (userA-userB vs userB-userA)
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
      const description = (await Promise.all(chunk.map(async ({ userA, userB, timestamp }) => {
        const nameA = await interaction.guild.members.fetch(userA).then(m => m.displayName).catch(() => `알수없음(${userA})`);
        const nameB = await interaction.guild.members.fetch(userB).then(m => m.displayName).catch(() => `알수없음(${userB})`);
        const timeStr = `<t:${Math.floor(timestamp / 1000)}:R>`;
        const rel = relationship.getRelation(userA, userB);
        return `👥 ${nameA} → ${nameB} | ${rel} (${timeStr})`;
      }))).join("\n");

      const embed = new EmbedBuilder()
        .setTitle("📘 최근 교류 현황 (서버 전체)")
        .setDescription(description || "표시할 교류 정보가 없습니다.")
        .setColor(0x33cc99)
        .setFooter({ text: `페이지 ${Math.floor(i / 10) + 1} / ${Math.ceil(sorted.length / 10)}` });

      pages.push(embed);
    }

    let page = 0;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prev").setLabel("◀ 이전").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("next").setLabel("다음 ▶").setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.reply({ embeds: [pages[page]], components: [row], ephemeral: true });

    const collector = reply.createMessageComponentCollector({ time: 1000 * 120 });
    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return i.reply({ content: "당신이 누를 수 없습니다!", ephemeral: true });

      if (i.customId === "prev" && page > 0) page--;
      else if (i.customId === "next" && page < pages.length - 1) page++;

      await i.update({ embeds: [pages[page]], components: [row] });
    });
  }
};
