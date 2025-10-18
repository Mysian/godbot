const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const CONTROL_CHANNEL_ID = "1429042667504930896";
const CAUTION_ROLE_ID = "1429039343603027979";
const ADMIN_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
const DATA_PATH = path.join(__dirname, "../data/caution-flow.json");

function loadAll() { try { const j = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); if (j && typeof j === "object") return j; return {}; } catch { return {}; } }
function saveAll(all) { try { fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true }); fs.writeFileSync(DATA_PATH, JSON.stringify(all), "utf8"); } catch {} }

function getSafeName(member) { const base = (member?.displayName || member?.user?.username || "유저").replace(/[^ㄱ-ㅎ가-힣A-Za-z0-9-_]/g, ""); return base || "유저"; }
function now() { return Date.now(); }

async function ensureRoleOverwritesForGuild(guild) {
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  if (!role) return;
  await guild.channels.fetch().catch(() => {});
  const chans = guild.channels.cache.filter((c) => [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildMedia].includes(c.type));
  for (const ch of chans.values()) {
    const has = ch.permissionOverwrites.cache.get(role.id);
    if (!has || has.deny.bitfield === 0n || !has.deny.has(PermissionFlagsBits.ViewChannel)) {
      await ch.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
    }
  }
}

function reasonsMaster() {
  return [
    { key: "r1", label: "동의되지 않은 상대에게 반말을 사용하지 않겠습니다." },
    { key: "r2", label: "욕설을 사용하지 않겠습니다." },
    { key: "r3", label: "서버 이용시 채널을 목적에 맞게 사용하겠습니다." },
    { key: "r4", label: "서버 내 유저를 사적인 목적을 위해 이용하지 않겠습니다." },
    { key: "r5", label: "유저 모집 후 게임 불참(노쇼) 행위를 하지 않겠습니다." },
    { key: "r6", label: "음성채널 입퇴장 시 인사 등 상호 존중 및 예의를 지키겠습니다." },
    { key: "r7", label: "제3자의 개인정보 및 오프라인 정보를 공유하지 않겠습니다." },
    { key: "r8", label: "음성채널 이용 시 불필요한 잡음을 유발하지 않겠습니다." },
    { key: "rc", label: "커스텀 항목" }
  ];
}

function buildPickEmbed(uid, exists) {
  return new EmbedBuilder().setTitle("주의 적용 대상 확인").setDescription(exists ? "이미 주의 절차 진행 중입니다. 항목 갱신 또는 해제를 선택할 수 있습니다." : "해당 유저에게 주의를 적용합니다. 부여할 항목을 선택하세요.").addFields({ name: "대상", value: `<@${uid}> (${uid})` }).setTimestamp(new Date());
}

function buildReasonSelect(ownerId, uid, key, preselected) {
  const opts = reasonsMaster().map(r => ({ label: r.label.slice(0, 100), value: r.key, description: r.key === "rc" ? "직접 문구 입력" : undefined }));
  const menu = new StringSelectMenuBuilder().setCustomId(`cau:reasons:${ownerId}:${uid}:${key}`).setPlaceholder("부여할 주의 항목 선택").setMinValues(1).setMaxValues(opts.length).addOptions(opts);
  if (preselected?.length) menu.setDefaultValues(preselected);
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
  const desc = [
    "주의 단계는 '경고'보다 낮은 단계이며, 서버 이용 시 유의가 필요한 상태입니다.",
    "아래 항목 각각의 [동의] 버튼을 모두 누르면 복귀할 수 있습니다."
  ].join("\n");
  return new EmbedBuilder().setTitle(`주의 절차 진행 중`).setDescription(desc).addFields({ name: "대상", value: `<@${member.id}> (${member.id})` }, { name: "항목", value: lines.join("\n") || "-" }).setTimestamp(new Date());
}

