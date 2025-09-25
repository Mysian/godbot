const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ComponentType } = require("discord.js");
const fsp = require("fs/promises");
const path = require("path");

const GATE_CHANNEL_ID = "1277610812977971334";
const STAFF_DECIDE_CHANNEL_ID = "1276751288117235755";
const APPROVED_LOG_CHANNEL_ID = "1240936843122573312";
const REJECTED_LOG_CHANNEL_ID = "1240936845014208614";
const SUB_ALT_ROLE_ID = "1208987442234007582";
const APPROVED_ROLE_ID = "285645561582059520";
const SERVER_NAME = "까리한 디스코드";
const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "approvals.json");

const SERVER_TAGS = [
  { label: "친목", value: "친목" },
  { label: "랭크", value: "랭크" },
  { label: "클랜", value: "클랜" },
  { label: "자유게시판", value: "자유게시판" },
  { label: "보이스 활성", value: "보이스" },
  { label: "이벤트 잦음", value: "이벤트" },
  { label: "엄격한 운영", value: "엄격" },
  { label: "초보 환영", value: "초보" },
  { label: "공략 공유", value: "공략" },
  { label: "매칭 도움", value: "매칭" }
];

const GAME_TAGS = [
  { label: "LOL", value: "LOL" },
  { label: "발로란트", value: "발로란트" },
  { label: "오버워치", value: "오버워치" },
  { label: "FC온라인", value: "FC온라인" },
  { label: "서든/카스", value: "FPS" },
  { label: "마인크래프트", value: "마인크래프트" },
  { label: "메이플", value: "메이플" },
  { label: "로블록스", value: "로블록스" },
  { label: "배그", value: "배그" },
  { label: "기타 인디", value: "인디" }
];

