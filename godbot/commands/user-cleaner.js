const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "../data");
const JSON_SCAN_DIRS = [DATA_DIR];
const BACKUP_DIR = path.join(DATA_DIR, "clean-backups");
const MAX_SCAN_PER_CHANNEL = 1000;
const FETCH_PAGE = 100;
const RESULT_LOG_CHANNEL_ID = "1380874052855529605";

const INCLUDED_CHANNEL_IDS = [
  "1202425624061415464",
  "1215257953318215780",
  "1209147973255036959",
  "1215630657393528842",
  "1245237572419194941",
  "1278900389537648691",
];
const INCLUDED_CATEGORY_IDS = [
  "1207980297854124032",
  "1318529703480397954",
  "1318445879455125514",
  "1247743962014420992",
  "1221787886408564786",
  "1273762376889532426",
  "1369008627045765173",
];

const sessions = new Map();
const activeJobs = new Map();

function progressBar(done, total, width = 24) {
  if (!total || total <= 0) return `[${" ".repeat(width)}] 0%`;
  const ratio = Math.max(0, Math.min(1, done / total));
  const filled = Math.round(width * ratio);
  return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}] ${Math.floor(ratio * 100)}%`;
}
function throttle(session, ms = 1200) {
  const now = Date.now();
  if (!session._lastTick || now - session._lastTick >= ms) {
    session._lastTick = now;
    return true;
  }
  return false;
}
function loadingEmbed(title, subtitle, done, total, lines = []) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x3498db)
    .setDescription(
      [
        subtitle,
        "",
        progressBar(done, total),
        `진행: ${done.toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")}`,
      ]
        .concat(lines.length ? ["", ...lines] : [])
        .join("\n")
    );
}
function nowTs() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function parseIds(raw) {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/[<@!>]/g, ""))
        .filter((s) => /^\d{8,}$/.test(s))
    )
  );
}

function channelIsIncluded(ch) {
  if (!ch) return false;
  if (INCLUDED_CHANNEL_IDS.includes(ch.id)) return true;
  if (INCLUDED_CATEGORY_IDS.includes(ch.parentId)) return true;
  return false;
}

function listTextLikeChannels(guild) {
  const arr = [];
  guild.channels.cache.forEach((ch) => {
    if (
      ch &&
      (
        ch.type === ChannelType.GuildText ||
        ch.type === ChannelType.GuildAnnouncement ||
        ch.type === ChannelType.GuildForum
      ) &&
      channelIsIncluded(ch)
    ) {
      arr.push(ch);
    }
  });
  return arr;
}

async function fetchAllThreadsOfChannel(channel) {
  const threads = [];
  try {
    if (channel.threads?.fetchActive) {
      const active = await channel.threads.fetchActive();
      active?.threads?.forEach((t) => threads.push(t));
    }
  } catch {}
  try {
    if (channel.threads?.fetchArchived) {
      let before;
      while (true) {
        const archived = await channel.threads.fetchArchived({ before, limit: 100 }).catch(() => null);
        if (!archived || archived.threads.size === 0) break;
        archived.threads.forEach((t) => threads.push(t));
        before = archived.threads.last()?.id;
        if (archived.threads.size < 100) break;
      }
    }
  } catch {}
  return threads;
}

function extractMentionUserIds(msg) {
  const set = new Set();
  try {
    msg.mentions?.users?.forEach((u) => set.add(u.id));
  } catch {}
  try {
    const re = /<@!?(\d{8,})>/g;
    let m;
    while ((m = re.exec(msg.content || ""))) set.add(m[1]);
  } catch {}
  return set;
}

