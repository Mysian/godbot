const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const CONTROL_CHANNEL_ID = "1429042667504930896";
const CAUTION_ROLE_ID = "1429039343603027979";
const ADMIN_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
const VOICE_HOLD_CHANNEL_ID = "1202971727915651092";
const DATA_PATH = path.join(__dirname, "../data/caution-flow.json");

function loadAll() { try { const j = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); if (j && typeof j === "object") return j; return {}; } catch { return {}; } }
function saveAll(all) { try { fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true }); fs.writeFileSync(DATA_PATH, JSON.stringify(all), "utf8"); } catch {} }
function now() { return Date.now(); }
function getSafeName(member) { const base = (member?.displayName || member?.user?.username || "유저").replace(/[^ㄱ-ㅎ가-힣A-Za-z0-9-_]/g, ""); return base || "유저"; }
function hasAdminRole(member) { if (!member) return false; return ADMIN_ROLE_IDS.some(id => member.roles?.cache?.has(id)); }

function canBotTalkIn(channel) {
  const me = channel?.guild?.members?.me;
  if (!me) return false;
  const perms = channel.permissionsFor(me);
  return perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages) && perms?.has(PermissionFlagsBits.EmbedLinks);
}
function safeLog(tag, e) { try { console.error(`[caution-flow] ${tag}:`, e?.stack || e?.message || e); } catch {} }

async function ensureRoleOverwritesForGuild(guild) {
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  if (!role) return;
  await guild.channels.fetch().catch(() => {});
  const chans = guild.channels.cache.filter((c) =>
    [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildMedia, ChannelType.GuildCategory].includes(c.type)
  );
  for (const ch of chans.values()) {
    const exists = ch.permissionOverwrites.cache.get(role.id);
    const need = !exists || !exists.deny.has(PermissionFlagsBits.ViewChannel);
    if (need) await ch.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
    if (ch.threads && typeof ch.threads.fetchActive === "function") {
      const active = await ch.threads.fetchActive().catch(() => null);
      if (active?.threads) for (const th of active.threads.values()) await th.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
      const archived = await ch.threads.fetchArchived().catch(() => null);
      if (archived?.threads) for (const th of archived.threads.values()) await th.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
    }
  }
}

function reasonsMaster() {
  return [
    { key: "r1", label: "동의되지 않은 상대에게 반말을 사용하지 않겠습니다.", agreeLabel: "동의 없는 반말을 하지 않겠습니다" },
    { key: "r2", label: "욕설을 사용하지 않겠습니다.", agreeLabel: "욕설을 하지 않겠습니다" },
    { key: "r3", label: "서버 이용시 채널을 목적에 맞게 사용하겠습니다.", agreeLabel: "채널을 목적에 맞게 사용하겠습니다" },
    { key: "r4", label: "서버 내 유저를 사적인 목적을 위해 이용하지 않겠습니다.", agreeLabel: "사적 이용을 하지 않겠습니다" },
    { key: "r5", label: "유저 모집 후 게임 불참(노쇼) 행위를 하지 않겠습니다.", agreeLabel: "모집 후 노쇼를 하지 않겠습니다" },
    { key: "r6", label: "음성채널 입퇴장 시 인사 등 상호 존중 및 예의를 지키겠습니다.", agreeLabel: "입퇴장 시 예의를 지키겠습니다" },
    { key: "r7", label: "제3자의 개인정보 및 오프라인 정보를 공유하지 않겠습니다.", agreeLabel: "개인정보·오프라인 정보 공유를 하지 않겠습니다" },
    { key: "r8", label: "음성채널 이용 시 불필요한 잡음을 유발하지 않겠습니다.", agreeLabel: "불필요한 잡음을 유발하지 않겠습니다" },
    { key: "rc", label: "커스텀 항목" }
  ];
}

function buildPickEmbed(uid, exists) {
  return new EmbedBuilder().setTitle("주의 적용 대상 확인").setDescription(exists ? "이미 주의 절차 진행 중입니다. 항목 갱신 또는 해제를 선택할 수 있습니다." : "해당 유저에게 주의를 적용합니다. 부여할 항목을 선택하세요.").addFields({ name: "대상", value: `<@${uid}> (${uid})` }).setTimestamp(new Date());
}

function buildSelectionEmbed(st) {
  const all = reasonsMaster();
  const names = [];
  const preset = (st?.selected || []).filter(v => v !== "rc");
  for (const k of preset) {
    const f = all.find(a => a.key === k);
    if (f) names.push(`• ${f.label}`);
  }
  if (st?.custom) names.push(`• ${st.custom}`);
  const val = names.length ? names.join("\n") : "선택 없음";
  return new EmbedBuilder().setTitle("선택 항목 미리보기").addFields({ name: "항목", value: val }).setTimestamp(new Date());
}

