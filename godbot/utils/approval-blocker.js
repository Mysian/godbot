const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const CONTROL_CHANNEL_ID = "1425966714604224566";
const ROLE_ID_A = "1205052922296016906";
const ROLE_ID_B = "1403748042666151936";
const DATA_PATH = path.join(__dirname, "../data/approval-blocked.json");
const EXEMPT_IDS = new Set(["285645561582059520", "1380841362752274504"]);

function isExempt(uid) { return EXEMPT_IDS.has(String(uid)); }
function loadBlocked() { try { const j = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); if (j && typeof j === "object") return j; return {}; } catch { return {}; } }
function saveBlocked(all) { try { fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true }); fs.writeFileSync(DATA_PATH, JSON.stringify(all), "utf8"); } catch {} }
function addBlocked(uid) { if (isExempt(uid)) return null; const all = loadBlocked(); all[uid] = { userId: uid, blockedAt: Date.now() }; saveBlocked(all); return all[uid]; }
function removeBlocked(uid) { const all = loadBlocked(); if (all[uid]) { delete all[uid]; saveBlocked(all); return true; } return false; }
function isBlocked(uid) { if (isExempt(uid)) return false; const all = loadBlocked(); return !!all[uid]; }
function getAllBlockedIds() { return Object.keys(loadBlocked()).filter((id) => !isExempt(id)); }

async function deletePrivateJoinChannel(guild, uid) {
  let target = null;
  try {
    const approvalFlow = require("./approval-flow.js");
    if (approvalFlow && typeof approvalFlow.findUserPrivateChannel === "function") {
      target = approvalFlow.findUserPrivateChannel(guild, uid);
    }
  } catch {}
  if (!target) {
    try { await guild.channels.fetch(); } catch {}
    target = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.topic === uid);
  }
  if (target) { try { await target.delete("승인 절차 차단 대상 정리"); } catch {} }
}

async function deleteFallbackJoinChannelsByName(guild, member) {
  try { await guild.channels.fetch(); } catch {}
  const base = (member.displayName || member.user.username || "").replace(/[^ㄱ-ㅎ가-힣A-Za-z0-9-_]/g, "");
  const candidates = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText && typeof c.name === "string" && c.name.startsWith("입장-") && c.name.includes(base));
  for (const ch of candidates.values()) { try { await ch.delete("승인 절차 차단 대상 정리(이름 패턴)"); } catch {} }
}

async function assignBypassRoles(guild, uid) {
  try { await guild.roles.fetch(); } catch {}
  const member = await guild.members.fetch(uid).catch(() => null);
  if (!member) return false;
  try {
    const r1 = guild.roles.cache.get(ROLE_ID_A); if (r1) { try { await member.roles.add(r1, "승인 절차 차단 대상 역할 부여(A)"); } catch {} }
    const r2 = guild.roles.cache.get(ROLE_ID_B); if (r2) { try { await member.roles.add(r2, "승인 절차 차단 대상 역할 부여(B)"); } catch {} }
  } catch {}
  return true;
}

async function removeBypassRoles(guild, uid) {
  try { await guild.roles.fetch(); } catch {}
  const member = await guild.members.fetch(uid).catch(() => null);
  if (!member) return false;
  try {
    const r1 = guild.roles.cache.get(ROLE_ID_A); if (r1) { try { await member.roles.remove(r1, "승인 절차 제한 해제(A)"); } catch {} }
    const r2 = guild.roles.cache.get(ROLE_ID_B); if (r2) { try { await member.roles.remove(r2, "승인 절차 제한 해제(B)"); } catch {} }
  } catch {}
  return true;
}

async function applyBlockNow(guild, uid) {
  if (isExempt(uid)) return;
  await assignBypassRoles(guild, uid);
  const member = await guild.members.fetch(uid).catch(() => null);
  if (member) {
    await deletePrivateJoinChannel(guild, uid);
    await new Promise((r) => setTimeout(r, 1200));
    await deleteFallbackJoinChannelsByName(guild, member);
  } else {
    await deletePrivateJoinChannel(guild, uid);
  }
}

function makeConfirmEmbed(guild, uid, blocked, actorId) {
  const title = blocked ? "이미 제한된 유저입니다" : "승인 절차 제한 확인";
  const desc = blocked ? "이미 제한된 유저입니다. 제한을 해제하시겠습니까?" : "해당 유저의 승인 절차를 모두 차단하고 지정 역할을 부여합니다. 진행하시겠습니까?";
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .addFields({ name: "대상", value: `<@${uid}> (${uid})`, inline: false }, { name: "상태", value: blocked ? "제한됨" : "미제한", inline: true })
    .setFooter({ text: `요청자: ${actorId}` })
    .setTimestamp(new Date());
}

