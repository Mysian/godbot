"use strict";

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
  ComponentType,
} = require("discord.js");
const { getBE, addBE } = require("../commands/be-util.js");
const fs = require("fs");
const path = require("path");

const CATEGORY_ID = "1419593419172347995";
const STATUS_CHANNEL_ID = "1419593845548777544";
const PREFIX_EMOJI = "🔒 ";
const MAX_ROOMS = 10;
const MIN_PW = 4;
const MAX_PW = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ZERO_EMPTY_GRACE_MS = 5 * 60 * 1000;
const COST_BE = 100000;

const DATA_DIR = path.join(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const ROOMS_PATH = path.join(DATA_DIR, "secret-rooms.json");

const passwordToRoom = new Map();
const roomDeletionTimers = new Map();
let statusMessageId = null;
let statusUpdating = false;

function nowKST() {
  const d = new Date();
  return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function readRoomsFromFile() {
  try {
    if (!fs.existsSync(ROOMS_PATH)) return {};
    const raw = fs.readFileSync(ROOMS_PATH, "utf8");
    if (!raw || !raw.trim()) return {};
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return {};
    return obj;
  } catch {
    return {};
  }
}

function writeRoomsToFile() {
  try {
    const obj = {};
    for (const [pw, info] of passwordToRoom.entries()) obj[pw] = info;
    fs.writeFileSync(ROOMS_PATH, JSON.stringify(obj));
  } catch {}
}

async function restoreRooms(client) {
  const saved = readRoomsFromFile();
  const keys = Object.keys(saved);
  let changed = false;
  for (const pw of keys) {
    const info = saved[pw];
    if (!info || !info.channelId) { changed = true; continue; }
    const ch = await client.channels.fetch(info.channelId).catch(() => null);
    if (ch && ch.type === ChannelType.GuildVoice && ch.parentId === CATEGORY_ID && typeof ch.name === "string" && ch.name.startsWith(PREFIX_EMOJI)) {
      passwordToRoom.set(pw, info);
      try { await evaluateRoom(ch, ch.guild); } catch {}
    } else {
      changed = true;
    }
  }
  if (changed) writeRoomsToFile();
}

async function countExistingRooms(guild) {
  const channels = await guild.channels.fetch();
  let n = 0;
  channels.forEach((ch) => {
    if (
      ch &&
      ch.type === ChannelType.GuildVoice &&
      ch.parentId === CATEGORY_ID &&
      typeof ch.name === "string" &&
      ch.name.startsWith(PREFIX_EMOJI)
    ) {
      n += 1;
    }
  });
  return n;
}

function buildEmbed(count) {
  return new EmbedBuilder()
    .setTitle("🔒 비밀 채널 안내")
    .setDescription(
      [
        `현재 개설 수량: [${count}/${MAX_ROOMS}]`,
        "개설 시 🔹100,000 정수가 소모됩니다.",
        "비밀 채널은 비밀번호로만 입장할 수 있는 비공개 음성채널입니다.",
        "비밀 채널은 존재 자체가 보이지 않습니다.",
        "비밀 채널에서의 활동은 서버 내 활동 집계 및 경험치 획득에서 제외됩니다.",
        "빈 방은 5분 뒤 자동 삭제되며, 1명만 남아 있는 경우 1시간 뒤에 자동 삭제됩니다.",
      ].join("\n")
    );
}

function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("secret_create").setLabel("비밀 채널 개설").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("secret_join").setLabel("비밀 채널 입장").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("secret_pw").setLabel("비밀번호 확인/변경").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("secret_delete").setLabel("비밀 채널 삭제").setStyle(ButtonStyle.Danger)
  );
}

async function getOrCreateStatusMessage(channel, embed) {
  if (statusMessageId) {
    try {
      const msg = await channel.messages.fetch(statusMessageId);
      if (msg) return msg;
    } catch {}
  }
  const messages = await channel.messages.fetch({ limit: 50 });
  const existing = messages.find(
    (m) =>
      m.author.id === channel.client.user.id &&
      m.embeds?.[0]?.title?.includes("비밀 채널 안내")
  );
  if (existing) {
    statusMessageId = existing.id;
    return existing;
  }
  const sent = await channel.send({ embeds: [embed], components: [buildButtons()] });
  statusMessageId = sent.id;
  return sent;
}

