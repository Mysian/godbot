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

function splitTokens(raw) {
  if (!raw) return [];
  return raw
    .replace(/<@!?(\\d+)>/g, (_, id) => id)
    .split(/[\\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function resolveMemberIdsByTokens(poolMembers, raw) {
  const tokens = splitTokens(raw);
  const ids = new Set();
  for (const t of tokens) {
    if (/^\\d{10,20}$/.test(t)) {
      ids.add(t);
      continue;
    }
    const exact = poolMembers.find(m => (m.displayName || m.user?.username) === t);
    if (exact) {
      ids.add(exact.id);
      continue;
    }
    const lower = t.toLowerCase();
    const ci = poolMembers.filter(m => (m.displayName || m.user?.username || "").toLowerCase() === lower);
    if (ci.length === 1) {
      ids.add(ci[0].id);
      continue;
    }
    const part = poolMembers.filter(m => (m.displayName || m.user?.username || "").toLowerCase().includes(lower));
    if (part.length === 1) {
      ids.add(part[0].id);
      continue;
    }
  }
  return Array.from(ids);
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
  try {
    const m = await guild.members.fetch(userId);
    return m.displayName || m.user.username || userId;
  } catch {
    return userId;
  }
}

function findMemberByName(poolMembers, name) {
  if (!name) return null;
  const exact = poolMembers.find(m => m.displayName === name || m.user?.username === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  const ci = poolMembers.filter(m => (m.displayName || m.user?.username || "").toLowerCase() === lower);
  if (ci.length === 1) return ci[0];
  const part = poolMembers.filter(m => (m.displayName || m.user?.username || "").toLowerCase().includes(lower));
  return part.length === 1 ? part[0] : null;
}

function assignTwoTeams(state) {
  const members = state.poolMembers.map(m => m.id);
  const rest = shuffle(members);
  const mid = Math.ceil(rest.length / 2);
  state.team1 = rest.slice(0, mid);
  state.team2 = rest.slice(mid);
}

function assignWithLocks(state) {
  const total = state.poolMembers.map(m => m.id);
  const lockSet = new Set(state.lockedIds || []);
  const locked1 = state.team1.filter(id => lockSet.has(id));
  const locked2 = state.team2.filter(id => lockSet.has(id));
  const others = shuffle(total.filter(id => !lockSet.has(id)));
  const target1 = Math.ceil(total.length / 2);
  const team1 = locked1.slice();
  const team2 = locked2.slice();
  for (const id of others) {
    if (team1.length < target1) team1.push(id);
    else team2.push(id);
  }
  state.team1 = team1;
  state.team2 = team2;
}

async function renderTableImage(guild, state) {
  const t1 = [];
  const t2 = [];
  for (const id of state.team1) {
    const nm = await nameOf(guild, id);
    const crown = id === state.team1LeaderId ? "👑 " : "• ";
    t1.push(crown + nm);
  }
  for (const id of state.team2) {
    const nm = await nameOf(guild, id);
    const crown = id === state.team2LeaderId ? "👑 " : "• ";
    t2.push(crown + nm);
  }
  const rows = Math.max(t1.length, t2.length, 1);
  const pad = 28;
  const colW = 420;
  const rowH = 40;
  const headerH = 70;
  const titleH = 64;
  const gap = 26;
  const w = pad * 2 + colW * 2 + gap;
  const h = pad * 2 + titleH + headerH + rows * rowH + 24;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "#201a2b");
  grd.addColorStop(1, "#0d1224");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.globalAlpha = 0.08;
  ctx.fillText("KKA-RI TEAM MAKER", pad, pad + 24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("팀 배정 결과", pad, pad + 36);
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
  function drawColumn(x, colorTop, colorBody, title, items) {
    roundRect(x, yBase, colW, headerH + rows * rowH + 16, 18);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    const hdrG = ctx.createLinearGradient(x, yBase, x, yBase + headerH);
    hdrG.addColorStop(0, colorTop);
    hdrG.addColorStop(1, colorBody);
    roundRect(x, yBase, colW, headerH, 18);
    ctx.fillStyle = hdrG;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, x + colW / 2, yBase + 44);
    ctx.textAlign = "left";
    let y = yBase + headerH + 12;
    ctx.font = "20px sans-serif";
    for (let i = 0; i < rows; i++) {
      const text = items[i] || "";
      const rowY = y + i * rowH;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(x + 12, rowY, colW - 24, rowH - 8, 10);
      ctx.fill();
      ctx.fillStyle = "#e8e8f0";
      ctx.fillText(text, x + 22, rowY + 26);
    }
  }
  drawColumn(pad, "#3b82f6", "#1d4ed8", state.team1Name, t1);
  drawColumn(pad + colW + gap, "#ef4444", "#b91c1c", state.team2Name, t2);
  return canvas.toBuffer("image/png");
}

async function renderEmbed(interaction, state) {
  const guild = interaction.guild;
  const toLines = async (ids, crownId) => {
    const arr = [];
    for (const uid of ids) {
      const nm = await nameOf(guild, uid);
      if (crownId && uid === crownId) arr.push("👑 " + nm);
      else arr.push("• " + nm);
    }
    return arr.length ? arr.join("\\n") : "(없음)";
  };
  const team1Lines = await toLines(state.team1, state.team1LeaderId);
  const team2Lines = await toLines(state.team2, state.team2LeaderId);
  const png = await renderTableImage(guild, state);
  const file = new AttachmentBuilder(png, { name: "teams.png" });
  const embed = new EmbedBuilder()
    .setTitle("🎲 팀 배정 결과")
    .setColor(0x8e44ad)
    .addFields(
      { name: "🟦 " + state.team1Name, value: team1Lines, inline: true },
      { name: "🟥 " + state.team2Name, value: team2Lines, inline: true },
      { name: "📜 규칙", value: state.rule || "까리 피플, 파뤼 피플", inline: false }
    )
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
  return s;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀짜기")
    .setDescription("2팀 랜덤 팀짜기 (예외멤버, 팀명, 조장, 규칙 모두 가능)")
    .addUserOption(opt => opt.setName("예외멤버1").setDescription("제외할 멤버1").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버2").setDescription("제외할 멤버2").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버3").setDescription("제외할 멤버3").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버4").setDescription("제외할 멤버4").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버5").setDescription("제외할 멤버5").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버6").setDescription("제외할 멤버6").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버7").setDescription("제외할 멤버7").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버8").setDescription("제외할 멤버8").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버9").setDescription("제외할 멤버9").setRequired(false)),
  async execute(interaction) {
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
    if (members.size < 2) {
      return await interaction.reply({ content: "참여 인원이 너무 적습니다.", ephemeral: true });
    }
    let memberArr = [...members.values()];
    const modal = new ModalBuilder().setCustomId("team-modal").setTitle("팀짜기 옵션 입력");
    const team1Input = new TextInputBuilder().setCustomId("team1name").setLabel("팀1 이름(이모지/이름)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20);
    const team2Input = new TextInputBuilder().setCustomId("team2name").setLabel("팀2 이름(이모지/이름)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20);
    const leader1Input = new TextInputBuilder().setCustomId("leader1").setLabel("1팀 조장 (닉/디코닉, 미입력시 없음)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32);
    const leader2Input = new TextInputBuilder().setCustomId("leader2").setLabel("2팀 조장 (닉/디코닉, 미입력시 없음)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32);
    const ruleInput = new TextInputBuilder().setCustomId("rule").setLabel("규칙 (미입력시: 까리 피플, 파뤼 피플)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40);
    modal.addComponents(
      new ActionRowBuilder().addComponents(team1Input),
      new ActionRowBuilder().addComponents(team2Input),
      new ActionRowBuilder().addComponents(leader1Input),
      new ActionRowBuilder().addComponents(leader2Input),
      new ActionRowBuilder().addComponents(ruleInput)
    );
    await interaction.showModal(modal);
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: i => i.customId === "team-modal" && i.user.id === interaction.user.id,
      time: 60_000
    }).catch(() => null);
    if (!modalSubmit) return;
    const team1Name = modalSubmit.fields.getTextInputValue("team1name")?.trim() || "팀1";
    const team2Name = modalSubmit.fields.getTextInputValue("team2name")?.trim() || "팀2";
    const leader1 = modalSubmit.fields.getTextInputValue("leader1")?.trim();
    const leader2 = modalSubmit.fields.getTextInputValue("leader2")?.trim();
    const rule = modalSubmit.fields.getTextInputValue("rule")?.trim() || "까리 피플, 파뤼 피플";
    let team1LeaderMember = leader1 ? findMemberByName(memberArr, leader1) : null;
    let team2LeaderMember = leader2 ? findMemberByName(memberArr, leader2) : null;
    if (leader1 && !team1LeaderMember) return await modalSubmit.reply({ content: `팀1 조장 닉네임 [${leader1}]과 일치하는 유저가 음성채널에 없습니다.`, ephemeral: true });
    if (leader2 && !team2LeaderMember) return await modalSubmit.reply({ content: `팀2 조장 닉네임 [${leader2}]과 일치하는 유저가 음성채널에 없습니다.`, ephemeral: true });
    if (team1LeaderMember && team2LeaderMember && team1LeaderMember.id === team2LeaderMember.id) return await modalSubmit.reply({ content: "조장은 서로 다른 사람이어야 합니다.", ephemeral: true });
    const state = {
      messageId: null,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      authorId: interaction.user.id,
      team1Name,
      team2Name,
      rule,
      team1LeaderId: team1LeaderMember?.id || null,
      team2LeaderId: team2LeaderMember?.id || null,
      poolMembers: memberArr,
      team1: [],
      team2: [],
      lockedIds: [],
      expiresAt: Date.now() + SESSION_TTL_MS
    };
    assignTwoTeams(state);
    if (state.team1LeaderId) {
      if (!state.team1.includes(state.team1LeaderId)) {
        state.team2 = state.team2.filter(id => id !== state.team1LeaderId);
        state.team1.unshift(state.team1LeaderId);
      }
    }
    if (state.team2LeaderId) {
      if (!state.team2.includes(state.team2LeaderId)) {
        state.team1 = state.team1.filter(id => id !== state.team2LeaderId);
        state.team2.unshift(state.team2LeaderId);
      }
    }
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
      if (i.customId === "team:reroll") {
        assignTwoTeams(cur);
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
        const raw = sub.fields.getTextInputValue("members") || "";
        const ids = resolveMemberIdsByTokens(cur.poolMembers, raw);
        cur.lockedIds = ids;
        assignWithLocks(cur);
        const { embed: em, file: f } = await renderEmbed(sub, cur);
        await sub.reply({ embeds: [em], files: [f] });
        await i.message.edit({ embeds: [em], components: buildButtons(), files: [f] });
        return;
      }
      if (i.customId === "team:add") {
        const m = new ModalBuilder().setCustomId("team:add-modal").setTitle("인원 추가");
        const tnum = new TextInputBuilder().setCustomId("team").setLabel("팀 번호 (1 또는 2)").setStyle(TextInputStyle.Short).setRequired(true);
        const mems = new TextInputBuilder().setCustomId("members").setLabel("추가할 멤버 (닉/멘션/ID, 쉼표 또는 줄바꿈)").setStyle(TextInputStyle.Paragraph).setRequired(true);
        m.addComponents(new ActionRowBuilder().addComponents(tnum), new ActionRowBuilder().addComponents(mems));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({ filter: x => x.customId === "team:add-modal" && x.user.id === cur.authorId, time: 60_000 }).catch(() => null);
        if (!sub) return;
        const teamNo = Math.max(1, Math.min(2, parseInt(sub.fields.getTextInputValue("team"), 10)));
        const raw = sub.fields.getTextInputValue("members");
        const ids = resolveMemberIdsByTokens(cur.poolMembers, raw);
        for (const uid of ids) {
          if (!cur.poolMembers.find(m => m.id === uid)) continue;
          cur.team1 = cur.team1.filter(id => id !== uid);
          cur.team2 = cur.team2.filter(id => id !== uid);
          if (teamNo === 1 && !cur.team1.includes(uid)) cur.team1.push(uid);
          if (teamNo === 2 && !cur.team2.includes(uid)) cur.team2.push(uid);
        }
        const { embed: em, file: f } = await renderEmbed(sub, cur);
        await sub.reply({ embeds: [em], files: [f] });
        await i.message.edit({ embeds: [em], components: buildButtons(), files: [f] });
        return;
      }
      if (i.customId === "team:exclude") {
        const m = new ModalBuilder().setCustomId("team:exclude-modal").setTitle("인원 제외");
        const tnum = new TextInputBuilder().setCustomId("team").setLabel("팀 번호 (1 또는 2)").setStyle(TextInputStyle.Short).setRequired(true);
        const mems = new TextInputBuilder().setCustomId("members").setLabel("제외할 멤버 (닉/멘션/ID, 쉼표 또는 줄바꿈)").setStyle(TextInputStyle.Paragraph).setRequired(true);
        m.addComponents(new ActionRowBuilder().addComponents(tnum), new ActionRowBuilder().addComponents(mems));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({ filter: x => x.customId === "team:exclude-modal" && x.user.id === cur.authorId, time: 60_000 }).catch(() => null);
        if (!sub) return;
        const teamNo = Math.max(1, Math.min(2, parseInt(sub.fields.getTextInputValue("team"), 10)));
        const raw = sub.fields.getTextInputValue("members");
        const ids = resolveMemberIdsByTokens(cur.poolMembers, raw);
        if (teamNo === 1) cur.team1 = cur.team1.filter(id => !ids.includes(id));
        if (teamNo === 2) cur.team2 = cur.team2.filter(id => !ids.includes(id));
        if (ids.includes(cur.team1LeaderId)) cur.team1LeaderId = null;
        if (ids.includes(cur.team2LeaderId)) cur.team2LeaderId = null;
        cur.lockedIds = (cur.lockedIds || []).filter(id => !ids.includes(id));
        const { embed: em, file: f } = await renderEmbed(sub, cur);
        await sub.reply({ embeds: [em], files: [f] });
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
