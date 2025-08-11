// utils/category-channel-watcher.js
const fs = require("fs");
const path = require("path");
const { ChannelType, PermissionFlagsBits, EmbedBuilder, Events } = require("discord.js");

const FULL_CATEGORY_IDS = new Set(["1318445879455125514"]);
const VIEW_ONLY_CATEGORY_IDS = new Set(["1318529703480397954"]);
const EXCLUDE_CHANNEL_IDS = new Set(["1318532838751998055"]);
const REPORT_CHANNEL_ID = "1393144927155785759";
const STATUS_MESSAGE_ID = "1404470066422091816";
const INACTIVE_DAYS_TO_LOCK = 30;

const dataDir = path.join(__dirname, "../data");
const storePath = path.join(dataDir, "channel-usage.json");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function loadStore() {
  ensureDir(dataDir);
  if (!fs.existsSync(storePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return {};
  }
}
function saveStore(obj) {
  ensureDir(dataDir);
  fs.writeFileSync(storePath, JSON.stringify(obj, null, 2), "utf8");
}
function nowMs() {
  return Date.now();
}
function formatKST(d) {
  const date = typeof d === "number" ? new Date(d) : d instanceof Date ? d : new Date(d || Date.now());
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(date);
}
function durationMsToText(ms) {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / (60 * 24));
  const h = Math.floor((m % (60 * 24)) / 60);
  const mm = m % 60;
  const parts = [];
  if (d) parts.push(`${d}일`);
  if (h) parts.push(`${h}시간`);
  parts.push(`${mm}분`);
  return parts.join(" ");
}

function isWatchedCategoryId(catId) {
  const s = String(catId);
  return FULL_CATEGORY_IDS.has(s) || VIEW_ONLY_CATEGORY_IDS.has(s);
}
function isFullChannel(ch) {
  if (!ch || !ch.parentId) return false;
  if (!FULL_CATEGORY_IDS.has(String(ch.parentId))) return false;
  if (EXCLUDE_CHANNEL_IDS.has(String(ch.id))) return false;
  return isSupportedType(ch.type);
}
function isViewOnlyChannel(ch) {
  if (!ch || !ch.parentId) return false;
  if (!VIEW_ONLY_CATEGORY_IDS.has(String(ch.parentId))) return false;
  if (EXCLUDE_CHANNEL_IDS.has(String(ch.id))) return false;
  return isSupportedType(ch.type);
}
function isMonitoredChannel(ch) {
  return isFullChannel(ch) || isViewOnlyChannel(ch);
}
function isSupportedType(t) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
  ].includes(t);
}

function channelKey(chId) {
  return String(chId);
}
function ensureChannelRecord(store, ch) {
  const key = channelKey(ch.id);
  store[key] = store[key] || {
    id: String(ch.id),
    name: ch.name || String(ch.id),
    type: ch.type,
    lastActivityAt: 0,
    usage: { textMessages: 0, voiceJoins: 0 },
    locked: false,
    lockedAt: 0,
    prevOverwrites: null,
  };
  return store[key];
}

async function markActivity(client, chId, kind) {
  try {
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!isMonitoredChannel(ch)) return;
    const store = loadStore();
    const rec = ensureChannelRecord(store, ch);
    rec.lastActivityAt = nowMs();
    if (kind === "text") rec.usage.textMessages = (rec.usage.textMessages || 0) + 1;
    if (kind === "voice") rec.usage.voiceJoins = (rec.usage.voiceJoins || 0) + 1;
    saveStore(store);
  } catch {}
}

async function fetchCategoryChannels(client) {
  const out = [];
  const catIds = new Set([...FULL_CATEGORY_IDS, ...VIEW_ONLY_CATEGORY_IDS]);
  for (const catId of catIds) {
    const category = await client.channels.fetch(catId).catch(() => null);
    if (!category) continue;
    const guild = category.guild;
    const children = guild.channels.cache.filter((c) => c.parentId === category.id);
    for (const ch of children.values()) {
      if (isMonitoredChannel(ch)) out.push(ch);
    }
  }
  return out;
}