async function loadStore() { try { await fsp.mkdir(DATA_DIR, { recursive: true }); } catch {} try { const raw = await fsp.readFile(STORE_FILE, "utf8"); return JSON.parse(raw); } catch { return { users: {}, messages: {} }; } }
async function saveStore(store) { await fsp.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8"); }
function minAllowedBirthYear() { const now = new Date(); return now.getFullYear() - 20; }
function ensureRecord(store, uid) { if (!store.users[uid]) store.users[uid] = { status: null, countJoinAttempts: 0, countApproved: 0, countRejected: 0, rejectedBirthYears: [], history: [], activeChannelId: null, flow: null, pendingDecisionMessageId: null, wizardMsgId: null, wizardStage: null, locked: false }; return store.users[uid]; }

function gateEmbed() {
  return new EmbedBuilder()
    .setColor(0x8a2be2)
    .setAuthor({ name: SERVER_NAME, iconURL: "https://cdn.discordapp.com/embed/avatars/2.png" })
    .setTitle("✨ 첫인상은 중요해! 입장 절차 시작")
    .setDescription(["버튼을 눌러 전용 채널에서 단계를 진행해줘.","모든 단계는 하나의 임베드에서 순서대로 진행돼.","관리진 승인까지 완료되면 자동 입장 처리돼."].join("\n"))
    .addFields({ name: "입장 기준", value: `출생년도 ${minAllowedBirthYear()}년 이하`, inline: true }, { name: "소요", value: "1~2분", inline: true })
    .setFooter({ text: "안전하고 깔끔한 커뮤니티를 위해, 조금만 협조해줘!" });
}
function gateRow() { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gate_start").setStyle(ButtonStyle.Success).setLabel("서버 입장하기").setEmoji("🚀")); }
async function postGateIfMissing(guild) { try { const ch = await guild.channels.fetch(GATE_CHANNEL_ID).catch(() => null); if (!ch) return; const msgs = await ch.messages.fetch({ limit: 10 }).catch(() => null); const exists = msgs?.some(m => m.author?.bot && m.components?.[0]?.components?.[0]?.customId === "gate_start"); if (!exists) await ch.send({ embeds: [gateEmbed()], components: [gateRow()] }); } catch {} }

function progressBar(done, total) {
  const len = 14;
  const filled = Math.max(0, Math.min(len, Math.round((done / total) * len)));
  const bar = "■".repeat(filled) + "□".repeat(len - filled);
  return `진행도 ${bar} ${done}/${total}`;
}

function wizardTitle(stage) {
  const map = {
    type: "유형 선택",
    birth: "출생년도",
    gender: "성별",
    source: "유입 경로",
    tags_settings: "서버 태그 선택",
    tags_games: "게임 태그 선택",
    nick: "별명 설정",
    wait: "승인 대기"
  };
  return map[stage] || "입장 절차";
}

function wizardStepIndex(stage) {
  const order = ["type", "birth", "gender", "source", "tags_settings", "tags_games", "nick", "wait"];
  return Math.max(1, order.indexOf(stage) + 1);
}

function embedWizard(user, flow, stage) {
  const total = 8;
  const done = Math.min(total, wizardStepIndex(stage));
  return new EmbedBuilder()
    .setColor(stage === "wait" ? 0x2ecc71 : 0x2095ff)
    .setAuthor({ name: `${SERVER_NAME} 승인 절차`, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setTitle(`🧭 ${wizardTitle(stage)}`)
    .setDescription(progressBar(done - (stage === "wait" ? 1 : 0), total - 1))
    .addFields(
      { name: "① 유형", value: flow?.type ? `✔ ${flow.type}` : "선택 필요", inline: true },
      { name: "② 출생년도", value: flow?.birthYear ? `✔ ${flow.birthYear}` : "입력 필요", inline: true },
      { name: "③ 성별", value: flow?.gender ? `✔ ${flow.gender}` : "선택 필요", inline: true },
      { name: "④ 경로", value: flow?.source ? `✔ ${flow.source}${flow?.referrer ? ` / ${flow.referrer}` : ""}` : "선택 필요", inline: true },
      { name: "⑤ 서버 태그", value: (flow?.serverTags?.length ? `✔ ${flow.serverTags.join(", ")}` : "최소 2개 선택"), inline: true },
      { name: "⑥ 게임 태그", value: (flow?.gameTags?.length ? `✔ ${flow.gameTags.join(", ")}` : "최소 2개 선택"), inline: true },
      { name: "⑦ 별명", value: flow?.nickname ? `✔ ${flow.nickname}` : "입력 필요", inline: true }
    )
    .setFooter({ text: stage === "wait" ? "관리진이 승인 중이야. 잠시만!" : "모든 단계는 이 메시지 하나에서 계속 진행돼." });
}

function rowType() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("type_new").setStyle(ButtonStyle.Primary).setLabel("신규").setEmoji("🆕"),
    new ButtonBuilder().setCustomId("type_rejoin").setStyle(ButtonStyle.Secondary).setLabel("재입장").setEmoji("🔁"),
    new ButtonBuilder().setCustomId("type_alt").setStyle(ButtonStyle.Success).setLabel("부계정").setEmoji("🧩")
  );
}
function rowGender() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gender_m").setStyle(ButtonStyle.Primary).setLabel("남자").setEmoji("👦"),
    new ButtonBuilder().setCustomId("gender_f").setStyle(ButtonStyle.Secondary).setLabel("여자").setEmoji("👧")
  );
}
function rowSource() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("src_disboard").setStyle(ButtonStyle.Primary).setLabel("디스보드").setEmoji("🪪"),
    new ButtonBuilder().setCustomId("src_dicoall").setStyle(ButtonStyle.Secondary).setLabel("디코올").setEmoji("🧭"),
    new ButtonBuilder().setCustomId("src_promo").setStyle(ButtonStyle.Secondary).setLabel("홍보글").setEmoji("📣"),
    new ButtonBuilder().setCustomId("src_ref").setStyle(ButtonStyle.Success).setLabel("추천인").setEmoji("🤝")
  );
}
function rowNick() { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_nick").setStyle(ButtonStyle.Primary).setLabel("별명 입력").setEmoji("✍️")); }

function rowServerTags(flow) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sel_server_tags")
    .setPlaceholder("서버 태그를 선택해줘 (최소 2개, 최대 5개)")
    .setMinValues(2)
    .setMaxValues(5)
    .addOptions(SERVER_TAGS.map(o => ({ label: o.label, value: o.value, emoji: "🏷️" })));
  const doneBtn = new ButtonBuilder().setCustomId("done_server_tags").setStyle(flow?.serverTags?.length >= 2 ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(flow?.serverTags?.length >= 2 ? "서버 태그 완료" : "선택 후 완료").setEmoji("✅").setDisabled(!(flow?.serverTags?.length >= 2));
  return [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(doneBtn)];
}

function rowGameTags(flow) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sel_game_tags")
    .setPlaceholder("게임 태그를 선택해줘 (최소 2개, 최대 5개)")
    .setMinValues(2)
    .setMaxValues(5)
    .addOptions(GAME_TAGS.map(o => ({ label: o.label, value: o.value, emoji: "🎮" })));
  const doneBtn = new ButtonBuilder().setCustomId("done_game_tags").setStyle(flow?.gameTags?.length >= 2 ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(flow?.gameTags?.length >= 2 ? "게임 태그 완료" : "선택 후 완료").setEmoji("✅").setDisabled(!(flow?.gameTags?.length >= 2));
  return [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(doneBtn)];
}

function rowDecision(ctxId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_user:${ctxId}`).setStyle(ButtonStyle.Success).setLabel("승인").setEmoji("🟢"),
    new ButtonBuilder().setCustomId(`approve_silent:${ctxId}`).setStyle(ButtonStyle.Primary).setLabel("조용히 승인").setEmoji("🔵"),
    new ButtonBuilder().setCustomId(`reject_user:${ctxId}`).setStyle(ButtonStyle.Danger).setLabel("거절").setEmoji("🔴")
  );
}

function buildSummaryEmbed(ctx) {
  return new EmbedBuilder()
    .setColor(0xf2b619)
    .setTitle("📝 승인 심사 요청")
    .setThumbnail(ctx.member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "유저", value: `<@${ctx.member.id}> (${ctx.member.user.tag})`, inline: false },
      { name: "유형", value: ctx.type, inline: true },
      { name: "출생년도", value: ctx.type === "부계정" ? String(ctx.mainBirthYear) : String(ctx.birthYear), inline: true },
      { name: "성별", value: ctx.type === "부계정" ? "-" : (ctx.gender || "-"), inline: true },
      { name: "경로", value: ctx.type === "부계정" ? `본계정: ${ctx.mainNickname}` : `${ctx.source || "-"}${ctx.referrer ? ` / ${ctx.referrer}` : ""}`, inline: false },
      { name: "서버 태그", value: ctx.serverTags?.length ? ctx.serverTags.join(", ") : "-", inline: false },
      { name: "게임 태그", value: ctx.gameTags?.length ? ctx.gameTags.join(", ") : "-", inline: false },
      { name: "희망 별명", value: ctx.nickname || "-", inline: false }
    );
}

function decisionLogEmbed(ctx, approved, reason) {
  return new EmbedBuilder()
    .setColor(approved ? 0x2ecc71 : 0xe74c3c)
    .setTitle(approved ? "✅ 승인" : "❌ 거절")
    .setThumbnail(ctx.member.user.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `• 유저: <@${ctx.member.id}> (${ctx.member.user.tag})`,
        `• 유형: ${ctx.type}`,
        ctx.type === "부계정"
          ? `• 본계정: ${ctx.mainNickname} / 출생년도: ${ctx.mainBirthYear}`
          : `• 출생년도: ${ctx.birthYear} / 성별: ${ctx.gender} / 경로: ${ctx.source}${ctx.referrer ? ` / ${ctx.referrer}` : ""}`,
        `• 서버 태그: ${ctx.serverTags?.length ? ctx.serverTags.join(", ") : "-"}`,
        `• 게임 태그: ${ctx.gameTags?.length ? ctx.gameTags.join(", ") : "-"}`,
        `• 별명: ${ctx.nickname || "-"}`,
        reason ? `• 비고: ${reason}` : null
      ].filter(Boolean).join("\n")
    );
}

async function logApproved(guild, ctx, reason) { const ch = await guild.channels.fetch(APPROVED_LOG_CHANNEL_ID).catch(() => null); if (ch) await ch.send({ embeds: [decisionLogEmbed(ctx, true, reason || null)] }); }
async function logRejected(guild, ctx, reason) { const ch = await guild.channels.fetch(REJECTED_LOG_CHANNEL_ID).catch(() => null); if (ch) await ch.send({ embeds: [decisionLogEmbed(ctx, false, reason || null)] }); }

async function getOrCreatePrivateChannel(guild, user) {
  const store = await loadStore();
  const rec = ensureRecord(store, user.id);
  if (rec.activeChannelId) { const exist = await guild.channels.fetch(rec.activeChannelId).catch(() => null); if (exist) return exist; }
  const ch = await guild.channels.create({
    name: `입장-${user.username}-${user.id.slice(-4)}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
    ]
  });
  rec.activeChannelId = ch.id;
  rec.flow = null;
  rec.wizardMsgId = null;
  rec.wizardStage = null;
  await saveStore(store);
  return ch;
}