function makeButtons(uid, blocked, ownerKey) {
  if (!blocked) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`blk:apply:${uid}:${ownerKey}`).setLabel("제한 적용").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`blk:cancel:${ownerKey}`).setLabel("취소").setStyle(ButtonStyle.Secondary)
    )];
  } else {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`blk:remove:${uid}:${ownerKey}`).setLabel("제한 해제").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`blk:cancel:${ownerKey}`).setLabel("취소").setStyle(ButtonStyle.Secondary)
    )];
  }
}

function buildSearchEmbed(nick, results) {
  const e = new EmbedBuilder().setTitle("대상자 선택").setDescription(`닉네임 검색 결과: **${nick}**`).setTimestamp(new Date());
  if (!results?.length) e.addFields({ name: "결과", value: "일치하는 유저가 없습니다." });
  return e;
}

function buildSearchSelect(authorId, key, members) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`blk:pick:${authorId}:${key}`)
    .setPlaceholder("대상자를 선택하세요")
    .addOptions(
      members.slice(0, 25).map((m) => ({
        label: (m.nickname || m.user.globalName || m.user.username || m.user.tag).slice(0, 100),
        description: m.user.tag.slice(0, 100),
        value: m.id
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function parseIdsAndMentions(msg) {
  const set = new Set();
  for (const u of msg.mentions.users.values()) set.add(u.id);
  const ids = msg.content.match(/\b\d{17,20}\b/g) || [];
  for (const id of ids) set.add(id);
  return Array.from(set);
}

function stripMentionsAndIds(text) {
  return text.replace(/<@!?(\d{17,20})>/g, " ").replace(/\b\d{17,20}\b/g, " ").replace(/\s+/g, " ").trim();
}

async function resolveByNickname(guild, text) {
  const nick = text.trim();
  if (!nick) return [];
  const found = await guild.members.search({ query: nick.slice(0, 100), limit: 10 }).catch(() => null);
  if (!found) return [];
  return Array.from(found.values());
}

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    try {
      if (!msg.guild) return;
      if (msg.author?.bot) return;
      if (msg.channelId !== CONTROL_CHANNEL_ID) return;
      const hasManage = msg.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) return;

      let targets = parseIdsAndMentions(msg).slice(0, 10).filter((id) => !isExempt(id));

      if (!targets.length) {
        const raw = stripMentionsAndIds(msg.content);
        if (!raw) return;
        const matches = await resolveByNickname(msg.guild, raw);
        if (!matches.length) {
          const e = new EmbedBuilder().setTitle("검색 실패").setDescription("일치하는 유저가 없어. 맨션/ID 또는 더 정확한 닉네임으로 다시 시도해줘.").setColor(0xe74c3c).setTimestamp(new Date());
          await msg.reply({ embeds: [e], allowedMentions: { parse: [] } });
          return;
        }
        const ownerKey = `${msg.author.id}:${Date.now()}`;
        if (matches.length === 1) {
          const uid = matches[0].id;
          if (isExempt(uid)) {
            await msg.reply({ content: "해당 ID는 예외 대상이라 제한/해제가 적용되지 않아.", allowedMentions: { parse: [] } });
            return;
          }
          const embed = makeConfirmEmbed(msg.guild, uid, isBlocked(uid), msg.author.id);
          const components = makeButtons(uid, isBlocked(uid), ownerKey);
          await msg.reply({ embeds: [embed], components, allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
          return;
        } else {
          const embed = buildSearchEmbed(raw, matches);
          const select = buildSearchSelect(msg.author.id, ownerKey, matches);
          const cancel = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`blk:cancel:${ownerKey}`).setLabel("취소").setStyle(ButtonStyle.Secondary));
          await msg.reply({ embeds: [embed], components: [select, cancel], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
          return;
        }
      }

      for (const uid of targets) {
        const ownerKey = `${msg.author.id}:${Date.now()}:${uid}`;
        const embed = makeConfirmEmbed(msg.guild, uid, isBlocked(uid), msg.author.id);
        const components = makeButtons(uid, isBlocked(uid), ownerKey);
        await msg.reply({ embeds: [embed], components, allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
      }
    } catch {}
  });

  client.on("interactionCreate", async (i) => {
    try {
      if (!i.guild) return;
      if (i.channelId !== CONTROL_CHANNEL_ID) return;

      if (i.isStringSelectMenu()) {
        const [ns, act, ownerId, key] = String(i.customId).split(":");
        if (ns !== "blk" || act !== "pick") return;
        if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 선택할 수 있어.", ephemeral: true }).catch(() => {}); return; }
        const uid = i.values?.[0];
        if (!/^\d{17,20}$/.test(uid)) return;
        if (isExempt(uid)) { await i.reply({ content: "해당 ID는 예외 대상이라 제한/해제가 적용되지 않아.", ephemeral: true }).catch(() => {}); return; }
        const embed = makeConfirmEmbed(i.guild, uid, isBlocked(uid), i.user.id);
        const rows = makeButtons(uid, isBlocked(uid), `${ownerId}:${key}`);
        await i.update({ embeds: [embed], components: rows, allowedMentions: { parse: [] } }).catch(() => {});
        return;
      }

      if (!i.isButton()) return;
      const parts = String(i.customId).split(":");
      if (parts[0] !== "blk") return;

      if (parts[1] === "cancel") {
        const ownerKey = parts[2] || "";
        const ownerId = ownerKey.split(":")[0];
        if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 취소할 수 있어.", ephemeral: true }).catch(() => {}); return; }
        const log = new EmbedBuilder().setTitle("요청 취소됨").setColor(0x95a5a6).setTimestamp(new Date());
        if (i.deferred || i.replied) {
          await i.editReply({ embeds: [log], components: [] }).catch(async () => {
            await i.message.edit({ embeds: [log], components: [], allowedMentions: { parse: [] } }).catch(() => {});
          });
        } else {
          await i.update({ embeds: [log], components: [], allowedMentions: { parse: [] } }).catch(async () => {
            await i.reply({ embeds: [log], ephemeral: true }).catch(() => {});
          });
        }
        return;
      }

      const [ns, action, uid, ownerKey] = parts;
      if (!/^\d{17,20}$/.test(uid)) return;
      const ownerId = (ownerKey || "").split(":")[0] || "";
      const hasManage = i.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) { await i.reply({ content: "권한이 없습니다.", ephemeral: true }).catch(() => {}); return; }
      if (ownerId && i.user.id !== ownerId) { await i.reply({ content: "요청자만 처리할 수 있어.", ephemeral: true }).catch(() => {}); return; }
      if (isExempt(uid)) { await i.reply({ content: "해당 ID는 예외 대상이라 제한/해제가 적용되지 않아.", ephemeral: true }).catch(() => {}); return; }

      if (action === "apply") {
        addBlocked(uid);
        await applyBlockNow(i.guild, uid);
        const embed = new EmbedBuilder().setTitle("🚫 제한 적용 완료").setDescription("해당 유저의 승인 절차가 차단되었으며 지정 역할이 부여되었습니다.").addFields({ name: "대상", value: `<@${uid}> (${uid})` }).setTimestamp(new Date());
        await i.update({ embeds: [embed], components: [], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } }).catch(() => {});
        return;
      }

      if (action === "remove") {
        removeBlocked(uid);
        await removeBypassRoles(i.guild, uid);
        const embed = new EmbedBuilder().setTitle("✅ 제한 해제 완료").setDescription("해당 유저의 승인 절차 제한이 해제되었습니다.").addFields({ name: "대상", value: `<@${uid}> (${uid})` }).setTimestamp(new Date());
        await i.update({ embeds: [embed], components: [], allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } }).catch(() => {});
        return;
      }
    } catch {}
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      if (isExempt(member.id) || !isBlocked(member.id)) return;
      await new Promise((r) => setTimeout(r, 1500));
      await applyBlockNow(member.guild, member.id);
    } catch {}
  });

  client.on("channelCreate", async (ch) => {
    try {
      if (ch.type !== ChannelType.GuildText) return;
      const guild = ch.guild;
      const topic = ch.topic;
      if (topic && /^\d{17,20}$/.test(topic) && !isExempt(topic) && isBlocked(topic)) { await ch.delete("승인 절차 차단 대상의 개인 채널 자동 삭제"); return; }
      if (typeof ch.name === "string" && ch.name.startsWith("입장-")) {
        await guild.members.fetch().catch(() => {});
        const blockedIds = getAllBlockedIds().filter((id) => !isExempt(id) && guild.members.cache.has(id));
        if (!blockedIds.length) return;
        for (const uid of blockedIds) {
          const m = guild.members.cache.get(uid);
          if (!m) continue;
          const base = (m.displayName || m.user.username || "").replace(/[^ㄱ-ㅎ가-힣A-Za-z0-9-_]/g, "");
          if (base && ch.name.includes(base)) { try { await ch.delete("승인 절차 차단 대상의 개인 채널 자동 삭제(이름 매칭)"); } catch {} break; }
        }
      }
    } catch {}
  });

  client.once("ready", async () => {
    try {
      for (const g of client.guilds.cache.values()) {
        const ids = getAllBlockedIds();
        if (!ids.length) continue;
        await g.members.fetch().catch(() => {});
        for (const uid of ids) {
          if (isExempt(uid)) { removeBlocked(uid); continue; }
          if (g.members.cache.has(uid)) { await applyBlockNow(g, uid); } else { await deletePrivateJoinChannel(g, uid); }
        }
      }
    } catch {}
  });
};
