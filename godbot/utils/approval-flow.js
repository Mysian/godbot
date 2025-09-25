const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const GATE_CHANNEL_ID = "1277610812977971334";
const STAFF_DECIDE_CHANNEL_ID = "1276751288117235755";
const APPROVED_LOG_CHANNEL_ID = "1240936843122573312";
const REJECTED_LOG_CHANNEL_ID = "1240936845014208614";
const SUB_ALT_ROLE_ID = "1208987442234007582";
const SERVER_NAME = "까리한 디스코드";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "approvals.json");

const selectSettings = require("../commands/select-settings.js");
const selectGame     = require("../commands/select-game.js");

function yyyymmdd(ts = Date.now()) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function loadStore() {
  try { await fsp.mkdir(DATA_DIR, { recursive: true }); } catch {}
  try { const raw = await fsp.readFile(STORE_FILE, "utf8"); return JSON.parse(raw); } catch { return { users: {} }; }
}

async function saveStore(store) {
  await fsp.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function minAllowedBirthYear() {
  const now = new Date();
  return now.getFullYear() - 20;
}

function ensureRecord(store, userId) {
  if (!store.users[userId]) store.users[userId] = { countJoinAttempts: 0, countApproved: 0, countRejected: 0, rejectedBirthYears: [], history: [] };
  return store.users[userId];
}

function makeGateEmbed() {
  return new EmbedBuilder()
    .setTitle(`🔑 ${SERVER_NAME} 서버 승인 절차`)
    .setColor(0x7b2ff2)
    .setDescription([
      "아래 버튼을 눌러 입장 절차를 시작하세요.",
      "신규/재입장/부계 여부와 기본 정보를 확인한 뒤, 관리진 승인 후 입장이 완료됩니다.",
      "모든 절차 기록은 전부 보관됩니다.",
      `현재 기준 입장 가능 출생년도: **${minAllowedBirthYear()}년 이하**`,
    ].join("\n"))
    .setFooter({ text: "모두 순둥순둥하게 즐기는 종합게임 서버 💜" });
}

function gateRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gate_start").setStyle(ButtonStyle.Success).setLabel("서버 입장하기").setEmoji("✅")
  );
}

function stepRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("step_type_new").setStyle(ButtonStyle.Primary).setLabel("신규 입장"),
    new ButtonBuilder().setCustomId("step_type_rejoin").setStyle(ButtonStyle.Secondary).setLabel("재입장"),
    new ButtonBuilder().setCustomId("step_type_alt").setStyle(ButtonStyle.Success).setLabel("부계정 생성")
  );
}

function sourceRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("src_disboard").setStyle(ButtonStyle.Primary).setLabel("디스보드"),
    new ButtonBuilder().setCustomId("src_dicoall").setStyle(ButtonStyle.Secondary).setLabel("디코올"),
    new ButtonBuilder().setCustomId("src_promo").setStyle(ButtonStyle.Secondary).setLabel("홍보글"),
    new ButtonBuilder().setCustomId("src_ref").setStyle(ButtonStyle.Success).setLabel("추천인(지인)")
  );
}

function genderRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gender_m").setStyle(ButtonStyle.Primary).setLabel("남자"),
    new ButtonBuilder().setCustomId("gender_f").setStyle(ButtonStyle.Secondary).setLabel("여자")
  );
}

function settingsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("open_select_settings").setStyle(ButtonStyle.Primary).setLabel("플레이/알림 태그 설정"),
    new ButtonBuilder().setCustomId("open_select_games").setStyle(ButtonStyle.Secondary).setLabel("게임 태그 설정")
  );
}

function decisionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("approve_user").setStyle(ButtonStyle.Success).setLabel("승인"),
    new ButtonBuilder().setCustomId("reject_user").setStyle(ButtonStyle.Danger).setLabel("거절")
  );
}

function makeSummaryEmbed(ctx) {
  const lines = [];
  lines.push(`• 유형: ${ctx.type}`);
  if (ctx.type === "부계정") {
    lines.push(`• 본계정 닉네임: ${ctx.mainNickname}`);
    lines.push(`• 본계정 출생년도 확인: ${ctx.mainBirthYear}`);
  } else {
    lines.push(`• 출생년도: ${ctx.birthYear}`);
    lines.push(`• 성별: ${ctx.gender}`);
    lines.push(`• 입장 경로: ${ctx.source}${ctx.referrer ? ` (추천인: ${ctx.referrer})` : ""}`);
  }
  lines.push(`• 희망 별명: ${ctx.nickname || "-"}`);
  if (ctx.tagsDone) lines.push("• 태그 설정: 완료");
  return new EmbedBuilder()
    .setTitle("📝 승인 심사 요청")
    .setColor(0xf2b619)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `유저: ${ctx.member.user.tag} (${ctx.member.id})` });
}