function buildStageComponents(stage, flow) {
  if (stage === "type") return [rowType()];
  if (stage === "birth") return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_birth").setStyle(ButtonStyle.Primary).setLabel("출생년도 입력").setEmoji("📅"))];
  if (stage === "gender") return [rowGender()];
  if (stage === "source") return [rowSource()];
  if (stage === "tags_settings") { const rows = rowServerTags(flow); return rows; }
  if (stage === "tags_games") { const rows = rowGameTags(flow); return rows; }
  if (stage === "nick") return [rowNick()];
  return [];
}

async function forceRenderWizard(ch, member, flow, stage) {
  const payload = { embeds: [embedWizard(member.user, flow || {}, stage)], components: buildStageComponents(stage, flow || {}) };
  const store = await loadStore();
  const rec = ensureRecord(store, member.id);
  let msg = null;
  if (rec.wizardMsgId) {
    msg = await ch.messages.fetch(rec.wizardMsgId).catch(() => null);
    if (msg) { await msg.edit(payload).catch(() => {}); return rec.wizardMsgId; }
  }
  msg = await ch.send(payload).catch(async () => null);
  if (!msg) { await ch.send("입장 절차를 표시할 수 없습니다. 운영진에게 문의해주세요."); return null; }
  rec.wizardMsgId = msg.id;
  await saveStore(store);
  return msg.id;
}

