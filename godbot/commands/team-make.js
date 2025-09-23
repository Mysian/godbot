"use strict";

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  AttachmentBuilder,
} = require("discord.js");
const { createCanvas } = require("canvas");

const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();

function isDiscordId(s) {
  return /^\d{10,20}$/.test(s || "");
}

function splitTokens(raw) {
  if (!raw) return [];
  return raw
    .replace(/<@!?(\d+)>/g, (_, id) => id)
    .replace(/\\n|\\r/g, "\n")
    .split(/[\n,;]+/)
    .map(s => s.replace(/^[•·\-–—]+\s*/g, "").replace(/^👑\s*/g, "").trim())
    .filter(Boolean);
}

function preferDisplayName(m) {
  return m.displayName || m.user?.globalName || m.user?.username || "";
}

function normalize(s) {
  return (s || "").trim().toLowerCase();
}

function resolveMemberIdsByTokensFromPool(poolMembers, raw) {
  const tokens = splitTokens(raw);
  const ids = new Set();
  const arr = Array.isArray(poolMembers) ? poolMembers : [...poolMembers.values()];
  for (const t of tokens) {
    if (isDiscordId(t)) {
      const has = arr.find(m => m.id === t);
      if (has) ids.add(t);
      continue;
    }
    const exact = arr.find(m => preferDisplayName(m) === t);
    if (exact) { ids.add(exact.id); continue; }
    const lower = t.toLowerCase();
    const ci = arr.filter(m => preferDisplayName(m).toLowerCase() === lower);
    if (ci.length === 1) { ids.add(ci[0].id); continue; }
    const part = arr.filter(m => preferDisplayName(m).toLowerCase().includes(lower));
    if (part.length === 1) { ids.add(part[0].id); continue; }
  }
  return Array.from(ids);
}

async function fetchAllNonBotMembers(guild) {
  try {
    const col = await guild.members.fetch();
    return [...col.values()].filter(m => !m.user.bot);
  } catch {
    return [];
  }
}

function pickUniqueId(list, predicate) {
  const hits = [];
  for (const m of list) if (predicate(m)) hits.push(m);
  return hits.length === 1 ? hits[0].id : null;
}

async function resolveMemberIdsByTokensFromGuild(guild, raw, preferMembers) {
  const tokens = splitTokens(raw);
  const out = new Set();
  const prefer = Array.isArray(preferMembers) ? preferMembers : [...(preferMembers?.values() || [])];
  const all = await fetchAllNonBotMembers(guild);

  for (const t of tokens) {
    if (isDiscordId(t)) {
      try {
        const m = await guild.members.fetch(t);
        if (m && !m.user.bot) { out.add(m.id); continue; }
      } catch {}
      out.add(t);
      continue;
    }
    const n = normalize(t);

    let id =
      pickUniqueId(prefer, m => preferDisplayName(m) === t || m.user?.username === t || m.user?.globalName === t) ||
      pickUniqueId(prefer, m => normalize(preferDisplayName(m)) === n || normalize(m.user?.username) === n || normalize(m.user?.globalName) === n) ||
      pickUniqueId(all, m => preferDisplayName(m) === t || m.user?.username === t || m.user?.globalName === t) ||
      pickUniqueId(all, m => normalize(preferDisplayName(m)) === n || normalize(m.user?.username) === n || normalize(m.user?.globalName) === n) ||
      pickUniqueId(prefer, m => normalize(preferDisplayName(m)).includes(n)) ||
      pickUniqueId(all, m => normalize(preferDisplayName(m)).includes(n));

    if (id) out.add(id);
    else out.add(t);
  }
  return [...out];
}

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function nameOf(guild, userId) {
  if (!isDiscordId(userId)) return String(userId);
  try {
    const m = await guild.members.fetch(userId);
    return preferDisplayName(m) || userId;
  } catch {
    return String(userId);
  }
}

function assignInitial(state) {
  const n = state.teamCount;
  const total = (Array.isArray(state.poolMembers) ? state.poolMembers : [...state.poolMembers.values()]).map(m => m.id);
  const leaders = state.leaderIds.map(id => (total.includes(id) ? id : null));
  const teams = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) if (leaders[i]) teams[i].push(leaders[i]);
  const seeded = new Set(leaders.filter(Boolean));
  const rest = shuffle(total.filter(id => !seeded.has(id)));
  for (const id of rest) {
    let minIdx = 0;
    for (let i = 1; i < n; i++) if (teams[i].length < teams[minIdx].length) minIdx = i;
    teams[minIdx].push(id);
  }
  state.teams = teams;
}

