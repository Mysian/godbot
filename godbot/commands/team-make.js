"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} = require("discord.js");

const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();

function parseIds(input) {
  if (!input) return [];
  const ids = new Set();
  const mentionRe = /<@!?(\d+)>/g;
  let m;
  while ((m = mentionRe.exec(input)) !== null) ids.add(m[1]);
  const tokens = input.split(/[\s,;\n]+/).map(s => s.trim()).filter(Boolean);
  for (const t of tokens) if (/^\d{10,19}$/.test(t)) ids.add(t);
  return Array.from(ids);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignTeams(state, ignoreLocks = false) {
  const teamCount = state.teamCount;
  const teams = Array.from({ length: teamCount }, () => []);
  const lockedInverse = new Map();
  if (!ignoreLocks) {
    for (const [uid, t] of state.locked.entries()) {
      if (!state.pool.includes(uid)) continue;
      if (!lockedInverse.has(t)) lockedInverse.set(t, []);
      lockedInverse.get(t).push(uid);
    }
    for (let i = 0; i < teamCount; i++) {
      const ls = lockedInverse.get(i) || [];
      teams[i].push(...ls);
    }
  }
  const lockedSet = ignoreLocks ? new Set() : new Set([...state.locked.keys()]);
  const assignables = state.pool.filter(u => !lockedSet.has(u));
  const order = shuffle(assignables);
  let idx = 0;
  for (const uid of order) {
    teams[idx % teamCount].push(uid);
    idx++;
  }
  state.teams = teams;
}

async function nameOf(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return m.displayName || m.user.username || userId;
  } catch {
    return userId;
  }
}

async function renderEmbed(interaction, state) {
  const guild = interaction.guild;
  const fields = [];
  for (let i = 0; i < state.teamCount; i++) {
    const members = state.teams[i] || [];
    const lines = [];
    for (const uid of members) {
      const n = await nameOf(guild, uid);
      const lockMark = state.locked.has(uid) ? "🔒" : "";
      lines.push(`${lockMark}<@${uid}> (${n})`);
    }
    fields.push({
      name: `팀 ${i + 1} (${members.length}명)`,
      value: lines.length ? lines.join("\n") : "없음",
      inline: false,
    });
  }
  const excludedNames = [];
  for (const uid of state.excluded) excludedNames.push(await nameOf(guild, uid));
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("팀 편성 결과")
    .setDescription(`총 ${state.pool.length}명, 팀 수 ${state.teamCount}개`)
    .addFields(fields)
    .setFooter({ text: excludedNames.length ? `예외: ${excludedNames.join(", ")}` : "예외 없음" });
  return embed;
}

function buildButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("team-make:reroll").setLabel("🎲랜덤 재편성").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("team-make:lock-reroll").setLabel("📌고정 재편성").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("team-make:add").setLabel("➕인원 추가").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("team-make:exclude").setLabel("➖인원 제외").setStyle(ButtonStyle.Danger),
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