function buildEmbedReport(items) {
  const nowText = formatKST(nowMs());
  const eb = new EmbedBuilder()
    .setTitle("채널 이용 현황")
    .setDescription(`모니터링 채널 목록 (KST 기준)\n마지막 업데이트: **${nowText}**`)
    .setColor(0x5865f2);

  // 음성/스테이지 제외
  const visible = items.filter((it) => ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(it.type));

  const lines = visible.map((it) => {
    const usedAgoMs = nowMs() - (it.lastActivityAt || 0);
    const usedAgoText = it.lastActivityAt ? `${durationMsToText(usedAgoMs)} 전` : "기록 없음";
    const lastAtText = it.lastActivityAt ? formatKST(it.lastActivityAt) : "-";
    const warnBadge = (usedAgoMs >= 25 * 24 * 3600 * 1000) ? "⚠️" : "";
    return `[채널명: ${it.name}]${warnBadge}\n> 마지막 활동: ${lastAtText} │ 비이용: ${usedAgoText}`;
  });

  // ✅ 1024자 제한 회피: 동일한 필드명 '목록'으로 자동 분할(‘목록 (계속)’ 안 뜸)
  if (lines.length === 0) {
    eb.addFields({ name: "목록", value: "대상 채널이 없습니다." });
    return eb;
  }
  let buf = "";
  for (const line of lines) {
    // +1은 줄바꿈 문자 고려
    if (buf.length + line.length + 1 > 1000) {
      eb.addFields({ name: "목록", value: buf });
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) eb.addFields({ name: "목록", value: buf });
  return eb;
}

function getEveryoneViewState(ch) {
  const everyone = ch.guild.roles.everyone;
  const ow = ch.permissionOverwrites.resolve(everyone.id);
  if (!ow) return "중립";
  const allow = ow.allow.has(PermissionFlagsBits.ViewChannel);
  const deny = ow.deny.has(PermissionFlagsBits.ViewChannel);
  if (allow) return "허용";
  if (deny) return "거부";
  return "중립";
}

async function enforceEveryoneViewLock(ch, reason = "auto-enforce") {
  try {
    if (!isMonitoredChannel(ch)) return false;
    const stateBefore = getEveryoneViewState(ch);
    if (stateBefore === "거부") return false;
    const everyone = ch.guild.roles.everyone;
    await ch.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason });
    try {
      const reportCh = await ch.client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
      if (reportCh && reportCh.isTextBased()) {
        await reportCh.send(`🚫 **@everyone '채널 보기'를 거부(X)로 강제 설정**\n- 대상: <#${ch.id}> \`(${ch.name})\`\n- 이전: **${stateBefore}** → 현재: **거부**\n- 사유: ${reason}\n- 시각: ${formatKST(nowMs())}`);
      }
    } catch {}
    return true;
  } catch {
    return false;
  }
}

async function lockChannelIfInactive(ch, rec) {
  if (!isFullChannel(ch)) return false;
  const guild = ch.guild;
  const everyone = guild.roles.everyone;
  const alreadyLocked = !!rec.locked;
  const last = rec.lastActivityAt || 0;
  const diffMs = nowMs() - last;
  const needLock = diffMs >= INACTIVE_DAYS_TO_LOCK * 24 * 3600 * 1000;
  if (!needLock || alreadyLocked) return false;
  try {
    if (!rec.prevOverwrites) {
      const current = Array.from(ch.permissionOverwrites.cache.values()).map((po) => ({
        id: String(po.id),
        type: po.type,
        allow: po.allow.bitfield?.toString() ?? po.allow.bitfield ?? po.allow ?? "0",
        deny: po.deny.bitfield?.toString() ?? po.deny.bitfield ?? po.deny ?? "0",
      }));
      rec.prevOverwrites = current;
    }
    const baseDeny = [PermissionFlagsBits.ViewChannel];
    if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(ch.type)) {
      baseDeny.push(PermissionFlagsBits.SendMessages);
    }
    if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(ch.type)) {
      baseDeny.push(PermissionFlagsBits.Connect, PermissionFlagsBits.Speak);
    }
    await ch.permissionOverwrites.set([{ id: everyone.id, deny: baseDeny.reduce((a, b) => a | BigInt(b), 0n), type: 0 }]);
    rec.locked = true;
    rec.lockedAt = nowMs();
    try {
      const reportCh = await ch.client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
      if (reportCh && reportCh.isTextBased()) {
        const lastText = last ? `${formatKST(last)} (${durationMsToText(diffMs)} 경과)` : "기록 없음";
        await reportCh.send(`🔒 <#${ch.id}> **비공개 처리**\n- 사유: ${INACTIVE_DAYS_TO_LOCK}일 이상 미사용(풀 모드)\n- 마지막 활동: ${lastText}\n- 시각: ${formatKST(rec.lockedAt)}`);
      }
    } catch {}
    return true;
  } catch {
    return false;
  }
}