async function scanChannelForTargets(channel, targetIdsSet, cutoffMs, includeTagged, onProgress, abortSignal) {
  const result = { own: new Map(), tagged: new Map(), ownCount: 0, taggedCount: 0 };

  async function scanOne(container) {
    let fetched = 0;
    let before;
    while (true) {
      if (abortSignal?.aborted) break;
      const batch = await container.messages.fetch({ limit: FETCH_PAGE, before }).catch(() => null);
      if (!batch || batch.size === 0) break;
      const messages = Array.from(batch.values());
      for (const msg of messages) {
        if (abortSignal?.aborted) break;
        before = msg.id;
        fetched += 1;
        if (cutoffMs && msg.createdTimestamp && msg.createdTimestamp < cutoffMs) return;

        if (targetIdsSet.has(msg.author?.id)) {
          let arr = result.own.get(container.id);
          if (!arr) {
            arr = [];
            result.own.set(container.id, arr);
          }
          arr.push(msg.id);
          result.ownCount += 1;
        } else if (includeTagged) {
          const mentionIds = extractMentionUserIds(msg);
          let hasTarget = false;
          let hasOther = false;
          for (const uid of mentionIds) {
            if (targetIdsSet.has(uid)) hasTarget = true;
            else hasOther = true;
            if (hasTarget && hasOther) break;
          }
          if (hasTarget && !hasOther) {
            let arr = result.tagged.get(container.id);
            if (!arr) {
              arr = [];
              result.tagged.set(container.id, arr);
            }
            arr.push(msg.id);
            result.taggedCount += 1;
          }
        }
      }
      if (onProgress && fetched % 300 === 0) await onProgress(fetched);
      if (fetched >= MAX_SCAN_PER_CHANNEL) break;
    }
  }

  if (!channel) return result;

  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
    await scanOne(channel);
    const threads = await fetchAllThreadsOfChannel(channel);
    for (const th of threads) {
      if (abortSignal?.aborted) break;
      await scanOne(th);
    }
  } else if (
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.AnnouncementThread
  ) {
    await scanOne(channel);
  } else if (channel.type === ChannelType.GuildForum) {
    const threads = await fetchAllThreadsOfChannel(channel);
    for (const th of threads) {
      if (abortSignal?.aborted) break;
      await scanOne(th);
    }
  }

  return result;
}

function enumerateJsonFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const stack = [dir];
      while (stack.length) {
        const cur = stack.pop();
        const st = fs.statSync(cur);
        if (st.isDirectory()) {
          const ents = fs.readdirSync(cur);
          for (const e of ents) stack.push(path.join(cur, e));
        } else if (st.isFile() && cur.toLowerCase().endsWith(".json")) {
          files.push(cur);
        }
      }
    } catch {}
  }
  return files;
}

function deepCleanJson(value, targetIdsSet) {
  let removed = 0;
  let changed = false;
  function clean(v) {
    if (v === null || v === undefined) return v;
    if (typeof v === "string") {
      if (targetIdsSet.has(v)) {
        changed = true;
        removed += 1;
        return undefined;
      }
      const replaced = v.replace(/\d{8,}/g, (m) => (targetIdsSet.has(m) ? "" : m));
      if (replaced !== v) {
        changed = true;
        return replaced;
      }
      return v;
    }
    if (typeof v === "number") {
      if (targetIdsSet.has(String(v))) {
        changed = true;
        removed += 1;
        return undefined;
      }
      return v;
    }
    if (Array.isArray(v)) {
      const nv = [];
      for (const item of v) {
        const cleaned = clean(item);
        if (cleaned !== undefined) nv.push(cleaned);
        else changed = true;
      }
      return nv;
    }
    if (typeof v === "object") {
      const nv = {};
      for (const [k, vv] of Object.entries(v)) {
        if (targetIdsSet.has(k)) {
          removed += 1;
          changed = true;
          continue;
        }
        const cleaned = clean(vv);
        if (cleaned !== undefined) nv[k] = cleaned;
        else changed = true;
      }
      return nv;
    }
    return v;
  }
  const cleaned = clean(value);
  return { cleaned, removed, changed };
}

