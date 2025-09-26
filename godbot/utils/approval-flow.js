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

const APPROVAL_SETTINGS_PATH = path.join(__dirname, "../data/approval-settings.json");
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
let listenersBound = false;

const STATE_DIR = path.join(__dirname, "../data/approval-state");
function ensureDir() {
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch {}
}
function stateFile(uid) {
  return path.join(STATE_DIR, `${uid}.json`);
}
function saveState(uid) {
  try {
    ensureDir();
    const prog = state.get(uid);
    if (!prog) return;
    fs.writeFileSync(stateFile(uid), JSON.stringify(prog), "utf8");
  } catch {}
}
function deleteState(uid) {
  try { fs.unlinkSync(stateFile(uid)); } catch {}
}
function loadAllStates() {
  ensureDir();
  try {
    const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith(".json"));
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), "utf8"));
        if (j && j.userId) state.set(j.userId, j);
      } catch {}
    }
  } catch {}
}
function setProg(uid, updater) {
  const cur = state.get(uid) || { userId: uid, step: 0, accountAge: 0, isAlt: false, sourceText: null, birthYear: null, nickname: null, gender: null, playStyle: null, gameTags: [], messageId: null, notifyRoleIds: [], queueMsgId: null, channelId: null };
  const next = typeof updater === "function" ? updater(cur) : { ...cur, ...updater };
  state.set(uid, next);
  saveState(uid);
  return next;
}
function getProg(uid) {
  return state.get(uid) || null;
}