async function setStage(member, stage) {
  const store = await loadStore();
  const rec = ensureRecord(store, member.id);
  rec.wizardStage = stage;
  await saveStore(store);
  const ch = await member.guild.channels.fetch(rec.activeChannelId).catch(() => null);
  if (ch) await forceRenderWizard(ch, member, rec.flow || {}, stage);
}

async function beginFlow(i) {
  const store = await loadStore();
  const rec = ensureRecord(store, i.user.id);
  if (rec.locked && rec.activeChannelId) { await i.editReply({ content: `이미 진행 중이야: <#${rec.activeChannelId}>`, ephemeral: true }); return null; }
  rec.locked = true;
  await saveStore(store);
  const ch = await getOrCreatePrivateChannel(i.guild, i.user);
  rec.countJoinAttempts += 1;
  rec.flow = {};
  rec.wizardStage = "type";
  await saveStore(store);
  await i.editReply({ content: `전용 채널에서 진행해줘: <#${ch.id}>`, ephemeral: true });
  const member = await i.guild.members.fetch(i.user.id);
  await ch.send({ content: `<@${i.user.id}> 환영해! 아래 단계부터 차례대로 진행해줘.` }).catch(() => {});
  await forceRenderWizard(ch, member, rec.flow, "type");
  return ch;
}

async function upsertFlow(uid, patch) { const s = await loadStore(); const r = ensureRecord(s, uid); r.flow = Object.assign({}, r.flow || {}, patch || {}); await saveStore(s); return r.flow; }
async function getFlow(uid) { const s = await loadStore(); const r = ensureRecord(s, uid); return r.flow || null; }
async function clearFlowAndChannel(guild, uid) {
  const s = await loadStore(); const r = ensureRecord(s, uid);
  if (r.activeChannelId) { const ch = await guild.channels.fetch(r.activeChannelId).catch(() => null); if (ch) { try { await ch.delete().catch(() => {}); } catch {} } r.activeChannelId = null; }
  r.flow = null;
  if (r.pendingDecisionMessageId && s.messages[r.pendingDecisionMessageId]) delete s.messages[r.pendingDecisionMessageId];
  r.pendingDecisionMessageId = null;
  r.wizardMsgId = null;
  r.wizardStage = null;
  r.locked = false;
  await saveStore(s);
}

async function sendDecisionCard(guild, ctx, rec) {
  const staffCh = await guild.channels.fetch(STAFF_DECIDE_CHANNEL_ID).catch(() => null);
  if (!staffCh) return null;
  const head = new EmbedBuilder().setTitle("📮 승인 요청").setColor(0x7b2ff2).setThumbnail(ctx.member.user.displayAvatarURL({ size: 256 })).setDescription(`• 대상: <@${ctx.member.id}> (${ctx.member.user.tag})\n• 누적 시도: ${rec.countJoinAttempts}회\n• 승인: ${rec.countApproved}회, 거절: ${rec.countRejected}회`);
  const ctxId = `${ctx.member.id}:${Date.now()}`;
  const msg = await staffCh.send({ embeds: [head, buildSummaryEmbed(ctx)], components: [rowDecision(ctxId)] });
  const store = await loadStore();
  store.messages[msg.id] = { ctx, memberId: ctx.member.id, channelId: rec.activeChannelId || null, ctxId };
  rec.pendingDecisionMessageId = msg.id;
  await saveStore(store);
  return msg.id;
}