function safeReadJson(file) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
function safeWriteJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}
function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
function backupFile(src, sessionId) {
  try {
    ensureBackupDir();
    const base = path.basename(src);
    const out = path.join(BACKUP_DIR, `${nowTs()}_${sessionId}_${base}`);
    fs.copyFileSync(src, out);
    return out;
  } catch {
    return null;
  }
}
function fmtInt(n) {
  return n.toLocaleString("ko-KR");
}

function buildPlanEmbed(session, totalChannels) {
  const e = new EmbedBuilder()
    .setTitle("유저청소 · 계획")
    .setColor(0x8e44ad)
    .setDescription("아래 내역은 스캔/삭제 계획이며, [삭제 확정] 전에는 실제 삭제되지 않아.")
    .addFields(
      { name: "대상 ID", value: session.targetIds.join(", "), inline: false },
      { name: "옵션", value: `메시지삭제 ${session.opts.deleteMessages ? "ON" : "OFF"} · 태그삭제 ${session.opts.deleteTagged ? "ON" : "OFF"} · JSON정리 ${session.opts.cleanJson ? "ON" : "OFF"} · 스캔기간 ${session.opts.days}일`, inline: false },
      { name: "스캔 범위", value: `채널 ${fmtInt(totalChannels)}개 (지정된 채널/카테고리만)`, inline: false },
      { name: "메시지(본인)", value: session.scanDone ? `${fmtInt(session.stats.own)}` : "스캔 전", inline: true },
      { name: "메시지(태그됨)", value: session.opts.deleteTagged ? (session.scanDone ? `${fmtInt(session.stats.tagged)}` : "스캔 전") : "OFF", inline: true },
      { name: "JSON 파일", value: session.scanDone ? `${fmtInt(session.json.matches)}개 파일에서 정리 대상 발견` : "스캔 전", inline: true },
    )
    .setFooter({ text: `세션 ${session.id} · 태그 메시지에 대상 외 인원 포함 시 제외` });
  return e;
}

function buildButtons(session, stage) {
  const row = new ActionRowBuilder();
  const scanBtn = new ButtonBuilder().setCustomId(`usercleanup_scan_${session.id}`).setLabel("스캔 실행").setStyle(ButtonStyle.Primary);
  const confirmBtn = new ButtonBuilder().setCustomId(`usercleanup_confirm_${session.id}`).setLabel("삭제 확정").setStyle(ButtonStyle.Danger).setDisabled(!session.scanDone);
  const cancelBtn = new ButtonBuilder().setCustomId(`usercleanup_cancel_${session.id}`).setLabel("취소").setStyle(ButtonStyle.Secondary);
  if (stage === "done") {
    confirmBtn.setDisabled(true);
    scanBtn.setDisabled(true);
  }
  row.addComponents(scanBtn, confirmBtn, cancelBtn);
  return [row];
}

async function ensurePermissions(interaction) {
  const me = await interaction.guild.members.fetchMe();
  const ok =
    me.permissions.has(PermissionFlagsBits.ManageMessages) &&
    me.permissions.has(PermissionFlagsBits.ReadMessageHistory) &&
    me.permissions.has(PermissionFlagsBits.ManageThreads);
  return ok;
}