function buildReasonSelect(ownerId, uid, key, preselected) {
  const presetSet = new Set(preselected || []);
  const opts = reasonsMaster().map(r => ({
    label: r.label.slice(0, 100),
    value: r.key,
    description: r.key === "rc" ? "직접 문구 입력" : undefined,
    default: presetSet.has(r.key)
  }));
  const menu = new StringSelectMenuBuilder().setCustomId(`cau:reasons:${ownerId}:${uid}:${key}`).setPlaceholder("부여할 주의 항목 선택").setMinValues(1).setMaxValues(opts.length).addOptions(opts);
  const row1 = new ActionRowBuilder().addComponents(menu);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cau:addcustom:${ownerId}:${uid}:${key}`).setLabel("커스텀 항목 입력").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cau:apply:${ownerId}:${uid}:${key}`).setLabel("주의 적용").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`cau:cancel:${ownerId}:${key}`).setLabel("취소").setStyle(ButtonStyle.Secondary)
  );
  return [row1, row2];
}

function renderAgreeEmbed(member, record) {
  const all = reasonsMaster();
  const lines = [];
  for (const it of record.items) {
    if (it.type === "preset") {
      const f = all.find(a => a.key === it.key);
      lines.push(`${record.acks?.[it.id] ? "✅" : "☑️"} ${f ? f.label : it.key}`);
    } else {
      lines.push(`${record.acks?.[it.id] ? "✅" : "☑️"} ${it.text}`);
    }
  }
  const desc = ["주의 단계는 '경고'보다 낮은 단계이며, 서버 이용 시 유의가 필요한 상태입니다.", "아래 각 항목의 버튼은 약속 문구입니다. 모든 항목의 버튼을 눌러 약속하면 복귀할 수 있습니다."].join("\n");
  return new EmbedBuilder().setTitle("주의 절차 진행 중").setDescription(desc).addFields({ name: "대상", value: `<@${member.id}> (${member.id})` }, { name: "항목", value: lines.join("\n") || "-" }).setTimestamp(new Date());
}

function toAgreeLabel(item) {
  if (typeof item?.agreeLabel === "string" && item.agreeLabel.trim()) return item.agreeLabel.trim().slice(0, 80);
  if (item?.type === "preset") {
    const p = reasonsMaster().find(a => a.key === item.key);
    if (p?.agreeLabel) return String(p.agreeLabel).slice(0, 80);
  }
  return "위 항목에 동의합니다";
}

function buildAgreeButtons(uid, record) {
  const rows = [];
  const btns = [];
  for (const it of record.items) {
    const done = !!record.acks?.[it.id];
    const label = done ? "동의됨" : toAgreeLabel(it);
    btns.push(new ButtonBuilder().setCustomId(`cau:ack:${uid}:${it.id}`).setLabel(label).setStyle(done ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(done));
  }
  for (let i = 0; i < btns.length; i += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i + 5)));
  const allAck = record.items.every(it => record.acks?.[it.id]);
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cau:restore:${uid}`).setLabel("복귀하기").setStyle(ButtonStyle.Success).setDisabled(!allAck)));
  return rows;
}

function buildControlStatusEmbed(uid, rec) {
  const total = rec.items.length;
  const done = Object.values(rec.acks || {}).filter(Boolean).length;
  const allDone = done >= total && total > 0;
  const title = allDone ? "주의 절차 완료" : "주의 절차 진행 중";
  const status = allDone ? "모든 항목 동의 완료. 복귀하기 버튼으로 완료되었습니다." : `동의 진행 상황: ${done}/${total}`;
  const fields = [{ name: "대상", value: `<@${uid}> (${uid})` }];
  if (rec.channelId) fields.push({ name: "채널", value: `<#${rec.channelId}>` });
  return new EmbedBuilder().setTitle(title).setDescription(status).addFields(fields).setTimestamp(new Date());
}

function newRecord(uid, items) {
  return { userId: uid, startedAt: now(), items: items.map((it, idx) => ({ ...it, id: `${idx + 1}` })), acks: {}, channelId: null, messageId: null, backupRoleIds: null, controlChannelId: null, controlMessageId: null };
}

async function ensureCautionChannel(guild, member) {
  const base = getSafeName(member);
  const name = `주의-${base}`;
  await guild.channels.fetch().catch(() => {});
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
  if (!ch) ch = await guild.channels.create({ name, type: ChannelType.GuildText }).catch((e) => { safeLog("channel.create", e); return null; });
  if (!ch) return null;
  const everyone = guild.roles.everyone;
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (everyone) await ch.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
  if (role) await ch.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
  if (botMember) await ch.permissionOverwrites.edit(botMember, { ViewChannel: true, SendMessages: true, ManageChannels: true, EmbedLinks: true }).catch(() => {});
  await ch.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true, EmbedLinks: true }).catch(() => {});
  for (const rid of ADMIN_ROLE_IDS) {
    const r = guild.roles.cache.get(rid) || await guild.roles.fetch(rid).catch(() => null);
    if (r) await ch.permissionOverwrites.edit(r, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  }
  return ch;
}

function botCanManageRole(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role || !me) return false;
  if (role.managed) return false;
  return me.roles.highest.comparePositionTo(role) > 0;
}

function collectRestorableRoleIds(guild, ids) {
  const set = new Set();
  for (const id of ids || []) {
    if (id === guild.roles.everyone.id) continue;
    if (id === CAUTION_ROLE_ID) continue;
    if (!guild.roles.cache.has(id)) continue;
    if (!botCanManageRole(guild, id)) continue;
    set.add(id);
  }
  return Array.from(set);
}

