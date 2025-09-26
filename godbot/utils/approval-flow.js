const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ComponentType,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

let ALL_GAMES = [];
try {
  ({ ALL_GAMES } = require("../select-game.js"));
} catch {
  ALL_GAMES = [
    "소환사의 협곡","칼바람 나락","롤토체스","이벤트 모드[우르프,아레나,돌격전 등]","스팀게임","DJ MAX","FC",
    "GTA","GTFO","TRPG","건파이어 리본","구스구스 덕","데드락","데바데","델타포스","돈스타브","래프트",
    "레인보우식스","레포 REPO","로스트아크","리썰컴퍼니","리스크 오브 레인","마블 라이벌즈","마인크래프트",
    "마피아42","메이플스토리","몬스터 헌터","문명","발로란트","배틀그라운드","배틀필드","백룸","백 포 블러드",
    "비세라 클린업","서든어택","선 헤이븐","스컬","스타듀밸리","스타크래프트","에이펙스","엘소드","오버워치",
    "왁제이맥스","워프레임","원신","원스 휴먼","이터널 리턴","좀보이드","카운터스트라이크","코어 키퍼",
    "콜오브듀티","테라리아","테이블 탑 시뮬레이터","테일즈런너","파스모포비아","파워워시 시뮬레이터",
    "파티 애니멀즈","팰월드","페긴","프래그 펑크","휴먼폴플랫","헬다이버즈","히오스",
  ];
}

const NOTIFY_CHOICES = [
  { label: "내전 알림", roleId: "1255580383559422033" },
  { label: "이벤트 알림", roleId: "1255580760371626086" },
  { label: "서버 변동사항 알림", roleId: "1255583755670917221" },
  { label: "경매 알림", roleId: "1255580504745574552" },
  { label: "퀴즈/문제 알림", roleId: "1255580906199191644" },
];

const APPROVAL_SETTINGS_PATH = path.join(
  __dirname,
  "../data/approval-settings.json"
);

function loadApprovalOn() {
  try {
    const j = JSON.parse(fs.readFileSync(APPROVAL_SETTINGS_PATH, "utf8"));
    return j.enabled !== false;
  } catch {
    return true;
  }
}

const CH_APPROVAL_QUEUE = "1276751288117235755";
const CH_WELCOME_LOG = "1240936843122573312";
const CH_SERVER_GREETING = "1202425624061415464";
const CH_REJECT_NOTICE = "1240916343788797983";

const ROLE_MEMBER_NORMAL = "816619403205804042";
const ROLE_MEMBER_ALT = "1208987442234007582";
const ROLE_REJECTED = "1205052922296016906";

const PLAY_STYLES = ["빡겜러", "즐빡겜러", "즐겜러"];

const state = new Map();
const chanName = (uid) => `입장-${uid}`;