function makeDecisionLogEmbed(ctx, decision, reason = null) {
  const e = new EmbedBuilder()
    .setTitle(decision === "APPROVED" ? "✅ 승인 완료" : "❌ 승인 거절")
    .setColor(decision === "APPROVED" ? 0x2ecc71 : 0xe74c3c)
    .setDescription([
      `• 유저: <@${ctx.member.id}> (${ctx.member.user.tag})`,
      `• 유형: ${ctx.type}`,
      ctx.type === "부계정"
        ? `• 본계정: ${ctx.mainNickname} / 출생년도: ${ctx.mainBirthYear}`
        : `• 출생년도: ${ctx.birthYear} / 성별: ${ctx.gender} / 경로: ${ctx.source}${ctx.referrer ? ` / 추천인: ${ctx.referrer}` : ""}`,
      `• 별명: ${ctx.nickname || "-"}`,
      reason ? `• 사유: ${reason}` : null
    ].filter(Boolean).join("\n"));
  return e;
}

async function postGateIfMissing(guild) {
  try {
    const ch = await guild.channels.fetch(GATE_CHANNEL_ID).catch(() => null);
    if (!ch) return;
    const last = await ch.messages.fetch({ limit: 10 }).catch(() => null);
    const exists = last?.some(m => m.author?.bot && m.components?.[0]?.components?.[0]?.customId === "gate_start");
    if (!exists) await ch.send({ embeds: [makeGateEmbed()], components: [gateRow()] });
  } catch {}
}

async function openBirthModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("modal_birth")
    .setTitle("출생년도 입력");
  const input = new TextInputBuilder()
    .setCustomId("birth")
    .setLabel("출생년도 (예: 2005)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function openNicknameModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("modal_nick")
    .setTitle("서버 별명 입력");
  const input = new TextInputBuilder()
    .setCustomId("nick")
    .setLabel("서버에서 사용할 별명")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function openRefModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("modal_ref")
    .setTitle("추천인 닉네임 입력");
  const input = new TextInputBuilder()
    .setCustomId("ref")
    .setLabel("추천인 닉네임")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function openMainAltModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("modal_alt")
    .setTitle("부계정 생성");
  const t1 = new TextInputBuilder().setCustomId("mainNick").setLabel("본계정 닉네임").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32);
  const t2 = new TextInputBuilder().setCustomId("mainBirth").setLabel("본계정 출생년도 (예: 2005)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4);
  modal.addComponents(new ActionRowBuilder().addComponents(t1), new ActionRowBuilder().addComponents(t2));
  await interaction.showModal(modal);
}

async function createPrivateChannel(guild, user) {
  const name = `입장-${user.username}-${user.id.slice(-4)}`;
  const everyone = guild.roles.everyone.id;
  const ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
    ]
  });
  return ch;
}

async function postStepIntro(ch, member, recordSummary) {
  const s = new EmbedBuilder()
    .setTitle(`👋 ${member.displayName}님, 환영합니다!`)
    .setColor(0x2095ff)
    .setDescription([
      "아래에서 유형을 선택해 주세요.",
      recordSummary ? recordSummary : null
    ].filter(Boolean).join("\n"));
  await ch.send({ embeds: [s], components: [stepRow()] });
}

function buildRecordSummary(rec) {
  const parts = [];
  parts.push(`• 누적 시도: ${rec.countJoinAttempts}회`);
  parts.push(`• 승인: ${rec.countApproved}회, 거절: ${rec.countRejected}회`);
  if (rec.rejectedBirthYears?.length) parts.push(`• 출생년도 오입력 거절 이력: ${rec.rejectedBirthYears.join(", ")}`);
  return parts.join("\n");
}

async function ensureNicknameUnique(guild, nickname) {
  const members = await guild.members.fetch();
  const exists = members.find(m => (m.nickname || m.user.username).toLowerCase() === nickname.toLowerCase());
  return !exists;
}

async function runSelectSettings(i) {
  try { await selectSettings.execute(i); } catch { await i.reply({ content: "설정 UI를 여는 중 오류가 발생했습니다.", ephemeral: true }); }
}

async function runSelectGames(i) {
  try { await selectGame.execute(i); } catch { await i.reply({ content: "게임 태그 UI를 여는 중 오류가 발생했습니다.", ephemeral: true }); }
}