async function announceWelcome(guild, ctx, silent) {
  if (silent) return;
  const store = await loadStore(); const rec = ensureRecord(store, ctx.member.id);
  if (!rec.activeChannelId) return;
  const ch = await guild.channels.fetch(rec.activeChannelId).catch(() => null);
  if (!ch) return;
  const topGames = (ctx.gameTags && Array.isArray(ctx.gameTags) ? ctx.gameTags.slice(0, 5) : []).map((g, i) => `#${i + 1} ${g}`).join("\n") || "표시할 게임 태그가 없습니다.";
  await ch.send({ content: `<@${ctx.member.id}> 님이 입장했습니다! 까리하게 맞이해주세요!! @here` }).catch(() => {});
  await ch.send({ embeds: [new EmbedBuilder().setTitle("대표 게임 태그").setDescription(topGames).setColor(0x2ecc71)] }).catch(() => {});
}

async function handleDecision(i, action, ctxFromId) {
  if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild) && !i.member.permissions.has(PermissionFlagsBits.Administrator)) { await i.reply({ content: "권한이 없습니다.", ephemeral: true }); return; }
  const mid = i.message.id;
  const store = await loadStore();
  let saved = store.messages[mid];
  if (!saved || (ctxFromId && saved.ctxId !== ctxFromId)) { await i.reply({ content: "컨텍스트가 만료되었습니다.", ephemeral: true }); return; }
  const guild = i.guild;
  const member = await guild.members.fetch(saved.memberId).catch(() => null);
  if (!member) { await i.reply({ content: "대상 사용자를 찾을 수 없습니다.", ephemeral: true }); return; }
  const ctx = Object.assign({}, saved.ctx, { member });
  const rec = ensureRecord(store, member.id);
  if (action === "APPROVE" || action === "APPROVE_SILENT") {
    rec.countApproved += 1; rec.status = "approved";
    if (ctx.type === "부계정") { try { await member.roles.add(SUB_ALT_ROLE_ID).catch(() => {}); } catch {} }
    try { await member.roles.add(APPROVED_ROLE_ID).catch(() => {}); } catch {}
    if (ctx.nickname) { const ok = await ensureNicknameUnique(guild, ctx.nickname); if (ok) { try { await member.setNickname(ctx.nickname).catch(() => {}); } catch {} } }
    rec.history.push({ at: Date.now(), type: ctx.type === "부계정" ? "ALT_APPROVED" : "APPROVED", payload: ctx });
    await saveStore(store);
    await logApproved(guild, ctx, action === "APPROVE_SILENT" ? "조용히 승인" : "일반 승인");
    try { await i.update({ content: "처리 완료", components: [] }); } catch {}
    await announceWelcome(guild, ctx, action === "APPROVE_SILENT");
    try { await clearFlowAndChannel(guild, member.id); } catch {}
  } else {
    rec.countRejected += 1; rec.status = "rejected";
    if (ctx.birthYear && ctx.birthRejectedImmediate) rec.rejectedBirthYears.push(ctx.birthYear);
    rec.history.push({ at: Date.now(), type: "REJECTED", payload: ctx });
    await saveStore(store);
    await logRejected(guild, ctx, "관리진 거절");
    try { await i.update({ content: "거절 처리 완료", components: [] }); } catch {}
    try { const ch = rec.activeChannelId ? await guild.channels.fetch(rec.activeChannelId).catch(() => null) : null; if (ch) await ch.send({ content: `<@${member.id}> 승인 심사에서 거절되었습니다. 문의는 운영진에게 부탁해.` }).catch(() => {}); } catch {}
    try { await clearFlowAndChannel(guild, member.id); } catch {}
  }
  delete store.messages[mid];
  await saveStore(store);
}

async function ensureNicknameUnique(guild, nickname) {
  const members = await guild.members.fetch();
  const exists = members.find(m => (m.nickname || m.user.username).toLowerCase() === nickname.toLowerCase());
  return !exists;
}