async function updateStatus(guild) {
  if (statusUpdating) return;
  statusUpdating = true;
  try {
    const ch = await guild.channels.fetch(STATUS_CHANNEL_ID);
    if (!ch || ch.type !== ChannelType.GuildText) {
      statusUpdating = false;
      return;
    }
    const count = await countExistingRooms(guild);
    const embed = buildEmbed(count);
    const msg = await getOrCreateStatusMessage(ch, embed);
    await msg.edit({ embeds: [embed], components: [buildButtons()] });
  } catch {}
  statusUpdating = false;
}

function validatePassword(pw) {
  if (typeof pw !== "string") return false;
  const s = pw.trim();
  if (s.length < MIN_PW || s.length > MAX_PW) return false;
  return true;
}

function normalizeName(name) {
  if (typeof name !== "string") return null;
  const s = name.trim().slice(0, 80);
  if (!s) return null;
  return s;
}

async function evaluateRoom(channel, guild) {
  if (!channel || channel.type !== ChannelType.GuildVoice || channel.parentId !== CATEGORY_ID) return;
  if (!channel.name.startsWith(PREFIX_EMOJI)) return;

  const count = channel.members.size;

  const clearTimer = () => {
    const t = roomDeletionTimers.get(channel.id);
    if (t) {
      clearTimeout(t);
      roomDeletionTimers.delete(channel.id);
    }
  };

  if (count === 0) {
    clearTimer();
    const timer = setTimeout(async () => {
      try {
        const fresh = await guild.channels.fetch(channel.id).catch(() => null);
        if (!fresh) {
          roomDeletionTimers.delete(channel.id);
          return;
        }
        if (fresh.members.size === 0) {
          for (const [pw, info] of passwordToRoom.entries()) {
            if (info.channelId === fresh.id) passwordToRoom.delete(pw);
          }
          writeRoomsToFile();
          await fresh.delete("비밀 채널: 0명 상태 5분 경과 자동 삭제");
          await updateStatus(guild);
        }
      } catch {} finally {
        roomDeletionTimers.delete(channel.id);
      }
    }, ZERO_EMPTY_GRACE_MS);
    roomDeletionTimers.set(channel.id, timer);
    return;
  }

  if (count === 1) {
    clearTimer();
    const timer = setTimeout(async () => {
      try {
        const fresh = await guild.channels.fetch(channel.id).catch(() => null);
        if (!fresh) {
          roomDeletionTimers.delete(channel.id);
          return;
        }
        if (fresh.members.size <= 1) {
          for (const [pw, info] of passwordToRoom.entries()) {
            if (info.channelId === fresh.id) passwordToRoom.delete(pw);
          }
          writeRoomsToFile();
          await fresh.delete("비밀 채널: 1인 1시간 경과 자동 삭제");
          await updateStatus(guild);
        }
      } catch {} finally {
        roomDeletionTimers.delete(channel.id);
      }
    }, ONE_HOUR_MS);
    roomDeletionTimers.set(channel.id, timer);
    return;
  }

  clearTimer();
}

async function ensureCanCreate(member) {
  const vc = member.voice.channel;
  if (vc && vc.parentId === CATEGORY_ID) return { ok: false, reason: "카테고리 내 음성채널 접속 중엔 개설 불가" };
  const n = await countExistingRooms(member.guild);
  if (n >= MAX_ROOMS) return { ok: false, reason: "최대 개설 수량 도달" };
  const balance = Number(getBE(member.id) || 0);
  if (balance < COST_BE) return { ok: false, reason: `정수 부족(필요 ${COST_BE.toLocaleString("ko-KR")}BE, 보유 ${balance.toLocaleString("ko-KR")}BE)` };
  return { ok: true };
}