function currentKRYear() {
  const nowSeoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return nowSeoul.getFullYear();
}
function parseBirthYear(input) {
  if (input == null) return NaN;
  const m = String(input).match(/\d{4}/);
  return m ? Number(m[0]) : NaN;
}
function accountAgeDays(user) {
  const ms = Date.now() - user.createdTimestamp;
  return Math.floor(ms / 86400000);
}
function validateNickname(name) {
  if (!name) return "닉네임을 입력해주세요.";
  if (name.length < 1 || name.length > 10) return "닉네임은 1~10글자여야 합니다.";
  if (!/^[\p{L}\p{N}\s]+$/u.test(name)) return "특수문자 없이 한글/영문/숫자만 사용해주세요.";
  return null;
}
function getAgeRange() {
  const nowY = currentKRYear();
  return { minY: nowY - 100, maxY: nowY - 20 };
}
function isBirthYearEligible(y) {
  const year = Number(y);
  if (!Number.isInteger(year)) return false;
  const { minY, maxY } = getAgeRange();
  return year >= minY && year <= maxY;
}
function validateBirthYear(input) {
  const year = parseBirthYear(input);
  if (!Number.isInteger(year)) {
    return { ok: false, reject: false, msg: "출생년도는 4자리 숫자로 입력해주세요. 예) 2005", year: null };
  }
  const { minY, maxY } = getAgeRange();
  if (year < minY || year > maxY) {
    return { ok: false, reject: true, msg: "20세 이상만 입장 가능합니다.", year };
  }
  return { ok: true, reject: false, msg: null, year };
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice( i, i + size));
  return out;
}
function navRow(ids, disabledMap = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ids[0]).setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(!!disabledMap.prev),
    new ButtonBuilder().setCustomId(ids[1]).setLabel("➡️다음").setStyle(ButtonStyle.Primary).setDisabled(!!disabledMap.next)
  );
}
function step1Embed(user) {
  return new EmbedBuilder()
    .setColor(0x7b2ff2)
    .setTitle(`🖐️ 환영합니다! ${user.username}님`)
    .setDescription(["종합게임서버 🌟**까리한 디스코드**🌟입니다.","","🗺️ 어떤 경로로 서버에 오셨나요?"].join("\n"));
}
function step1Buttons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("src_disboard").setLabel("디스보드").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("src_dicoall").setLabel("디코올").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("src_sns").setLabel("🛜SNS").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("src_ref").setLabel("🧑추천인(지인)").setStyle(ButtonStyle.Secondary)
  );
}
function step1ButtonsAlt() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("src_rejoin").setLabel("재입장").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("src_alt").setLabel("부계정 생성").setStyle(ButtonStyle.Danger)
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
          .setLabel(kind === "SNS" ? "SNS 종류를 입력하세요 (예: 유튜브/틱톡/인스타)" : "추천인 닉네임을 입력하세요")
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
        new TextInputBuilder().setCustomId("mainNick").setLabel("본계정의 서버 닉네임을 입력하세요").setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
}
function step2aEmbed(progress) {
  const { maxY } = getAgeRange();
  return new EmbedBuilder()
    .setColor(0x2095ff)
    .setTitle("입장 절차 2-1단계")
    .setDescription([
      "아래 정보를 입력해주세요. **모든 정보는 절대 공개되지 않습니다.**",
      "",
      "• 👶 출생년도",
      "• 📛 서버에서 사용할 닉네임",
      "",
      "※ 생성된지 30일 미만 계정은 입장이 거절됩니다."
    ].join("\n"))
    .addFields({ name: "귀하의 계정이 생성된지", value: `${progress.accountAge}일`, inline: true });
}
function step2bEmbed(progress) {
  return new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle("입장 절차 2-2단계")
    .setDescription("성별을 선택해주세요.♂️♀️ **절대 공개되지 않습니다.**")
    .addFields(
      { name: "입력하신 출생년도", value: String(progress.birthYear || "-"), inline: true },
      { name: "희망하는 닉네임", value: String(progress.nickname || "-"), inline: true }
    );
}
function birthNickModal() {
  return new ModalBuilder()
    .setCustomId("modal_bio")
    .setTitle("✏️ 출생년도 & 닉네임 입력")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("birth").setLabel("출생년도 (4자리 숫자, 예: 2005)").setPlaceholder("예: 2005").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("nickname").setLabel("서버에서 사용할 닉네임 (1~10글자, 특수문자 불가)").setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
}
function genderRow(selected) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gender_m").setLabel(selected === "M" ? "✓ 남자" : "남자").setStyle(selected === "M" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gender_f").setLabel(selected === "F" ? "✓ 여자" : "여자").setStyle(selected === "F" ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("to_step3a").setLabel("➡️다음").setStyle(ButtonStyle.Primary).setDisabled(!selected)
  );
  return [row1, row2];
}
function step3aEmbed(progress) {
  return new EmbedBuilder()
    .setColor(0xf2b619)
    .setTitle("입장 절차 3-1단계")
    .setDescription("**😎 게임 스타일(플레이스타일)** 을 선택해주세요 (1개). 선택 후 다음을 눌러주세요.")
    .addFields({ name: "플레이스타일", value: progress.playStyle || "미선택", inline: true });
}
function playStyleRow(selected) {
  const row1 = new ActionRowBuilder().addComponents(
    ...PLAY_STYLES.map((ps) =>
      new ButtonBuilder()
        .setCustomId(`ps_${ps}`)
        .setLabel(selected === ps ? `✓ ${ps}` : ps)
        .setStyle(selected === ps ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("to_step3b").setLabel("➡️다음").setStyle(ButtonStyle.Primary).setDisabled(!selected)
  );
  return [row1, row2];
}
function step3bEmbed(progress, totalPages) {
  return new EmbedBuilder()
    .setColor(0xf29f05)
    .setTitle("입장 절차 3-2단계")
    .setDescription(["🎮 **주로 하시는 게임**을 모두 선택하세요.","최소 **1개 이상** 선택하면 됩니다.","게임 태그로 서버에서 소통이 가능합니다."].join("\n"))
    .addFields(
      { name: "선택한 게임", value: progress.gameTags?.length ? progress.gameTags.join(", ") : "0개 선택", inline: false },
      { name: "선택 팁", value: `총 ${totalPages}페이지 셀렉트에서 고를 수 있어요.`, inline: false }
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
    new ButtonBuilder().setCustomId(`approve_${progress.userId}`).setLabel("승인").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`approve_silent_${progress.userId}`).setLabel("조용히 승인").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`nickreq_${progress.userId}`).setLabel("닉네임 변경 요청").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`reject_${progress.userId}`).setLabel("거절").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ban_${progress.userId}`).setLabel("차단").setStyle(ButtonStyle.Danger)
  );
}
function settingsSelectRow(selectedIds = []) {
  const opts = NOTIFY_CHOICES.map((o) => ({ label: o.label, value: o.roleId, default: selectedIds.includes(o.roleId) }));
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
    content: `<@${userId}> 님이 서버에 입장하셨습니다! 까리하게 맞이해주세요!! @here\n> "저는 주로 '${tagText}'을 합니다!"`,
    allowedMentions: { parse: ["roles", "everyone", "users"] },
  });
}
async function sendRejectNotice(guild, userId, reasonText) {
  const ch = guild.channels.cache.get(CH_REJECT_NOTICE);
  if (!ch) return;
  await ch.send({
    content: `<@${userId}> 님, 죄송합니다. 내부 규정에 의거하여 서버 입장이 제한되었습니다.\n사유: ${reasonText || "규정 미충족"}`,
    allowedMentions: { users: [userId] },
  });
}
function sanitizeName(name){
  return (name || "")
    .replace(/[^ㄱ-ㅎ가-힣A-Za-z0-9-_]/g, "")
    .slice(0, 20) || "새친구";
}
function chanNameForMember(member){
  const base = sanitizeName(member.displayName || member.user.username);
  return `입장-${base}님_환영합니다`;
}
function getUserPrivateChannel(guild, uid){
  const prog = getProg(uid);
  const byId = prog?.channelId && guild.channels.cache.get(prog.channelId);
  if (byId) return byId;
  const byTopic = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === uid);
  if (byTopic) { setProg(uid, { channelId: byTopic.id }); return byTopic; }
  return null;
}
async function createPrivateChannel(guild, member) {
  const existing = getUserPrivateChannel(guild, member.id);
  if (existing) return existing;
  const ch = await guild.channels.create({
    name: chanNameForMember(member),
    type: ChannelType.GuildText,
    topic: member.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });
  return ch;
}
async function forceAutoReject(guild, userId, reason) {
  try {
    const role = guild.roles.cache.get(ROLE_REJECTED);
    if (role) await guild.members.resolve(userId)?.roles.add(role, "자동 거절");
  } catch {}
  await sendRejectNotice(guild, userId, reason || "연령 기준 미충족");
  const pch = getUserPrivateChannel(guild, userId);
  if (pch) {
    try { await pch.delete("입장 절차 자동 거절"); } catch {}
  }
  const prog = getProg(userId);
  if (prog && prog.queueMsgId) {
    const qch = guild.channels.cache.get(CH_APPROVAL_QUEUE);
    if (qch) { try { const m = await qch.messages.fetch(prog.queueMsgId); await m.delete(); } catch {} }
  }
  state.delete(userId);
  deleteState(userId);
}
function nicknameRequestEmbed(reasonText) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("닉네임 변경 요청")
    .setDescription(["입장 절차를 계속 진행하기 위해 닉네임 변경이 필요합니다.","아래 버튼을 눌러 새 닉네임을 입력해주세요."].join("\n"))
    .addFields({ name: "요청 사유", value: reasonText || "닉네임이 서버 규칙에 부적합하여 변경이 필요합니다." });
}
function nicknameRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("open_nick_change").setLabel("닉네임 재입력").setStyle(ButtonStyle.Primary)
  );
}
function rejectReasonModalCustomId(targetId) {
  return `modal_reject_${targetId}`;
}
function nickreqReasonModalCustomId(targetId) {
  return `modal_nickreq_${targetId}`;
}
function reasonModal(title, customId) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel("사유를 입력하세요 (선택)").setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder("미입력 시 기본 사유가 전송됩니다.")
      )
    );
}
function nickChangeModal() {
  return new ModalBuilder()
    .setCustomId("modal_nickchange")
    .setTitle("새 닉네임 입력")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("nickname_new").setLabel("새 닉네임 (1~10글자, 특수문자 불가)").setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
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
  const msg = await ch.send({
    content: `<@${userId}>`,
    embeds: [step1Embed(member.user)],
    components: [step1Buttons(), step1ButtonsAlt()],
    allowedMentions: { users: [userId] },
  });
  setProg(userId, {
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
    messageId: msg.id,
    notifyRoleIds: [],
    queueMsgId: null,
    channelId: ch.id,
  });
}

module.exports = (client) => {
  if (listenersBound) return;
  listenersBound = true;

  client.on("guildMemberAdd", async (member) => {
    if (!loadApprovalOn()) return;
    try { await member.guild.roles.fetch(); } catch {}
    await startFlow(member.guild, member).catch(() => {});
  });

  client.on("guildMemberRemove", async (member) => {
    const guild = member.guild;
    const ch = getUserPrivateChannel(guild, member.id);
    if (ch) { try { await ch.delete("유저 퇴장으로 인한 입장 절차 채널 정리"); } catch {} }
    const prog = getProg(member.id);
    if (prog && prog.queueMsgId) {
      const qch = guild.channels.cache.get(CH_APPROVAL_QUEUE);
      if (qch) { try { const m = await qch.messages.fetch(prog.queueMsgId); await m.delete(); } catch {} }
    }
    state.delete(member.id);
    deleteState(member.id);
  });

  client.once("ready", async () => {
    loadAllStates();
    try {
      for (const g of client.guilds.cache.values()) {
        await g.channels.fetch();
        const dangling = g.channels.cache.filter(
          (c) => c.type === ChannelType.GuildText && !!c.topic && /^\d{17,20}$/.test(c.topic)
        );
        for (const ch of dangling.values()) {
          const uid = ch.topic;
          const stillHere = g.members.cache.has(uid);
          if (!stillHere) { try { await ch.delete("고아 입장 절차 채널 정리"); } catch {} }
          else {
            const prog = getProg(uid);
            if (prog && !prog.channelId) setProg(uid, { channelId: ch.id });
          }
        }
      }
    } catch {}
  });

  client.on("interactionCreate", async (i) => {
    try {
      if (i.isModalSubmit()) {
        if (i.customId.startsWith("modal_reject_")) {
          const targetId = i.customId.split("_").pop();
          const reasonIn = i.fields.getTextInputValue("reason")?.trim();
          const finalReason = reasonIn && reasonIn.replace(/\s+/g, "") !== "" ? reasonIn : "관리자 판단에 따른 입장 거절";
          if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await i.reply({ content: "관리 권한이 필요합니다.", ephemeral: true }); return; }
          const target = await i.guild.members.fetch(targetId).catch(() => null);
          if (!target) { await i.reply({ content: "대상 유저를 찾을 수 없습니다.", ephemeral: true }); return; }
          const progT = getProg(targetId) || { userId: targetId };
          try {
            const role = i.guild.roles.cache.get(ROLE_REJECTED);
            if (role) await target.roles.add(role, "관리자 거절");
          } catch {}
          await sendRejectNotice(i.guild, targetId, finalReason);
          const pch2 = getUserPrivateChannel(i.guild, targetId);
          if (pch2) { try { await pch2.delete("승인 절차 종료(거절)"); } catch {} }
          if (progT.queueMsgId) {
            const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
            if (qch) { try { const m = await qch.messages.fetch(progT.queueMsgId); await m.delete(); } catch {} }
          }
          state.delete(targetId);
          deleteState(targetId);
          await i.reply({ content: `거절 처리 완료: <@${targetId}>\n사유: ${finalReason}`, ephemeral: true });
          return;
        }

        if (i.customId.startsWith("modal_nickreq_")) {
          const targetId = i.customId.split("_").pop();
          const reasonIn = i.fields.getTextInputValue("reason")?.trim();
          const finalReason = reasonIn && reasonIn.replace(/\s+/g, "") !== "" ? reasonIn : "닉네임이 서버 규칙에 부적합하여 변경을 요청드립니다.";
          if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await i.reply({ content: "관리 권한이 필요합니다.", ephemeral: true }); return; }
          const member = await i.guild.members.fetch(targetId).catch(() => null);
          if (!member) { await i.reply({ content: "대상 유저를 찾을 수 없습니다.", ephemeral: true }); return; }
          const pch = getUserPrivateChannel(i.guild, targetId);
          if (!pch) { await i.reply({ content: "대상 유저의 개인 입장 채널을 찾지 못했습니다.", ephemeral: true }); return; }
          await pch.send({ content: `<@${targetId}>`, embeds: [nicknameRequestEmbed(finalReason)], components: [nicknameRequestRow()], allowedMentions: { users: [targetId] } });
          await i.reply({ content: `닉네임 변경 요청 전송 완료: <@${targetId}>\n사유: ${finalReason}`, ephemeral: true });
          return;
        }

        const uid = i.user.id;
        const prog = getProg(uid);
        if (!prog) return;
        const chNow = getUserPrivateChannel(i.guild, uid);
        if (!chNow || i.channelId !== chNow.id) {
          if (i.customId === "modal_bio" || i.customId === "modal_nickchange") { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); }
          return;
        }

        if (i.customId === "modal_SNS" || i.customId === "modal_추천인") {
          await i.deferUpdate().catch(() => {});
          const detail = i.fields.getTextInputValue("detail")?.trim();
          setProg(uid, p => ({ ...p, sourceText: i.customId === "modal_SNS" ? `SNS(${detail})` : `추천인(${detail})`, isAlt: false, step: 21 }));
          const targetMsg = i.message ?? (await chNow.messages.fetch(prog.messageId).catch(() => null));
          if (targetMsg) {
            const cur = getProg(uid);
            await targetMsg.edit({
              embeds: [step2aEmbed(cur)],
              components: [
                new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)),
                navRow(["noop_prev", "to_step2b"], { prev: true, next: !(cur.birthYear && cur.nickname) }),
              ],
            });
          }
          return;
        }

        if (i.customId === "modal_alt") {
          const mainNick = i.fields.getTextInputValue("mainNick")?.trim();
          const matched = i.guild.members.cache.find((m) => (m.displayName || m.user.username) === mainNick);
          if (!matched) { await i.reply({ content: "본계정 닉네임을 찾지 못했습니다. 다시 확인해주세요.", ephemeral: true }); return; }
          await i.deferUpdate().catch(() => {});
          setProg(uid, p => ({ ...p, sourceText: `부계정(본계: ${mainNick})`, isAlt: true, step: 21 }));
          const targetMsg = i.message ?? (await chNow.messages.fetch(prog.messageId).catch(() => null));
          if (targetMsg) {
            const cur = getProg(uid);
            await targetMsg.edit({
              embeds: [step2aEmbed(cur)],
              components: [
                new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)),
                navRow(["noop_prev", "to_step2b"], { prev: true, next: !(cur.birthYear && cur.nickname) }),
              ],
            });
          }
          return;
        }

        if (i.customId === "modal_bio") {
          const birth = i.fields.getTextInputValue("birth")?.trim();
          const nick = i.fields.getTextInputValue("nickname")?.trim();

          const vr = validateBirthYear(birth);
          if (!vr.ok) {
            if (vr.reject) {
              await forceAutoReject(i.guild, uid, vr.msg);
              try { await i.reply({ content: "죄송합니다. 연령 기준 미충족으로 입장이 거절되었습니다.", ephemeral: true }); } catch {}
            } else {
              await i.reply({ content: vr.msg, ephemeral: true });
            }
            return;
          }

          const nErr = validateNickname(nick);
          if (nErr) { await i.reply({ content: nErr, ephemeral: true }); return; }

          const dup = i.guild.members.cache.find((m) => (m.displayName || m.user.username) === nick && m.id !== uid);
          if (dup) { await i.reply({ content: "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.", ephemeral: true }); return; }

          await i.deferUpdate().catch(() => {});
          setProg(uid, p => ({ ...p, birthYear: vr.year, nickname: nick, step: 21 }));

          const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
          if (targetMsg) {
            const cur = getProg(uid);
            await targetMsg.edit({
              embeds: [step2aEmbed(cur)],
              components: [
                new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 재입력").setStyle(ButtonStyle.Secondary)),
                navRow(["noop_prev", "to_step2b"], { prev: true, next: !(cur.birthYear && cur.nickname) }),
              ],
            });
          }
          return;
        }

        if (i.customId === "modal_nickchange") {
          const newNick = i.fields.getTextInputValue("nickname_new")?.trim();
          const err = validateNickname(newNick);
          if (err) { await i.reply({ content: err, ephemeral: true }); return; }
          const dup2 = i.guild.members.cache.find((m) => (m.displayName || m.user.username) === newNick && m.id !== uid);
          if (dup2) { await i.reply({ content: "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.", ephemeral: true }); return; }
          setProg(uid, { nickname: newNick });
          const progNow = getProg(uid);
          const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
          if (qch && progNow.queueMsgId) {
            try {
              const qmsg = await qch.messages.fetch(progNow.queueMsgId);
              const member = await i.guild.members.fetch(uid).catch(() => null);
              if (member) {
                await qmsg.edit({ embeds: [buildQueueEmbed(i.guild, member, progNow)], components: [queueButtons(progNow)] });
              }
            } catch {}
          }
          await i.reply({ content: `닉네임이 '${newNick}' 으로 업데이트되었습니다.`, ephemeral: true });
          return;
        }

        return;
      }

      if (!(i.isButton() || i.isStringSelectMenu())) return;

      const uid = i.user?.id;
      const isQueueChannel = i.channelId === CH_APPROVAL_QUEUE;
      const privateCh = getUserPrivateChannel(i.guild, uid);
      const isUserPrivate = !!privateCh && i.channelId === privateCh.id;

      if (!isUserPrivate && !(
        isQueueChannel &&
        i.isButton() &&
        ["approve_", "approve_silent_", "reject_", "ban_", "nickreq_"].some((p) => i.customId.startsWith(p))
      )) {
        return;
      }

      if (i.isStringSelectMenu() && i.customId.startsWith("games_select_")) {
        const prog = getProg(uid);
        if (!prog) return;
        if (i.user.id !== uid) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
        const idx = Number(i.customId.split("_").pop());
        const chunks = chunk(ALL_GAMES, 25);
        const names = chunks[idx] || [];
        const curSet = new Set(prog?.gameTags || []);
        for (const n of names) curSet.delete(n);
        for (const v of i.values) curSet.add(v);
        setProg(uid, { gameTags: Array.from(curSet) });
        const chNow = getUserPrivateChannel(i.guild, uid);
        const { rows, pages } = gamesSelectRows(getProg(uid).gameTags);
        const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
        if (targetMsg) {
          await targetMsg.edit({
            embeds: [step3bEmbed(getProg(uid), pages)],
            components: [...rows, navRow(["back_step3a", "go_queue"], { next: !(getProg(uid).gameTags && getProg(uid).gameTags.length) })],
          });
        }
        await i.deferUpdate().catch(() => {});
        return;
      }

      if (i.isStringSelectMenu() && i.customId === "settings_select") {
        const prog = getProg(uid);
        if (!prog) return;
        if (i.user.id !== uid) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
        setProg(uid, { notifyRoleIds: i.values || [] });
        await i.deferUpdate().catch(() => {});
        return;
      }

      if (i.isButton() && i.customId.startsWith("ps_")) {
        const prog = getProg(uid);
        if (!prog) return;
        if (i.user.id !== uid) { await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true }); return; }
        const ps = i.customId.slice(3);
        if (!PLAY_STYLES.includes(ps)) return;
        setProg(uid, { playStyle: ps });
        const chNow = getUserPrivateChannel(i.guild, uid);
        const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
        if (targetMsg) { await targetMsg.edit({ embeds: [step3aEmbed(getProg(uid))], components: playStyleRow(getProg(uid).playStyle) }); }
        await i.deferUpdate().catch(() => {});
        return;
      }

      if (i.isButton()) {
        const prog = getProg(uid);
        if (isUserPrivate && ["src_", "open_bio", "to_step2b", "gender_m", "gender_f", "to_step3a", "to_step3b", "back_step3a", "go_queue", "open_nick_change"].some((p) => i.customId.startsWith(p) || i.customId === p)) {
          if (!prog) return;

          if (i.customId.startsWith("src_")) {
            const id = i.customId.slice(4);
            if (id === "sns") { await i.showModal(snsOrRefModal("SNS")); return; }
            if (id === "ref") { await i.showModal(snsOrRefModal("추천인")); return; }
            if (id === "alt") { await i.showModal(altModal()); return; }
            const sourceText = id === "disboard" ? "디스보드" : id === "dicoall" ? "디코올" : id === "rejoin" ? "재입장" : "기타";
            setProg(uid, { sourceText, isAlt: false, step: 21 });
            const chNow = getUserPrivateChannel(i.guild, uid);
            const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
            if (targetMsg) {
              const cur = getProg(uid);
              await targetMsg.edit({
                embeds: [step2aEmbed(cur)],
                components: [
                  new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)),
                  navRow(["noop_prev", "to_step2b"], { prev: true, next: !(cur.birthYear && cur.nickname) }),
                ],
              });
            }
            await i.deferUpdate().catch(() => {});
            return;
          }

          if (i.customId === "open_bio") { await i.showModal(birthNickModal()); return; }

          if (i.customId === "to_step2b") {
            const cur = getProg(uid);
            if (!(cur.birthYear && cur.nickname)) {
              await i.reply({ content: "출생년도·닉네임을 먼저 입력해주세요.", ephemeral: true });
              return;
            }
            if (!isBirthYearEligible(Number(cur.birthYear))) {
              await forceAutoReject(i.guild, uid, "20세 이상만 입장 가능합니다.");
              try { await i.reply({ content: "연령 기준 미충족으로 자동 거절되었습니다.", ephemeral: true }); } catch {}
              return;
            }
            setProg(uid, { step: 22 });
            const chNow = getUserPrivateChannel(i.guild, uid);
            const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
            if (targetMsg) { await targetMsg.edit({ embeds: [step2bEmbed(getProg(uid))], components: genderRow(getProg(uid).gender) }); }
            await i.deferUpdate().catch(() => {});
            return;
          }

          if (i.customId === "gender_m" || i.customId === "gender_f") {
            setProg(uid, { gender: i.customId.endsWith("_m") ? "M" : "F" });
            const chNow = getUserPrivateChannel(i.guild, uid);
            const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
            if (targetMsg) { await targetMsg.edit({ embeds: [step2bEmbed(getProg(uid))], components: genderRow(getProg(uid).gender) }); }
            await i.deferUpdate().catch(() => {});
            return;
          }

          if (i.customId === "to_step3a") {
            if (!getProg(uid).gender) { await i.reply({ content: "성별을 선택해주세요.", ephemeral: true }); return; }
            setProg(uid, { step: 31 });
            const chNow = getUserPrivateChannel(i.guild, uid);
            const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
            if (targetMsg) { await targetMsg.edit({ embeds: [step3aEmbed(getProg(uid))], components: playStyleRow(getProg(uid).playStyle) }); }
            await i.deferUpdate().catch(() => {});
            return;
          }

          if (i.customId === "to_step3b") {
            if (!getProg(uid).playStyle) { await i.reply({ content: "플레이스타일을 먼저 선택해주세요.", ephemeral: true }); return; }
            setProg(uid, { step: 32 });
            const chNow = getUserPrivateChannel(i.guild, uid);
            const { rows, pages } = gamesSelectRows(getProg(uid).gameTags);
            const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
            if (targetMsg) {
              await targetMsg.edit({
                embeds: [step3bEmbed(getProg(uid), pages)],
                components: [...rows, navRow(["back_step3a", "go_queue"], { next: !(getProg(uid).gameTags && getProg(uid).gameTags.length) })],
              });
            }
            await i.deferUpdate().catch(() => {});
            return;
          }

          if (i.customId === "back_step3a") {
            setProg(uid, { step: 31 });
            const chNow = getUserPrivateChannel(i.guild, uid);
            const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
            if (targetMsg) { await targetMsg.edit({ embeds: [step3aEmbed(getProg(uid))], components: playStyleRow(getProg(uid).playStyle) }); }
            await i.deferUpdate().catch(() => {});
            return;
          }

          if (i.customId === "go_queue") {
            const cur = getProg(uid);
            if (!(cur.gameTags && cur.gameTags.length)) { await i.reply({ content: "주 게임 태그를 최소 1개 이상 선택해주세요.", ephemeral: true }); return; }
            if (!isBirthYearEligible(cur.birthYear)) {
              await forceAutoReject(i.guild, uid, `20세 이상만 입장 가능합니다.`);
              try { await i.reply({ content: "연령 기준 미충족으로 자동 거절되었습니다.", ephemeral: true }); } catch {}
              return;
            }
            const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
            if (qch) {
              const member = await i.guild.members.fetch(uid).catch(() => null);
              if (!member) return;
              const qmsg = await qch.send({ embeds: [buildQueueEmbed(i.guild, member, cur)], components: [queueButtons(cur)] });
              setProg(uid, { queueMsgId: qmsg.id });
            }
            const chNow = getUserPrivateChannel(i.guild, uid);
            const targetMsg = i.message ?? (await chNow.messages.fetch(getProg(uid).messageId).catch(() => null));
            if (targetMsg) {
              await targetMsg.edit({
                embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("🪑승인 대기 중").setDescription(["관리진 검토 후 처리됩니다. 감사합니다!🙇","","선택 사항: 🔔**서버 알림 태그**를 설정할 수 있어요. 원치 않으면 건너뛰어도 됩니다."].join("\n"))],
                components: [settingsSelectRow(getProg(uid).notifyRoleIds || [])],
              });
            }
            await i.deferUpdate().catch(() => {});
            return;
          }

          if (i.customId === "open_nick_change") {
            await i.showModal(nickChangeModal());
            return;
          }
        }

        if (["approve_", "approve_silent_", "reject_", "ban_", "nickreq_"].some((p) => i.customId.startsWith(p))) {
          if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) { await i.reply({ content: "관리 권한이 필요합니다.", ephemeral: true }); return; }
          const targetId = i.customId.split("_").pop();
          const target = await i.guild.members.fetch(targetId).catch(() => null);
          if (!target) { await i.reply({ content: "대상 유저를 찾을 수 없습니다.", ephemeral: true }); return; }
          const progT = getProg(targetId) || { userId: targetId, isAlt: false, gameTags: [], notifyRoleIds: [] };

          if (i.customId.startsWith("ban_")) {
            await target.ban({ reason: "입장 절차 중 차단 처리" }).catch(() => {});
            await i.update({ content: `차단 처리 완료: <@${targetId}>`, components: [], embeds: [] });
            const pch2 = getUserPrivateChannel(i.guild, targetId);
            if (pch2) { try { await pch2.delete("승인 절차 종료(차단)"); } catch {} }
            if (progT.queueMsgId) {
              const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
              if (qch) { try { const m = await qch.messages.fetch(progT.queueMsgId); await m.delete(); } catch {} }
            }
            state.delete(targetId);
            deleteState(targetId);
            return;
          }

          if (i.customId.startsWith("reject_")) {
            await i.showModal(reasonModal("거절 사유 입력(선택)", rejectReasonModalCustomId(targetId)));
            return;
          }

          if (i.customId.startsWith("nickreq_")) {
            await i.showModal(reasonModal("닉네임 변경 요청 사유(선택)", nickreqReasonModalCustomId(targetId)));
            return;
          }

          const silent = i.customId.startsWith("approve_silent_");

          if (progT.nickname) { try { await target.setNickname(progT.nickname, "입장 절차 승인 닉네임 반영"); } catch {} }
          try {
            const roleId = progT.isAlt ? ROLE_MEMBER_ALT : ROLE_MEMBER_NORMAL;
            const role = i.guild.roles.cache.get(roleId);
            if (role) await target.roles.add(role, "입장 승인");
          } catch {}

          if (Array.isArray(progT.notifyRoleIds) && progT.notifyRoleIds.length) {
            for (const roleId of progT.notifyRoleIds) {
              const r = i.guild.roles.cache.get(roleId);
              if (r) { try { await target.roles.add(r, "서버 알림 태그 선택"); } catch {} }
            }
          }

          let gameRolesAssigned = [];
          if (Array.isArray(progT.gameTags) && progT.gameTags.length) {
            const toAssign = progT.gameTags.map((name) => i.guild.roles.cache.find((r) => r.name === name)).filter(Boolean);
            if (toAssign.length) {
              try { await target.roles.add(toAssign, "입장 승인 - 선택한 게임 태그 부여"); } catch {}
              gameRolesAssigned = toAssign.map((r) => r.name);
            }
          }

          const logCh = i.guild.channels.cache.get(CH_WELCOME_LOG);
          if (logCh) {
            const notifyNames = (progT.notifyRoleIds || []).map((rid) => i.guild.roles.cache.get(rid)?.name).filter(Boolean);
            const genderText = progT.gender === "M" ? "남자" : progT.gender === "F" ? "여자" : "-";
            const ts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
            const contentLines = [
              "```ini",
              "[입장 승인 로그]",
              `시간 = ${ts}`,
              `처리자 = ${i.user.tag} (${i.user.id})`,
              `대상유저 = ${target.user.tag} (${targetId})`,
              `멘션 = <@${targetId}>`,
              `부계정여부 = ${progT.isAlt ? "부계정" : "일반"}`,
              `조용히승인 = ${silent ? "예" : "아니오"}`,
              "",
              `[프로필]`,
              `닉네임 = ${progT.nickname || (target.displayName || target.user.username)}`,
              `출생년도 = ${progT.birthYear || "-"}`,
              `성별 = ${genderText}`,
              `유입경로 = ${progT.sourceText || "-"}`,
              `플레이스타일 = ${progT.playStyle || "-"}`,
              "",
              `[게임 태그]`,
              `선택 = ${progT.gameTags?.length ? progT.gameTags.join(", ") : "-"}`,
              `부여된역할 = ${gameRolesAssigned.length ? gameRolesAssigned.join(", ") : "-"}`,
              "",
              `[알림 태그]`,
              `설정 = ${notifyNames.length ? notifyNames.join(", ") : "선택 안 함"}`,
              "```",
            ];
            await logCh.send({ content: contentLines.join("\n") });
          }

          if (!silent && !progT.isAlt) { await sendWelcome(i.guild, targetId, progT.gameTags || []); }

          await i.update({ content: `승인 처리 완료: <@${targetId}> ${silent ? "(조용히 승인)" : ""}`, components: [], embeds: [] });

          const pch2 = getUserPrivateChannel(i.guild, targetId);
          if (pch2) { try { await pch2.delete("승인 절차 종료(승인)"); } catch {} }
          if (progT.queueMsgId) {
            const qch = i.guild.channels.cache.get(CH_APPROVAL_QUEUE);
            if (qch) { try { const m = await qch.messages.fetch(progT.queueMsgId); await m.delete(); } catch {} }
          }
          state.delete(targetId);
          deleteState(targetId);
          return;
        }
      }
    } catch {}
  });
};