async function handleAltFinalize(i, values) {
  const guild = i.guild;
  const member = await guild.members.fetch(i.user.id);
  const mainNickname = values.mainNick.trim();
  const mainBirthYear = parseInt(values.mainBirth, 10);
  if (!/^\d{4}$/.test(String(mainBirthYear))) { await i.reply({ content: "출생년도 형식이 올바르지 않습니다.", ephemeral: true }); return; }
  const minY = minAllowedBirthYear();
  if (mainBirthYear > minY) {
    const store = await loadStore(); const rec = ensureRecord(store, member.id);
    rec.countRejected += 1; rec.rejectedBirthYears.push(mainBirthYear); rec.history.push({ at: Date.now(), type: "ALT_REJECT", year: mainBirthYear }); rec.status = "rejected"; await saveStore(store);
    const ctx = { type: "부계정", mainNickname, mainBirthYear, member, nickname: `${member.displayName || member.user.username}[부계]` };
    await logRejected(guild, ctx, `본계정 출생년도 기준 미달 (최소 ${minY})`);
    await i.reply({ content: `부계정 생성 거절: 본계정 출생년도 기준 미달 (최소 ${minY})`, ephemeral: true });
    try { await clearFlowAndChannel(guild, member.id); } catch {}
    return;
  }
  await upsertFlow(member.id, { type: "부계정", mainNickname, mainBirthYear, nickname: `${mainNickname}[부계]` });
  const store = await loadStore(); const rec = ensureRecord(store, member.id);
  const ctx = { type: "부계정", mainNickname, mainBirthYear, member, nickname: `${mainNickname}[부계]` };
  await sendDecisionCard(guild, ctx, rec);
  await i.reply({ content: "부계정 심사 요청이 접수되었습니다. 관리진 승인을 기다려줘.", ephemeral: true });
  await setStage(member, "wait");
}

async function handleBirthValidation(yearStr) { const y = parseInt(yearStr, 10); const minY = minAllowedBirthYear(); if (!/^\d{4}$/.test(String(y))) return { ok: false, reason: "출생년도 형식이 올바르지 않습니다." }; if (y > minY) return { ok: false, reason: `출생년도 기준 미달 (최소 ${minY})` }; return { ok: true, year: y }; }

function buildDecisionCtxFromFlow(flow, member) { return { type: flow.type || "신규/재입장", birthYear: flow.birthYear, gender: flow.gender, source: flow.source, referrer: flow.referrer, serverTags: flow.serverTags || [], gameTags: flow.gameTags || [], nickname: flow.nickname, member, mainNickname: flow.mainNickname, mainBirthYear: flow.mainBirthYear }; }