async function runScan(interaction, session) {
  const cutoffMs = session.opts.days > 0 ? Date.now() - session.opts.days * 24 * 60 * 60 * 1000 : null;
  const channels = listTextLikeChannels(interaction.guild).sort((a, b) => a.position - b.position);
  const totalChannels = Math.max(1, channels.length);
  const targetIdsSet = new Set(session.targetIds);
  const abortController = new AbortController();
  session.abortController = abortController;
  session.scanDone = false;
  session.stats = { own: 0, tagged: 0, perChannel: [] };
  session.msgPlan = { own: new Map(), tagged: new Map() };
  session.json = { matches: 0, files: [], sample: [] };

  await interaction.editReply({
    embeds: [loadingEmbed("유저청소 · 스캔중", "지정된 채널/카테고리만 스캔 중.", 0, totalChannels, [
      `대상: ${session.targetIds.join(", ")}`,
      `옵션: 메시지삭제 ${session.opts.deleteMessages ? "ON" : "OFF"} · 태그삭제 ${session.opts.deleteTagged ? "ON" : "OFF"} · JSON정리 ${session.opts.cleanJson ? "ON" : "OFF"} · 기간 ${session.opts.days}일`,
    ])],
    components: buildButtons(session, "plan"),
  }).catch(() => {});

  let chIndex = 0;
  for (const ch of channels) {
    if (abortController.aborted) break;
    chIndex += 1;
    const res = await scanChannelForTargets(
      ch,
      targetIdsSet,
      cutoffMs,
      session.opts.deleteTagged,
      async () => {
        if (throttle(session)) {
          await interaction.editReply({
            embeds: [loadingEmbed("유저청소 · 스캔중", "지정된 채널/카테고리만 스캔 중.", chIndex - 1, totalChannels, [
              `발견: 본인메시지 ${fmtInt(session.stats.own)} · 태그됨 ${fmtInt(session.stats.tagged)}`,
            ])],
            components: buildButtons(session, "plan"),
          }).catch(() => {});
        }
      },
      abortController.signal
    );
    session.stats.own += res.ownCount;
    session.stats.tagged += res.taggedCount;
    if (res.own.size) {
      for (const [cid, arr] of res.own.entries()) {
        const prev = session.msgPlan.own.get(cid) || [];
        session.msgPlan.own.set(cid, prev.concat(arr));
      }
    }
    if (res.tagged.size) {
      for (const [cid, arr] of res.tagged.entries()) {
        const prev = session.msgPlan.tagged.get(cid) || [];
        session.msgPlan.tagged.set(cid, prev.concat(arr));
      }
    }
    await interaction.editReply({
      embeds: [loadingEmbed("유저청소 · 스캔중", "지정된 채널/카테고리만 스캔 중.", chIndex, totalChannels, [
        `발견: 본인메시지 ${fmtInt(session.stats.own)} · 태그됨 ${fmtInt(session.stats.tagged)}`,
      ])],
      components: buildButtons(session, "plan"),
    }).catch(() => {});
  }

  await interaction.editReply({
    embeds: [loadingEmbed("유저청소 · 스캔중", "봇 JSON 데이터에서 흔적을 찾는 중.", 0, 1, [
      `현재까지 발견: 본인 ${fmtInt(session.stats.own)} · 태그 ${fmtInt(session.stats.tagged)}`,
    ])],
    components: buildButtons(session, "plan"),
  }).catch(() => {});

  const files = enumerateJsonFiles(JSON_SCAN_DIRS);
  let jsonMatches = 0;
  const sampleShows = [];
  for (const f of files) {
    const obj = safeReadJson(f);
    if (!obj) continue;
    const { cleaned, removed, changed } = deepCleanJson(obj, targetIdsSet);
    if (changed || removed > 0) {
      jsonMatches += 1;
      session.json.files.push({ path: f, removed, changed });
      if (sampleShows.length < 10) sampleShows.push(path.relative(process.cwd(), f));
    }
  }
  session.json.matches = jsonMatches;
  session.json.sample = sampleShows;
  session.scanDone = true;
  session._totalChannels = totalChannels;
}

