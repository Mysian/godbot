const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const activity = require("../utils/activity-tracker");

// 조회 명령어
module.exports = {
  data: new SlashCommandBuilder()
    .setName("이용현황")
    .setDescription("특정 기간, 필터, 유저별 활동량 및 TOP100 순위")
    .addStringOption(opt => opt.setName("시작일").setDescription("YYYY-MM-DD").setRequired(false))
    .addStringOption(opt => opt.setName("종료일").setDescription("YYYY-MM-DD").setRequired(false))
    .addStringOption(opt => opt.setName("필터").setDescription("종류 (종합|채팅|음성)").addChoices(
      { name: "종합", value: "all" },
      { name: "채팅", value: "message" },
      { name: "음성", value: "voice" }
    ).setRequired(false))
    .addUserOption(opt => opt.setName("유저").setDescription("특정 유저만 조회").setRequired(false)),

  async execute(interaction) {
    // 옵션 파싱
    const from = interaction.options.getString("시작일") || null;
    const to = interaction.options.getString("종료일") || null;
    const filterType = interaction.options.getString("필터") || "all";
    const user = interaction.options.getUser("유저");

    let stats = activity.getStats({ from, to, filterType, userId: user?.id || null });
    // 정렬
    if (filterType === "message") stats.sort((a, b) => b.message - a.message);
    else if (filterType === "voice") stats.sort((a, b) => b.voice - a.voice);
    else stats.sort((a, b) => (b.message + b.voice) - (a.message + a.voice));

    // 페이징 (TOP100)
    let page = 0;
    const pageSize = 15;
    const totalPages = Math.ceil(Math.min(100, stats.length) / pageSize);
    function makeEmbed(page) {
      let list = "";
      for (let i = page * pageSize; i < Math.min(stats.length, (page + 1) * pageSize); i++) {
        const s = stats[i];
        const msgStr = s.message.toLocaleString();
        const voiceStr = (s.voice / 3600).toFixed(1);
        list += `**${i + 1}위** <@${s.userId}> — 💬 ${msgStr}개, 🔊 ${voiceStr}시간\n`;
      }
      const embed = new EmbedBuilder()
        .setTitle(`📊 활동 랭킹 [${filterType === "message" ? "채팅" : filterType === "voice" ? "음성" : "종합"}]`)
        .setDescription(list.length ? list : "해당 조건에 데이터 없음")
        .setFooter({ text: `기간: ${from || "전체"} ~ ${to || "전체"} | ${page + 1}/${totalPages}페이지` });
      return embed;
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prev").setLabel("이전").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("next").setLabel("다음").setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ embeds: [makeEmbed(page)], components: [row], ephemeral: true });

    if (totalPages <= 1) return;
    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      componentType: ComponentType.Button,
      time: 2 * 60 * 1000
    });
    collector.on("collect", async i => {
      if (i.customId === "prev" && page > 0) page--;
      if (i.customId === "next" && page < totalPages - 1) page++;
      await i.update({ embeds: [makeEmbed(page)], components: [row], ephemeral: true });
    });
  }
};
