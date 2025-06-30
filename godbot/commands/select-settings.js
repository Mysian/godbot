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
      const defaultPlayStyleId = PLAY_STYLE_TAGS[1].id;
      await member.roles.remove(playStyleRoleIds, "플레이 스타일 역할 초기화");
      await member.roles.add(defaultPlayStyleId, "비정상 상태: 즐빡겜러로 세팅");
      ownedPlayStyle = [defaultPlayStyleId];
    }

    // 기타 태그
    const otherTags = [
      ADULT_CHAT_TAG,
      ...NOTIFY_TAGS,
    ];

    // embed, 메뉴 생성 함수 (항상 fresh하게 만듦)
    function makeEmbedAndMenus(currentRoles) {
      // embed
      const embed = new EmbedBuilder()
        .setTitle("💎 서버 태그 역할 설정")
        .setDescription([
          "서로 다른 플레이 스타일이 있음을 배려해주세요.",
          "❤️ **빡겜러**: 모든 게임에서 집중하고 경쟁을 즐기며 순위권을 가려는 자.",
          "💛 **즐빡겜러**: 기본적으로는 즐겜을 선호하지만, 특정 순간 빡겜러가 되어버리는 자.",
          "💚 **즐겜러**: 실력에 상관없이 유쾌하고 즐거운 분위기 위주로 즐기려는 자.",
          "",
          "🔞 **성인 채팅방 활성화**: 🔞🗨채팅방🔞│수위＆반말 방 접근 권한 해제",
          "",
          "⏰ **알림 태그**: 서버의 각종 주요 알림을 받아볼 수 있습니다.",
          "",
          "✅ **굵게** 표시된 태그는 이미 보유중, *기울임*은 미보유 상태입니다.",
        ].join("\n"))
        .setColor(0x7b2ff2)
        .setFooter({ text: "플레이 스타일 3개 중 1개는 반드시 선택해야 합니다." });

      // 상태 필드
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

      embed.setFields([{ name: "현재 내 태그 상태", value: tagStatusText }]);

      // 메뉴
      const playStyleSelect = new StringSelectMenuBuilder()
        .setCustomId("play_style_select")
        .setPlaceholder("플레이 스타일을 선택하세요 (필수)")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          PLAY_STYLE_TAGS.map(tag => ({
            label: tag.label,
            value: tag.id,
            emoji: tag.emoji,
            default: currentRoles.has(tag.id),
          }))
        );

      const tagSelect = new StringSelectMenuBuilder()
        .setCustomId("server_tags_select")
        .setPlaceholder("서버 알림/기타 태그 선택")
        .setMinValues(0)
        .setMaxValues(otherTags.length)
        .addOptions(
          otherTags.map(tag => ({
            label: tag.label,
            value: tag.id,
            emoji: tag.emoji,
            default: currentRoles.has(tag.id),
          }))
        );

      const actionRows = [
        new ActionRowBuilder().addComponents(playStyleSelect),
        new ActionRowBuilder().addComponents(tagSelect),
      ];
      return { embed, actionRows };
    }

    // 최초 렌더링
    let { embed, actionRows } = makeEmbedAndMenus(member.roles.cache);

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
      // **중요: 최신 상태 기준으로 항상 다시 생성**
      member = await interaction.guild.members.fetch(interaction.user.id);
      let updateRequired = false;

      if (i.customId === "play_style_select") {
        const newPlayStyleId = i.values[0];
        if (!member.roles.cache.has(newPlayStyleId) || ownedPlayStyle[0] !== newPlayStyleId) {
          await member.roles.remove(playStyleRoleIds, "플레이 스타일 변경");
          await member.roles.add(newPlayStyleId, "플레이 스타일 선택");
          updateRequired = true;
        }
      }
      else if (i.customId === "server_tags_select") {
        const selected = new Set(i.values);
        const toAdd = [];
        const toRemove = [];
        for (const tag of otherTags) {
          const hasRole = member.roles.cache.has(tag.id);
          if (selected.has(tag.id) && !hasRole) toAdd.push(tag.id);
          if (!selected.has(tag.id) && hasRole) toRemove.push(tag.id);
        }
        if (toAdd.length > 0) { await member.roles.add(toAdd, "서버 태그 추가"); updateRequired = true; }
        if (toRemove.length > 0) { await member.roles.remove(toRemove, "서버 태그 해제"); updateRequired = true; }
      }

      // 항상 최신 정보로 재생성
      member = await interaction.guild.members.fetch(interaction.user.id);
      const { embed: embed2, actionRows: actionRows2 } = makeEmbedAndMenus(member.roles.cache);

      await i.update({
        embeds: [embed2],
        components: actionRows2,
      });
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