async function deletePlannedMessages(interaction, session, onTick) {
  const targetOwn = session.msgPlan.own;
  const targetTagged = session.opts.deleteTagged ? session.msgPlan.tagged : new Map();

  const totalOwn = Array.from(targetOwn.values()).reduce((a, b) => a + b.length, 0);
  const totalTagged = Array.from(targetTagged.values()).reduce((a, b) => a + b.length, 0);
  const total = Math.max(1, totalOwn + totalTagged);

  let deleted = 0, deletedOwn = 0, deletedTagged = 0;

  for (const [cid, ids] of targetOwn.entries()) {
    const ch = interaction.guild.channels.cache.get(cid);
    if (!ch || !ids?.length) continue;
    for (const mid of ids) {
      try {
        const m = await ch.messages.fetch(mid).catch(() => null);
        if (m) await m.delete().catch(() => {});
        deleted += 1; deletedOwn += 1;
        if (onTick && throttle(session, 800)) await onTick({ deleted, total, deletedOwn, deletedTagged });
      } catch {}
    }
  }

  for (const [cid, ids] of targetTagged.entries()) {
    const ch = interaction.guild.channels.cache.get(cid);
    if (!ch || !ids?.length) continue;
    for (const mid of ids) {
      try {
        const m = await ch.messages.fetch(mid).catch(() => null);
        if (m) await m.delete().catch(() => {});
        deleted += 1; deletedTagged += 1;
        if (onTick && throttle(session, 800)) await onTick({ deleted, total, deletedOwn, deletedTagged });
      } catch {}
    }
  }
  if (onTick) await onTick({ deleted, total, deletedOwn, deletedTagged });
  return { deletedOwn, deletedTagged };
}

