const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");

// 태그 설정
const PLAY_STYLE_TAGS = [
  { label: "빡겜러", id: "1210762363704311838", emoji: "❤️" },
  { label: "즐빡겜러", id: "1210762298172383273", emoji: "💛" },
  { label: "즐겜러", id: "1210762420151394354", emoji: "💚" },
];

const ADULT_CHAT_TAG = { label: "성인 채팅방 활성화", id: "1215261658314702859", emoji: "🔞" };

const NOTIFY_TAGS = [
  { label: "서버 변동사항 알림", id: "1255583755670917221", emoji: "⏰" },
  { label: "이벤트 알림", id: "1255580760371626086", emoji: "⏰" },
  { label: "내전 알림", id: "1255580383559422033", emoji: "⏰" },
  { label: "경매 알림", id: "1255580504745574552", emoji: "⏰" },
  { label: "포인트 퀴즈 알림", id: "1255580906199191644", emoji: "⏰" },
  { label: "홍보 쿨타임(BUMP) 알림", id: "1314483547142098984", emoji: "⏰" },
];

const ALL_TAGS = [
  ...PLAY_STYLE_TAGS,
  ADULT_CHAT_TAG,
  ...NOTIFY_TAGS,
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("서버태그설정")
    .setDescription("서버에서 제공하는 태그 역할을 선택/해제할 수 있습니다."),

  async execute(interaction) {
    await interaction.guild.roles.fetch();
    let member = await interaction.guild.members.fetch(interaction.user.id);

    // 빡겜러/즐빡겜러/즐겜러 롤 ID만 모으기
    const playStyleRoleIds = PLAY_STYLE_TAGS.map(tag => tag.id);

    // 유저가 현재 가진 플레이스타일 역할 ID
    let ownedPlayStyle = playStyleRoleIds.filter(id => member.roles.cache.has(id));

    // 정상적인 상태 아니면(0개 또는 2개 이상), '즐빡겜러'만 남기고 나머지 제거
    if (ownedPlayStyle.length !== 1) {
      // 즐빡겜러 ID
      const defaultPlayStyleId = PLAY_STYLE_TAGS[1].id;
      // 일단 3개 다 제거
      await member.roles.remove(playStyleRoleIds, "플레이 스타일 역할 초기화");
      // 즐빡겜러 부여
      await member.roles.add(defaultPlayStyleId, "비정상 상태: 즐빡겜러로 세팅");
      ownedPlayStyle = [defaultPlayStyleId];
    }

    // 현재 유저가 가진 태그 역할들
    const currentRoles2 = member.roles.cache;

  // [1] 플레이스타일 셀렉트 갱신
  const playStyleSelect2 = new StringSelectMenuBuilder()
    .setCustomId("play_style_select")
    .setPlaceholder("플레이 스타일을 선택하세요 (필수)")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      PLAY_STYLE_TAGS.map(tag => ({
        label: tag.label,
        value: tag.id,
        emoji: tag.emoji,
        default: currentRoles2.has(tag.id),
      }))
    );

  // [2] 기타 태그 셀렉트 갱신
  const tagSelect2 = new StringSelectMenuBuilder()
    .setCustomId("server_tags_select")
    .setPlaceholder("서버 알림/기타 태그 선택")
    .setMinValues(0)
    .setMaxValues(otherTags.length)
    .addOptions(
      otherTags.map(tag => ({
        label: tag.label,
        value: tag.id,
        emoji: tag.emoji,
        default: currentRoles2.has(tag.id),
      }))
    );

  const actionRows2 = [
    new ActionRowBuilder().addComponents(playStyleSelect2),
    new ActionRowBuilder().addComponents(tagSelect2),
  ];

  await i.update({
    embeds: [embed],
    components: actionRows2,
  });
});

    // 설명 embed
    const embed = new EmbedBuilder()
      .setTitle("💎 서버 태그 역할 설정")
      .setDescription([
        "플레이 스타일(빡겜러/즐빡겜러/즐겜러)은 **무조건 1개만** 선택되어야 하며, 해제할 수 없습니다.",
        "",
        `**플레이 스타일**\n${PLAY_STYLE_TAGS.map(tag => `${tag.emoji} ${tag.label}`).join("  ")}`,
        `\n**성인채팅방**\n${ADULT_CHAT_TAG.emoji} ${ADULT_CHAT_TAG.label}`,
        `\n**알림 태그**\n${NOTIFY_TAGS.map(tag => `${tag.emoji} ${tag.label}`).join("  ")}`,
        "",
        "✅ **굵게** 표시된 태그는 이미 보유중, *기울임*은 미보유 상태입니다.",
      ].join("\n"))
      .setColor(0x7b2ff2)
      .setFooter({ text: "플레이 스타일 3개 중 1개는 반드시 선택해야 합니다." });

    // 상태 표기
    const tagStatusText = [
      "**플레이 스타일**",
      PLAY_STYLE_TAGS.map(tag =>
        `${currentRoles.has(tag.id) ? "✅" : "⬜"} ${tag.emoji} ${currentRoles.has(tag.id) ? `**${tag.label}**` : `*${tag.label}*`}`
      ).join(" "),
      "",
      "**기타 태그**",
      otherTags.map(tag =>
        `${currentRoles.has(tag.id) ? "✅" : "⬜"} ${tag.emoji} ${currentRoles.has(tag.id) ? `**${tag.label}**` : `*${tag.label}*`}`
      ).join("  "),
    ].join("\n");

    embed.addFields({ name: "현재 내 태그 상태", value: tagStatusText });

    await interaction.reply({
      embeds: [embed],
      components: actionRows,
      ephemeral: true,
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 90_000,
    });

    collector.on("collect", async i => {
      // 플레이 스타일 셀렉트 처리
      if (i.customId === "play_style_select") {
        const newPlayStyleId = i.values[0];
        // 만약 기존이랑 다르면 갱신
        if (!currentRoles.has(newPlayStyleId) || ownedPlayStyle[0] !== newPlayStyleId) {
          // 기존 3개 제거 후 선택한 하나만 추가
          await member.roles.remove(playStyleRoleIds, "플레이 스타일 변경");
          await member.roles.add(newPlayStyleId, "플레이 스타일 선택");
        }
        // 최신화
        member = await interaction.guild.members.fetch(interaction.user.id);
        // 태그 embed 업데이트
        const currentRoles2 = member.roles.cache;
        embed.data.fields[0].value = [
          "**플레이 스타일**",
          PLAY_STYLE_TAGS.map(tag =>
            `${currentRoles2.has(tag.id) ? "✅" : "⬜"} ${tag.emoji} ${currentRoles2.has(tag.id) ? `**${tag.label}**` : `*${tag.label}*`}`
          ).join(" "),
          "",
          "**기타 태그**",
          otherTags.map(tag =>
            `${currentRoles2.has(tag.id) ? "✅" : "⬜"} ${tag.emoji} ${currentRoles2.has(tag.id) ? `**${tag.label}**` : `*${tag.label}*`}`
          ).join("  "),
        ].join("\n");
        await i.update({
          embeds: [embed],
          components: actionRows,
        });
      }
      // 기타 태그(자유선택) 처리
      else if (i.customId === "server_tags_select") {
        const selected = new Set(i.values);
        const toAdd = [];
        const toRemove = [];
        for (const tag of otherTags) {
          const hasRole = member.roles.cache.has(tag.id);
          if (selected.has(tag.id) && !hasRole) toAdd.push(tag.id);
          if (!selected.has(tag.id) && hasRole) toRemove.push(tag.id);
        }
        if (toAdd.length > 0) await member.roles.add(toAdd, "서버 태그 추가");
        if (toRemove.length > 0) await member.roles.remove(toRemove, "서버 태그 해제");
        // 최신화
        member = await interaction.guild.members.fetch(interaction.user.id);
        // 태그 embed 업데이트
        const currentRoles2 = member.roles.cache;
        embed.data.fields[0].value = [
          "**플레이 스타일**",
          PLAY_STYLE_TAGS.map(tag =>
            `${currentRoles2.has(tag.id) ? "✅" : "⬜"} ${tag.emoji} ${currentRoles2.has(tag.id) ? `**${tag.label}**` : `*${tag.label}*`}`
          ).join(" "),
          "",
          "**기타 태그**",
          otherTags.map(tag =>
            `${currentRoles2.has(tag.id) ? "✅" : "⬜"} ${tag.emoji} ${currentRoles2.has(tag.id) ? `**${tag.label}**` : `*${tag.label}*`}`
          ).join("  "),
        ].join("\n");
        await i.update({
          embeds: [embed],
          components: actionRows,
        });
      }
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({
          components: [],
        });
      } catch {}
    });
  }
};
