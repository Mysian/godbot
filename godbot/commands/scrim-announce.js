// commands/scrim-announce.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FIXED_ROLE_ID = "1255580383559422033"; // 고정 멘션 역할ID

// === 간단 영속 저장소 (토큰별 페이지 상태) ===
const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const DB_PATH = path.join(dataDir, "scrims.json");

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "{}", "utf8");
    const raw = fs.readFileSync(DB_PATH, "utf8") || "{}";
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch {}
}

function isHttpUrl(str) {
  return /^https?:\/\/\S+/i.test(str || "");
}

function buildEmbeds(titleText, pageLabel, imgUrl, showUrl) {
  const imgEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📣 ${titleText} — ${pageLabel}`)
    .setImage(imgUrl)
    .setTimestamp(new Date());

  if (!showUrl) return [imgEmbed];

  const urlEmbed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setDescription(`**이미지 링크**\n\`\`\`\n${imgUrl}\n\`\`\``);

  return [imgEmbed, urlEmbed];
}

function buildComponents(token, pageIndex, pages) {
  const prev = new ButtonBuilder()
    .setCustomId(`scrim:nav|${token}|prev`)
    .setLabel("◀")
    .setStyle(ButtonStyle.Secondary);

  const indicator = new ButtonBuilder()
    .setCustomId("scrim:noop")
    .setLabel(`${pageIndex + 1} / ${pages.length}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const next = new ButtonBuilder()
    .setCustomId(`scrim:nav|${token}|next`)
    .setLabel("▶")
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(prev, indicator, next);

  const jumpBtns = pages.map((p, i) =>
    new ButtonBuilder()
      .setCustomId(`scrim:jump|${token}|${i}`)
      .setLabel(p.label)
      .setStyle(i === pageIndex ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(...jumpBtns);

  const openLink = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("이미지 열기")
    .setURL(pages[pageIndex].url);
  const row3 = new ActionRowBuilder().addComponents(openLink);

  return [row1, row2, row3];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("내전공지")
    .setDescription("내전 공지 임베드를 생성합니다 (이미지 페이징)")
    .addRoleOption(o =>
      o
        .setName("게임역할")
        .setDescription("@역할 태그 (내전게임 역할)")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("표지")
        .setDescription("내전표지 이미지 URL")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("팀규칙")
        .setDescription("내전 팀과 규칙 이미지 URL")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("보상")
        .setDescription("내전 보상 이미지 URL")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("제목")
        .setDescription("임베드 제목(미입력시 역할 이름 사용)")
        .setRequired(false)
    )
    .addBooleanOption(o =>
      o
        .setName("url표시")
        .setDescription("임베드 하단에 이미지 URL을 크게 표시 (기본: 끔)")
        .setRequired(false)
    ),

  // /내전공지 실행
  async execute(interaction) {
    const gameRole = interaction.options.getRole("게임역할", true);
    const coverUrl = interaction.options.getString("표지", true);
    const rulesUrl = interaction.options.getString("팀규칙", true);
    const rewardUrl = interaction.options.getString("보상", true);
    const customTitle = interaction.options.getString("제목") || gameRole.name;
    const showUrl = interaction.options.getBoolean("url표시") ?? false;

    if (![coverUrl, rulesUrl, rewardUrl].every(isHttpUrl)) {
      return interaction.reply({
        content: "이미지 URL은 http(s)로 시작해야 해.",
        ephemeral: true,
      });
    }

    const pages = [
      { label: "표지", url: coverUrl },
      { label: "팀·규칙", url: rulesUrl },
      { label: "보상", url: rewardUrl },
    ];

    // 토큰으로 식별 (메시지ID 의존 제거 → 첫 게시부터 최종 UI)
    const token = crypto.randomUUID().slice(0, 12);

    // DB에 먼저 저장
    const db = loadDB();
    db[token] = {
      title: customTitle,
      roleIds: [FIXED_ROLE_ID, gameRole.id],
      pages,
      page: 0,
      showUrl,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      authorId: interaction.user.id,
      createdAt: Date.now(),
    };
    saveDB(db);

    const [imgEmbed, urlEmbed] = buildEmbeds(
      customTitle,
      pages[0].label,
      pages[0].url,
      showUrl
    );
    const rows = buildComponents(token, 0, pages);

    // 처음부터 최종 형태로 전송 (로딩 버튼 없음)
    await interaction.reply({
      content: `<@&${FIXED_ROLE_ID}> <@&${gameRole.id}>`,
      embeds: showUrl ? [imgEmbed, urlEmbed] : [imgEmbed],
      components: rows,
      allowedMentions: { roles: [FIXED_ROLE_ID, gameRole.id], parse: [] },
    });
  },

  // 버튼 상호작용 처리
  async onComponent(interaction) {
    try {
      const cid = interaction.customId;
      if (!cid.startsWith("scrim:")) return;

      if (cid === "scrim:noop") {
        return interaction.deferUpdate().catch(() => {});
      }

      const payload = cid.slice("scrim:".length); // nav|<token>|prev  /  jump|<token>|<i>
      const [kind, token, arg] = payload.split("|");
      const db = loadDB();
      const rec = db[token];

      if (!rec) {
        return interaction.reply({
          content: "⚠️ 공지 데이터가 유실됐어. 새로 게시해줘!",
          ephemeral: true,
        });
      }

      let page = rec.page || 0;
      if (kind === "nav") {
        page = arg === "prev" ? (page - 1 + rec.pages.length) % rec.pages.length : (page + 1) % rec.pages.length;
      } else if (kind === "jump") {
        const idx = Math.max(0, Math.min(rec.pages.length - 1, Number(arg)));
        page = idx;
      } else {
        return interaction.deferUpdate().catch(() => {});
      }

      rec.page = page;
      db[token] = rec;
      saveDB(db);

      const embeds = buildEmbeds(
        rec.title,
        rec.pages[page].label,
        rec.pages[page].url,
        rec.showUrl
      );
      const rows = buildComponents(token, page, rec.pages);

      return interaction.update({
        embeds,
        components: rows,
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      return interaction.reply({
        content: "버튼 처리 중 오류가 발생했어.",
        ephemeral: true,
      }).catch(() => {});
    }
  },
};
