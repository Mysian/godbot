"use strict";

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const relationship = require("./relationship.js");
const activityLogger = require("./activity-logger.js");

const TARGET_CHANNEL_ID = "1430786532423237723";

function renderBar(pct, width = 20) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  const empty = Math.max(0, width - filled);
  return `〔${"█".repeat(filled)}${"░".repeat(empty)}〕 ${p.toFixed(1)}%`;
}

function relLabel(score) {
  return relationship.getRelationshipLevel?.(score) || "";
}

function scoreOf(a, b) {
  return Number(relationship.getScore?.(a, b) ?? 0);
}

function fmtTime(ms) {
  if (!ms || !Number.isFinite(ms)) return "기록 없음";
  const t = new Date(ms + 9 * 3600 * 1000);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  const h = String(t.getHours()).padStart(2, "0");
  const mi = String(t.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${mi}`;
}

async function resolveTarget(message) {
  if (!message.guild) return null;
  if (message.mentions.users.size) return message.mentions.users.first();
  const raw = (message.content || "").trim();
  const idMatch = raw.match(/\d{15,20}/);
  if (idMatch) {
    const id = idMatch[0];
    try {
      const u = await message.client.users.fetch(id);
      if (u) return u;
    } catch {}
  }
  const name = raw.replace(/[<@!#>&]/g, "").trim();
  if (!name) return null;
  const members = await message.guild.members.fetch().catch(() => null);
  if (!members) return null;
  const hit = members.find(m => {
    const dn = (m.displayName || "").toLowerCase();
    const un = (m.user?.username || "").toLowerCase();
    const q = name.toLowerCase();
    return dn.includes(q) || un.includes(q);
  });
  return hit?.user || null;
}

async function buildRowsForUser(guild, userId) {
  const data = relationship.loadData?.() || {};
  const last = relationship.loadLastInteraction?.() || {};
  const yours = data[userId] || {};
  const entries = Object.keys(yours).filter(id => id !== userId);
  const withInfo = [];
  for (const otherId of entries) {
    const s = scoreOf(userId, otherId);
    const li = last?.[userId]?.[otherId] || 0;
    withInfo.push({ otherId, score: s, last: li });
  }
  const members = await guild.members.fetch().catch(() => null);
  const nameOf = async id => {
    const m = members?.get(id);
    if (m) return m.displayName;
    try {
      const u = await guild.client.users.fetch(id);
      return u?.username || "(탈주)";
    } catch {
      return "(탈주)";
    }
  };
  const positives = withInfo.filter(v => v.score > 0).sort((a, b) => b.score - a.score);
  const negatives = withInfo.filter(v => v.score < 0).sort((a, b) => a.score - b.score);
  const recents = withInfo.slice().sort((a, b) => b.last - a.last);
  const posSum = positives.reduce((a, b) => a + Math.max(0, b.score), 0) || 0;
  const bias = positives.map(v => ({ ...v, pct: posSum ? (Math.max(0, v.score) / posSum) * 100 : 0 }));
  const rows = [];
  for (const v of bias) {
    const nm = await nameOf(v.otherId);
    rows.push({
      type: "pos",
      key: v.otherId,
      line1: `- ${nm} (<@${v.otherId}>)`,
      line2: `${renderBar(v.pct)}  • ${relLabel(v.score)}  • 최근교류: ${fmtTime(v.last)}`
    });
  }
  const negRows = [];
  for (const v of negatives) {
    const nm = await nameOf(v.otherId);
    negRows.push({
      type: "neg",
      key: v.otherId,
      line1: `- ${nm} (<@${v.otherId}>)`,
      line2: `〔──────────────〕 편향 없음  • ${relLabel(v.score)}  • 최근교류: ${fmtTime(v.last)}`
    });
  }
  const recentRows = [];
  for (const v of recents.slice(0, 50)) {
    const nm = await nameOf(v.otherId);
    recentRows.push({
      type: "rec",
      key: v.otherId,
      line1: `- ${nm} (<@${v.otherId}>)`,
      line2: `${relLabel(v.score)}  • 최근교류: ${fmtTime(v.last)}`
    });
  }
  return { biasRows: rows, negRows, recentRows, posSum };
}

function paginate(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildEmbedBase(targetUser, totals, pageInfo) {
  const e = new EmbedBuilder()
    .setColor(0x5db7ff)
    .setAuthor({ name: `${targetUser.username} (${targetUser.id})`, iconURL: targetUser.displayAvatarURL() })
    .setTitle("유저 관계 상세 리포트")
    .setDescription(`<@${targetUser.id}> 의 교류 편향 및 관계도 요약`)
    .setFooter({ text: pageInfo });
  if (Number.isFinite(totals?.count)) e.addFields({ name: "총 관계 수", value: `${totals.count}명`, inline: true });
  if (Number.isFinite(totals?.pos)) e.addFields({ name: "긍정 관계", value: `${totals.pos}명`, inline: true });
  if (Number.isFinite(totals?.neg)) e.addFields({ name: "부정 관계", value: `${totals.neg}명`, inline: true });
  return e;
}

function rowsToFieldBlocks(rows) {
  if (!rows.length) return [{ name: "데이터 없음", value: "표시할 항목이 없습니다.", inline: false }];
  const blocks = [];
  let cur = "";
  for (const r of rows) {
    const seg = `${r.line1}\n${r.line2}\n`;
    if (cur.length + seg.length > 950) {
      blocks.push(cur);
      cur = "";
    }
    cur += seg;
  }
  if (cur) blocks.push(cur);
  return blocks.map((text, i) => ({ name: i === 0 ? "목록" : `목록 (${i + 1})`, value: text, inline: false }));
}

async function buildPages(guild, targetUser) {
  const { biasRows, negRows, recentRows, posSum } = await buildRowsForUser(guild, targetUser.id);
  const totals = { count: biasRows.length + negRows.length, pos: biasRows.length, neg: negRows.length };
  const biasPages = paginate(biasRows, 8).map((chunk, idx, all) => {
    const e = buildEmbedBase(targetUser, totals, `편향 상위 • ${idx + 1}/${all.length || 1}`);
    const blocks = rowsToFieldBlocks(chunk);
    e.addFields(blocks);
    if (posSum > 0) e.addFields({ name: "합계 기준", value: `상위 목록 막대는 상호관계 점수의 상대지분(%)로 환산됨`, inline: false });
    return { kind: "bias", embed: e };
  });
  const negPages = paginate(negRows, 8).map((chunk, idx, all) => {
    const e = buildEmbedBase(targetUser, totals, `부정 관계 • ${idx + 1}/${all.length || 1}`);
    const blocks = rowsToFieldBlocks(chunk);
    e.addFields(blocks);
    return { kind: "neg", embed: e };
  });
  const recPages = paginate(recentRows, 10).map((chunk, idx, all) => {
    const e = buildEmbedBase(targetUser, totals, `최근 교류 • ${idx + 1}/${all.length || 1}`);
    const blocks = rowsToFieldBlocks(chunk);
    e.addFields(blocks);
    return { kind: "rec", embed: e };
  });
  const pages = [];
  if (biasPages.length) pages.push(...biasPages);
  if (negPages.length) pages.push(...negPages);
  if (recPages.length) pages.push(...recPages);
  if (!pages.length) {
    const e = buildEmbedBase(targetUser, totals, "데이터 없음");
    e.addFields({ name: "안내", value: "해당 유저의 관계 데이터가 없습니다.", inline: false });
    pages.push({ kind: "empty", embed: e });
  }
  return pages;
}

function navRow(prefix, userId, idx, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:first|${userId}`).setStyle(ButtonStyle.Secondary).setEmoji("⏮️").setDisabled(idx <= 0),
    new ButtonBuilder().setCustomId(`${prefix}:prev|${userId}`).setStyle(ButtonStyle.Secondary).setEmoji("◀️").setDisabled(idx <= 0),
    new ButtonBuilder().setCustomId(`${prefix}:next|${userId}`).setStyle(ButtonStyle.Secondary).setEmoji("▶️").setDisabled(idx >= total - 1),
    new ButtonBuilder().setCustomId(`${prefix}:last|${userId}`).setStyle(ButtonStyle.Secondary).setEmoji("⏭️").setDisabled(idx >= total - 1),
    new ButtonBuilder().setCustomId(`${prefix}:stop|${userId}`).setStyle(ButtonStyle.Danger).setEmoji("🛑")
  );
}