async function createRoom(member, name, password) {
  const guild = member.guild;
  if (passwordToRoom.has(password)) throw new Error("비밀번호 중복");
  const everyone = guild.roles.everyone;
  const overwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream] },
    { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
  ];
  const room = await guild.channels.create({
    name: `${PREFIX_EMOJI}${name}`,
    type: ChannelType.GuildVoice,
    parent: CATEGORY_ID,
    permissionOverwrites: overwrites,
    reason: "비밀 채널 생성",
  });
  passwordToRoom.set(password, { channelId: room.id, ownerId: member.id, createdAt: Date.now() });
  writeRoomsToFile();
  await updateStatus(guild);
  try {
    if (member.voice.channelId) {
      await member.voice.setChannel(room.id, "비밀 채널 개설에 따른 이동");
    } else {
      await member.voice.setChannel(room.id, "비밀 채널 개설에 따른 이동");
    }
  } catch {}
  await evaluateRoom(room, guild);
  return room;
}

async function joinRoom(member, password) {
  const info = passwordToRoom.get(password);
  if (!info) throw new Error("비밀번호 불일치");
  const channel = await member.guild.channels.fetch(info.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    passwordToRoom.delete(password);
    writeRoomsToFile();
    throw new Error("방이 존재하지 않음");
  }
  try {
    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
    });
  } catch {}
  let moved = false;
  if (member.voice && member.voice.channelId) {
    try {
      await member.voice.setChannel(channel.id, "비밀 채널 비밀번호 입장");
      moved = true;
    } catch {}
  }
  await evaluateRoom(channel, member.guild);
  return { channel, moved };
}

function getRoomInfoByChannelId(chId) {
  for (const [pw, info] of passwordToRoom.entries()) {
    if (info.channelId === chId) return { pw, info };
  }
  return null;
}

async function findOwnedRoom(member) {
  const vc = member.voice.channel;
  if (vc && vc.parentId === CATEGORY_ID && vc.type === ChannelType.GuildVoice && vc.name.startsWith(PREFIX_EMOJI)) {
    const found = getRoomInfoByChannelId(vc.id);
    if (found && found.info.ownerId === member.id) {
      const ch = await member.guild.channels.fetch(vc.id).catch(() => null);
      if (ch) return { channel: ch, pw: found.pw, info: found.info };
    }
  }
  let candidate = null;
  for (const [pw, info] of passwordToRoom.entries()) {
    if (info.ownerId !== member.id) continue;
    const ch = await member.guild.channels.fetch(info.channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildVoice || ch.parentId !== CATEGORY_ID) continue;
    if (!candidate || (info.createdAt || 0) > (candidate.info.createdAt || 0)) {
      candidate = { channel: ch, pw, info };
    }
  }
  return candidate;
}

async function deleteOwnedRoom(member) {
  const item = await findOwnedRoom(member);
  if (!item) return { ok: false, reason: "본인이 개설한 비밀 채널을 찾을 수 없습니다." };
  const { channel } = item;
  try {
    for (const [pw, info] of passwordToRoom.entries()) {
      if (info.channelId === channel.id) passwordToRoom.delete(pw);
    }
    writeRoomsToFile();
    const t = roomDeletionTimers.get(channel.id);
    if (t) {
      clearTimeout(t);
    }
    roomDeletionTimers.delete(channel.id);
    await channel.delete("비밀 채널 삭제(개설자 요청)");
    await updateStatus(member.guild);
    return { ok: true };
  } catch {
    return { ok: false, reason: "삭제 중 오류가 발생했습니다." };
  }
}

async function showCreateModal(interaction) {
  const modal = new ModalBuilder().setCustomId("secret_create_modal").setTitle("비밀 채널 개설");
  const nameInput = new TextInputBuilder().setCustomId("sc_name").setLabel("채널명").setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true);
  const pwInput = new TextInputBuilder().setCustomId("sc_pw").setLabel("비밀번호(4~10자)").setStyle(TextInputStyle.Short).setMaxLength(MAX_PW).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(pwInput));
  await interaction.showModal(modal);
}

async function showJoinModal(interaction) {
  const modal = new ModalBuilder().setCustomId("secret_join_modal").setTitle("비밀 채널 입장");
  const pwInput = new TextInputBuilder().setCustomId("sj_pw").setLabel("비밀번호").setStyle(TextInputStyle.Short).setMaxLength(MAX_PW).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(pwInput));
  await interaction.showModal(modal);
}