function assignWithLocks(state) {
  const n = state.teamCount;
  const total = (Array.isArray(state.poolMembers) ? state.poolMembers : [...state.poolMembers.values()]).map(m => m.id);
  const lockSet = new Set(state.lockedIds || []);
  const teams = Array.from({ length: n }, () => []);
  const current = state.teams || Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) teams[i] = current[i].filter(id => lockSet.has(id));
  const others = shuffle(total.filter(id => !lockSet.has(id)));
  for (const id of others) {
    let minIdx = 0;
    for (let i = 1; i < n; i++) if (teams[i].length < teams[minIdx].length) minIdx = i;
    teams[minIdx].push(id);
  }
  state.teams = teams;
}

async function renderTableImage(guild, state) {
  const n = state.teamCount;
  const lists = [];
  for (let i = 0; i < n; i++) {
    const arr = [];
    for (const id of state.teams[i]) {
      const nm = await nameOf(guild, id);
      const crown = state.leaderIds[i] && id === state.leaderIds[i] ? "👑 " : "• ";
      arr.push(crown + nm);
    }
    lists.push(arr);
  }
  const rows = Math.max(...lists.map(a => a.length), 1);
  const pad = 24;
  const colW = n === 4 ? 320 : 380;
  const rowH = 38;
  const headerH = 64;
  const titleH = 58;
  const gap = 22;
  const w = pad * 2 + colW * n + gap * (n - 1);
  const h = pad * 2 + titleH + headerH + rows * rowH + 20;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "#201a2b");
  grd.addColorStop(1, "#0d1224");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  ctx.globalAlpha = 0.08;
  ctx.fillText("KKA-RI TEAM MAKER", pad, pad + 22);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("팀 배정 결과", pad, pad + 34);
  const yBase = pad + titleH;
  function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
  const palettes = [
    ["#3b82f6", "#1d4ed8"],
    ["#ef4444", "#b91c1c"],
    ["#22c55e", "#15803d"],
    ["#f59e0b", "#b45309"],
  ];
  for (let i = 0; i < n; i++) {
    const x = pad + i * (colW + gap);
    roundRect(x, yBase, colW, headerH + rows * rowH + 14, 16);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    const hdrG = ctx.createLinearGradient(x, yBase, x, yBase + headerH);
    const pal = palettes[i % palettes.length];
    hdrG.addColorStop(0, pal[0]);
    hdrG.addColorStop(1, pal[1]);
    roundRect(x, yBase, colW, headerH, 16);
    ctx.fillStyle = hdrG;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.teamNames[i], x + colW / 2, yBase + 42);
    ctx.textAlign = "left";
    let y = yBase + headerH + 10;
    ctx.font = "20px sans-serif";
    for (let r = 0; r < rows; r++) {
      const text = lists[i][r] || "";
      const rowY = y + r * rowH;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(x + 10, rowY, colW - 20, rowH - 8, 10);
      ctx.fill();
      ctx.fillStyle = "#e8e8f0";
      ctx.fillText(text, x + 20, rowY + 24);
    }
  }
  return canvas.toBuffer("image/png");
}

async function renderEmbed(interaction, state) {
  const guild = interaction.guild;
  const toLines = async (ids, leaderId) => {
    const arr = [];
    for (const uid of ids) {
      const nm = await nameOf(guild, uid);
      if (leaderId && uid === leaderId) arr.push("👑 " + nm);
      else arr.push("• " + nm);
    }
    return arr.length ? arr.join("\n") : "(없음)";
  };
  const fields = [];
  for (let i = 0; i < state.teamCount; i++) {
    const lines = await toLines(state.teams[i] || [], state.leaderIds[i] || null);
    const badge = ["🟦", "🟥", "🟩", "🟨"][i] || "⬜";
    fields.push({ name: `${badge} ${state.teamNames[i]}`, value: lines, inline: true });
  }
  const png = await renderTableImage(guild, state);
  const file = new AttachmentBuilder(png, { name: "teams.png" });
  const embed = new EmbedBuilder()
    .setTitle("🎲 팀 배정 결과")
    .setColor(0x8e44ad)
    .addFields(...fields, { name: "📜 규칙", value: state.rule || "까리 피플, 파뤼 피플", inline: false })
    .setImage("attachment://teams.png");
  return { embed, file };
}

function buildButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("team:reroll").setLabel("🎲랜덤 재편성").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("team:lockreroll").setLabel("📌고정 재편성").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("team:add").setLabel("➕인원 추가").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("team:exclude").setLabel("➖인원 제외").setStyle(ButtonStyle.Danger)
  );
  return [row1, row2];
}

function ensureSession(messageId) {
  const s = sessions.get(messageId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(messageId);
    return null;
  }
  s.expiresAt = Date.now() + SESSION_TTL_MS;
  return s;
}

async function refreshPoolMembers(interaction, state) {
  try {
    const ch = await interaction.guild.channels.fetch(state.voiceChannelId).catch(() => null);
    const arr = [];
    if (ch && ch.members) {
      for (const m of ch.members.values()) if (!m.user.bot) arr.push(m);
    }
    const teamIds = new Set((state.teams || []).flat());
    for (const uid of teamIds) {
      if (!arr.find(m => m.id === uid)) {
        if (isDiscordId(uid)) {
          const gm = await interaction.guild.members.fetch(uid).catch(() => null);
          if (gm && !gm.user.bot) arr.push(gm);
          else arr.push({ id: uid, displayName: String(uid), user: { bot: false } });
        } else {
          arr.push({ id: uid, displayName: String(uid), user: { bot: false } });
        }
      }
    }
    state.poolMembers = arr;
  } catch {}
}

function parseNames(input, n) {
  const arr = (input || "").split(/[,，]+/).map(s => s.trim()).filter(Boolean);
  const names = [];
  for (let i = 0; i < n; i++) names.push(arr[i] || `팀${i + 1}`);
  return names;
}