async function sendPaged(message, targetUser) {
  const pages = await buildPages(message.guild, targetUser);
  let index = 0;
  const row = navRow("relins", targetUser.id, index, pages.length);
  const sent = await message.channel.send({ embeds: [pages[index].embed], components: [row] });
  const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10 * 60 * 1000 });
  collector.on("collect", async i => {
    if (i.channelId !== message.channelId) return i.deferUpdate().catch(() => {});
    const [pref, actionUid] = (i.customId || "").split(":");
    if (pref !== "relins") return i.deferUpdate().catch(() => {});
    const [action, uid] = (actionUid || "").split("|");
    if (uid !== String(targetUser.id)) return i.deferUpdate().catch(() => {});
    if (action === "first") index = 0;
    else if (action === "prev") index = Math.max(0, index - 1);
    else if (action === "next") index = Math.min(pages.length - 1, index + 1);
    else if (action === "last") index = pages.length - 1;
    else if (action === "stop") {
      collector.stop("user_stop");
      try {
        await i.update({ components: [] });
      } catch {}
      return;
    }
    const newRow = navRow("relins", targetUser.id, index, pages.length);
    try {
      await i.update({ embeds: [pages[index].embed], components: [newRow] });
    } catch {}
  });
  collector.on("end", async () => {
    try {
      await sent.edit({ components: [] });
    } catch {}
  });
}

