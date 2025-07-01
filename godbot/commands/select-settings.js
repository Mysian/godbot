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

const CATEGORIES = [
  {
    name: "플레이 스타일 태그",
    tags: PLAY_STYLE_TAGS,
    selectId: "play_style_select",
    min: 1,
    max: 1,
  },
  {
    name: "알림 태그",
    tags: NOTIFY_TAGS,
    selectId: "notify_select",
    min: 0,
    max: NOTIFY_TAGS.length,
  },
  {
    name: "채팅방 태그",
    tags: [CHAT_TAG],
    selectId: "chat_select",
    min: 0,
    max: 1,
  },
];

// ---- 슬래시 명령 --------------------------------------------------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName("서버태그설정")
    .setDescription("서버 태그(플레이 스타일·알림·채팅방)를 설정합니다."),

  async execute(interaction) {
    await interaction.guild.roles.fetch();
    let member = await interaction.guild.members.fetch(interaction.user.id);

    // 플레이 스타일 1개 강제 유지 ------------------------------------------------
    const playStyleIds = PLAY_STYLE_TAGS.map(t => t.id);
    const ownedPlayStyles = playStyleIds.filter(id => member.roles.cache.has(id));
    if (ownedPlayStyles.length !== 1) {
      const defaultId = PLAY_STYLE_TAGS[1].id; // 즐빡겜러
      await member.roles.remove(playStyleIds, "플레이 스타일 초기화");
      await member.roles.add(defaultId, "비정상 상태: 즐빡겜러로 보정");
      member = await interaction.guild.members.fetch(interaction.user.id);
    }

    // ---- 렌더 함수 -----------------------------------------------------------
    let page = 0;
    function makeStatusText(roleCache) {
      const lines = [
        "━━━━━━━━━━━━━━━━━━━━",
        "**[ 현재 내 태그 상태 ]**",
        "",
        "**플레이 스타일**:",
        PLAY_STYLE_TAGS.map(t =>
          `${roleCache.has(t.id) ? "✅" : "⬜"} ${t.emoji} ${roleCache.has(t.id) ? `**${t.label}**` : `*${t.label}*`}`
        ).join("   "),
        "",
        "**알림 태그**:",
        NOTIFY_TAGS.map(t =>
          `${t.emoji} ${t.label} : ${roleCache.has(t.id) ? "✅" : "⬜"}`
        ).join("\n"),
        "",
        "**채팅방 태그**:",
        `${CHAT_TAG.emoji} ${CHAT_TAG.label} : ${roleCache.has(CHAT_TAG.id) ? "✅" : "⬜"}`,
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "✅ 굵게: 보유 | ⬜ 미보유",
      ];
      return lines.join("\n");
    }

    function renderPayload(roleCache) {
      const cat = CATEGORIES[page];

      // ── embed ---------------------------------------------------------------
      const embed = new EmbedBuilder()
        .setTitle(`💎 ${cat.name} 설정 (${page + 1}/${CATEGORIES.length})`)
        .setDescription(`아래 드롭다운에서 ${cat.name}을(를) 선택/해제하세요.`)
        .addFields({ name: "\u200b", value: makeStatusText(roleCache) })
        .setColor(0x7b2ff2)
        .setFooter({ text: "플레이 스타일 태그는 반드시 1개 유지해야 합니다." });

      // ── select --------------------------------------------------------------
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
            default: roleCache.has(t.id),
          }))
        );

      // ── nav buttons ---------------------------------------------------------
      const nav = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prev")
          .setLabel("이전")
          .setStyle("Secondary")
          .setEmoji("⬅️")
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("next")
          .setLabel("다음")
          .setStyle("Primary")
          .setEmoji("➡️")
          .setDisabled(page === CATEGORIES.length - 1),
      );

      return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(select), nav],
        ephemeral: true,
      };
    }

    await interaction.reply(renderPayload(member.roles.cache));
    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 600_000,
    });

    // ---- 인터랙션 처리 -------------------------------------------------------
    collector.on("collect", async i => {
      member = await interaction.guild.members.fetch(interaction.user.id);

      // 페이지 버튼 ------------------------------------------------------------
      if (i.isButton()) {
        if (i.customId === "prev" && page > 0) page--;
        if (i.customId === "next" && page < CATEGORIES.length - 1) page++;
        return void i.update(renderPayload(member.roles.cache));
      }

      // 셀렉트 메뉴 ------------------------------------------------------------
      const cat = CATEGORIES.find(c => c.selectId === i.customId);
      if (!cat) return;

      const selected = new Set(i.values);

      // 플레이 스타일 교체 (단일 선택) ----------------------------------------
      if (cat.selectId === "play_style_select") {
        const current = playStyleIds.filter(id => member.roles.cache.has(id))[0];
        const nextId = [...selected][0];
        if (current !== nextId) {
          await member.roles.remove(playStyleIds, "플레이 스타일 변경");
          await member.roles.add(nextId, "플레이 스타일 선택");
        }
      } else {
        // 알림/채팅방 태그 다중 선택 -----------------------------------------
        const toAdd = cat.tags
          .filter(t => selected.has(t.id) && !member.roles.cache.has(t.id))
          .map(t => t.id);
        const toRemove = cat.tags
          .filter(t => !selected.has(t.id) && member.roles.cache.has(t.id))
          .map(t => t.id);
        if (toAdd.length) await member.roles.add(toAdd, `${cat.name} 추가`);
        if (toRemove.length) await member.roles.remove(toRemove, `${cat.name} 제거`);
      }

      member = await interaction.guild.members.fetch(interaction.user.id);
      await i.update(renderPayload(member.roles.cache));
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    });
  },
};