function currentKRYear() {
  return Number(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
    }).format(new Date())
  );
}
function accountAgeDays(user) {
  const ms = Date.now() - user.createdTimestamp;
  return Math.floor(ms / 86400000);
}
function validateNickname(name) {
  if (!name) return "닉네임을 입력해주세요.";
  if (name.length < 1 || name.length > 10) return "닉네임은 1~10글자여야 합니다.";
  if (!/^[\p{L}\p{N}\s]+$/u.test(name))
    return "특수문자 없이 한글/영문/숫자만 사용해주세요.";
  return null;
}
function validateBirthYear(y) {
  if (!/^\d{4}$/.test(y))
    return "출생년도는 4자리 숫자로 입력해주세요. 예) 2005년생";
  const year = Number(y);
  const nowY = currentKRYear();
  const minY = nowY - 100;
  const maxY = nowY - 20;
  if (year < minY || year > maxY)
    return `만 20세 이상(출생년도 ${minY}~${maxY})만 입장 가능합니다.`;
  return null;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function navRow(ids, disabledMap = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ids[0])
      .setLabel("이전")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!!disabledMap.prev),
    new ButtonBuilder()
      .setCustomId(ids[1])
      .setLabel("다음")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!!disabledMap.next)
  );
}
function step1Embed(user) {
  return new EmbedBuilder()
    .setColor(0x7b2ff2)
    .setTitle(`환영합니다! ${user.username}님`)
    .setDescription(
      [
        "종합게임서버 **'까리한 디스코드'**입니다.",
        "지금부터 서버 **입장 절차**를 진행하겠습니다.",
        "",
        "다음 중, 어떤 경로로 서버에 오셨나요?",
      ].join("\n")
    );
}
function step1Buttons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("src_disboard")
      .setLabel("디스보드")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("src_dicoall")
      .setLabel("디코올")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("src_sns")
      .setLabel("SNS")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("src_ref")
      .setLabel("추천인(지인)")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("src_rejoin")
      .setLabel("재입장")
      .setStyle(ButtonStyle.Success)
  );
}
function step1ButtonsAlt() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("src_alt")
      .setLabel("부계정 생성")
      .setStyle(ButtonStyle.Danger)
  );
}
function snsOrRefModal(kind = "SNS") {
  return new ModalBuilder()
    .setCustomId(`modal_${kind}`)
    .setTitle(`${kind} 정보 입력`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("detail")
          .setLabel(
            kind === "SNS"
              ? "SNS 종류를 입력하세요 (예: 유튜브/틱톡/인스타)"
              : "추천인 닉네임을 입력하세요"
          )
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}
function altModal() {
  return new ModalBuilder()
    .setCustomId("modal_alt")
    .setTitle("부계정 본계 닉네임 확인")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mainNick")
          .setLabel("본계정의 서버 닉네임을 입력하세요")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}
function step2aEmbed(progress) {
  const nowY = currentKRYear();
  const exYear = nowY - 20;
  return new EmbedBuilder()
    .setColor(0x2095ff)
    .setTitle("입장 절차 2-1단계")
    .setDescription(
      [
        "아래 정보를 입력해주세요. **모든 정보는 절대 공개되지 않습니다.**",
        "",
        `• 출생년도 (예: ${exYear}년생)`,
        "• 서버에서 사용할 닉네임",
        "",
        "※ 만 20세 미만이거나 100세 초과로 계산되는 출생년도는 **승인거절** 됩니다.",
      ].join("\n")
    )
    .addFields(
      { name: "유입 경로", value: progress.sourceText || "미입력", inline: true },
      { name: "부계정 여부", value: progress.isAlt ? "부계정" : "일반", inline: true },
      { name: "계정 생성일 경과", value: `${progress.accountAge}일`, inline: true }
    );
}
function step2bEmbed(progress) {
  return new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle("입장 절차 2-2단계")
    .setDescription("성별을 선택해주세요. **절대 공개되지 않습니다.**")
    .addFields(
      { name: "출생년도", value: String(progress.birthYear || "-"), inline: true },
      { name: "닉네임", value: String(progress.nickname || "-"), inline: true }
    );
}
function birthNickModal() {
  return new ModalBuilder()
    .setCustomId("modal_bio")
    .setTitle("출생년도 & 닉네임 입력")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("birth")
          .setLabel("출생년도 (4자리 숫자, 예: 2005)")
          .setPlaceholder("예: 2005")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("서버에서 사용할 닉네임 (1~10글자, 특수문자 불가)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}
function genderRow(selected) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gender_m")
      .setLabel(selected === "M" ? "✓ 남자" : "남자")
      .setStyle(selected === "M" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gender_f")
      .setLabel(selected === "F" ? "✓ 여자" : "여자")
      .setStyle(selected === "F" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("to_step3a")
      .setLabel("다음")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!selected)
  );
}
function step3aEmbed(progress) {
  return new EmbedBuilder()
    .setColor(0xf2b619)
    .setTitle("입장 절차 3-1단계")
    .setDescription("**게임 스타일(플레이스타일)** 을 선택해주세요 (1개). 선택 후 다음을 눌러주세요.")
    .addFields({
      name: "플레이스타일",
      value: progress.playStyle || "미선택",
      inline: true,
    });
}
function playStyleRow(selected) {
  return new ActionRowBuilder().addComponents(
    ...PLAY_STYLES.map((ps) =>
      new ButtonBuilder()
        .setCustomId(`ps_${ps}`)
        .setLabel(selected === ps ? `✓ ${ps}` : ps)
        .setStyle(selected === ps ? ButtonStyle.Success : ButtonStyle.Secondary)
    ),
    new ButtonBuilder()
      .setCustomId("to_step3b")
      .setLabel("다음")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!selected)
  );
}
function step3bEmbed(progress, totalPages) {
  return new EmbedBuilder()
    .setColor(0xf29f05)
    .setTitle("입장 절차 3-2단계")
    .setDescription(
      [
        "**주로 하시는 게임 태그**를 선택해주세요.",
        "최소 **1개 이상** 선택하면 됩니다.",
        "필요하면 여러 페이지에서 선택할 수 있습니다.",
      ].join("\n")
    )
    .addFields(
      {
        name: "선택한 게임",
        value: progress.gameTags?.length ? progress.gameTags.join(", ") : "0개 선택",
        inline: false,
      },
      {
        name: "선택 팁",
        value: `총 ${totalPages}페이지 셀렉트에서 고를 수 있어요.`,
        inline: false,
      }
    );
}
function gamesSelectRows(chosen = []) {
  const chunks = chunk(ALL_GAMES, 25);
  const rows = [];
  chunks.forEach((names, idx) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`games_select_${idx}`)
      .setPlaceholder(`주 게임 선택 (페이지 ${idx + 1}/${chunks.length})`)
      .setMinValues(0)
      .setMaxValues(Math.min(25, names.length))
      .addOptions(
        names.map((name) => ({
          label: name.length > 100 ? name.slice(0, 97) + "…" : name,
          value: name,
          default: chosen.includes(name),
        }))
      );
    rows.push(new ActionRowBuilder().addComponents(menu));
  });
  return { rows: rows.slice(0, 5), pages: chunks.length };
}
function buildQueueEmbed(guild, member, progress) {
  const createdAt = new Date(member.user.createdTimestamp);
  const createdStr = createdAt.toISOString().slice(0, 10);
  const hasRejectHistory = progress.rejectHistory ? "있음" : "없음";
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("신규 입장 승인 대기")
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "디스코드 계정", value: `<@${member.id}> (${member.user.tag})`, inline: false },
      { name: "변경 닉네임", value: progress.nickname, inline: true },
      { name: "출생년도", value: String(progress.birthYear), inline: true },
      { name: "성별", value: progress.gender === "M" ? "남자" : "여자", inline: true },
      { name: "유입 경로", value: progress.sourceText || "미입력", inline: true },
      { name: "부계정 여부", value: progress.isAlt ? "부계정" : "일반", inline: true },
      { name: "거절 이력", value: hasRejectHistory, inline: true },
      { name: "계정 생성일", value: `${createdStr} (경과 ${progress.accountAge}일)`, inline: true },
      { name: "플레이스타일", value: progress.playStyle || "미선택", inline: true },
      { name: "주 게임", value: progress.gameTags?.length ? progress.gameTags.join(", ") : "미선택", inline: false }
    );
}
function queueButtons(progress) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${progress.userId}`)
      .setLabel("승인")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`approve_silent_${progress.userId}`)
      .setLabel("조용히 승인")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`reject_${progress.userId}`)
      .setLabel("거절")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ban_${progress.userId}`)
      .setLabel("차단")
      .setStyle(ButtonStyle.Danger)
  );
}
function settingsSelectRow(selectedIds = []) {
  const opts = NOTIFY_CHOICES.map((o) => ({
    label: o.label,
    value: o.roleId,
    default: selectedIds.includes(o.roleId),
  }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId("settings_select")
    .setPlaceholder("서버 알림 태그를 선택하세요 (선택 사항)")
    .setMinValues(0)
    .setMaxValues(Math.max(1, opts.length))
    .addOptions(opts);
  return new ActionRowBuilder().addComponents(menu);
}

async function sendWelcome(guild, userId, gameTags = []) {
  const ch = guild.channels.cache.get(CH_SERVER_GREETING);
  if (!ch) return;
  const tagText = gameTags.length ? gameTags.join(",") : "게임태그 미등록";
  await ch.send({
    content:
      `<@${userId}> 님이 서버에 입장하셨습니다! 까리하게 맞이해주세요!! @here\n` +
      `> "저는 주로 '${tagText}'을 합니다!"`,
    allowedMentions: { parse: ["roles", "everyone", "users"] },
  });
}
async function sendRejectNotice(guild, userId, reasonText) {
  const ch = guild.channels.cache.get(CH_REJECT_NOTICE);
  if (!ch) return;
  await ch.send({
    content:
      `<@${userId}> 님, 죄송합니다. 내부 규정에 의거하여 서버 입장이 제한되었습니다.\n` +
      `사유: ${reasonText || "규정 미충족"}`,
    allowedMentions: { users: [userId] },
  });
}

async function createPrivateChannel(guild, member) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === chanName(member.id)
  );
  if (existing) return existing;
  const ch = await guild.channels.create({
    name: chanName(member.id),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });
  return ch;
}

