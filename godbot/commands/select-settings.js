const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");

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

    const playStyleRoleIds = PLAY_STYLE_TAGS.map(tag => tag.id);
    let ownedPlayStyle = playStyleRoleIds.filter(id => member.roles.cache.has(id));

    if (ownedPlayStyle.length !== 1) {
      const defaultPlayStyleId = PLAY_STYLE_TAGS[1].id;
      await member.roles.remove(playStyleRoleIds, "플레이 스타일 역할 초기화");
      await member.roles.add(defaultPlayStyleId, "비정상 상태: 즐빡겜러로 세팅");
      ownedPlayStyle = [defaultPlayStyleId];
    }

    const otherTags = [ADULT_CHAT_TAG, ...NOTIFY_TAGS];

    function makeEmbedAndMenus(currentRoles) {
      // 역할 설명 구간
      const desc = [
        "**플레이스타일은 서로 배려해주세요!**",
        "❤️ **빡겜러**: 모든 게임에서 집중하고 경쟁을 즐기며 순위권을 가려는 자.",
        "💛 **즐빡겜러**: 기본적으로는 즐겜을 선호하지만, 특정 순간 빡겜러가 되어버리는 자.",
        "💚 **즐겜러**: 실력에 상관없이 유쾌하고 즐거운 분위기 위주로 즐기려는 자.",
        "",
        "🔞 **성인 채팅방 활성화**: 🔞🗨채팅방🔞│수위＆반말 방 접근 권한 해제",
        "",
        "⏰ **알림 태그**: 서버의 각종 주요 알림을 받아볼 수 있습니다.",
        "",
        "---",
        "**⏬ 아래에서 원하는 태그를 선택하세요.**",
      ].join("\n");

      // 상태 구간 (기타 태그는 한 줄씩 보유여부)
      const tagStatusText = [
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "**[ 현재 내 태그 상태 ]**",
        "",
        "플레이 스타일:",
        PLAY_STYLE_TAGS.map(tag =>
          `${currentRoles.has(tag.id) ? "✅" : "⬜"} ${tag.emoji} ${currentRoles.has(tag.id) ? `**${tag.label}**` : `*${tag.label}*`}`
        ).join("   "),
        "",
        "기타 태그:",
        otherTags.map(tag =>
          `${tag.emoji} ${tag.label} : ${currentRoles.has(tag.id) ? "✅ 보유" : "⬜ 미보유"}`
        ).join("\n"),
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "✅ **굵게**: 이미 보유중, *기울임*: 미보유",
      ].join("\n");

      const embed = new EmbedBuilder()
        .setTitle("💎 서버 태그 역할 설정")
        .setDescription(desc)
        .addFields({ name: "\u200b", value: tagStatusText })
        .setColor(0x7b2ff2)
        .setFooter({ text: "플레이 스타일 3개 중 1개는 반드시 선택해야 합니다." });

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

    let { embed, actionRows } = makeEmbedAndMenus(member.roles.cache);

    await interaction.reply({
      embeds: [embed],
      components: actionRows,
      ephemeral: true,
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 600_000,
    });

    collector.on("collect", async i => {
      member = await interaction.guild.members.fetch(interaction.user.id);
      if (i.customId === "play_style_select") {
        const newPlayStyleId = i.values[0];
        if (!member.roles.cache.has(newPlayStyleId) || !playStyleRoleIds.includes(newPlayStyleId)) {
          await member.roles.remove(playStyleRoleIds, "플레이 스타일 변경");
          await member.roles.add(newPlayStyleId, "플레이 스타일 선택");
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
        if (toAdd.length > 0) await member.roles.add(toAdd, "서버 태그 추가");
        if (toRemove.length > 0) await member.roles.remove(toRemove, "서버 태그 해제");
      }
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