function getFieldValue(fields, keys) {
  for (const k of keys) {
    try {
      const v = fields.getTextInputValue(k);
      if (typeof v === "string") return v;
    } catch {}
  }
  return "";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀짜기")
    .setDescription("인원을 입력해 팀을 편성합니다.")
    .addIntegerOption(o =>
      o.setName("팀_개수")
        .setDescription("2~4팀 중 선택")
        .setMinValue(2)
        .setMaxValue(4)
        .setRequired(true)
    ),
  async execute(interaction) {
    const teamCount = interaction.options.getInteger("팀_개수", true);
    const modal = new ModalBuilder().setCustomId("team-modal").setTitle("팀짜기");
    const inputMembers = new TextInputBuilder()
      .setCustomId("members")
      .setLabel("참여 인원 (멘션/ID, 공백/줄바꿈/쉼표 구분)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    const inputExcluded = new TextInputBuilder()
      .setCustomId("excluded")
      .setLabel("예외 멤버 (선택)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
    modal.addComponents(
      new ActionRowBuilder().addComponents(inputMembers),
      new ActionRowBuilder().addComponents(inputExcluded)
    );
    await interaction.showModal(modal);
    const submitted = await interaction.awaitModalSubmit({
      filter: i => i.customId === "team-modal" && i.user.id === interaction.user.id,
      time: 60_000,
    }).catch(() => null);
    if (!submitted) return;
    const membersRaw = getFieldValue(submitted.fields, ["members", "참여", "참여인원", "participants", "참여_인원"]);
    const excludedRaw = getFieldValue(submitted.fields, ["excluded", "예외", "제외", "exclude", "예외_멤버"]);
    const poolAll = parseIds(membersRaw);
    const excludedIds = new Set(parseIds(excludedRaw));
    const pool = poolAll.filter(id => !excludedIds.has(id));
    if (pool.length === 0) {
      return submitted.reply({ ephemeral: true, content: "편성할 인원이 없습니다." });
    }
    const state = {
      messageId: null,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      authorId: interaction.user.id,
      teamCount,
      pool,
      excluded: excludedIds,
      locked: new Map(),
      teams: [],
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    assignTeams(state, true);
    const embed = await renderEmbed(interaction, state);
    const rows = buildButtons();
    const reply = await submitted.reply({ embeds: [embed], components: rows, fetchReply: true });
    state.messageId = reply.id;
    sessions.set(reply.id, state);
    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: SESSION_TTL_MS });
    collector.on("collect", async i => {
      const cur = ensureSession(reply.id);
      if (!cur) return i.reply({ ephemeral: true, content: "세션이 만료되었습니다. 다시 실행해주세요." });
      if (i.user.id !== state.authorId) return i.reply({ ephemeral: true, content: "생성자만 사용할 수 있습니다." });
      if (i.customId === "team-make:reroll") {
        assignTeams(cur, true);
        const em = await renderEmbed(i, cur);
        await i.update({ embeds: [em], components: buildButtons() });
        return;
      }
      if (i.customId === "team-make:lock-reroll") {
        const m = new ModalBuilder().setCustomId("team-lock").setTitle("고정 재편성");
        const tip = new TextInputBuilder()
          .setCustomId("locks")
          .setLabel("형식: 팀번호: 멤버들 (예: 1: @a @b, 2: 1234567890)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);
        m.addComponents(new ActionRowBuilder().addComponents(tip));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({
          filter: x => x.customId === "team-lock" && x.user.id === state.authorId,
          time: 60_000,
        }).catch(() => null);
        if (!sub) return;
        const locksRaw = getFieldValue(sub.fields, ["locks", "lock", "고정", "고정_멤버"]);
        cur.locked.clear();
        const lines = locksRaw.split(/\n/).map(s => s.trim()).filter(Boolean);
        for (const line of lines) {
          const m2 = line.match(/^(\d+)\s*:\s*(.+)$/);
          if (!m2) continue;
          const tnum = Math.max(1, Math.min(cur.teamCount, parseInt(m2[1], 10))) - 1;
          const ids = parseIds(m2[2]);
          for (const uid of ids) if (cur.pool.includes(uid)) cur.locked.set(uid, tnum);
        }
        assignTeams(cur, false);
        const em = await renderEmbed(sub, cur);
        await sub.reply({ embeds: [em] });
        await i.message.edit({ embeds: [em], components: buildButtons() });
        return;
      }
      if (i.customId === "team-make:add") {
        const m = new ModalBuilder().setCustomId("team-add").setTitle("인원 추가");
        const tnum = new TextInputBuilder().setCustomId("team").setLabel("팀 번호 (1~" + cur.teamCount + ")").setStyle(TextInputStyle.Short).setRequired(true);
        const mems = new TextInputBuilder().setCustomId("members").setLabel("추가할 멤버 (멘션/ID)").setStyle(TextInputStyle.Paragraph).setRequired(true);
        m.addComponents(new ActionRowBuilder().addComponents(tnum), new ActionRowBuilder().addComponents(mems));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({
          filter: x => x.customId === "team-add" && x.user.id === state.authorId,
          time: 60_000,
        }).catch(() => null);
        if (!sub) return;
        const t = Math.max(1, Math.min(cur.teamCount, parseInt(getFieldValue(sub.fields, ["team", "팀", "팀번호"]), 10))) - 1;
        const ids = parseIds(getFieldValue(sub.fields, ["members", "추가", "추가_멤버"]));
        let changed = false;
        for (const uid of ids) {
          if (cur.excluded.has(uid)) cur.excluded.delete(uid);
          if (!cur.pool.includes(uid)) {
            cur.pool.push(uid);
            changed = true;
          }
          for (let k = 0; k < cur.teams.length; k++) {
            const pos = cur.teams[k].indexOf(uid);
            if (pos !== -1) cur.teams[k].splice(pos, 1);
          }
          if (!cur.teams[t]) cur.teams[t] = [];
          if (!cur.teams[t].includes(uid)) cur.teams[t].push(uid);
        }
        if (changed) assignTeams(cur, false);
        const em = await renderEmbed(sub, cur);
        await sub.reply({ embeds: [em] });
        await i.message.edit({ embeds: [em], components: buildButtons() });
        return;
      }
      if (i.customId === "team-make:exclude") {
        const m = new ModalBuilder().setCustomId("team-exclude").setTitle("인원 제외");
        const tnum = new TextInputBuilder().setCustomId("team").setLabel("팀 번호 (1~" + cur.teamCount + ")").setStyle(TextInputStyle.Short).setRequired(true);
        const mems = new TextInputBuilder().setCustomId("members").setLabel("제외할 멤버 (멘션/ID)").setStyle(TextInputStyle.Paragraph).setRequired(true);
        m.addComponents(new ActionRowBuilder().addComponents(tnum), new ActionRowBuilder().addComponents(mems));
        await i.showModal(m);
        const sub = await i.awaitModalSubmit({
          filter: x => x.customId === "team-exclude" && x.user.id === state.authorId,
          time: 60_000,
        }).catch(() => null);
        if (!sub) return;
        const t = Math.max(1, Math.min(cur.teamCount, parseInt(getFieldValue(sub.fields, ["team", "팀", "팀번호"]), 10))) - 1;
        const ids = parseIds(getFieldValue(sub.fields, ["members", "제외", "제외_멤버"]));
        for (const uid of ids) {
          if (cur.teams[t]) {
            const pos = cur.teams[t].indexOf(uid);
            if (pos !== -1) cur.teams[t].splice(pos, 1);
          }
          cur.excluded.add(uid);
          const ppos = cur.pool.indexOf(uid);
          if (ppos !== -1) cur.pool.splice(ppos, 1);
          cur.locked.delete(uid);
        }
        assignTeams(cur, false);
        const em = await renderEmbed(sub, cur);
        await sub.reply({ embeds: [em] });
        await i.message.edit({ embeds: [em], components: buildButtons() });
        return;
      }
    });
    collector.on("end", async () => {
      const cur = sessions.get(reply.id);
      if (!cur) return;
      sessions.delete(reply.id);
      try {
        await reply.edit({ components: [] });
      } catch {}
    });
  },
};