async function startFlow(guild, member) {
  const userId = member.id;
  const ageDays = accountAgeDays(member.user);
  if (ageDays < 30) {
    try {
      const role = guild.roles.cache.get(ROLE_REJECTED);
      if (role) await member.roles.add(role, "계정 생성 30일 미만 자동 거절");
    } catch {}
    await sendRejectNotice(guild, userId, "디스코드 계정 생성 30일 미만");
    return;
  }

  const ch = await createPrivateChannel(guild, member);

  state.set(userId, {
    userId,
    step: 1,
    accountAge: ageDays,
    isAlt: false,
    sourceText: null,
    birthYear: null,
    nickname: null,
    gender: null,
    playStyle: null,
    gameTags: [],
    messageId: null,
    notifyRoleIds: [],
    queueMsgId: null,
  });

  const msg = await ch.send({
    content: `<@${userId}>`,
    embeds: [step1Embed(member.user)],
    components: [step1Buttons(), step1ButtonsAlt()],
    allowedMentions: { users: [userId] },
  });

  const prog0 = state.get(userId);
  prog0.messageId = msg.id;
  state.set(userId, prog0);

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 900000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== userId) {
      await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
      return;
    }
    const prog = state.get(userId);
    if (!prog) return;

    if (i.customId.startsWith("src_")) {
      const id = i.customId.slice(4);
      if (id === "sns") {
        await i.showModal(snsOrRefModal("SNS"));
        return;
      }
      if (id === "ref") {
        await i.showModal(snsOrRefModal("추천인"));
        return;
      }
      if (id === "alt") {
        await i.showModal(altModal());
        return;
      }

      prog.sourceText =
        id === "disboard" ? "디스보드" :
        id === "dicoall"  ? "디코올"   :
        id === "rejoin"   ? "재입장"   : "기타";
      prog.isAlt = false;
      prog.step = 21;

      const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step2aEmbed(prog)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("open_bio")
                .setLabel("출생년도·닉네임 입력")
                .setStyle(ButtonStyle.Primary)
            ),
            navRow(["noop_prev", "to_step2b"], {
              prev: true,
              next: !(prog.birthYear && prog.nickname),
            }),
          ],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.customId === "open_bio") {
      await i.showModal(birthNickModal());
      return;
    }

    if (i.customId === "to_step2b") {
      if (!(prog.birthYear && prog.nickname)) {
        await i.reply({
          content: "출생년도·닉네임을 먼저 입력해주세요.",
          ephemeral: true,
        });
        return;
      }
      prog.step = 22;
      const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step2bEmbed(prog)],
          components: [genderRow(prog.gender)],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.customId === "gender_m" || i.customId === "gender_f") {
      prog.gender = i.customId.endsWith("_m") ? "M" : "F";
      const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step2bEmbed(prog)],
          components: [genderRow(prog.gender)],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.customId === "to_step3a") {
      if (!prog.gender) {
        await i.reply({ content: "성별을 선택해주세요.", ephemeral: true });
        return;
      }
      prog.step = 31;
      const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step3aEmbed(prog)],
          components: [playStyleRow(prog.playStyle)],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.customId === "to_step3b") {
      if (!prog.playStyle) {
        await i.reply({ content: "플레이스타일을 먼저 선택해주세요.", ephemeral: true });
        return;
      }
      prog.step = 32;
      const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
      const { rows, pages } = gamesSelectRows(prog.gameTags);
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step3bEmbed(prog, pages)],
          components: [
            ...rows,
            navRow(["back_step3a", "go_queue"], {
              next: !(prog.gameTags && prog.gameTags.length),
            }),
          ],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.customId === "back_step3a") {
      prog.step = 31;
      const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step3aEmbed(prog)],
          components: [playStyleRow(prog.playStyle)],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.customId === "go_queue") {
      if (!(prog.gameTags && prog.gameTags.length)) {
        await i.reply({
          content: "주 게임 태그를 최소 1개 이상 선택해주세요.",
          ephemeral: true,
        });
        return;
      }
      const qch = guild.channels.cache.get(CH_APPROVAL_QUEUE);
      if (qch) {
        const qmsg = await qch.send({
          embeds: [buildQueueEmbed(guild, member, prog)],
          components: [queueButtons(prog)],
        });
        prog.queueMsgId = qmsg.id;
      }
      const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("승인 대기 중")
              .setDescription(
                [
                  "관리진 검토 후 처리됩니다. 감사합니다!",
                  "",
                  "선택 사항: **서버 알림 태그**를 설정할 수 있어요. 원치 않으면 건너뛰어도 됩니다.",
                ].join("\n")
              ),
          ],
          components: [settingsSelectRow(prog.notifyRoleIds || [])],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }
  });

  member.client.on("interactionCreate", async (mi) => {
    if (!state.has(userId)) return;
    if (!mi.isModalSubmit()) return;
    if (mi.user.id !== userId) return;

    const prog = state.get(userId);
    const chNow = guild.channels.cache.find((c) => c.name === chanName(userId));
    if (!chNow || mi.channelId !== chNow.id) return;

    if (mi.customId === "modal_SNS" || mi.customId === "modal_추천인") {
      await mi.deferUpdate().catch(() => {});
      const detail = mi.fields.getTextInputValue("detail")?.trim();
      prog.sourceText = mi.customId === "modal_SNS" ? `SNS(${detail})` : `추천인(${detail})`;
      prog.isAlt = false;
      prog.step = 21;
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step2aEmbed(prog)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("open_bio")
                .setLabel("출생년도·닉네임 입력")
                .setStyle(ButtonStyle.Primary)
            ),
            navRow(["noop_prev", "to_step2b"], {
              prev: true,
              next: !(prog.birthYear && prog.nickname),
            }),
          ],
        });
      }
      return;
    }

    if (mi.customId === "modal_alt") {
      const mainNick = mi.fields.getTextInputValue("mainNick")?.trim();
      const matched = guild.members.cache.find(
        (m) => (m.displayName || m.user.username) === mainNick
      );
      if (!matched) {
        await mi.reply({
          content: "본계정 닉네임을 찾지 못했습니다. 다시 확인해주세요.",
          ephemeral: true,
        });
        return;
      }
      await mi.deferUpdate().catch(() => {});
      prog.sourceText = `부계정(본계: ${mainNick})`;
      prog.isAlt = true;
      prog.step = 21;
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step2aEmbed(prog)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("open_bio")
                .setLabel("출생년도·닉네임 입력")
                .setStyle(ButtonStyle.Primary)
            ),
            navRow(["noop_prev", "to_step2b"], {
              prev: true,
              next: !(prog.birthYear && prog.nickname),
            }),
          ],
        });
      }
      return;
    }

    if (mi.customId === "modal_bio") {
      const birth = mi.fields.getTextInputValue("birth")?.trim();
      const nick = mi.fields.getTextInputValue("nickname")?.trim();

      const byErr = validateBirthYear(birth);
      if (byErr) {
        try {
          const role = guild.roles.cache.get(ROLE_REJECTED);
          if (role) await member.roles.add(role, "연령 기준 미충족 자동 거절");
        } catch {}
        await sendRejectNotice(guild, userId, "연령 제한으로 인함");
        const pch = guild.channels.cache.find((c) => c.name === chanName(userId));
        if (pch) {
          try {
            await pch.delete("입장 절차 자동 거절(연령)");
          } catch {}
        }
        state.delete(userId);
        try {
          await mi.reply({
            content: "죄송합니다. 연령 기준 미충족으로 입장이 거절되었습니다.",
            ephemeral: true,
          });
        } catch {}
        return;
      }

      const nErr = validateNickname(nick);
      if (nErr) {
        await mi.reply({ content: nErr, ephemeral: true });
        return;
      }

      const dup = guild.members.cache.find(
        (m) => (m.displayName || m.user.username) === nick && m.id !== userId
      );
      if (dup) {
        await mi.reply({
          content: "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.",
          ephemeral: true,
        });
        return;
      }

      await mi.deferUpdate().catch(() => {});
      prog.birthYear = Number(birth);
      prog.nickname = nick;
      prog.step = 21;

      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step2aEmbed(prog)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("open_bio")
                .setLabel("출생년도·닉네임 재입력")
                .setStyle(ButtonStyle.Secondary)
            ),
            navRow(["noop_prev", "to_step2b"], {
              prev: true,
              next: !(prog.birthYear && prog.nickname),
            }),
          ],
        });
      }
      return;
    }
  });

  member.client.on("interactionCreate", async (i) => {
    if (!(i.isButton() || i.isStringSelectMenu())) return;

    const uid = i.user?.id;
    const isQueueChannel = i.channelId === CH_APPROVAL_QUEUE;
    const privateCh = i.guild?.channels?.cache?.find(
      (c) => c.name === chanName(uid)
    );
    const isUserPrivate = !!privateCh && i.channelId === privateCh.id;

    if (
      !isUserPrivate &&
      !(
        isQueueChannel &&
        i.isButton() &&
        ["approve_", "approve_silent_", "reject_", "ban_"].some((p) =>
          i.customId.startsWith(p)
        )
      )
    ) {
      return;
    }

    const prog = state.get(uid);

    if (i.isStringSelectMenu() && i.customId.startsWith("games_select_")) {
      if (i.user.id !== uid) {
        await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      const idx = Number(i.customId.split("_").pop());
      const chunks = chunk(ALL_GAMES, 25);
      const names = chunks[idx] || [];
      const cur = new Set(prog?.gameTags || []);
      for (const n of names) cur.delete(n);
      for (const v of i.values) cur.add(v);
      prog.gameTags = Array.from(cur);
      state.set(uid, prog);
      const chNow = i.guild.channels.cache.find((c) => c.name === chanName(uid));
      const { rows, pages } = gamesSelectRows(prog.gameTags);
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step3bEmbed(prog, pages)],
          components: [
            ...rows,
            navRow(["back_step3a", "go_queue"], {
              next: !(prog.gameTags && prog.gameTags.length),
            }),
          ],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.isStringSelectMenu() && i.customId === "settings_select") {
      if (i.user.id !== uid) {
        await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      prog.notifyRoleIds = i.values || [];
      state.set(uid, prog);
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (i.isButton() && i.customId.startsWith("ps_")) {
      if (i.user.id !== uid) {
        await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      const ps = i.customId.slice(3);
      if (!PLAY_STYLES.includes(ps)) return;
      prog.playStyle = ps;
      state.set(uid, prog);
      const chNow = i.guild.channels.cache.find((c) => c.name === chanName(uid));
      const targetMsg = await chNow.messages.fetch(prog.messageId).catch(() => null);
      if (targetMsg) {
        await targetMsg.edit({
          embeds: [step3aEmbed(prog)],
          components: [playStyleRow(prog.playStyle)],
        });
      }
      await i.deferUpdate().catch(() => {});
      return;
    }

    if (
      i.isButton() &&
      ["approve_", "approve_silent_", "reject_", "ban_"].some((p) =>
        i.customId.startsWith(p)
      )
    ) {
      if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await i.reply({ content: "관리 권한이 필요합니다.", ephemeral: true });
        return;
      }

      const targetId = i.customId.split("_").pop();
      const target = await i.guild.members.fetch(targetId).catch(() => null);
      if (!target) {
        await i.reply({ content: "대상 유저를 찾을 수 없습니다.", ephemeral: true });
        return;
      }

      const progT =
        state.get(targetId) || {
          userId: targetId,
          isAlt: false,
          gameTags: [],
          notifyRoleIds: [],
        };

      if (i.customId.startsWith("ban_")) {
        await target.ban({ reason: "입장 절차 중 차단 처리" }).catch(() => {});
        await i.update({ content: `차단 처리 완료: <@${targetId}>`, components: [], embeds: [] });
        const pch2 = i.guild.channels.cache.find((c) => c.name === chanName(targetId));
        if (pch2) {
          try { await pch2.delete("승인 절차 종료(차단)"); } catch {}
        }
        if (progT.queueMsgId) {
          const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
          if (qch) { try { const m = await qch.messages.fetch(progT.queueMsgId); await m.delete(); } catch {} }
        }
        state.delete(targetId);
        return;
      }

      if (i.customId.startsWith("reject_")) {
        try {
          const role = i.guild.roles.cache.get(ROLE_REJECTED);
          if (role) await target.roles.add(role, "관리자 거절");
        } catch {}
        await sendRejectNotice(i.guild, targetId, "관리자 거절");
        await i.update({ content: `거절 처리 완료: <@${targetId}>`, components: [], embeds: [] });
        const pch2 = i.guild.channels.cache.find((c) => c.name === chanName(targetId));
        if (pch2) {
          try { await pch2.delete("승인 절차 종료(거절)"); } catch {}
        }
        if (progT.queueMsgId) {
          const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
          if (qch) { try { const m = await qch.messages.fetch(progT.queueMsgId); await m.delete(); } catch {} }
        }
        state.delete(targetId);
        return;
      }

      const silent = i.customId.startsWith("approve_silent_");

      if (progT.nickname) {
        try { await target.setNickname(progT.nickname, "입장 절차 승인 닉네임 반영"); } catch {}
      }

      try {
        const roleId = progT.isAlt ? ROLE_MEMBER_ALT : ROLE_MEMBER_NORMAL;
        const role = i.guild.roles.cache.get(roleId);
        if (role) await target.roles.add(role, "입장 승인");
      } catch {}

      if (Array.isArray(progT.notifyRoleIds) && progT.notifyRoleIds.length) {
        for (const roleId of progT.notifyRoleIds) {
          const r = i.guild.roles.cache.get(roleId);
          if (r) {
            try { await target.roles.add(r, "서버 알림 태그 선택"); } catch {}
          }
        }
      }

      const logCh = i.guild.channels.cache.get(CH_WELCOME_LOG);
      if (logCh) {
        const notifyNames = (progT.notifyRoleIds || [])
          .map((rid) => i.guild.roles.cache.get(rid)?.name)
          .filter(Boolean);
        await logCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle("입장 로그")
              .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
              .addFields(
                { name: "유저", value: `<@${targetId}> (${target.user.tag})` },
                {
                  name: "닉네임",
                  value: progT.nickname || (target.displayName || target.user.username),
                  inline: true,
                },
                { name: "출생년도", value: String(progT.birthYear || "-"), inline: true },
                {
                  name: "성별",
                  value: progT.gender === "M" ? "남자" : progT.gender === "F" ? "여자" : "-",
                  inline: true,
                },
                { name: "유입 경로", value: progT.sourceText || "-", inline: true },
                { name: "플레이스타일", value: progT.playStyle || "-", inline: true },
                {
                  name: "주 게임",
                  value: progT.gameTags?.length ? progT.gameTags.join(", ") : "-",
                  inline: false,
                },
                {
                  name: "알림 태그",
                  value: notifyNames.length ? notifyNames.join(", ") : "선택 안 함",
                  inline: false,
                }
              ),
          ],
        });
      }

      if (!silent && !progT.isAlt) {
        await sendWelcome(i.guild, targetId, progT.gameTags || []);
      }

      await i.update({
        content: `승인 처리 완료: <@${targetId}> ${silent ? "(조용히 승인)" : ""}`,
        components: [],
        embeds: [],
      });

      const pch2 = i.guild.channels.cache.find((c) => c.name === chanName(targetId));
      if (pch2) {
        try { await pch2.delete("승인 절차 종료(승인)"); } catch {}
      }
      if (progT.queueMsgId) {
        const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
        if (qch) { try { const m = await qch.messages.fetch(progT.queueMsgId); await m.delete(); } catch {} }
      }
      state.delete(targetId);
      return;
    }
  });
}