async function postHeader(message, targetUser) {
  const last = relationship.loadLastInteraction?.() || {};
  const ls = last?.[targetUser.id] || {};
  const lastCount = Object.keys(ls).length;
  let lastPeer = null;
  let lastTime = 0;
  for (const [peer, t] of Object.entries(ls)) {
    if ((t || 0) > lastTime) {
      lastTime = t || 0;
      lastPeer = peer;
    }
  }
  let lastPeerStr = "기록 없음";
  if (lastPeer) lastPeerStr = `<@${lastPeer}> (${fmtTime(lastTime)})`;
  const logs = activityLogger.getUserActivities?.(targetUser.id) || [];
  const recent = logs.slice().sort((a, b) => (b.time || 0) - (a.time || 0))[0];
  const recentStr = recent ? `${recent.activityType || recent.type || "활동"} • ${fmtTime(recent.time)}` : "기록 없음";
  const e = new EmbedBuilder()
    .setColor(0x82d8ff)
    .setTitle("요청 대상")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "유저", value: `${targetUser.username} • <@${targetUser.id}>`, inline: true },
      { name: "유저 ID", value: `${targetUser.id}`, inline: true },
      { name: "최근 교류 상대", value: lastPeerStr, inline: false },
      { name: "최근 서버 활동", value: recentStr, inline: false }
    );
  await message.channel.send({ embeds: [e] });
}

async function handleMessage(message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (message.channelId !== TARGET_CHANNEL_ID) return;
  const target = await resolveTarget(message);
  if (!target) {
    await message.channel.send({ content: "대상 유저를 찾지 못했어. 맨션, ID, 혹은 닉네임으로 다시 입력해줘." });
    return;
  }
  await postHeader(message, target);
  await sendPaged(message, target);
}

function registerRelationshipInspector(client) {
  client.on("messageCreate", handleMessage);
}

module.exports = {
  registerRelationshipInspector
};