function buildAgreeButtons(uid, record) {
  const rows = [];
  const btns = [];
  for (const it of record.items) {
    const done = !!record.acks?.[it.id];
    btns.push(new ButtonBuilder().setCustomId(`cau:ack:${uid}:${it.id}`).setLabel(done ? "동의됨" : "동의").setStyle(done ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(done));
  }
  for (let i = 0; i < btns.length; i += 5) rows.push(new ActionRowBuilder().addComponents(btns.slice(i, i + 5)));
  const allAck = record.items.every(it => record.acks?.[it.id]);
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cau:restore:${uid}`).setLabel("복귀하기").setStyle(ButtonStyle.Success).setDisabled(!allAck)));
  return rows;
}

function newRecord(uid, items) {
  const rec = { userId: uid, startedAt: now(), items: items.map((it, idx) => ({ ...it, id: `${idx + 1}` })), acks: {}, channelId: null, messageId: null };
  return rec;
}

async function ensureCautionChannel(guild, member, record) {
  const base = getSafeName(member);
  const name = `주의-${base}`;
  await guild.channels.fetch().catch(() => {});
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
  if (!ch) {
    ch = await guild.channels.create({ name, type: ChannelType.GuildText }).catch(() => null);
  }
  if (!ch) return null;
  const everyone = guild.roles.everyone;
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (everyone) await ch.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
  if (role) await ch.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
  if (botMember) await ch.permissionOverwrites.edit(botMember, { ViewChannel: true, SendMessages: true, ManageChannels: true, EmbedLinks: true }).catch(() => {});
  await ch.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true }).catch(() => {});
  for (const rid of ADMIN_ROLE_IDS) {
    const r = guild.roles.cache.get(rid) || await guild.roles.fetch(rid).catch(() => null);
    if (r) await ch.permissionOverwrites.edit(r, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  }
  return ch;
}

async function assignCautionRole(guild, uid) {
  const m = await guild.members.fetch(uid).catch(() => null);
  if (!m) return null;
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  if (!role) return m;
  await m.roles.add(role).catch(() => {});
  return m;
}

async function removeCautionRole(guild, uid) {
  const m = await guild.members.fetch(uid).catch(() => null);
  if (!m) return null;
  const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
  if (role) await m.roles.remove(role).catch(() => {});
  return m;
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
  const s = await guild.members.search({ query: q.slice(0, 100), limit: 10 }).catch(() => null);
  if (!s) return [];
  return Array.from(s.values());
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

module.exports = (client) => {
  client.on("messageCreate", async (msg) => {
    try {
      if (!msg.guild) return;
      if (msg.author?.bot) return;
      if (msg.channelId !== CONTROL_CHANNEL_ID) return;
      const hasManage = msg.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasManage) return;

      let targets = parseIdsFromMessage(msg).slice(0, 10);
      if (!targets.length) {
        const raw = stripIds(msg.content);
        if (!raw) return;
        const matches = await searchByNickname(msg.guild, raw);
        if (!matches.length) {
          await msg.reply({ embeds: [new EmbedBuilder().setTitle("검색 실패").setDescription("대상이 없어. 맨션/ID 또는 더 정확한 닉네임으로 다시 시도해줘.").setColor(0xe74c3c)], allowedMentions: { parse: [] } });
          return;
        }
        const ownerKey = `${msg.author.id}:${Date.now()}`;
        if (matches.length === 1) {
          const uid = matches[0].id;
          const all = loadAll();
          const exists = !!all[uid];
          const embed = buildPickEmbed(uid, exists);
          const rows = buildReasonSelect(msg.author.id, uid, ownerKey, exists ? all[uid].items.map(x => x.type === "preset" ? x.key : "rc") : null);
          await msg.reply({ embeds: [embed], components: rows, allowedMentions: { parse: [] } });
          pending.set(ownerKey, { uid, selected: exists ? all[uid].items.map(x => x.type === "preset" ? x.key : "rc") : [] });
        } else {
          const embed = buildSearchEmbed(raw, matches);
          const row = buildSearchSelect(msg.author.id, ownerKey, matches);
          const cancel = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cau:cancel:${msg.author.id}:${ownerKey}`).setLabel("취소").setStyle(ButtonStyle.Secondary));
          await msg.reply({ embeds: [embed], components: [row, cancel], allowedMentions: { parse: [] } });
        }
        return;
      }

      for (const uid of targets) {
        const ownerKey = `${msg.author.id}:${Date.now()}:${uid}`;
        const all = loadAll();
        const exists = !!all[uid];
        const embed = buildPickEmbed(uid, exists);
        const rows = buildReasonSelect(msg.author.id, uid, ownerKey, exists ? all[uid].items.map(x => x.type === "preset" ? x.key : "rc") : null);
        await msg.reply({ embeds: [embed], components: rows, allowedMentions: { parse: [] } });
        pending.set(ownerKey, { uid, selected: exists ? all[uid].items.map(x => x.type === "preset" ? x.key : "rc") : [] });
      }
    } catch {}
  });

  client.on("interactionCreate", async (i) => {
    try {
      if (!i.guild) return;
      if (i.channelId !== CONTROL_CHANNEL_ID && !String(i.customId || "").startsWith("cau:ack:") && !String(i.customId || "").startsWith("cau:restore:")) {
        return;
      }

      if (i.isStringSelectMenu()) {
        const parts = String(i.customId).split(":");
        if (parts[0] !== "cau") return;
        if (parts[1] === "pick") {
          const ownerId = parts[2]; const key = parts[3];
          if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 선택할 수 있어.", ephemeral: true }); return; }
          const uid = i.values?.[0]; if (!/^\d{17,20}$/.test(uid)) return;
          const allData = loadAll(); const exists = !!allData[uid];
          const embed = buildPickEmbed(uid, exists);
          const rows = buildReasonSelect(ownerId, uid, key, exists ? allData[uid].items.map(x => x.type === "preset" ? x.key : "rc") : null);
          pending.set(key, { uid, selected: exists ? allData[uid].items.map(x => x.type === "preset" ? x.key : "rc") : [] });
          await i.update({ embeds: [embed], components: rows, allowedMentions: { parse: [] } });
          return;
        }
        if (parts[1] === "reasons") {
          const ownerId = parts[2]; const uid = parts[3]; const key = parts[4];
          if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 변경할 수 있어.", ephemeral: true }); return; }
          const sel = i.values || [];
          const st = pending.get(key) || { uid, selected: [] }; st.selected = sel; pending.set(key, st);
          const embed = buildPickEmbed(uid, !!loadAll()[uid]);
          const rows = buildReasonSelect(ownerId, uid, key, sel);
          await i.update({ embeds: [embed], components: rows });
          return;
        }
      }

      if (i.isModalSubmit()) {
        const [ns, act, ownerId, uid, key] = String(i.customId).split(":");
        if (ns !== "cau" || act !== "custom") return;
        if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 입력할 수 있어.", ephemeral: true }); return; }
        const text = i.fields.getTextInputValue("cau_custom_text")?.trim().slice(0, 200);
        const st = pending.get(key) || { uid, selected: [] };
        if (text) st.custom = text;
        pending.set(key, st);
        await i.reply({ content: "커스텀 항목이 반영되었어.", ephemeral: true }).catch(() => {});
        return;
      }

      if (i.isButton()) {
        const parts = String(i.customId).split(":");
        if (parts[0] !== "cau") return;

        if (parts[1] === "addcustom") {
          const ownerId = parts[2]; const uid = parts[3]; const key = parts[4];
          if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 입력할 수 있어.", ephemeral: true }); return; }
          const modal = new ModalBuilder().setCustomId(`cau:custom:${ownerId}:${uid}:${key}`).setTitle("커스텀 항목 입력");
          const input = new TextInputBuilder().setCustomId("cau_custom_text").setLabel("문구").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await i.showModal(modal).catch(() => {});
          return;
        }

        if (parts[1] === "cancel") {
          const ownerId = parts[2]; const key = parts[3];
          if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 취소할 수 있어.", ephemeral: true }); return; }
          await i.update({ embeds: [new EmbedBuilder().setTitle("요청 취소됨").setColor(0x95a5a6).setTimestamp(new Date())], components: [] }).catch(async () => {
            await i.message.edit({ embeds: [new EmbedBuilder().setTitle("요청 취소됨").setColor(0x95a5a6).setTimestamp(new Date())], components: [] }).catch(() => {});
          });
          pending.delete(key);
          return;
        }

        if (parts[1] === "apply") {
          const ownerId = parts[2]; const uid = parts[3]; const key = parts[4];
          if (i.user.id !== ownerId) { await i.reply({ content: "요청자만 적용할 수 있어.", ephemeral: true }); return; }
          const st = pending.get(key) || { uid, selected: [] };
          const selected = Array.isArray(st.selected) ? st.selected : [];
          if (!selected.length) { await i.reply({ content: "부여할 항목을 선택해줘.", ephemeral: true }); return; }
          const items = [];
          for (const k of selected) {
            if (k === "rc") {
              if (st.custom && st.custom.trim()) items.push({ type: "custom", text: st.custom.trim() });
            } else {
              items.push({ type: "preset", key: k });
            }
          }
          if (!items.length) { await i.reply({ content: "유효한 항목이 없어. 커스텀 문구를 입력했는지 확인해줘.", ephemeral: true }); return; }
          const all = loadAll();
          all[uid] = newRecord(uid, items);
          saveAll(all);
          await ensureRoleOverwritesForGuild(i.guild);
          const member = await assignCautionRole(i.guild, uid);
          if (!member) { await i.reply({ content: "대상을 찾을 수 없어.", ephemeral: true }); return; }
          const ch = await ensureCautionChannel(i.guild, member, all[uid]);
          if (!ch) { await i.reply({ content: "주의 채널 생성에 실패했어.", ephemeral: true }); return; }
          const embed = renderAgreeEmbed(member, all[uid]);
          const rows = buildAgreeButtons(uid, all[uid]);
          const sent = await ch.send({ content: `<@${uid}>`, embeds: [embed], components: rows, allowedMentions: { users: [uid] } }).catch(() => null);
          all[uid].channelId = ch.id; all[uid].messageId = sent?.id || null; saveAll(all);
          await i.update({ embeds: [new EmbedBuilder().setTitle("주의 적용 완료").setDescription("주의 채널이 생성되었고 절차가 시작되었습니다.").addFields({ name: "대상", value: `<@${uid}> (${uid})` }, { name: "채널", value: `<#${ch.id}>` }).setTimestamp(new Date())], components: [] }).catch(() => {});
          pending.delete(key);
          return;
        }

        if (parts[1] === "ack") {
          const uid = parts[2]; const itemId = parts[3];
          const targetId = uid;
          if (i.user.id !== targetId && !i.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) { await i.reply({ content: "대상자 또는 관리자만 동의할 수 있어.", ephemeral: true }); return; }
          const all = loadAll(); const rec = all[targetId]; if (!rec) return;
          rec.acks = rec.acks || {}; rec.acks[itemId] = true; saveAll(all);
          const member = await i.guild.members.fetch(targetId).catch(() => null);
          if (!member) return;
          const embed = renderAgreeEmbed(member, rec);
          const rows = buildAgreeButtons(targetId, rec);
          if (i.channel?.id === rec.channelId && i.message?.id === rec.messageId) {
            await i.update({ content: `<@${targetId}>`, embeds: [embed], components: rows, allowedMentions: { users: [targetId] } }).catch(async () => {
              await i.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
            });
          } else {
            await i.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
          }
          return;
        }

        if (parts[1] === "restore") {
          const uid = parts[2] || parts[1] === "restore" ? i.user.id : null;
          const targetId = parts[2] || i.user.id;
          const all = loadAll(); const rec = all[targetId]; if (!rec) { await i.reply({ content: "진행 중인 주의 절차가 없어.", ephemeral: true }); return; }
          if (i.user.id !== targetId && !i.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) { await i.reply({ content: "대상자 또는 관리자만 복귀할 수 있어.", ephemeral: true }); return; }
          const allAck = rec.items.every(it => rec.acks?.[it.id]);
          if (!allAck) { await i.reply({ content: "모든 항목에 동의해야 복귀할 수 있어.", ephemeral: true }); return; }
          await removeCautionRole(i.guild, targetId);
          const ch = rec.channelId ? await i.guild.channels.fetch(rec.channelId).catch(() => null) : null;
          if (ch && ch.deletable) await ch.delete().catch(() => {});
          delete all[targetId]; saveAll(all);
          if (i.isRepliable()) {
            await i.reply({ content: "복귀가 완료되었습니다.", ephemeral: true }).catch(() => {});
          }
          return;
        }
      }
    } catch {}
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      const all = loadAll(); if (!all[member.id]) return;
      await ensureRoleOverwritesForGuild(member.guild);
      const m = await assignCautionRole(member.guild, member.id);
      if (!m) return;
      const rec = all[member.id];
      const ch = await ensureCautionChannel(member.guild, m, rec);
      if (!ch) return;
      const embed = renderAgreeEmbed(m, rec);
      const rows = buildAgreeButtons(member.id, rec);
      let msg = null;
      if (rec.messageId) {
        msg = await ch.messages.fetch(rec.messageId).catch(() => null);
      }
      if (!msg) {
        const sent = await ch.send({ content: `<@${member.id}>`, embeds: [embed], components: rows, allowedMentions: { users: [member.id] } }).catch(() => null);
        rec.channelId = ch.id; rec.messageId = sent?.id || null; saveAll(all);
      } else {
        await msg.edit({ content: `<@${member.id}>`, embeds: [embed], components: rows, allowedMentions: { users: [member.id] } }).catch(() => {});
      }
    } catch {}
  });

  client.on("channelCreate", async (ch) => {
    try {
      const guild = ch.guild;
      if (!guild) return;
      const role = guild.roles.cache.get(CAUTION_ROLE_ID) || await guild.roles.fetch(CAUTION_ROLE_ID).catch(() => null);
      if (!role) return;
      if ([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildMedia].includes(ch.type)) {
        await ch.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
      }
    } catch {}
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
          const ch = await ensureCautionChannel(g, m, rec);
          if (!ch) continue;
          const embed = renderAgreeEmbed(m, rec);
          const rows = buildAgreeButtons(uid, rec);
          let msg = null;
          if (rec.messageId) msg = await ch.messages.fetch(rec.messageId).catch(() => null);
          if (!msg) {
            const sent = await ch.send({ content: `<@${uid}>`, embeds: [embed], components: rows, allowedMentions: { users: [uid] } }).catch(() => null);
            rec.channelId = ch.id; rec.messageId = sent?.id || null; saveAll(all);
          } else {
            await msg.edit({ content: `<@${uid}>`, embeds: [embed], components: rows, allowedMentions: { users: [uid] } }).catch(() => {});
          }
        }
      }
    } catch {}
  });
};