module.exports = (client) => {
  client.on("guildMemberAdd", async (member) => {
    if (!loadApprovalOn()) return;
    try {
      await member.guild.roles.fetch();
    } catch {}
    await startFlow(member.guild, member).catch(() => {});
  });

  client.on("guildMemberRemove", async (member) => {
    const guild = member.guild;

    const ch = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === chanName(member.id)
    );
    if (ch) {
      try {
        await ch.delete("유저 퇴장으로 인한 입장 절차 채널 정리");
      } catch {}
    }

    const prog = state.get(member.id);
    if (prog && prog.queueMsgId) {
      const qch = guild.channels.cache.get(CH_APPROVAL_QUEUE);
      if (qch) {
        try {
          const m = await qch.messages.fetch(prog.queueMsgId);
          await m.delete();
        } catch {}
      }
    }
    state.delete(member.id);
  });

  client.once("ready", async () => {
    try {
      for (const g of client.guilds.cache.values()) {
        await g.channels.fetch();
        const dangling = g.channels.cache.filter(
          (c) => c.type === ChannelType.GuildText && /^입장-\d+$/.test(c.name)
        );
        for (const ch of dangling.values()) {
          const uid = ch.name.split("-")[1];
          const stillHere = g.members.cache.has(uid);
          if (!stillHere) {
            try {
              await ch.delete("고아 입장 절차 채널 정리");
            } catch {}
          }
        }
      }
    } catch {}
  });
};