async function enforceCautionOnlyRole(member, record) {
  const guild = member.guild;
  if (!botCanManageRole(guild, CAUTION_ROLE_ID)) {
    throw new Error("봇이 CAUTION 역할을 관리할 수 없음(역할 순위 확인 필요).");
  }
  const current = member.roles.cache.map(r => r.id).filter(id => id !== guild.roles.everyone.id);
  if (!record.backupRoleIds) {
    record.backupRoleIds = collectRestorableRoleIds(guild, current);
    const all = loadAll(); all[member.id] = record; saveAll(all);
  }
  await member.roles.set([CAUTION_ROLE_ID]).catch(e => { safeLog("roles.set([CAUTION])", e); throw e; });
}

async function restoreSnapshotRoles(member, record) {
  const guild = member.guild;
  const restore = collectRestorableRoleIds(guild, record.backupRoleIds || []);
  await member.roles.set(restore).catch(async (e) => {
    safeLog("roles.set(restore)", e);
    for (const id of restore) { if (botCanManageRole(guild, id)) await member.roles.add(id).catch(() => {}); }
  });
}

async function assignCautionRole(guild, uid) {
  const m = await guild.members.fetch(uid).catch((e) => { safeLog("members.fetch(assign)", e); return null; });
  if (!m) return null;
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  if (!role) return m;
  if (!botCanManageRole(guild, CAUTION_ROLE_ID)) throw new Error("봇이 CAUTION 역할을 관리할 수 없음(역할 순위 확인 필요).");
  if (!m.roles.cache.has(role.id)) await m.roles.add(role).catch(e => { safeLog("roles.add(caution)", e); throw e; });
  return m;
}

async function removeCautionRole(guild, uid) {
  const m = await guild.members.fetch(uid).catch(() => null);
  if (!m) return null;
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  if (role && m.roles.cache.has(role.id) && botCanManageRole(guild, CAUTION_ROLE_ID)) await m.roles.remove(role).catch(e => safeLog("roles.remove(caution)", e));
  return m;
}

async function moveToHoldVoiceIfNeeded(guild, member) {
  if (!member?.voice?.channelId) return;
  if (member.voice.channelId === VOICE_HOLD_CHANNEL_ID) return;
  const dst = await guild.channels.fetch(VOICE_HOLD_CHANNEL_ID).catch(() => null);
  if (!dst) return;
  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(dst.type)) return;
  await member.voice.setChannel(dst).catch(e => safeLog("voice.setChannel", e));
}

async function quarantineMemberAcrossGuild(guild, member, exceptChannelId) {
  await guild.channels.fetch().catch(() => {});
  const chans = guild.channels.cache.filter(c =>
    [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildMedia, ChannelType.GuildCategory].includes(c.type)
  );
  for (const ch of chans.values()) {
    if (ch.id === exceptChannelId) continue;
    await ch.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
    if (ch.threads && typeof ch.threads.fetchActive === "function") {
      const active = await ch.threads.fetchActive().catch(() => null);
      if (active?.threads) for (const th of active.threads.values()) await th.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
      const archived = await ch.threads.fetchArchived().catch(() => null);
      if (archived?.threads) for (const th of archived.threads.values()) await th.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {});
    }
  }
}

async function clearQuarantineForMember(guild, memberId) {
  await guild.channels.fetch().catch(() => {});
  const chans = guild.channels.cache.filter(c =>
    [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildMedia, ChannelType.GuildCategory].includes(c.type)
  );
  for (const ch of chans.values()) {
    const ow = ch.permissionOverwrites.cache.get(memberId);
    if (ow) await ch.permissionOverwrites.delete(memberId).catch(() => {});
    if (ch.threads && typeof ch.threads.fetchActive === "function") {
      const active = await ch.threads.fetchActive().catch(() => null);
      if (active?.threads) for (const th of active.threads.values()) { const o = th.permissionOverwrites.cache.get(memberId); if (o) await th.permissionOverwrites.delete(memberId).catch(() => {}); }
      const archived = await ch.threads.fetchArchived().catch(() => null);
      if (archived?.threads) for (const th of archived.threads.values()) { const o = th.permissionOverwrites.cache.get(memberId); if (o) await th.permissionOverwrites.delete(memberId).catch(() => {}); }
    }
  }
}

function parseIdsFromMessage(msg) {
  const set = new Set();
  for (const u of msg.mentions.users.values()) set.add(u.id);
  const ids = msg.content.match(/\b\d{17,20}\b/g) || [];
  for (const id of ids) set.add(id);
  return Array.from(set);
}
function stripIds(text) { return text.replace(/<@!?(\d{17,20})>/g, " ").replace(/\b\d{17,20}\b/g, " ").replace(/\s+/g, " ").trim(); }

async function searchByNickname(guild, q) {
  const key = q.slice(0, 100);
  let list = [];
  try { const s = await guild.members.search({ query: key, limit: 10 }); if (s) list = Array.from(s.values()); } catch {}
  if (list.length) return list;
  await guild.members.fetch().catch(() => {});
  const lower = key.toLowerCase();
  const cached = guild.members.cache.filter(m => {
    const a = m.nickname || m.user.globalName || m.user.username || m.user.tag;
    return a && a.toLowerCase().includes(lower);
  });
  return Array.from(cached.values()).slice(0, 10);
}