async function openModalBirth(i) { const m = new ModalBuilder().setCustomId("modal_birth").setTitle("출생년도 입력"); const t = new TextInputBuilder().setCustomId("birth").setLabel("출생년도 (예: 2005)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4); m.addComponents(new ActionRowBuilder().addComponents(t)); await i.showModal(m); }
async function openModalNick(i) { const m = new ModalBuilder().setCustomId("modal_nick").setTitle("서버 별명 입력"); const t = new TextInputBuilder().setCustomId("nick").setLabel("서버에서 사용할 별명").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32); m.addComponents(new ActionRowBuilder().addComponents(t)); await i.showModal(m); }
async function openModalRef(i) { const m = new ModalBuilder().setCustomId("modal_ref").setTitle("추천인 닉네임 입력"); const t = new TextInputBuilder().setCustomId("ref").setLabel("추천인 닉네임").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32); m.addComponents(new ActionRowBuilder().addComponents(t)); await i.showModal(m); }
async function openModalAlt(i) { const m = new ModalBuilder().setCustomId("modal_alt").setTitle("부계정 생성"); const t1 = new TextInputBuilder().setCustomId("mainNick").setLabel("본계정 닉네임").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32); const t2 = new TextInputBuilder().setCustomId("mainBirth").setLabel("본계정 출생년도 (예: 2005)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4); m.addComponents(new ActionRowBuilder().addComponents(t1), new ActionRowBuilder().addComponents(t2)); await i.showModal(m); }

async function collectFlow(client) {
  client.on("interactionCreate", async i => {
    if (!i.inCachedGuild()) return;

    if (i.isButton() && i.customId === "gate_start") {
      await i.deferReply({ ephemeral: true });
      const store = await loadStore();
      const rec = ensureRecord(store, i.user.id);
      if (rec.locked && rec.activeChannelId) { await i.editReply({ content: `이미 진행 중이야: <#${rec.activeChannelId}>`, ephemeral: true }); return; }
      await beginFlow(i);
      return;
    }

    if (!i.channel) return;
    if (i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) {
      const store = await loadStore(); const rec = ensureRecord(store, i.user.id);
      if (rec.activeChannelId && i.channel.id !== rec.activeChannelId) { try { await i.reply({ content: `본인 전용 채널에서만 진행 가능해: <#${rec.activeChannelId}>`, ephemeral: true }); } catch {} return; }
    }

    if (i.isButton() && (i.customId === "type_new" || i.customId === "type_rejoin" || i.customId === "type_alt")) {
      await upsertFlow(i.user.id, { type: i.customId === "type_new" ? "신규" : i.customId === "type_rejoin" ? "재입장" : "부계정" });
      if (i.customId === "type_alt") { await openModalAlt(i); return; }
      await i.reply({ content: "선택 완료.", ephemeral: true });
      const member = await i.guild.members.fetch(i.user.id);
      await setStage(member, "birth");
      return;
    }

    if (i.isButton() && i.customId === "open_birth") { await openModalBirth(i); return; }

    if (i.isModalSubmit() && i.customId === "modal_alt") {
      const mainNick = i.fields.getTextInputValue("mainNick"); const mainBirth = i.fields.getTextInputValue("mainBirth"); await handleAltFinalize(i, { mainNick, mainBirth }); return;
    }

    if (i.isModalSubmit() && i.customId === "modal_birth") {
      const v = i.fields.getTextInputValue("birth");
      const res = await handleBirthValidation(v);
      if (!res.ok) {
        const store = await loadStore(); const rec = ensureRecord(store, i.user.id);
        rec.countRejected += 1; if (/^\d{4}$/.test(String(v))) rec.rejectedBirthYears.push(parseInt(v, 10)); rec.history.push({ at: Date.now(), type: "BIRTH_REJECT", year: v }); rec.status = "rejected"; await saveStore(store);
        const ctx = { type: "신규/재입장", birthYear: /^\d{4}$/.test(String(v)) ? parseInt(v, 10) : null, birthRejectedImmediate: true, member: await i.guild.members.fetch(i.user.id) };
        await logRejected(i.guild, ctx, res.reason);
        await i.reply({ content: `승인 거절: ${res.reason}`, ephemeral: true });
        try { await clearFlowAndChannel(i.guild, i.user.id); } catch {}
        return;
      }
      await upsertFlow(i.user.id, { birthYear: res.year });
      await i.reply({ content: `출생년도 확인: ${res.year}`, ephemeral: true });
      const member = await i.guild.members.fetch(i.user.id);
      await setStage(member, "gender");
      return;
    }

    if (i.isButton() && (i.customId === "gender_m" || i.customId === "gender_f")) {
      const f = await getFlow(i.user.id);
      if (!f || !f.birthYear) { await i.reply({ content: "먼저 출생년도부터 입력해줘.", ephemeral: true }); return; }
      await upsertFlow(i.user.id, { gender: i.customId === "gender_m" ? "남자" : "여자" });
      await i.reply({ content: "성별 선택 완료.", ephemeral: true });
      const member = await i.guild.members.fetch(i.user.id);
      await setStage(member, "source");
      return;
    }

    if (i.isButton() && i.customId.startsWith("src_")) {
      const f = await getFlow(i.user.id);
      if (!f || !f.birthYear || !f.gender) { await i.reply({ content: "출생년도, 성별부터 진행해줘.", ephemeral: true }); return; }
      const map = { src_disboard: "디스보드", src_dicoall: "디코올", src_promo: "홍보글", src_ref: "추천인(지인)" };
      const sourceSel = map[i.customId] || "기타";
      await upsertFlow(i.user.id, { source: sourceSel });
      if (i.customId === "src_ref") { await openModalRef(i); return; }
      await i.reply({ content: "경로 선택 완료.", ephemeral: true });
      const member = await i.guild.members.fetch(i.user.id);
      await setStage(member, "tags_settings");
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_ref") {
      const ref = i.fields.getTextInputValue("ref").trim();
      await upsertFlow(i.user.id, { referrer: ref });
      await i.reply({ content: `추천인: ${ref}`, ephemeral: true });
      const member = await i.guild.members.fetch(i.user.id);
      await setStage(member, "tags_settings");
      return;
    }

    if (i.isStringSelectMenu() && i.customId === "sel_server_tags") {
      await upsertFlow(i.user.id, { serverTags: i.values });
      await i.reply({ content: `서버 태그 선택: ${i.values.join(", ")}`, ephemeral: true });
      const store = await loadStore(); const rec = ensureRecord(store, i.user.id); const member = await i.guild.members.fetch(i.user.id); const ch = await i.guild.channels.fetch(rec.activeChannelId).catch(() => null);
      if (ch) await forceRenderWizard(ch, member, rec.flow, "tags_settings");
      return;
    }

    if (i.isButton() && i.customId === "done_server_tags") {
      const f = await getFlow(i.user.id);
      if (!f?.serverTags || f.serverTags.length < 2) { await i.reply({ content: "최소 2개를 선택해줘.", ephemeral: true }); return; }
      await i.reply({ content: "서버 태그 완료.", ephemeral: true });
      const member = await i.guild.members.fetch(i.user.id);
      await setStage(member, "tags_games");
      return;
    }

    if (i.isStringSelectMenu() && i.customId === "sel_game_tags") {
      await upsertFlow(i.user.id, { gameTags: i.values });
      await i.reply({ content: `게임 태그 선택: ${i.values.join(", ")}`, ephemeral: true });
      const store = await loadStore(); const rec = ensureRecord(store, i.user.id); const member = await i.guild.members.fetch(i.user.id); const ch = await i.guild.channels.fetch(rec.activeChannelId).catch(() => null);
      if (ch) await forceRenderWizard(ch, member, rec.flow, "tags_games");
      return;
    }

    if (i.isButton() && i.customId === "done_game_tags") {
      const f = await getFlow(i.user.id);
      if (!f?.gameTags || f.gameTags.length < 2) { await i.reply({ content: "최소 2개를 선택해줘.", ephemeral: true }); return; }
      await i.reply({ content: "게임 태그 완료.", ephemeral: true });
      const member = await i.guild.members.fetch(i.user.id);
      await setStage(member, "nick");
      return;
    }

    if (i.isButton() && i.customId === "open_nick") {
      const f = await getFlow(i.user.id);
      if (!f?.serverTags?.length || !f?.gameTags?.length) { await i.reply({ content: "서버/게임 태그를 먼저 완료해줘.", ephemeral: true }); return; }
      await openModalNick(i);
      return;
    }

    if (i.isModalSubmit() && i.customId === "modal_nick") {
      const want = i.fields.getTextInputValue("nick").trim();
      const unique = await ensureNicknameUnique(i.guild, want);
      if (!unique) { await i.reply({ content: "이미 사용 중인 별명이야. 다른 별명으로 입력해줘.", ephemeral: true }); return; }
      await upsertFlow(i.user.id, { nickname: want });
      await i.reply({ content: `별명 설정: ${want}`, ephemeral: true });
      const flow = await getFlow(i.user.id);
      const member = await i.guild.members.fetch(i.user.id);
      const ctx = buildDecisionCtxFromFlow(flow, member);
      const store = await loadStore(); const rec = ensureRecord(store, i.user.id);
      await sendDecisionCard(i.guild, ctx, rec);
      await setStage(member, "wait");
      return;
    }

    if (i.isButton() && (i.customId.startsWith("approve_user:") || i.customId.startsWith("approve_silent:") || i.customId.startsWith("reject_user:"))) {
      const [action, ctxId] = i.customId.split(":");
      await handleDecision(i, action === "approve_user" ? "APPROVE" : action === "approve_silent" ? "APPROVE_SILENT" : "REJECT", ctxId);
      return;
    }
  });

  client.on("guildMemberRemove", async member => { try { await clearFlowAndChannel(member.guild, member.id); const store = await loadStore(); const rec = ensureRecord(store, member.id); rec.status = null; await saveStore(store); } catch {} });

  client.on("channelDelete", async ch => {
    if (!ch?.guild) return;
    const store = await loadStore(); let changed = false;
    for (const uid of Object.keys(store.users)) {
      const rec = store.users[uid];
      if (rec.activeChannelId === ch.id) { rec.activeChannelId = null; rec.flow = null; rec.wizardMsgId = null; rec.wizardStage = null; rec.locked = false; changed = true; }
      if (rec.pendingDecisionMessageId && store.messages[rec.pendingDecisionMessageId] && store.messages[rec.pendingDecisionMessageId].channelId === ch.id) { delete store.messages[rec.pendingDecisionMessageId]; rec.pendingDecisionMessageId = null; changed = true; }
    }
    if (changed) await saveStore(store);
  });
}

function initApprovalSystem(client) {
  client.once("ready", async () => {
    for (const [, g] of client.guilds.cache) { await postGateIfMissing(g).catch(() => {}); }
    const store = await loadStore();
    for (const uid of Object.keys(store.users)) {
      const rec = store.users[uid];
      if (rec.activeChannelId) {
        const guild = [...client.guilds.cache.values()].find(gg => gg.channels.cache.has(rec.activeChannelId)) || null;
        if (guild) {
          const ch = await guild.channels.fetch(rec.activeChannelId).catch(() => null);
          if (!ch) { rec.activeChannelId = null; rec.flow = null; rec.wizardMsgId = null; rec.wizardStage = null; rec.locked = false; await saveStore(store); }
          else {
            const member = await guild.members.fetch(uid).catch(() => null);
            if (member) await forceRenderWizard(ch, member, rec.flow || {}, rec.wizardStage || "type").catch(() => {});
          }
        }
      } else { rec.locked = false; await saveStore(store); }
    }
  });
  collectFlow(client);
}

module.exports = { initApprovalSystem };