async function sendDecisionCard(guild, ctx) {
  const staffCh = await guild.channels.fetch(STAFF_DECIDE_CHANNEL_ID).catch(() => null);
  if (!staffCh) return null;
  const rec = ctx.recordSummaryText;
  const head = new EmbedBuilder().setTitle("📮 승인 요청 도착").setColor(0x7b2ff2).setDescription([
    `• 대상: <@${ctx.member.id}> (${ctx.member.user.tag})`,
    rec ? `• 기록\n${rec}` : null
  ].filter(Boolean).join("\n"));
  const msg = await staffCh.send({ embeds: [head, makeSummaryEmbed(ctx)], components: [decisionRow()] });
  return msg.id;
}

async function logApproved(guild, ctx, reason = null) {
  const ch = await guild.channels.fetch(APPROVED_LOG_CHANNEL_ID).catch(() => null);
  if (!ch) return;
  await ch.send({ embeds: [makeDecisionLogEmbed(ctx, "APPROVED", reason)] });
}

async function logRejected(guild, ctx, reason = null) {
  const ch = await guild.channels.fetch(REJECTED_LOG_CHANNEL_ID).catch(() => null);
  if (!ch) return;
  await ch.send({ embeds: [makeDecisionLogEmbed(ctx, "REJECTED", reason)] });
}

function ctxKeyFromMessage(messageId) {
  return `ctx_${messageId}`;
}

const ephemeralCtx = new Map();

async function beginFlow(client, interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const ch = await createPrivateChannel(guild, user);
  const store = await loadStore();
  const rec = ensureRecord(store, user.id);
  rec.countJoinAttempts += 1;
  await saveStore(store);
  await ch.send({ content: `<@${user.id}>` });
  await postStepIntro(ch, await guild.members.fetch(user.id), buildRecordSummary(rec));
  return ch;
}

async function handleAltFinalize(client, i, values) {
  const guild = i.guild;
  const member = await guild.members.fetch(i.user.id);
  const mainNickname = values.mainNick.trim();
  const mainBirthYear = parseInt(values.mainBirth, 10);
  if (!/^\d{4}$/.test(String(mainBirthYear))) {
    await i.reply({ content: "출생년도 형식이 올바르지 않습니다.", ephemeral: true });
    return;
  }
  const minY = minAllowedBirthYear();
  const ok = mainBirthYear <= minY;
  const ctx = { type: "부계정", mainNickname, mainBirthYear, member, nickname: `${member.displayName || member.user.username}[부계]` };
  if (!ok) {
    const store = await loadStore();
    const rec = ensureRecord(store, member.id);
    rec.countRejected += 1;
    rec.rejectedBirthYears.push(mainBirthYear);
    rec.history.push({ at: Date.now(), type: "ALT_REJECT", year: mainBirthYear });
    await saveStore(store);
    await logRejected(guild, ctx, `본계정 출생년도 기준 미달 (최소 ${minY})`);
    await i.reply({ content: `부계정 생성 거절: 본계정 출생년도 기준 미달 (최소 ${minY})`, ephemeral: true });
    return;
  }
  try {
    await member.roles.add(SUB_ALT_ROLE_ID).catch(() => {});
    const wantNick = `${mainNickname}[부계]`;
    const usable = await ensureNicknameUnique(guild, wantNick);
    const finalNick = usable ? wantNick : `${member.displayName || member.user.username}[부계]`;
    await member.setNickname(finalNick).catch(() => {});
  } catch {}
  const store = await loadStore();
  const rec = ensureRecord(store, member.id);
  rec.countApproved += 1;
  rec.history.push({ at: Date.now(), type: "ALT_APPROVE", mainNickname, mainBirthYear });
  await saveStore(store);
  await logApproved(guild, ctx, "부계정 자동 승인");
  await i.reply({ content: "부계정 생성이 완료되었습니다. 즐거운 활동 되세요!", ephemeral: true });
  try { await i.channel.delete().catch(()=>{}); } catch {}
}

async function handleNewRejoinFlowMessage(channel, text) {
  await channel.send({ embeds: [new EmbedBuilder().setTitle("다음 단계로 진행해 주세요").setDescription(text).setColor(0x95a5a6)] });
}

