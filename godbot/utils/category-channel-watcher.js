// utils/category-channel-watcher.js
const fs = require("fs");
const path = require("path");
const { ChannelType, PermissionFlagsBits, EmbedBuilder, Events } = require("discord.js");

const CATEGORY_ID = "1318445879455125514";
const EXCLUDE_CHANNEL_IDS = new Set(["1318532838751998055"]);
const REPORT_CHANNEL_ID = "1393144927155785759";
const INACTIVE_DAYS_TO_LOCK = 30;

const dataDir = path.join(__dirname, "../data");
const storePath = path.join(dataDir, "channel-usage.json");

// 메타 저장 위치 (임베드 메시지 ID 등)
const META_KEY = "_meta";

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
function nowMs() { return Date.now(); }
function formatKST(d) {
  const date = typeof d === "number" ? new Date(d) : d instanceof Date ? d : new Date(d || Date.now());
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
function isMonitoredChannel(ch) {
  if (!ch || !ch.parentId) return false;
  if (String(ch.parentId) !== CATEGORY_ID) return false;
  if (EXCLUDE_CHANNEL_IDS.has(String(ch.id))) return false;
  return [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
  ].includes(ch.type);
}
function channelKey(chId) { return String(chId); }
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
  const category = await client.channels.fetch(CATEGORY_ID).catch(() => null);
  if (!category) return [];
  const guild = category.guild;
  const all = guild.channels.cache.filter((c) => c.parentId === category.id);
  return all.filter((c) => isMonitoredChannel(c)).toJSON();
}
function buildEmbedReport(items) {
  const nowText = formatKST(nowMs());
  const eb = new EmbedBuilder()
    .setTitle("채널 이용 현황")
    .setDescription(`카테고리 내 모니터링 채널 목록 (KST 기준)\n마지막 업데이트: **${nowText}**`)
    .setColor(0x5865F2);

  const lines = items.map((it) => {
    const usedAgoMs = nowMs() - (it.lastActivityAt || 0);
    const usedAgoText = it.lastActivityAt ? `${durationMsToText(usedAgoMs)} 전` : "기록 없음";
    const lastAtText = it.lastActivityAt ? formatKST(it.lastActivityAt) : "-";
    const usageSum = (it.usage?.textMessages || 0) + (it.usage?.voiceJoins || 0);
    const typeText =
      it.type === ChannelType.GuildText ? "텍스트" :
      it.type === ChannelType.GuildVoice ? "음성" :
      it.type === ChannelType.GuildStageVoice ? "스테이지" :
      it.type === ChannelType.GuildAnnouncement ? "공지" :
      it.type === ChannelType.GuildForum ? "포럼" :
      it.type === ChannelType.GuildMedia ? "미디어" : "기타";
    const lockBadge = it.locked ? "🔒" : "";
    return `${lockBadge}<#${it.id}> · ${typeText} · 사용량 ${usageSum} (텍스트 ${it.usage?.textMessages || 0}, 음성 ${it.usage?.voiceJoins || 0}) · 마지막 활동: ${lastAtText} · 비이용: ${usedAgoText}`;
  });

  // 너무 길어지면 필드 수 제한(25) 넘을 수 있으니, 25개 단위로 끊음
  const MAX_FIELD = 25;
  const chunks = [];
  let acc = [];
  for (const line of lines) {
    acc.push(line);
    if (acc.length === 20) { // 여유있게 20줄씩
      chunks.push(acc.join("\n"));
      acc = [];
    }
  }
  if (acc.length) chunks.push(acc.join("\n"));

  if (!chunks.length) {
    eb.addFields({ name: "정보", value: "대상 채널이 없습니다." });
  } else {
    chunks.slice(0, MAX_FIELD).forEach((chunk, i) => {
      eb.addFields({ name: i === 0 ? "목록" : `목록 (계속 ${i + 1})`, value: chunk });
    });
  }
  return eb;
}

// ✅ 비공개 처리 시 즉시 로그 전송(텍스트 메시지)
async function lockChannelIfInactive(ch, rec) {
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
    if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement || ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildMedia) {
      baseDeny.push(PermissionFlagsBits.SendMessages);
    }
    if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
      baseDeny.push(PermissionFlagsBits.Connect, PermissionFlagsBits.Speak);
    }

    await ch.permissionOverwrites.set([
      {
        id: everyone.id,
        deny: baseDeny.reduce((a, b) => a | BigInt(b), 0n),
        type: 0, // Role
      },
    ]);

    rec.locked = true;
    rec.lockedAt = nowMs();

    // 🔔 보고 채널로 즉시 로그 전송
    try {
      const reportCh = await ch.client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
      if (reportCh && reportCh.isTextBased()) {
        const lastText = last ? `${formatKST(last)} (${durationMsToText(diffMs)} 경과)` : "기록 없음";
        await reportCh.send(
          `🔒 <#${ch.id}> 채널을 **비공개 처리**했습니다.\n- 사유: 30일 이상 미사용\n- 마지막 활동: ${lastText}\n- 처리 시각: ${formatKST(rec.lockedAt)}`
        );
      }
    } catch {}

    return true;
  } catch {
    return false;
  }
}

// ✅ 보고 임베드: 최초 1회 전송 후 같은 메시지 계속 수정
async function upsertReportMessage(client, embed) {
  const store = loadStore();
  const meta = (store[META_KEY] = store[META_KEY] || {});
  const reportCh = await client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
  if (!reportCh || !reportCh.isTextBased()) return;

  // 기존 메시지 있으면 edit 시도
  if (meta.reportMessageId) {
    try {
      const msg = await reportCh.messages.fetch(meta.reportMessageId);
      await msg.edit({ embeds: [embed] });
      return; // 성공 시 끝
    } catch {
      // 못 찾으면 새로 생성
    }
  }

  // 새로 보냄 + ID 저장
  const sent = await reportCh.send({ embeds: [embed] }).catch(() => null);
  if (sent) {
    meta.reportMessageId = sent.id;
    saveStore(store);
  }
}

async function scanAndReport(client) {
  const channels = await fetchCategoryChannels(client);
  const store = loadStore();

  // 초기 lastActivityAt 추정 & 잠금 처리
  for (const ch of channels) {
    const rec = ensureChannelRecord(store, ch);
    if (!rec.lastActivityAt) {
      try {
        if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
          const lastMsg = ch.lastMessage ?? (await ch.messages.fetch({ limit: 1 }).then(c => c.first()).catch(() => null));
          if (lastMsg?.createdTimestamp) rec.lastActivityAt = lastMsg.createdTimestamp;
        } else if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
          if (ch.members && ch.members.size > 0) rec.lastActivityAt = nowMs();
        }
      } catch {}
    }
    await lockChannelIfInactive(ch, rec);
  }

  const items = channels
    .map((ch) => ensureChannelRecord(store, ch))
    .sort((a, b) => (a.locked === b.locked ? (b.lastActivityAt || 0) - (a.lastActivityAt || 0) : a.locked ? 1 : -1));

  saveStore(store);

  const eb = buildEmbedReport(items);
  await upsertReportMessage(client, eb);
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

  setInterval(run, 60 * 60 * 1000); // 1시간마다
}

module.exports = { initChannelWatcher };
