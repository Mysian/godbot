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

const FIXED_ROLE_ID = "1255580383559422033"; // 고정 멘션 역할

// === 간단 영속 저장소 (메시지별 페이지/URL 기억) ===
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

function buildEmbeds(titleText, pageLabel, imgUrl) {
  // 이미지 위주(상단), URL은 하단에 "큰 코드블럭"으로
  const imgEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📣 ${titleText} — ${pageLabel}`)
    .setImage(imgUrl)
    .setTimestamp(new Date());

  const urlEmbed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setDescription(`**이미지 링크**\n\`\`\`\n${imgUrl}\n\`\`\``);

  return [imgEmbed, urlEmbed];
}

function buildComponents(messageId, pageIndex, pages) {
  const prev = new ButtonBuilder()
    .setCustomId(`scrim:nav|${messageId}|prev`)
    .setLabel("◀")
    .setStyle(ButtonStyle.Secondary);

  const indicator = new ButtonBuilder()
    .setCustomId("scrim:noop")
    .setLabel(`${pageIndex + 1} / ${pages.length}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const next = new ButtonBuilder()
    .setCustomId(`scrim:nav|${messageId}|next`)
    .setLabel("▶")
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(prev, indicator, next);

  const jumpBtns = pages.map((p, i) =>
    new ButtonBuilder()
      .setCustomId(`scrim:jump|${messageId}|${i}`)
      .setLabel(p.label)
      .setStyle(i === pageIndex ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(...jumpBtns);

  // 현재 페이지 이미지 직접 열기 (링크 버튼, 매 업데이트마다 현재 URL로 갱신)
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
    ),

  // /내전공지 실행
  async execute(interaction) {
    const gameRole = interaction.options.getRole("게임역할", true);
    const coverUrl = interaction.options.getString("표지", true);
    const rulesUrl = interaction.options.getString("팀규칙", true);
    const rewardUrl = interaction.options.getString("보상", true);
    const customTitle = interaction.options.getString("제목") || gameRole.name;

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

    // 1) 임시 컴포넌트로 우선 전송 (멘션 포함)
    const pageIndex = 0;
    const [imgEmbed, urlEmbed] = buildEmbeds(
      customTitle,
      pages[pageIndex].label,
      pages[pageIndex].url
    );

    await interaction.reply({
      content: `<@&${FIXED_ROLE_ID}> <@&${gameRole.id}>`,
      embeds: [imgEmbed, urlEmbed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("scrim:loading")
            .setLabel("로딩…")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        ),
      ],
      allowedMentions: { roles: [FIXED_ROLE_ID, gameRole.id] },
    });

    // 2) 메시지 ID로 실제 컴포넌트/DB 세팅
    const msg = await interaction.fetchReply();
    const messageId = msg.id;

    const db = loadDB();
    db[messageId] = {
      title: customTitle,
      roleIds: [FIXED_ROLE_ID, gameRole.id],
      pages,
      page: 0,
      channelId: msg.channelId,
      guildId: msg.guildId,
      authorId: interaction.user.id,
      createdAt: Date.now(),
    };
    saveDB(db);

    const rows = buildComponents(messageId, 0, pages);
    await msg.edit({
      components: rows,
      // 멘션 반복 방지
      allowedMentions: { parse: [] },
    });
  },

  // 버튼 상호작용 처리
  async onComponent(interaction) {
    try {
      const cid = interaction.customId;
      if (!cid.startsWith("scrim:")) return;

      if (cid === "scrim:noop" || cid === "scrim:loading") {
        return interaction.deferUpdate().catch(() => {});
      }

      const payload = cid.slice("scrim:".length); // nav|<mid>|prev  /  jump|<mid>|<i>
      const [kind, mid, arg] = payload.split("|");
      const db = loadDB();
      const rec = db[mid];

      if (!rec) {
        return interaction.reply({
          content:
            "⚠️ 공지 데이터가 유실되었어. 새로 게시해줘!",
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
      db[mid] = rec;
      saveDB(db);

      const [imgEmbed, urlEmbed] = buildEmbeds(
        rec.title,
        rec.pages[page].label,
        rec.pages[page].url
      );
      const rows = buildComponents(mid, page, rec.pages);

      return interaction.update({
        embeds: [imgEmbed, urlEmbed],
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