async function handleDecision(interaction, decision) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "승인/거절 권한이 없습니다.", ephemeral: true });
    return;
  }
  const messageId = interaction.message.id;
  const key = ctxKeyFromMessage(messageId);
  const ctx = ephemeralCtx.get(key);
  if (!ctx) { await interaction.reply({ content: "컨텍스트가 만료되었습니다.", ephemeral: true }); return; }
  const guild = interaction.guild;
  const targetMember = ctx.member;
  if (decision === "APPROVE") {
    const store = await loadStore();
    const rec = ensureRecord(store, targetMember.id);
    rec.countApproved += 1;
    rec.history.push({ at: Date.now(), type: "APPROVED", payload: ctx });
    await saveStore(store);
    if (ctx.nickname) {
      const ok = await ensureNicknameUnique(guild, ctx.nickname);
      if (ok) { try { await targetMember.setNickname(ctx.nickname); } catch {} }
    }
    await logApproved(guild, ctx);
    await interaction.update({ content: "승인 완료", components: [] });
    try { await ctx.channel.send({ content: "승인되었습니다! 즐거운 시간 보내세요 🎉" }); } catch {}
    try { await ctx.channel.delete().catch(()=>{}); } catch {}
  } else {
    const store = await loadStore();
    const rec = ensureRecord(store, targetMember.id);
    rec.countRejected += 1;
    if (ctx.birthYear && ctx.birthRejectedImmediate) rec.rejectedBirthYears.push(ctx.birthYear);
    rec.history.push({ at: Date.now(), type: "REJECTED", payload: ctx });
    await saveStore(store);
    await logRejected(guild, ctx, "관리진 거절");
    await interaction.update({ content: "거절 처리 완료", components: [] });
    try { await ctx.channel.send({ content: "거절되었습니다. 문의는 운영진에게 부탁드립니다." }); } catch {}
    try { await ctx.channel.delete().catch(()=>{}); } catch {}
  }
  ephemeralCtx.delete(key);
}

async function handleBirthValidation(i, yearStr) {
  const y = parseInt(yearStr, 10);
  const minY = minAllowedBirthYear();
  if (!/^\d{4}$/.test(String(y))) return { ok: false, reason: "출생년도 형식이 올바르지 않습니다." };
  if (y > minY) return { ok: false, reason: `출생년도 기준 미달 (최소 ${minY})` };
  return { ok: true, year: y };
}