async function showPwModal(interaction) {
  const owned = await findOwnedRoom(interaction.member);
  if (!owned) {
    await interaction.reply({ content: "본인이 개설한 비밀 채널을 찾을 수 없습니다.", ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId("secret_pw_modal").setTitle("비밀번호 확인/변경");
  const pwInput = new TextInputBuilder()
    .setCustomId("spw_new")
    .setLabel("현재 비밀번호(수정 가능)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(MAX_PW)
    .setRequired(true)
    .setValue(owned.pw);
  modal.addComponents(new ActionRowBuilder().addComponents(pwInput));
  await interaction.showModal(modal);
}

async function onInteractionCreate(interaction) {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "secret_create") {
        const guild = interaction.guild;
        if (!guild) return;
        const can = await ensureCanCreate(interaction.member);
        if (!can.ok) {
          await interaction.reply({ content: `개설 불가: ${can.reason}`, ephemeral: true });
          return;
        }
        await showCreateModal(interaction);
        return;
      }
      if (interaction.customId === "secret_join") {
        await showJoinModal(interaction);
        return;
      }
      if (interaction.customId === "secret_pw") {
        await showPwModal(interaction);
        return;
      }
      if (interaction.customId === "secret_delete") {
        await interaction.deferReply({ ephemeral: true });
        const res = await deleteOwnedRoom(interaction.member);
        if (!res.ok) {
          await interaction.editReply({ content: `삭제 불가: ${res.reason}` });
        } else {
          await interaction.editReply({ content: "비밀 채널을 삭제했습니다." });
        }
        return;
      }
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "secret_create_modal") {
        const name = normalizeName(interaction.fields.getTextInputValue("sc_name"));
        const pwRaw = interaction.fields.getTextInputValue("sc_pw");
        const pw = typeof pwRaw === "string" ? pwRaw.trim() : "";
        if (!name) {
          await interaction.reply({ content: "채널명이 올바르지 않습니다.", ephemeral: true });
          return;
        }
        if (!validatePassword(pw)) {
          await interaction.reply({ content: "비밀번호는 4~10자로 입력해주세요.", ephemeral: true });
          return;
        }
        if (passwordToRoom.has(pw)) {
          await interaction.reply({ content: "이미 사용 중인 비밀번호입니다.", ephemeral: true });
          return;
        }
        const can = await ensureCanCreate(interaction.member);
        if (!can.ok) {
          await interaction.reply({ content: `개설 불가: ${can.reason}`, ephemeral: true });
          return;
        }
        const currentCount = await countExistingRooms(interaction.guild);
        if (currentCount >= MAX_ROOMS) {
          await interaction.reply({ content: "더 이상 개설할 수 없습니다.", ephemeral: true });
          return;
        }
        try {
          await interaction.deferReply({ ephemeral: true });
          const balance = Number(getBE(interaction.member.id) || 0);
          if (balance < COST_BE) {
            await interaction.editReply({ content: `정수가 부족합니다. (필요 ${COST_BE.toLocaleString("ko-KR")}BE, 보유 ${balance.toLocaleString("ko-KR")}BE)` });
            return;
          }
          const room = await createRoom(interaction.member, name, pw);
          try {
            await addBE(interaction.member.id, -COST_BE, "비밀 채널 개설");
          } catch {
            try { await room.delete("정수 차감 실패로 개설 취소"); } catch {}
            await updateStatus(interaction.guild);
            await interaction.editReply({ content: "정수 차감 중 오류가 발생하여 개설이 취소되었습니다." });
            return;
          }
          await interaction.editReply({ content: "비밀 채널이 개설되었습니다. (100,000 정수 차감)" });
          await evaluateRoom(room, interaction.guild);
        } catch {
          await interaction.editReply({ content: "개설 중 오류가 발생했습니다." });
        }
        return;
      }
      if (interaction.customId === "secret_join_modal") {
        const pwRaw = interaction.fields.getTextInputValue("sj_pw");
        const pw = typeof pwRaw === "string" ? pwRaw.trim() : "";
        if (!validatePassword(pw)) {
          await interaction.reply({ content: "비밀번호와 일치하는 방이 없습니다.", ephemeral: true });
          return;
        }
        try {
          await interaction.deferReply({ ephemeral: true });
          const { channel: ch, moved } = await joinRoom(interaction.member, pw);
          if (moved) {
            await interaction.editReply({ content: "입장 완료." });
          } else {
            await interaction.editReply({ content: "해당되는 비밀 채널을 찾았습니다. 비밀 채널 카테고리에서 확인하세요" });
          }
          await evaluateRoom(ch, interaction.guild);
        } catch {
          await interaction.editReply({ content: "입장 실패." });
        }
        return;
      }
      if (interaction.customId === "secret_pw_modal") {
        const newPwRaw = interaction.fields.getTextInputValue("spw_new");
        const newPw = typeof newPwRaw === "string" ? newPwRaw.trim() : "";
        if (!validatePassword(newPw)) {
          await interaction.reply({ content: "비밀번호는 4~10자로 입력해주세요.", ephemeral: true });
          return;
        }
        const owned = await findOwnedRoom(interaction.member);
        if (!owned) {
          await interaction.reply({ content: "본인이 개설한 비밀 채널을 찾을 수 없습니다.", ephemeral: true });
          return;
        }
        const oldPw = owned.pw;
        if (newPw === oldPw) {
          await interaction.reply({ content: `변경 없음. 현재 비밀번호: ${newPw}`, ephemeral: true });
          return;
        }
        if (passwordToRoom.has(newPw)) {
          await interaction.reply({ content: "이미 사용 중인 비밀번호입니다.", ephemeral: true });
          return;
        }
        passwordToRoom.delete(oldPw);
        passwordToRoom.set(newPw, owned.info);
        writeRoomsToFile();
        await interaction.reply({ content: "비밀번호를 변경했습니다.", ephemeral: true });
        return;
      }
    }
  } catch {}
}