function parseLeaders(poolMembers, input, n) {
  const arr = (input || "").split(/[,，]+/).map(s => s.trim()).filter(Boolean);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const token = arr[i];
    if (!token) { ids.push(null); continue; }
    const matched = resolveMemberIdsByTokensFromPool(poolMembers, token);
    ids.push(matched[0] || null);
  }
  return ids;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀짜기")
    .setDescription("랜덤 팀짜기")
    .addSubcommand(sc =>
      sc.setName("팀2개")
        .setDescription("2팀 랜덤 팀짜기 (예외멤버 선택 가능)")
        .addUserOption(opt => opt.setName("예외멤버1").setDescription("제외할 멤버1").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버2").setDescription("제외할 멤버2").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버3").setDescription("제외할 멤버3").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버4").setDescription("제외할 멤버4").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버5").setDescription("제외할 멤버5").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버6").setDescription("제외할 멤버6").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버7").setDescription("제외할 멤버7").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버8").setDescription("제외할 멤버8").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버9").setDescription("제외할 멤버9").setRequired(false))
    )
    .addSubcommand(sc =>
      sc.setName("팀3개")
        .setDescription("3팀 랜덤 팀짜기 (예외멤버 선택 가능)")
        .addUserOption(opt => opt.setName("예외멤버1").setDescription("제외할 멤버1").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버2").setDescription("제외할 멤버2").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버3").setDescription("제외할 멤버3").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버4").setDescription("제외할 멤버4").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버5").setDescription("제외할 멤버5").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버6").setDescription("제외할 멤버6").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버7").setDescription("제외할 멤버7").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버8").setDescription("제외할 멤버8").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버9").setDescription("제외할 멤버9").setRequired(false))
    )
    .addSubcommand(sc =>
      sc.setName("팀4개")
        .setDescription("4팀 랜덤 팀짜기 (예외멤버 선택 가능)")
        .addUserOption(opt => opt.setName("예외멤버1").setDescription("제외할 멤버1").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버2").setDescription("제외할 멤버2").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버3").setDescription("제외할 멤버3").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버4").setDescription("제외할 멤버4").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버5").setDescription("제외할 멤버5").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버6").setDescription("제외할 멤버6").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버7").setDescription("제외할 멤버7").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버8").setDescription("제외할 멤버8").setRequired(false))
        .addUserOption(opt => opt.setName("예외멤버9").setDescription("제외할 멤버9").setRequired(false))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const teamCount = sub === "팀4개" ? 4 : sub === "팀3개" ? 3 : 2;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return await interaction.reply({ content: "먼저 음성채널에 접속한 뒤 사용하세요.", ephemeral: true });
    }
    let members = voiceChannel.members.filter(m => !m.user.bot);
    for (let i = 1; i <= 9; i++) {
      const except = interaction.options.getUser(`예외멤버${i}`);
      if (except) members = members.filter(m => m.id !== except.id);
    }
    if (members.size < teamCount) {
      return await interaction.reply({ content: "참여 인원이 팀 수보다 적습니다.", ephemeral: true });
    }
    const modal = new ModalBuilder().setCustomId("team-modal").setTitle(`${teamCount}팀 옵션 입력`);
    const namesInput = new TextInputBuilder().setCustomId("names").setLabel("팀명들 (쉼표로 구분, 미입력시 자동)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100);
    const leadersInput = new TextInputBuilder().setCustomId("leaders").setLabel("조장들 (닉/디코닉, 쉼표로 구분, 선택)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400);
    const ruleInput = new TextInputBuilder().setCustomId("rule").setLabel("규칙 (미입력시: 까리 피플, 파뤼 피플)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60);
    modal.addComponents(
      new ActionRowBuilder().addComponents(namesInput),
      new ActionRowBuilder().addComponents(leadersInput),
      new ActionRowBuilder().addComponents(ruleInput)
    );
    await interaction.showModal(modal);
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: i => i.customId === "team-modal" && i.user.id === interaction.user.id,
      time: 60_000
    }).catch(() => null);
    if (!modalSubmit) return;
    const poolMembers = [...members.values()];
    const names = parseNames(modalSubmit.fields.getTextInputValue("names"), teamCount);
    const rule = modalSubmit.fields.getTextInputValue("rule")?.trim() || "까리 피플, 파뤼 피플";
    const leaderIds = parseLeaders(poolMembers, modalSubmit.fields.getTextInputValue("leaders"), teamCount);
    const state = {
      messageId: null,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      authorId: interaction.user.id,
      voiceChannelId: voiceChannel.id,
      teamCount,
      teamNames: names,
      rule,
      leaderIds,
      poolMembers,
      teams: [],
      lockedIds: [],
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    assignInitial(state);
    const { embed, file } = await renderEmbed(interaction, state);
    const rows = buildButtons();
    const msg = await modalSubmit.reply({ embeds: [embed], components: rows, files: [file], fetchReply: true });
    state.messageId = msg.id;
    sessions.set(msg.id, state);
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: SESSION_TTL_MS });
    collector.on("collect", async i => {
      const cur = ensureSession(msg.id);
      if (!cur) return i.reply({ ephemeral: true, content: "세션이 만료되었습니다. 다시 실행해주세요." });
      if (i.user.id !== cur.authorId) return i.reply({ ephemeral: true, content: "생성자만 사용할 수 있습니다." });
      await refreshPoolMembers(i, cur);
      if (i.customId === "team:reroll") {
        assignInitial(cur);
        const { embed: em, file: f } = await renderEmbed(i, cur);
        return i.update({ embeds: [em], components: buildButtons(), files: [f] });
      }
      if (i.customId === "team:lockreroll") {
        const m = new ModalBuilder().setCustomId("team:lock-modal").setTitle("고정 재편성");
        const mems = new TextInputBuilder().setCustomId("members").setLabel("고정할 멤버 (닉/멘션/ID, 쉼표 또는 줄바꿈)").setStyle(TextInputStyle.Paragraph).setRequired(false);
        m.addComponents(new ActionRowBuilder().addComponents(mems));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({ filter: x => x.customId === "team:lock-modal" && x.user.id === cur.authorId, time: 60_000 }).catch(() => null);
        if (!sub) return;
        cur.lockedIds = resolveMemberIdsByTokensFromPool(cur.poolMembers, sub.fields.getTextInputValue("members") || "");
        assignWithLocks(cur);
        const { embed: em, file: f } = await renderEmbed(sub, cur);
        await sub.deferUpdate();
        await i.message.edit({ embeds: [em], components: buildButtons(), files: [f] });
        return;
      }
      if (i.customId === "team:add") {
        const m = new ModalBuilder().setCustomId("team:add-modal").setTitle("인원 추가");
        const tnum = new TextInputBuilder().setCustomId("team").setLabel(`팀 번호 (1~${cur.teamCount})`).setStyle(TextInputStyle.Short).setRequired(true);
        const mems = new TextInputBuilder().setCustomId("members").setLabel("추가할 멤버 (닉/멘션/ID, 쉼표 또는 줄바꿈)").setStyle(TextInputStyle.Paragraph).setRequired(true);
        m.addComponents(new ActionRowBuilder().addComponents(tnum), new ActionRowBuilder().addComponents(mems));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({ filter: x => x.customId === "team:add-modal" && x.user.id === cur.authorId, time: 60_000 }).catch(() => null);
        if (!sub) return;
        const teamNo = Math.max(1, Math.min(cur.teamCount, parseInt(sub.fields.getTextInputValue("team"), 10)));
        const ids = await resolveMemberIdsByTokensFromGuild(i.guild, sub.fields.getTextInputValue("members"), cur.poolMembers);
        for (const uid of ids) {
          for (let k = 0; k < cur.teamCount; k++) cur.teams[k] = cur.teams[k].filter(id => id !== uid);
          if (!cur.teams[teamNo - 1].includes(uid)) cur.teams[teamNo - 1].push(uid);
          const hasInPool = (Array.isArray(cur.poolMembers) ? cur.poolMembers : [...cur.poolMembers]).find(m => m.id === uid);
          if (!hasInPool) {
            if (isDiscordId(uid)) {
              const gm = await i.guild.members.fetch(uid).catch(() => null);
              if (gm && !gm.user.bot) {
                if (Array.isArray(cur.poolMembers)) cur.poolMembers.push(gm);
                else cur.poolMembers = [...cur.poolMembers.values(), gm];
              } else {
                if (Array.isArray(cur.poolMembers)) cur.poolMembers.push({ id: uid, displayName: String(uid), user: { bot: false } });
                else cur.poolMembers = [...cur.poolMembers.values(), { id: uid, displayName: String(uid), user: { bot: false } }];
              }
            } else {
              if (Array.isArray(cur.poolMembers)) cur.poolMembers.push({ id: uid, displayName: String(uid), user: { bot: false } });
              else cur.poolMembers = [...cur.poolMembers.values(), { id: uid, displayName: String(uid), user: { bot: false } }];
            }
          }
        }
        const { embed: em, file: f } = await renderEmbed(sub, cur);
        await sub.deferUpdate();
        await i.message.edit({ embeds: [em], components: buildButtons(), files: [f] });
        return;
      }
      if (i.customId === "team:exclude") {
        const m = new ModalBuilder().setCustomId("team:exclude-modal").setTitle("인원 제외");
        const tnum = new TextInputBuilder().setCustomId("team").setLabel(`팀 번호 (1~${cur.teamCount})`).setStyle(TextInputStyle.Short).setRequired(true);
        const mems = new TextInputBuilder().setCustomId("members").setLabel("제외할 멤버 (닉/멘션/ID, 쉼표 또는 줄바꿈)").setStyle(TextInputStyle.Paragraph).setRequired(true);
        m.addComponents(new ActionRowBuilder().addComponents(tnum), new ActionRowBuilder().addComponents(mems));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({ filter: x => x.customId === "team:exclude-modal" && x.user.id === cur.authorId, time: 60_000 }).catch(() => null);
        if (!sub) return;
        const teamNo = Math.max(1, Math.min(cur.teamCount, parseInt(sub.fields.getTextInputValue("team"), 10)));
        const ids = await resolveMemberIdsByTokensFromGuild(i.guild, sub.fields.getTextInputValue("members"), cur.poolMembers);
        cur.teams[teamNo - 1] = cur.teams[teamNo - 1].filter(id => !ids.includes(id));
        for (let iTeam = 0; iTeam < cur.teamCount; iTeam++) {
          if (ids.includes(cur.leaderIds[iTeam])) cur.leaderIds[iTeam] = null;
        }
        cur.lockedIds = (cur.lockedIds || []).filter(id => !ids.includes(id));
        const { embed: em, file: f } = await renderEmbed(sub, cur);
        await sub.deferUpdate();
        await i.message.edit({ embeds: [em], components: buildButtons(), files: [f] });
        return;
      }
    });
    collector.on("end", async () => {
      const cur = sessions.get(msg.id);
      if (!cur) return;
      sessions.delete(msg.id);
      try {
        await msg.edit({ components: [] });
      } catch {}
    });
  }
};