async function collectFlow(client) {
  client.on("interactionCreate", async i => {
    if (!i.inCachedGuild()) return;

    if (i.isButton() && i.customId === "gate_start") {
      await i.deferReply({ ephemeral: true });
      const ch = await beginFlow(client, i);
      await i.editReply({ content: `전용 채널을 열었습니다: <#${ch.id}>`, ephemeral: true });
      return;
    }

    if (i.isButton() && (i.customId === "step_type_new" || i.customId === "step_type_rejoin" || i.customId === "step_type_alt")) {
      const ch = i.channel;
      const isPrivate = ch && ch.type === ChannelType.GuildText;
      if (!isPrivate) { await i.reply({ content: "전용 채널에서만 진행할 수 있습니다.", ephemeral: true }); return; }
      if (i.customId === "step_type_alt") {
        await i.deferReply({ ephemeral: true });
        await i.editReply({ content: "부계정 생성 모달을 열었습니다.", ephemeral: true });
        await openMainAltModal(i);
        return;
      } else {
        await i.reply({ content: `${i.customId === "step_type_new" ? "신규" : "재입장"} 절차를 시작합니다.` });
        await handleNewRejoinFlowMessage(ch, "출생년도를 입력해 주세요.");
        await openBirthModal(i);
        return;
      }
    }

    if (i.isModalSubmit() && i.customId === "modal_alt") {
      const mainNick = i.fields.getTextInputValue("mainNick");
      const mainBirth = i.fields.getTextInputValue("mainBirth");
      await handleAltFinalize(client, i, { mainNick, mainBirth });
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_birth") {
      const v = i.fields.getTextInputValue("birth");
      const res = await handleBirthValidation(i, v);
      if (!res.ok) {
        const store = await loadStore();
        const rec = ensureRecord(store, i.user.id);
        rec.countRejected += 1;
        if (/^\d{4}$/.test(String(v))) rec.rejectedBirthYears.push(parseInt(v, 10));
        rec.history.push({ at: Date.now(), type: "BIRTH_REJECT", year: v });
        await saveStore(store);
        const guild = i.guild;
        const member = await guild.members.fetch(i.user.id);
        const ctx = { type: "신규/재입장", birthYear: /^\d{4}$/.test(String(v)) ? parseInt(v, 10) : null, birthRejectedImmediate: true, member, channel: i.channel };
        await logRejected(guild, ctx, res.reason);
        await i.reply({ content: `승인 거절: ${res.reason}`, ephemeral: true });
        try { await i.channel.delete().catch(()=>{}); } catch {}
        return;
      }
      const guild = i.guild;
      const member = await guild.members.fetch(i.user.id);
      await i.reply({ content: `출생년도 확인 완료: ${res.year}` });
      await i.channel.send({ embeds: [new EmbedBuilder().setTitle("성별 선택").setDescription("성별을 선택해 주세요.").setColor(0x9b59b6)], components: [genderRow()] });
      i.channel.__flow = i.channel.__flow || {};
      i.channel.__flow[i.user.id] = { type: "신규/재입장", birthYear: res.year, member, channel: i.channel };
      return;
    }

    if (i.isButton() && (i.customId === "gender_m" || i.customId === "gender_f")) {
      const f = i.channel.__flow?.[i.user.id];
      if (!f) { await i.reply({ content: "먼저 출생년도를 입력해 주세요.", ephemeral: true }); return; }
      f.gender = i.customId === "gender_m" ? "남자" : "여자";
      await i.reply({ content: `성별: ${f.gender}` });
      await i.channel.send({ embeds: [new EmbedBuilder().setTitle("입장 경로").setDescription("아래에서 입장 경로를 선택해 주세요.").setColor(0x3498db)], components: [sourceRow()] });
      return;
    }

    if (i.isButton() && (i.customId.startsWith("src_"))) {
      const f = i.channel.__flow?.[i.user.id];
      if (!f) { await i.reply({ content: "먼저 출생년도와 성별을 입력해 주세요.", ephemeral: true }); return; }
      const map = { src_disboard: "디스보드", src_dicoall: "디코올", src_promo: "홍보글", src_ref: "추천인(지인)" };
      f.source = map[i.customId] || "기타";
      if (i.customId === "src_ref") {
        await i.reply({ content: "추천인 닉네임을 입력해 주세요." });
        await openRefModal(i);
      } else {
        await i.reply({ content: `입장 경로: ${f.source}` });
        await i.channel.send({ embeds: [new EmbedBuilder().setTitle("태그 설정").setDescription("아래 버튼으로 태그 설정을 완료해 주세요.").setColor(0x2ecc71)], components: [settingsRow()] });
      }
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_ref") {
      const f = i.channel.__flow?.[i.user.id];
      if (!f) { await i.reply({ content: "세션 정보가 없습니다.", ephemeral: true }); return; }
      f.referrer = i.fields.getTextInputValue("ref").trim();
      await i.reply({ content: `추천인: ${f.referrer}` });
      await i.channel.send({ embeds: [new EmbedBuilder().setTitle("태그 설정").setDescription("아래 버튼으로 태그 설정을 완료해 주세요.").setColor(0x2ecc71)], components: [settingsRow()] });
      return;
    }

    if (i.isButton() && i.customId === "open_select_settings") {
      await runSelectSettings(i);
      return;
    }

    if (i.isButton() && i.customId === "open_select_games") {
      await runSelectGames(i);
      await i.channel.send({ content: "설정이 끝났다면 별명을 입력해 주세요." });
      await openNicknameModal(i);
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_nick") {
      const f = i.channel.__flow?.[i.user.id];
      if (!f) { await i.reply({ content: "세션 정보가 없습니다.", ephemeral: true }); return; }
      const want = i.fields.getTextInputValue("nick").trim();
      const unique = await ensureNicknameUnique(i.guild, want);
      if (!unique) {
        await i.reply({ content: "이미 사용 중인 별명입니다. 다른 별명을 입력해 주세요.", ephemeral: true });
        await openNicknameModal(i);
        return;
      }
      f.nickname = want;
      f.tagsDone = true;
      await i.reply({ content: `별명 설정: ${want}` });
      const recStore = await loadStore();
      const rec = ensureRecord(recStore, i.user.id);
      const recordSummaryText = buildRecordSummary(rec);
      f.recordSummaryText = recordSummaryText;
      const msgId = await sendDecisionCard(i.guild, f);
      if (msgId) {
        const key = ctxKeyFromMessage(msgId);
        ephemeralCtx.set(key, f);
      }
      await i.channel.send({ embeds: [new EmbedBuilder().setTitle("대기 안내").setDescription("관리진의 승인을 기다려 주세요.").setColor(0x95a5a6)] });
      return;
    }

    if (i.isButton() && (i.customId === "approve_user" || i.customId === "reject_user")) {
      await handleDecision(i, i.customId === "approve_user" ? "APPROVE" : "REJECT");
      return;
    }
  });
}

function initApprovalSystem(client) {
  client.once("ready", async () => {
    for (const [, g] of client.guilds.cache) {
      await postGateIfMissing(g).catch(()=>{});
    }
  });

  collectFlow(client);

  client.on("guildCreate", async g => {
    await postGateIfMissing(g).catch(()=>{});
  });
}

module.exports = { initApprovalSystem };