async function onVoiceStateUpdate(oldState, newState) {
  try {
    const guild = newState.guild || oldState.guild;
    const oldCh = oldState.channel;
    const newCh = newState.channel;
    if (oldCh && oldCh.parentId === CATEGORY_ID && oldCh.type === ChannelType.GuildVoice && oldCh.name.startsWith(PREFIX_EMOJI)) {
      await evaluateRoom(oldCh, guild);
    }
    if (newCh && newCh.parentId === CATEGORY_ID && newCh.type === ChannelType.GuildVoice && newCh.name.startsWith(PREFIX_EMOJI)) {
      await evaluateRoom(newCh, guild);
    }
  } catch {}
}

async function bootstrapStatus(client) {
  try {
    const guilds = client.guilds.cache;
    for (const [, g] of guilds) {
      const guild = await client.guilds.fetch(g.id);
      await updateStatus(guild);
    }
  } catch {}
}

function startSecretChannels(client) {
  client.on("ready", async () => {
    await restoreRooms(client);
    await bootstrapStatus(client);
    setInterval(async () => {
      try {
        const guilds = client.guilds.cache;
        for (const [, g] of guilds) {
          const guild = await client.guilds.fetch(g.id);
          await updateStatus(guild);
        }
      } catch {}
    }, 60 * 1000);
  });
  client.on("interactionCreate", onInteractionCreate);
  client.on("voiceStateUpdate", onVoiceStateUpdate);
  client.on("channelDelete", async (ch) => {
    try {
      if (ch && ch.type === ChannelType.GuildVoice && ch.parentId === CATEGORY_ID) {
        for (const [pw, info] of passwordToRoom.entries()) {
          if (info.channelId === ch.id) passwordToRoom.delete(pw);
        }
        writeRoomsToFile();
        const t = roomDeletionTimers.get(ch.id);
        if (t) {
          clearTimeout(t);
          roomDeletionTimers.delete(ch.id);
        }
        if (ch.guild) await updateStatus(ch.guild);
      }
    } catch {}
  });
}

module.exports = { startSecretChannels };