function buildSearchEmbed(keyword, list) {
  const e = new EmbedBuilder().setTitle("대상자 선택").setDescription(`닉네임 검색: **${keyword}**`).setTimestamp(new Date());
  if (!list?.length) e.addFields({ name: "결과", value: "일치 없음" });
  return e;
}
function buildSearchSelect(authorId, key, members) {
  const menu = new StringSelectMenuBuilder().setCustomId(`cau:pick:${authorId}:${key}`).setPlaceholder("대상 선택").addOptions(members.slice(0, 25).map(m => ({ label: (m.nickname || m.user.globalName || m.user.username || m.user.tag).slice(0, 100), description: m.user.tag.slice(0, 100), value: m.id })));
  return new ActionRowBuilder().addComponents(menu);
}

const pending = new Map();

function bar(p, w = 12) { const f = Math.max(0, Math.min(100, Math.floor(p))); const n = Math.round((f / 100) * w); return `[${"█".repeat(n)}${"░".repeat(w - n)}] ${f}%`; }
function progressEmbed(title, phase, p) { return new EmbedBuilder().setTitle(title).setDescription(`${phase}\n${bar(p)}`).setColor(0x3498db).setTimestamp(new Date()); }
function doneEmbed(title, desc, fields) { const e = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(0x2ecc71).setTimestamp(new Date()); for (const f of fields || []) e.addFields(f); return e; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function postProgressIn(channel, title, phase, p) {
  if (!canBotTalkIn(channel)) return null;
  return await channel.send({ embeds: [progressEmbed(title, phase, p)] }).catch(() => null);
}
async function updateProgressMessage(msg, title, phase, p) {
  if (!msg) return;
  await msg.edit({ embeds: [progressEmbed(title, phase, p)] }).catch(() => {});
}

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    if (!msg.guild) return;
    if (msg.author?.bot) return;
    if (msg.channelId !== CONTROL_CHANNEL_ID) return;
    const isAdminRole = ADMIN_ROLE_IDS.some(id => msg.member?.roles?.cache?.has(id));
    if (!isAdminRole) return;
    if (!canBotTalkIn(msg.channel)) return;

    let targets = [];
    try { targets = parseIdsFromMessage(msg).slice(0, 10); } catch {}
    if (!targets.length) {
      const raw = stripIds(msg.content);
      if (!raw) return;
      const matches = await searchByNickname(msg.guild, raw);
      if (!matches.length) {
        await msg.reply({ embeds: [new EmbedBuilder().setTitle("검색 실패").setDescription("대상이 없어. 맨션/ID 또는 더 정확한 닉네임으로 다시 시도해줘.").setColor(0xe74c3c)], allowedMentions: { parse: [] } }).catch(() => {});
        return;
      }
      const ownerKey = `${msg.author.id}:${Date.now()}`;
      if (matches.length === 1) {
        const uid = matches[0].id;
        const targetM = await msg.guild.members.fetch(uid).catch(() => null);
        if (hasAdminRole(targetM)) { await msg.reply({ content: "해당 유저는 예외 대상이야.", allowedMentions: { parse: [] } }).catch(() => {}); return; }
        const all = loadAll();
        const exists = !!all[uid];
        const preselected = exists ? [...all[uid].items.filter(x => x.type === "preset").map(x => x.key)] : [];
        const embed = buildPickEmbed(uid, exists);
        const rows = buildReasonSelect(msg.author.id, uid, ownerKey, preselected);
        const sent = await msg.reply({ embeds: [embed, buildSelectionEmbed({ selected: preselected })], components: rows, allowedMentions: { parse: [] } }).catch((e) => { safeLog("reply(pick-single)", e); return null; });
        pending.set(ownerKey, { uid, selected: preselected, messageId: sent?.id || null, channelId: msg.channelId });
      } else {
        const filtered = matches.filter(m => !hasAdminRole(m));
        if (!filtered.length) { await msg.reply({ content: "검색 결과가 모두 예외 대상이야.", allowedMentions: { parse: [] } }).catch(() => {}); return; }
        const embed = buildSearchEmbed(raw, filtered);
        const ownerKey = `${msg.author.id}:${Date.now()}`;
        const row = buildSearchSelect(msg.author.id, ownerKey, filtered);
        const cancel = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cau:cancel:${msg.author.id}:${ownerKey}`).setLabel("취소").setStyle(ButtonStyle.Secondary));
        await msg.reply({ embeds: [embed], components: [row, cancel], allowedMentions: { parse: [] } }).catch((e) => safeLog("reply(search-list)", e));
      }
      return;
    }

    const filteredIds = [];
    for (const uid of targets) {
      const targetM = await msg.guild.members.fetch(uid).catch(() => null);
      if (hasAdminRole(targetM)) continue;
      filteredIds.push(uid);
    }
    if (!filteredIds.length) { await msg.reply({ content: "모든 대상이 예외 역할을 보유하고 있어.", allowedMentions: { parse: [] } }).catch(() => {}); return; }

    for (const uid of filteredIds) {
      const ownerKey = `${msg.author.id}:${Date.now()}:${uid}`;
      const all = loadAll();
      const exists = !!all[uid];
      const preselected = exists ? [...all[uid].items.filter(x => x.type === "preset").map(x => x.key)] : [];
      const embed = buildPickEmbed(uid, exists);
      const rows = buildReasonSelect(msg.author.id, uid, ownerKey, preselected);
      const sent = await msg.reply({ embeds: [embed, buildSelectionEmbed({ selected: preselected })], components: rows, allowedMentions: { parse: [] } }).catch((e) => { safeLog("reply(pick-multi)", e); return null; });
      pending.set(ownerKey, { uid, selected: preselected, messageId: sent?.id || null, channelId: msg.channelId });
    }
  });

  client.on("interactionCreate", async (i) => {
    try {
      if (!i.guild) return;

      const isCaution = String(i.customId || "").startsWith("cau:");
      const isControl = i.channelId === CONTROL_CHANNEL_ID;

      const ackUpdate = async () => { if (!i.deferred && !i.replied) { await i.deferUpdate().catch(() => {}); } };
      const ackReply = async () => { if (!i.deferred && !i.replied) { await i.deferReply({ ephemeral: true }).catch(() => {}); } };

      if (!isControl && !isCaution) return;
      if (!isControl && isCaution && !(String(i.customId).startsWith("cau:ack:") || String(i.customId).startsWith("cau:restore:"))) return;

      if (i.isStringSelectMenu()) {
        await ackUpdate();

        const parts = String(i.customId).split(":");
        if (parts[0] !== "cau") return;

        if (parts[1] === "pick") {
          const ownerId = parts[2]; const key = parts[3];
          if (i.user.id !== ownerId) return;
          const uid = i.values?.[0]; if (!/^\d{17,20}$/.test(uid)) return;
          const targetM = await i.guild.members.fetch(uid).catch(() => null);
          if (hasAdminRole(targetM)) return;

          const allData = loadAll(); const exists = !!allData[uid];
          const preselected = exists ? [...allData[uid].items.filter(x => x.type === "preset").map(x => x.key)] : [];
          const embed = buildPickEmbed(uid, exists);
          const rows = buildReasonSelect(ownerId, uid, key, preselected);
          const st = { uid, selected: preselected, messageId: i.message?.id || null, channelId: i.channelId };
          pending.set(key, st);
          if (canBotTalkIn(i.channel)) await i.message.edit({ embeds: [embed, buildSelectionEmbed(st)], components: rows }).catch((e) => safeLog("edit(pick->showReasons)", e));
          return;
        }

        if (parts[1] === "reasons") {
          const ownerId = parts[2]; const uid = parts[3]; const key = parts[4];
          if (i.user.id !== ownerId) return;
          const sel = i.values || [];
          const st = pending.get(key) || { uid, selected: [] };
          st.selected = sel;
          pending.set(key, st);
          const embed = buildPickEmbed(uid, !!loadAll()[uid]);
          const rows = buildReasonSelect(ownerId, uid, key, sel);
          if (canBotTalkIn(i.channel)) await i.message.edit({ embeds: [embed, buildSelectionEmbed(st)], components: rows }).catch((e) => safeLog("edit(reasons)", e));
          return;
        }
      }

      if (i.isModalSubmit()) {
        const [ns, act, ownerId, uid, key] = String(i.customId).split(":");
        if (ns !== "cau" || act !== "custom") return;
        if (i.user.id !== ownerId) { await i.reply({ content: "권한 없음", ephemeral: true }).catch(() => {}); return; }
        await i.deferReply({ ephemeral: true }).catch(() => {});
        const text  = i.fields.getTextInputValue("cau_custom_text")?.trim().slice(0, 200);
        const agree = i.fields.getTextInputValue("cau_custom_agree")?.trim().slice(0, 80);
        const st = pending.get(key) || { uid, selected: [] };
        let changed = false;
        if (text)  { st.custom = text;  changed = true; }
        if (agree) { st.customAgree = agree; changed = true; }
        if (changed) {
          if (!st.selected) st.selected = [];
          if (!st.selected.includes("rc")) st.selected.push("rc");
        }
        pending.set(key, st);
        try {
          if (st.messageId && st.channelId) {
            const ch = await i.guild.channels.fetch(st.channelId).catch(() => null);
            const msg = ch ? await ch.messages.fetch(st.messageId).catch(() => null) : null;
            if (msg && canBotTalkIn(ch)) {
              const exists = !!loadAll()[uid];
              const embed = buildPickEmbed(uid, exists);
              const rows = buildReasonSelect(ownerId, uid, key, st.selected);
              await msg.edit({ embeds: [embed, buildSelectionEmbed(st)], components: rows }).catch(() => {});
            }
          }
        } catch {}
        await i.editReply({ content: "커스텀 항목이 반영되었어." }).catch(() => {});
        return;
      }

      if (i.isButton()) {
        const parts = String(i.customId).split(":");
        if (parts[0] !== "cau") return;

        if (parts[1] === "cancel") {
          await ackUpdate();
          const ownerId = parts[2]; const key = parts[3];
          if (i.user.id !== ownerId) return;
          if (canBotTalkIn(i.channel)) await i.message.edit({ embeds: [new EmbedBuilder().setTitle("요청 취소됨").setColor(0x95a5a6).setTimestamp(new Date())], components: [] }).catch((e) => safeLog("edit(cancel)", e));
          pending.delete(key);
          return;
        }

        if (parts[1] === "addcustom") {
          const ownerId = parts[2]; const uid = parts[3]; const key = parts[4];
          if (i.user.id !== ownerId) return;
          const st = pending.get(key) || { uid, selected: [], messageId: i.message?.id || null, channelId: i.channelId || null };
          st.messageId = i.message?.id || st.messageId || null;
          st.channelId = i.channelId || st.channelId || null;
          pending.set(key, st);
          const modal = new ModalBuilder().setCustomId(`cau:custom:${ownerId}:${uid}:${key}`).setTitle("커스텀 항목 입력");
          const input1 = new TextInputBuilder().setCustomId("cau_custom_text").setLabel("항목 문구").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
          const input2 = new TextInputBuilder().setCustomId("cau_custom_agree").setLabel("버튼 문구(약속문)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder("예: 해당 항목을 지키겠습니다");
          modal.addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2));
          await i.showModal(modal).catch((e) => safeLog("showModal", e));
          return;
        }

        if (parts[1] === "apply") {
          await ackReply();
          await i.editReply({ content: "주의 적용 처리 중..." }).catch(() => {});
          const ownerId = parts[2]; const uid = parts[3]; const key = parts[4];
          if (i.user.id !== ownerId) { await i.editReply({ content: "요청자만 적용할 수 있어." }).catch(() => {}); return; }
          const st = pending.get(key) || { uid, selected: [] };
          let selected = Array.isArray(st.selected) ? [...st.selected] : [];
          const targetMember = await i.guild.members.fetch(uid).catch(() => null);
          if (!targetMember) { await i.editReply({ content: "대상을 찾을 수 없어." }).catch(() => {}); return; }
          if (hasAdminRole(targetMember)) { await i.editReply({ content: "해당 유저는 예외 대상이야." }).catch(() => {}); return; }

          const progressMsg = await postProgressIn(i.channel, "주의 적용 중", "초기화 중...", 5);
          await sleep(200);

          const items = [];
          for (const k of selected) {
            if (k !== "rc") {
              const pm = reasonsMaster().find(a => a.key === k);
              items.push({ type: "preset", key: k, agreeLabel: pm?.agreeLabel ? String(pm.agreeLabel).slice(0, 80) : undefined });
            }
          }
          if (st.custom && st.custom.trim()) {
            const agree = st.customAgree && st.customAgree.trim() ? st.customAgree.trim().slice(0, 80) : "위 항목을 지키겠습니다";
            items.push({ type: "custom", text: st.custom.trim(), agreeLabel: agree });
          }
          if (!items.length) { await i.editReply({ content: "부여할 항목을 선택하거나 커스텀을 입력해줘." }).catch(() => {}); return; }

          await updateProgressMessage(progressMsg, "주의 적용 중", "데이터 저장...", 20);
          const all = loadAll(); const existed = all[uid]; all[uid] = existed ? { ...existed, items: items.map((it, idx) => ({ ...it, id: `${idx + 1}` })), acks: {} } : newRecord(uid, items); saveAll(all);

          await updateProgressMessage(progressMsg, "주의 적용 중", "역할 부여...", 40);
          const member = await assignCautionRole(i.guild, uid);
          if (!member) { await i.editReply({ content: "대상을 찾을 수 없어." }).catch(() => {}); return; }

          await updateProgressMessage(progressMsg, "주의 적용 중", "역할 스냅샷 및 격리...", 55);
          await enforceCautionOnlyRole(member, all[uid]);

          await updateProgressMessage(progressMsg, "주의 적용 중", "보이스 이동 확인...", 60);
          await moveToHoldVoiceIfNeeded(i.guild, member).catch(() => {});

          await updateProgressMessage(progressMsg, "주의 적용 중", "주의 채널 생성...", 75);
          const ch = await ensureCautionChannel(i.guild, member);
          if (!ch) { await i.editReply({ content: "주의 채널 생성 실패." }).catch(() => {}); return; }

          await updateProgressMessage(progressMsg, "주의 적용 중", "서버 전역 접근 제한...", 90);
          await quarantineMemberAcrossGuild(i.guild, member, ch.id).catch(() => {});

          await updateProgressMessage(progressMsg, "주의 적용 중", "안내 임베드 게시...", 95);
          const embed = renderAgreeEmbed(member, all[uid]);
          const rows = buildAgreeButtons(uid, all[uid]);
          let sent = null;
          if (canBotTalkIn(ch)) sent = await ch.send({ content: `<@${uid}>`, embeds: [embed], components: rows, allowedMentions: { users: [uid] } }).catch((e) => { safeLog("send(caution-room)", e); return null; });
          all[uid].channelId = ch.id; all[uid].messageId = sent?.id || null;
          all[uid].controlChannelId = i.channelId; all[uid].controlMessageId = i.message?.id || null;
          saveAll(all);

          if (isControl && canBotTalkIn(i.channel)) {
            try {
              await i.message.edit({ embeds: [new EmbedBuilder().setTitle("주의 적용 완료").setDescription("주의 채널이 생성되었고 절차가 시작되었습니다.").addFields({ name: "대상", value: `<@${uid}> (${uid})` }, { name: "채널", value: `<#${ch.id}>` }).setTimestamp(new Date()), buildControlStatusEmbed(uid, all[uid])], components: [] });
            } catch (e) { safeLog("edit(control->applied)", e); }
          }
          await updateProgressMessage(progressMsg, "주의 적용 완료", "모든 준비가 완료되었습니다.", 100);
          await sleep(1500);
          if (progressMsg) { try { await progressMsg.delete().catch(() => {}); } catch {} }
          await i.editReply({ content: "적용 완료." }).catch(() => {});
          pending.delete(key);
          return;
        }

        if (parts[1] === "ack") {
          await ackUpdate();

          const uid = parts[2]; const itemId = parts[3];
          const targetId = uid;
          const all = loadAll(); const rec = all[targetId]; if (!rec) return;
          if (i.user.id !== targetId && !i.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return;

          rec.acks = rec.acks || {}; rec.acks[itemId] = true; saveAll(all);
          const member = await i.guild.members.fetch(targetId).catch(() => null);
          if (!member) return;

          const embed = renderAgreeEmbed(member, rec);
          const rows = buildAgreeButtons(targetId, rec);

          if (i.channel?.id === rec.channelId && i.message?.id === rec.messageId && canBotTalkIn(i.channel)) {
            await i.message.edit({ content: `<@${targetId}>`, embeds: [embed], components: rows, allowedMentions: { users: [targetId] } }).catch((e) => safeLog("edit(ack)", e));
          }

          try {
            if (rec.controlChannelId && rec.controlMessageId) {
              const ctrlCh = await i.guild.channels.fetch(rec.controlChannelId).catch(() => null);
              const ctrlMsg = ctrlCh ? await ctrlCh.messages.fetch(rec.controlMessageId).catch(() => null) : null;
              if (ctrlMsg && canBotTalkIn(ctrlCh)) {
                await ctrlMsg.edit({ embeds: [buildControlStatusEmbed(targetId, rec)] }).catch(() => {});
              }
            }
          } catch {}

          return;
        }

        if (parts[1] === "restore") {
          await ackReply();
          await i.editReply({ content: "복귀 처리 중..." }).catch(() => {});
          let finalMsg = "복귀 완료.";

          const targetId = parts[2] ?? i.user.id;
          const all = loadAll(); const rec = all[targetId];
          if (!rec) { finalMsg = "진행 중인 주의 절차가 없어."; await i.editReply({ content: finalMsg }).catch(() => {}); return; }
          if (i.user.id !== targetId && !i.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) { finalMsg = "대상자 또는 관리자만 복귀 가능."; await i.editReply({ content: finalMsg }).catch(() => {}); return; }
          const allAck = rec.items.every(it => rec.acks?.[it.id]);
          if (!allAck) { finalMsg = "모든 항목에 동의해야 복귀할 수 있어."; await i.editReply({ content: finalMsg }).catch(() => {}); return; }

          const ch = rec.channelId ? await i.guild.channels.fetch(rec.channelId).catch(() => null) : null;
          let progressChannel = ch || i.channel;
          const progressMsg = await postProgressIn(progressChannel, "복귀 처리 중", "검증 중...", 10);
          await sleep(200);

          try {
            const member = await i.guild.members.fetch(targetId).catch(() => null);
            await updateProgressMessage(progressMsg, "복귀 처리 중", "역할 복원...", 50);
            if (member) await restoreSnapshotRoles(member, rec).catch(() => {});
            await updateProgressMessage(progressMsg, "복귀 처리 중", "주의 역할 제거...", 65);
            await removeCautionRole(i.guild, targetId).catch(() => {});
            await updateProgressMessage(progressMsg, "복귀 처리 중", "접근 제한 해제...", 80);
            await clearQuarantineForMember(i.guild, targetId).catch(() => {});
            await updateProgressMessage(progressMsg, "복귀 처리 중", "주의 채널 정리 준비...", 95);

            try {
              if (rec.controlChannelId && rec.controlMessageId) {
                const ctrlCh = await i.guild.channels.fetch(rec.controlChannelId).catch(() => null);
                const ctrlMsg = ctrlCh ? await ctrlCh.messages.fetch(rec.controlMessageId).catch(() => null) : null;
                if (ctrlMsg && canBotTalkIn(ctrlCh)) {
                  await ctrlMsg.edit({ embeds: [new EmbedBuilder().setTitle("복귀 완료").setDescription("모든 절차가 완료되었습니다.").addFields({ name: "대상", value: `<@${targetId}> (${targetId})` }).setTimestamp(new Date())], components: [] }).catch(() => {});
                }
              }
            } catch {}

            await updateProgressMessage(progressMsg, "복귀 처리 완료", "정상적으로 복귀가 완료되었습니다.", 100);
            await sleep(1500);

            if (ch) {
              try {
                if (rec.messageId) {
                  const msg = await ch.messages.fetch(rec.messageId).catch(() => null);
                  if (msg) {
                    const disabled = msg.components.map(row => {
                      const r = ActionRowBuilder.from(row);
                      r.components = r.components.map(c => ButtonBuilder.from(c).setDisabled(true));
                      return r;
                    });
                    await msg.edit({ components: disabled }).catch(() => {});
                  }
                }
              } catch {}
              await ch.delete().catch(() => {});
            }

            delete all[targetId]; saveAll(all);
          } catch (e) {
            safeLog("restore", e);
            finalMsg = "복귀 처리 중 오류가 발생했어. 권한과 로그를 확인해줘.";
          } finally {
            try { if (progressMsg && progressMsg.channel) await progressMsg.delete().catch(() => {}); } catch {}
            await i.editReply({ content: finalMsg }).catch(() => {});
          }
          return;
        }
      }
    } catch (e) {
      safeLog("interactionCreate", e);
      try {
        if (e?.code === 40060) return;
        if (e?.message?.includes("Unknown interaction")) return;
      } catch {}
      try {
        const i = arguments?.[0];
        if (!i) return;
        if (i.replied) return;
        if (i.deferred) { await i.editReply({ content: "처리 중 오류가 발생했어. 권한과 로그를 확인해줘." }).catch(() => {}); }
        else { await i.reply({ content: "처리 중 오류가 발생했어. 권한과 로그를 확인해줘.", ephemeral: true }).catch(() => {}); }
      } catch {}
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      const all = loadAll(); if (!all[member.id]) return;
      await ensureRoleOverwritesForGuild(member.guild);
      const m = await assignCautionRole(member.guild, member.id);
      if (!m) return;
      await enforceCautionOnlyRole(m, all[member.id]);
      await moveToHoldVoiceIfNeeded(member.guild, m);
      const rec = all[member.id];
      const ch = await ensureCautionChannel(member.guild, m);
      if (!ch) return;
      await quarantineMemberAcrossGuild(member.guild, m, ch.id);
      const embed = renderAgreeEmbed(m, rec);
      const rows = buildAgreeButtons(member.id, rec);
      let msg = null;
      if (rec.messageId) msg = await ch.messages.fetch(rec.messageId).catch(() => null);
      if (!msg) {
        if (canBotTalkIn(ch)) {
          const sent = await ch.send({ content: `<@${member.id}>`, embeds: [embed], components: rows, allowedMentions: { users: [member.id] } }).catch((e) => { safeLog("send(memberAdd)", e); return null; });
          rec.channelId = ch.id; rec.messageId = sent?.id || null; saveAll(all);
        }
      } else {
        if (canBotTalkIn(ch)) await msg.edit({ content: `<@${member.id}>`, embeds: [embed], components: rows, allowedMentions: { users: [member.id] } }).catch(() => {});
      }
      try {
        if (rec.controlChannelId && rec.controlMessageId) {
          const ctrlCh = await member.guild.channels.fetch(rec.controlChannelId).catch(() => null);
          const ctrlMsg = ctrlCh ? await ctrlCh.messages.fetch(rec.controlMessageId).catch(() => null) : null;
          if (ctrlMsg && canBotTalkIn(ctrlCh)) await ctrlMsg.edit({ embeds: [buildControlStatusEmbed(member.id, rec)] }).catch(() => {});
        }
      } catch {}
    } catch (e) { safeLog("guildMemberAdd", e); }
  });

  client.on("channelCreate", async (ch) => {
    try {
      const guild = ch.guild;
      if (!guild) return;
      const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
      if (!role) return;
      if ([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildMedia, ChannelType.GuildCategory].includes(ch.type)) {
        await ch.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
      }
    } catch (e) { safeLog("channelCreate", e); }
  });

  client.once("ready", async () => {
    try {
      for (const g of client.guilds.cache.values()) {
        await ensureRoleOverwritesForGuild(g);
        const all = loadAll();
        const ids = Object.keys(all);
        if (!ids.length) continue;
        await g.members.fetch().catch(() => {});
        for (const uid of ids) {
          const rec = all[uid];
          const m = await assignCautionRole(g, uid);
          if (!m) continue;
          await enforceCautionOnlyRole(m, rec);
          await moveToHoldVoiceIfNeeded(g, m);
          const ch = await ensureCautionChannel(g, m);
          if (!ch) continue;
          await quarantineMemberAcrossGuild(g, m, ch.id);
          const embed = renderAgreeEmbed(m, rec);
          const rows = buildAgreeButtons(uid, rec);
          let msg = null;
          if (rec.messageId) msg = await ch.messages.fetch(rec.messageId).catch(() => null);
          if (!msg) {
            if (canBotTalkIn(ch)) {
              const sent = await ch.send({ content: `<@${uid}>`, embeds: [embed], components: rows, allowedMentions: { users: [uid] } }).catch((e) => { safeLog("send(ready)", e); return null; });
              rec.channelId = ch.id; rec.messageId = sent?.id || null; saveAll(all);
            }
          } else {
            if (canBotTalkIn(ch)) await msg.edit({ content: `<@${uid}>`, embeds: [embed], components: rows, allowedMentions: { users: [uid] } }).catch(() => {});
          }
          try {
            if (rec.controlChannelId && rec.controlMessageId) {
              const ctrlCh = await g.channels.fetch(rec.controlChannelId).catch(() => null);
              const ctrlMsg = ctrlCh ? await ctrlCh.messages.fetch(rec.controlMessageId).catch(() => null) : null;
              if (ctrlMsg && canBotTalkIn(ctrlCh)) await ctrlMsg.edit({ embeds: [buildControlStatusEmbed(uid, rec)] }).catch(() => {});
            }
          } catch {}
        }
      }
    } catch (e) { safeLog("ready", e); }
  });
};
