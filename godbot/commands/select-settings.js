const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ComponentType,
} = require("discord.js");

// ---- 태그 정의 ---------------------------------------------------------------
const PLAY_STYLE_TAGS = [
  { label: "빡겜러",     id: "1210762363704311838", emoji: "❤️" },
  { label: "즐빡겜러",   id: "1210762298172383273", emoji: "💛" },
  { label: "즐겜러",     id: "1210762420151394354", emoji: "💚" },
];

const NOTIFY_TAGS = [
  { label: "서버 변동사항 알림",         id: "1255583755670917221", emoji: "⏰" },
  { label: "이벤트 알림",               id: "1255580760371626086", emoji: "⏰" },
  { label: "내전 알림",                 id: "1255580383559422033", emoji: "⏰" },
  { label: "경매 알림",                 id: "1255580504745574552", emoji: "⏰" },
  { label: "포인트 퀴즈 알림",          id: "1255580906199191644", emoji: "⏰" },
  { label: "홍보 쿨타임(BUMP) 알림",    id: "1314483547142098984", emoji: "⏰" },
];

const CHAT_TAG = { label: "성인 채팅방 활성화", id: "1215261658314702859", emoji: "🔞" };

// ---- 카테고리 메타 -----------------------------------------------------------
const CATEGORIES = [
  {
    name: "플레이 스타일 태그",
    selectId: "play_style_select",
    min: 1,
    max: 1,
    tags: PLAY_STYLE_TAGS,
    intro: [
      "**플레이스타일은 서로 배려해주세요!**",
      "❤️ **빡겜러**: 모든 게임에서 집중하고 경쟁을 즐기며 순위권을 가려는 자.",
      "💛 **즐빡겜러**: 기본적으로는 즐겜을 선호하지만, 특정 순간 빡겜러가 되어버리는 자.",
      "💚 **즐겜러**: 실력에 상관없이 유쾌하고 즐거운 분위기 위주로 즐기려는 자.",
    ],
    footer: "플레이 스타일 태그는 반드시 1개 유지해야 합니다.",
  },
  {
    name: "알림 태그",
    selectId: "notify_select",
    min: 0,
    max: NOTIFY_TAGS.length,
    tags: NOTIFY_TAGS,
    intro: [
      "⏰ **알림 태그**: 서버의 각종 주요 알림을 받아볼 수 있습니다.",
    ],
  },
  {
    name: "채팅방 태그",
    selectId: "chat_select",
    min: 0,
    max: 1,
    tags: [CHAT_TAG],
    intro: [
      "🔞 **성인 채팅방 활성화**: 🔞🗨채팅방🔞│수위＆반말 방 접근 권한 해제",
    ],
  },
];

// ---- 유틸: 카테고리별 상태 텍스트 ------------------------------------------
function makeStatusText(roleCache, cat) {
  if (cat.selectId === "play_style_select") {
    return cat.tags
      .map(t => `${roleCache.has(t.id) ? "✅" : "⬜"} ${t.emoji} ${roleCache.has(t.id) ? `**${t.label}**` : t.label}`)
      .join("   ");
  }
  return cat.tags
    .map(t => `${t.emoji} ${t.label} : ${roleCache.has(t.id) ? "✅" : "⬜"}`)
    .join("\n");
}

// -----------------------------------------------------------------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName("서버태그설정")
    .setDescription("서버 태그(플레이 스타일·알림·채팅방)를 설정합니다."),

  async execute(interaction) {
    await interaction.guild.roles.fetch();
    let member = await interaction.guild.members.fetch(interaction.user.id);

    // 플레이 스타일 1개 강제 유지 -------------------------------------------
    const playStyleIds = PLAY_STYLE_TAGS.map(t => t.id);
    const ownedPlay = playStyleIds.filter(id => member.roles.cache.has(id));
    if (ownedPlay.length !== 1) {
      const defaultId = PLAY_STYLE_TAGS[1].id; // 즐빡겜러 기본
      await member.roles.remove(playStyleIds, "플레이 스타일 초기화");
      await member.roles.add(defaultId, "비정상 상태: 즐빡겜러로 보정");
      member = await interaction.guild.members.fetch(interaction.user.id);
    }

    // ---- 렌더 함수 ---------------------------------------------------------
    let page = 0;
    const buildPayload = cache => {
      const cat = CATEGORIES[page];

      // ── 임베드 ------------------------------------------------------------
      const embed = new EmbedBuilder()
        .setTitle(`💎 ${cat.name} 설정 (${page + 1}/${CATEGORIES.length})`)
        .setDescription(cat.intro.join("\n"))
        .addFields({ name: "현재 내 태그 상태", value: makeStatusText(cache, cat) })
        .setColor(0x7b2ff2);
      if (cat.footer) embed.setFooter({ text: cat.footer });

      // ── 셀렉트 메뉴 --------------------------------------------------------
      const select = new StringSelectMenuBuilder()
        .setCustomId(cat.selectId)
        .setPlaceholder(cat.name)
        .setMinValues(cat.min)
        .setMaxValues(cat.max)
        .addOptions(
          cat.tags.map(t => ({
            label: t.label,
            value: t.id,
            emoji: t.emoji,
            default: cache.has(t.id),
          }))
        );

      // ── 네비 버튼 ----------------------------------------------------------
      const prevLabel = page === 0 ? "" : `⬅️ ${CATEGORIES[page - 1].name}`;
      const nextLabel = page === CATEGORIES.length - 1 ? "" : `${CATEGORIES[page + 1].name} ➡️`;

      const nav = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prev")
          .setStyle("Secondary")
          .setLabel(prevLabel || "이전")
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("next")
          .setStyle("Primary")
          .setLabel(nextLabel || "다음")
          .setDisabled(page === CATEGORIES.length - 1),
      );

      return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(select), nav],
        ephemeral: true,
      };
    };

    await interaction.reply(buildPayload(member.roles.cache));
    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 600_000,
    });

    // ---- 인터랙션 처리 -----------------------------------------------------
    collector.on("collect", async i => {
      member = await interaction.guild.members.fetch(interaction.user.id);

      // 페이지 이동 ---------------------------------------------------------
      if (i.isButton()) {
        if (i.customId === "prev" && page > 0) page--;
        if (i.customId === "next" && page < CATEGORIES.length - 1) page++;
        return void i.update(buildPayload(member.roles.cache));
      }

      // 셀렉트 메뉴 ---------------------------------------------------------
      const cat = CATEGORIES.find(c => c.selectId === i.customId);
      if (!cat) return;

      const chosen = new Set(i.values);

      if (cat.selectId === "play_style_select") {
        const current = playStyleIds.find(id => member.roles.cache.has(id));
        const nextId = [...chosen][0];
        if (current !== nextId) {
          await member.roles.remove(playStyleIds, "플레이 스타일 변경");
          await member.roles.add(nextId, "플레이 스타일 선택");
        }
      } else {
        const toAdd = cat.tags.filter(t => chosen.has(t.id) && !member.roles.cache.has(t.id)).map(t => t.id);
        const toRemove = cat.tags.filter(t => !chosen.has(t.id) && member.roles.cache.has(t.id)).map(t => t.id);
        if (toAdd.length) await member.roles.add(toAdd, `${cat.name} 추가`);
        if (toRemove.length) await member.roles.remove(toRemove, `${cat.name} 제거`);
      }

      member = await interaction.guild.members.fetch(interaction.user.id);
      await i.update(buildPayload(member.roles.cache));
    });

    collector.on("end", async () => {
      try { await interaction.editReply({ components: [] }); } catch {}
    });
  },
};