async function scanAndReport(client) {
  const reportCh = await client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
  const channels = await fetchCategoryChannels(client);
  const store = loadStore();
  for (const ch of channels) {
    const rec = ensureChannelRecord(store, ch);
    if (!rec.lastActivityAt) {
      try {
        if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
          const lastMsg = ch.lastMessage ?? (await ch.messages.fetch({ limit: 1 }).then((c) => c.first()).catch(() => null));
          if (lastMsg?.createdTimestamp) rec.lastActivityAt = lastMsg.createdTimestamp;
        } else if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
          if (ch.members && ch.members.size > 0) rec.lastActivityAt = nowMs();
        }
      } catch {}
    }
    await enforceEveryoneViewLock(ch, "주기 스캔(enforce)");
    if (isFullChannel(ch)) {
      await lockChannelIfInactive(ch, rec);
    }
  }
  const items = channels.map((ch) => ensureChannelRecord(store, ch))
  .sort((a, b) => {
    const diffA = nowMs() - (a.lastActivityAt || 0);
    const diffB = nowMs() - (b.lastActivityAt || 0);
    return diffB - diffA;
  });
  saveStore(store);
  if (reportCh && reportCh.isTextBased()) {
    const eb = buildEmbedReport(items);
    try {
      const msg = await reportCh.messages.fetch(STATUS_MESSAGE_ID);
      await msg.edit({ embeds: [eb] });
    } catch {
      await reportCh.send({ embeds: [eb] }).catch(() => {});
    }
  }
}

function wireListeners(client) {
  client.on(Events.MessageCreate, async (msg) => {
    try {
      if (msg.author?.bot) return;
      const ch = msg.channel;
      if (!isMonitoredChannel(ch)) return;
      await markActivity(client, ch.id, "text");
    } catch {}
  });
  client.on(Events.VoiceStateUpdate, async (oldS, newS) => {
    try {
      const newCh = newS.channel;
      const oldCh = oldS.channel;
      if (newCh && isMonitoredChannel(newCh)) {
        await markActivity(newS.client, newCh.id, "voice");
      }
      if (!newCh && oldCh && isMonitoredChannel(oldCh)) {
        await markActivity(oldS.client, oldCh.id, "voice");
      }
    } catch {}
  });
  client.on(Events.ChannelUpdate, async (oldCh, newCh) => {
    try {
      if (!isMonitoredChannel(newCh)) return;
      const store = loadStore();
      const rec = ensureChannelRecord(store, newCh);
      rec.name = newCh.name || rec.name;
      rec.type = newCh.type || rec.type;
      saveStore(store);
      await enforceEveryoneViewLock(newCh, "권한 변경 감지(enforce)");
    } catch {}
  });
}

function initChannelWatcher(client) {
  wireListeners(client);
  const run = async () => {
    await scanAndReport(client);
  };
  if (client.isReady && client.isReady()) {
    run();
  } else {
    client.once(Events.ClientReady, run);
  }
  client.on(Events.ShardResume, run);
  setInterval(run, 60 * 60 * 1000);
}

module.exports = { initChannelWatcher };