async function cleanJsonFiles(session, onTick) {
  const targetIdsSet = new Set(session.targetIds);
  ensureBackupDir();
  let filesTouched = 0;
  let keysRemoved = 0;

  const total = Math.max(1, session.json.files.length);
  let done = 0;

  for (const entry of session.json.files) {
    try {
      const obj = safeReadJson(entry.path);
      if (obj) {
        const { cleaned, removed, changed } = deepCleanJson(obj, targetIdsSet);
        if (changed || removed > 0) {
          backupFile(entry.path, session.id);
          safeWriteJson(entry.path, cleaned);
          filesTouched += 1;
          keysRemoved += removed;
        }
      }
    } catch {}
    done += 1;
    if (onTick && throttle(session, 800)) await onTick({ done, total, filesTouched, keysRemoved });
  }
  if (onTick) await onTick({ done, total, filesTouched, keysRemoved });
  return { filesTouched, keysRemoved };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("유저청소")
    .setDescription("퇴장한 유저의 메시지/태그/JSON 흔적을 정리하기 위한 계획·실행 도우미")
    .addStringOption((opt) =>
      opt
        .setName("대상")
        .setDescription("유저 ID를 쉼표로 여러 개 입력 (예: 123,456)")
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("스캔일수")
        .setDescription("최근 며칠치까지 스캔 (기본 30, 0이면 제한 없음)")
        .setMinValue(0)
        .setMaxValue(3650)
    )
    .addBooleanOption((opt) =>
      opt.setName("메시지삭제").setDescription("대상의 모든 메시지 삭제 (기본 ON)")
    )
    .addBooleanOption((opt) =>
      opt.setName("태그삭제").setDescription("대상이 태그된 메시지도 삭제 (기본 ON, 단 대상 외 유저가 하나라도 태그된 메시지는 제외)")
    )
    .addBooleanOption((opt) =>
      opt.setName("json정리").setDescription("봇 데이터(JSON)에서 대상 흔적 제거 (기본 ON)")
    ),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ ephemeral: true, content: "길드에서만 사용 가능해." });
    }
    const ok = await ensurePermissions(interaction);
    if (!ok) {
      return interaction.reply({ ephemeral: true, content: "권한 부족: 메시지 관리/메시지 기록 보기/스레드 관리가 필요해." });
    }
    const raw = interaction.options.getString("대상");
    const ids = parseIds(raw);
    if (!ids.length) {
      return interaction.reply({ ephemeral: true, content: "유효한 유저 ID를 하나 이상 입력해줘." });
    }
    const days = interaction.options.getInteger("스캔일수") ?? 30;
    const deleteMessages = interaction.options.getBoolean("메시지삭제");
    const deleteTagged = interaction.options.getBoolean("태그삭제");
    const cleanJson = interaction.options.getBoolean("json정리");
    const opts = {
      days,
      deleteMessages: deleteMessages !== false,
      deleteTagged: deleteTagged !== false,
      cleanJson: cleanJson !== false,
    };
    const sessionId = crypto.randomBytes(6).toString("hex");
    const session = {
      id: sessionId,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      targetIds: ids,
      opts,
      stats: { own: 0, tagged: 0 },
      json: { matches: 0, files: [], sample: [] },
      scanDone: false,
      msgPlan: { own: new Map(), tagged: new Map() },
      createdAt: Date.now(),
      abortController: null,
    };
    sessions.set(sessionId, session);

    const totalChannels = listTextLikeChannels(interaction.guild).length || 0;

    await interaction.reply({
      ephemeral: true,
      embeds: [buildPlanEmbed(session, totalChannels)],
      components: buildButtons(session, "plan"),
    });
  },
  async component(interaction) {
    if (!interaction.customId || !interaction.inGuild()) return;
    const id = interaction.customId;
    if (!id.startsWith("usercleanup_")) return;
    const parts = id.split("_");
    const action = parts[1];
    const sessionId = parts.slice(2).join("_");
    const session = sessions.get(sessionId);
    if (!session) {
      return interaction.reply({ ephemeral: true, content: "세션을 찾을 수 없어. 다시 시도해줘." });
    }
    if (interaction.user.id !== session.userId) {
      return interaction.reply({ ephemeral: true, content: "이 세션은 네가 만든 게 아니야." });
    }
    if (action === "cancel") {
      try {
        session.abortController?.abort();
      } catch {}
      sessions.delete(sessionId);
      return interaction.update({ embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle("유저청소 · 취소됨").setDescription("작업이 취소되었어.")], components: [] });
    }
    if (action === "scan") {
      if (activeJobs.get(sessionId) === "scanning") {
        return interaction.reply({ ephemeral: true, content: "이미 스캔 중이야." });
      }
      activeJobs.set(sessionId, "scanning");
      await interaction.deferUpdate();
      try {
        await runScan(interaction, session);
      } catch (e) {
      } finally {
        activeJobs.delete(sessionId);
      }
      const totalChannels = session._totalChannels || listTextLikeChannels(interaction.guild).length || 0;
      const embed = buildPlanEmbed(session, totalChannels);
      if (session.json.sample?.length) {
        embed.addFields({ name: "JSON 샘플", value: session.json.sample.map((s) => `• ${s}`).join("\n").slice(0, 1024) });
      }
      await interaction.editReply({ embeds: [embed], components: buildButtons(session, "plan") }).catch(() => {});
      return;
    }
    if (action === "confirm") {
      if (!session.scanDone) {
        return interaction.reply({ ephemeral: true, content: "먼저 [스캔 실행] 버튼으로 계획을 만들어줘." });
      }
      if (activeJobs.get(sessionId)) {
        return interaction.reply({ ephemeral: true, content: "이미 작업이 진행 중이야." });
      }
      activeJobs.set(sessionId, "running");
      await interaction.deferUpdate();
      const summary = { deletedOwn: 0, deletedTagged: 0, jsonFiles: 0, jsonKeys: 0 };

      if (session.opts.deleteMessages) {
        const totalOwn = Array.from(session.msgPlan.own.values()).reduce((a, b) => a + b.length, 0);
        const totalTagged = session.opts.deleteTagged ? Array.from(session.msgPlan.tagged.values()).reduce((a, b) => a + b.length, 0) : 0;
        const total = Math.max(1, totalOwn + totalTagged);

        await interaction.editReply({
          embeds: [loadingEmbed("유저청소 · 메시지 삭제중", "대상 메시지를 삭제하고 있어.", 0, total, [
            `예정: 본인 ${fmtInt(totalOwn)} · 태그 ${session.opts.deleteTagged ? fmtInt(totalTagged) : "OFF"}`,
          ])],
          components: buildButtons(session, "plan"),
        }).catch(() => {});

        const res = await deletePlannedMessages(interaction, session, async (st) => {
          await interaction.editReply({
            embeds: [loadingEmbed("유저청소 · 메시지 삭제중", "대상 메시지를 삭제하고 있어.", st.deleted, st.total, [
              `삭제됨: 본인 ${fmtInt(st.deletedOwn)} · 태그 ${session.opts.deleteTagged ? fmtInt(st.deletedTagged) : "OFF"}`,
            ])],
            components: buildButtons(session, "plan"),
          }).catch(() => {});
        }).catch(() => ({ deletedOwn: 0, deletedTagged: 0 }));

        summary.deletedOwn = res.deletedOwn || 0;
        summary.deletedTagged = res.deletedTagged || 0;
      }

      if (session.opts.cleanJson) {
        await interaction.editReply({
          embeds: [loadingEmbed("유저청소 · JSON 정리중", "봇 데이터에서 대상 흔적을 제거하고 있어.", 0, Math.max(1, session.json.files.length), [
            `${fmtInt(session.json.files.length)}개 파일 예정`,
          ])],
          components: buildButtons(session, "plan"),
        }).catch(() => {});

        const jr = await cleanJsonFiles(session, async (st) => {
          await interaction.editReply({
            embeds: [loadingEmbed("유저청소 · JSON 정리중", "봇 데이터에서 대상 흔적을 제거하고 있어.", st.done, st.total, [
              `처리됨: ${fmtInt(st.filesTouched)}개 파일, 제거된 키 ${fmtInt(st.keysRemoved)}`,
            ])],
            components: buildButtons(session, "plan"),
          }).catch(() => {});
        }).catch(() => ({ filesTouched: 0, keysRemoved: 0 }));

        summary.jsonFiles = jr.filesTouched || 0;
        summary.jsonKeys = jr.keysRemoved || 0;
      }

      const doneEmbed = new EmbedBuilder()
        .setTitle("유저청소 · 완료")
        .setColor(0x2ecc71)
        .setDescription("요청한 정리 작업을 마쳤어.")
        .addFields(
          { name: "대상 ID", value: session.targetIds.join(", "), inline: false },
          { name: "삭제된 메시지(본인)", value: fmtInt(summary.deletedOwn), inline: true },
          { name: "삭제된 메시지(태그됨)", value: session.opts.deleteTagged ? fmtInt(summary.deletedTagged) : "OFF", inline: true },
          { name: "JSON 정리", value: `${fmtInt(summary.jsonFiles)}개 파일, ${fmtInt(summary.jsonKeys)}건 제거`, inline: true }
        )
        .setFooter({ text: `세션 ${session.id}` });

      sessions.delete(sessionId);
      activeJobs.delete(sessionId);
      await interaction.editReply({ embeds: [doneEmbed], components: buildButtons(session, "done") }).catch(() => {});

      try {
        const logChannel = interaction.guild.channels.cache.get(RESULT_LOG_CHANNEL_ID);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle("유저청소 · 처리결과")
            .setColor(0x2ecc71)
            .setDescription("처리가 완료되었어.")
            .addFields(
              { name: "대상 ID", value: session.targetIds.join(", "), inline: false },
              { name: "메시지(본인)", value: fmtInt(summary.deletedOwn), inline: true },
              { name: "메시지(태그됨)", value: session.opts.deleteTagged ? fmtInt(summary.deletedTagged) : "OFF", inline: true },
              { name: "JSON", value: `${fmtInt(summary.jsonFiles)}개 파일, ${fmtInt(summary.jsonKeys)}건 제거`, inline: true },
              { name: "처리자", value: `<@${interaction.user.id}>`, inline: true },
              { name: "세션", value: session.id, inline: true }
            )
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      } catch {}

      return;
    }
  },
};
