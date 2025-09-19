// godbot/commands/youtube.js
"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");

const REGION = "KR";
const HL = "ko_KR";
const SEARCH_PAGE_SIZE = 10;
const SESSION_TTL_MS = 10 * 60 * 1000;
const SESS_PREFIX = "yt:";
const CH_SESS_PREFIX = "ytc:";
const sessions = new Map();

let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try { _fetch = require("node-fetch"); } catch {}
}
async function httpGet(url) {
  const res = await _fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtNum(n) {
  if (n === undefined || n === null) return "정보 없음";
  return Number(n).toLocaleString("ko-KR");
}
function toKST(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch { return iso || "알 수 없음"; }
}
function parseISO8601Duration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return "알 수 없음";
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  const parts = [];
  if (h > 0) parts.push(String(h));
  parts.push(String(min).padStart(2, "0"));
  parts.push(String(s).padStart(2, "0"));
  return parts.join(":");
}
function cut(str, n) {
  if (!str) return "";
  return str.length > n ? (str.slice(0, n - 1) + "…") : str;
}
function extractVideoId(input) {
  if (!input) return null;
  try {
    if (/^[A-Za-z0-9_\-]{11}$/.test(input)) return input;
    const url = new URL(input);
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      if (id && id.length >= 11) return id.slice(0,11);
    }
    const v = url.searchParams.get("v");
    if (v && /^[A-Za-z0-9_\-]{11}$/.test(v)) return v;
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      if (/^[A-Za-z0-9_\-]{11}$/.test(id)) return id;
    }
  } catch {}
  return null;
}

async function ytSearch(query, key) {
  const base = new URL("https://www.googleapis.com/youtube/v3/search");
  base.searchParams.set("part", "snippet");
  base.searchParams.set("type", "video");
  base.searchParams.set("q", query);
  base.searchParams.set("maxResults", String(SEARCH_PAGE_SIZE));
  base.searchParams.set("relevanceLanguage", "ko");
  base.searchParams.set("regionCode", REGION);
  base.searchParams.set("hl", HL);
  base.searchParams.set("key", key);

  const s = await httpGet(base.toString());
  const ids = (s.items || []).map(i => i.id && i.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const vapi = new URL("https://www.googleapis.com/youtube/v3/videos");
  vapi.searchParams.set("part", "snippet,statistics,contentDetails");
  vapi.searchParams.set("hl", HL);
  vapi.searchParams.set("id", ids.join(","));
  vapi.searchParams.set("key", key);

  const vres = await httpGet(vapi.toString());
  const dict = new Map();
  for (const it of (vres.items || [])) dict.set(it.id, it);

  const out = [];
  for (const id of ids) {
    const it = dict.get(id);
    if (it) out.push(it);
  }
  return out;
}

async function ytVideoInfo(videoId, key) {
  const vapi = new URL("https://www.googleapis.com/youtube/v3/videos");
  vapi.searchParams.set("part", "snippet,statistics,contentDetails");
  vapi.searchParams.set("hl", HL);
  vapi.searchParams.set("id", videoId);
  vapi.searchParams.set("key", key);
  const vres = await httpGet(vapi.toString());
  const v = (vres.items || [])[0];
  if (!v) return null;

  const chId = v.snippet?.channelId;
  let ch = null;
  if (chId) {
    const chApi = new URL("https://www.googleapis.com/youtube/v3/channels");
    chApi.searchParams.set("part", "snippet,statistics");
    chApi.searchParams.set("hl", HL);
    chApi.searchParams.set("id", chId);
    chApi.searchParams.set("key", key);
    const cres = await httpGet(chApi.toString());
    ch = (cres.items || [])[0] || null;
  }

  let recentC = null;
  try {
    const cApi = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    cApi.searchParams.set("part", "snippet");
    cApi.searchParams.set("videoId", videoId);
    cApi.searchParams.set("maxResults", "1");
    cApi.searchParams.set("order", "time");
    cApi.searchParams.set("textFormat", "plainText");
    cApi.searchParams.set("key", key);
    const cres = await httpGet(cApi.toString());
    recentC = (cres.items || [])[0] || null;
  } catch {}

  return { video: v, channel: ch, recentComment: recentC };
}

function buildEmbedForVideo(v, ch, recent, indexPos = null, total = null) {
  const vid = v.id;
  const sn = v.snippet || {};
  theStatsGuard(v);
  const st = v.statistics || {};
  const cd = v.contentDetails || {};

  const url = `https://www.youtube.com/watch?v=${vid}`;
  const title = sn.title || "제목 없음";
  const chName = sn.channelTitle || "채널 정보 없음";
  const uploaded = toKST(sn.publishedAt);
  const views = fmtNum(st.viewCount);
  const likes = st.likeCount ? fmtNum(st.likeCount) : "공개 안 됨";
  const cmts = st.commentCount ? fmtNum(st.commentCount) : "비공개/없음";
  const dur = parseISO8601Duration(cd.duration);
  const thumb = sn.thumbnails?.maxres?.url
             || sn.thumbnails?.standard?.url
             || sn.thumbnails?.high?.url
             || sn.thumbnails?.medium?.url
             || sn.thumbnails?.default?.url;

  const desc = [
    `채널: **${chName}**`,
    `업로드: **${uploaded} (KST)**`,
    `길이: **${dur}**`,
    `조회수: **${views}** · 좋아요: **${likes}** · 댓글: **${cmts}**`,
  ].join("\n");

  const eb = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(title)
    .setURL(url)
    .setDescription(desc)
    .setThumbnail(thumb)
    .setFooter(indexPos != null && total != null ? { text: `결과 ${indexPos + 1}/${total}` } : null);

  const videoDesc = sn.description ? cut(sn.description, 600) : null;
  if (videoDesc) {
    eb.addFields({ name: "영상 설명", value: videoDesc });
  }

  if (ch) {
    const cSn = ch.snippet || {};
    const cSt = ch.statistics || {};
    const subs = cSt.hiddenSubscriberCount ? "비공개" : fmtNum(cSt.subscriberCount);
    const vids = fmtNum(cSt.videoCount);
    eb.addFields({
      name: "업로더",
      value: [
        `이름: **${cSn.title || "정보 없음"}**`,
        `구독자: **${subs}**, 업로드 영상 수: **${vids}**`,
      ].join("\n"),
      inline: false,
    });
  }

  if (recent) {
    const r = recent.snippet?.topLevelComment?.snippet;
    if (r) {
      const rn = r.authorDisplayName || "익명";
      const rt = toKST(r.publishedAt || r.updatedAt);
      const rv = cut(r.textDisplay || r.textOriginal || "", 300) || "(내용 없음)";
      eb.addFields({
        name: "최근 댓글 (최신순)",
        value: `**${rn}** • ${rt}\n${rv}`,
      });
    }
  }

  return { embed: eb, url };
}

function buildPagerRow(sessionId, index, total) {
  const prev = new ButtonBuilder()
    .setCustomId(`${SESS_PREFIX}prev:${sessionId}`)
    .setLabel("이전")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index <= 0);

  const next = new ButtonBuilder()
    .setCustomId(`${SESS_PREFIX}next:${sessionId}`)
    .setLabel("다음")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index >= total - 1);

  return new ActionRowBuilder().addComponents(prev, next);
}

async function respondWithPlayable(interaction, payload) {
  const { contentUrl, embed, components } = payload;
  const ensureEphemeralReply = async (opts) => {
    if (interaction.deferred || interaction.replied) return interaction.editReply(opts);
    return interaction.reply({ ...opts, ephemeral: true });
  };
  const infoMsg = await ensureEphemeralReply({ content: "", embeds: [embed], components, allowedMentions: { parse: [] } });
  const playerMsg = await interaction.followUp({ content: contentUrl, allowedMentions: { parse: [] }, ephemeral: false });
  return { infoMsg, playerMsg };
}

function theStatsGuard(v) {
  if (!v.statistics) v.statistics = {};
}

async function ytFindChannelByName(name, key) {
  const s = new URL("https://www.googleapis.com/youtube/v3/search");
  s.searchParams.set("part", "snippet");
  s.searchParams.set("type", "channel");
  s.searchParams.set("q", name);
  s.searchParams.set("maxResults", "5");
  s.searchParams.set("regionCode", REGION);
  s.searchParams.set("hl", HL);
  s.searchParams.set("key", key);
  const res = await httpGet(s.toString());
  const it = (res.items || [])[0];
  if (!it) return null;
  return it.id?.channelId || null;
}

async function ytChannelCore(channelId, key) {
  const u = new URL("https://www.googleapis.com/youtube/v3/channels");
  u.searchParams.set("part", "snippet,statistics,contentDetails");
  u.searchParams.set("id", channelId);
  u.searchParams.set("hl", HL);
  u.searchParams.set("key", key);
  const r = await httpGet(u.toString());
  const ch = (r.items || [])[0];
  if (!ch) return null;
  return ch;
}

async function ytChannelUploads(channelId, key, max = 50) {
  const ch = await ytChannelCore(channelId, key);
  if (!ch) return { channel: null, videos: [] };
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return { channel: ch, videos: [] };

  let items = [];
  let pageToken = null;
  while (items.length < max) {
    const u = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    u.searchParams.set("part", "snippet,contentDetails");
    u.searchParams.set("playlistId", uploads);
    u.searchParams.set("maxResults", String(Math.min(50, max - items.length)));
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    u.searchParams.set("hl", HL);
    u.searchParams.set("key", key);
    const r = await httpGet(u.toString());
    items = items.concat(r.items || []);
    pageToken = r.nextPageToken || null;
    if (!pageToken) break;
  }

  const ids = items.map(i => i.contentDetails?.videoId).filter(Boolean);
  if (ids.length === 0) return { channel: ch, videos: [] };

  const v = new URL("https://www.googleapis.com/youtube/v3/videos");
  v.searchParams.set("part", "snippet,statistics,contentDetails");
  v.searchParams.set("id", ids.join(","));
  v.searchParams.set("hl", HL);
  v.searchParams.set("key", key);
  const vr = await httpGet(v.toString());
  const dict = new Map();
  for (const it of (vr.items || [])) dict.set(it.id, it);

  const videos = [];
  for (const id of ids) {
    const it = dict.get(id);
    if (!it) continue;
    theStatsGuard(it);
    videos.push(it);
  }
  return { channel: ch, videos };
}

function median(nums) {
  if (!nums.length) return 0;
  const arr = nums.slice().sort((a,b)=>a-b);
  const mid = Math.floor(arr.length/2);
  return arr.length%2?arr[mid]:(arr[mid-1]+arr[mid])/2;
}
function daysSince(iso) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const d = Math.max(0, (now - t) / 86400000);
  return d;
}
function avg(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const n of arr) s += n;
  return s / arr.length;
}
function summarizeChannel(ch, videos) {
  const sn = ch.snippet || {};
  const st = ch.statistics || {};
  const created = sn.publishedAt;
  const subsHidden = !!st.hiddenSubscriberCount;
  const subs = subsHidden ? null : Number(st.subscriberCount || 0);
  const totalViews = Number(st.viewCount || 0);
  const totalVideos = Number(st.videoCount || 0);

  const recent = videos.slice(0, 30);
  const views = recent.map(v => Number(v.statistics?.viewCount || 0));
  const ages = recent.map(v => Math.max(1, Math.floor(daysSince(v.snippet?.publishedAt))));
  const vpd = recent.map((v,i)=> (Number(v.statistics?.viewCount || 0) / ages[i]));
  const avgViews = Math.round(avg(views));
  const medViews = Math.round(median(views));
  const avgVpd = Math.round(avg(vpd));

  let intervals = [];
  for (let i=0;i<Math.min(videos.length-1, 29);i++) {
    const a = new Date(videos[i].snippet.publishedAt).getTime();
    const b = new Date(videos[i+1].snippet.publishedAt).getTime();
    const d = Math.abs(a-b)/86400000;
    intervals.push(d);
  }
  const avgInterval = intervals.length? avg(intervals): null;
  const perWeek = avgInterval ? (7/avgInterval) : 0;

  const last28 = videos.filter(v => daysSince(v.snippet.publishedAt) <= 28);
  const uploads28 = last28.length;

  const topByViews = recent.slice().sort((a,b)=>Number(b.statistics?.viewCount||0)-Number(a.statistics?.viewCount||0)).slice(0,5);
  const topByVPD = recent.slice().sort((a,b)=>{
    const av = Number(a.statistics?.viewCount||0)/Math.max(1,daysSince(a.snippet?.publishedAt));
    const bv = Number(b.statistics?.viewCount||0)/Math.max(1,daysSince(b.snippet?.publishedAt));
    return bv-av;
  }).slice(0,5);

  return {
    title: sn.title || "채널",
    description: sn.description || "",
    created,
    subsHidden,
    subs,
    totalViews,
    totalVideos,
    avgViews,
    medViews,
    avgVpd,
    avgInterval,
    perWeek,
    uploads28,
    topByViews,
    topByVPD,
  };
}

function pageify(arr, size) {
  const out = [];
  for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
  return out;
}

function buildChannelEmbeds(ch, videos, summary, pageIndex, pages) {
  const thumb = ch.snippet?.thumbnails?.high?.url || ch.snippet?.thumbnails?.default?.url;
  const chUrl = `https://www.youtube.com/channel/${ch.id}`;
  const eb = new EmbedBuilder()
    .setColor(0xff0033)
    .setTitle(`${summary.title} • 채널 분석`)
    .setURL(chUrl)
    .setThumbnail(thumb)
    .setFooter({ text: `페이지 ${pageIndex+1}/${pages}` });

  if (pageIndex === 0) {
    const subsTxt = summary.subsHidden ? "비공개" : fmtNum(summary.subs || 0);
    const created = toKST(summary.created);
    const cadence = summary.avgInterval ? `${summary.perWeek.toFixed(2)}/주 (평균 간격 ${summary.avgInterval.toFixed(2)}일)` : "정보 부족";
    eb.addFields(
      { name: "기본 지표", value: [
        `구독자: **${subsTxt}**`,
        `총 조회수: **${fmtNum(summary.totalViews)}**`,
        `총 영상 수: **${fmtNum(summary.totalVideos)}**`,
        `개설일: **${created} (KST)**`,
      ].join("\n") },
      { name: "최근 30개 영상 요약", value: [
        `평균 조회수: **${fmtNum(summary.avgViews)}**`,
        `중앙값 조회수: **${fmtNum(summary.medViews)}**`,
        `평균 일일조회(영상별): **${fmtNum(summary.avgVpd)}**`,
        `업로드 빈도(추정): **${cadence}**`,
        `최근 28일 업로드 수: **${fmtNum(summary.uploads28)}**`,
      ].join("\n") }
    );
    const tv = summary.topByViews.map((v,i)=>{
      const t = cut(v.snippet?.title||"제목 없음", 60);
      const vc = fmtNum(v.statistics?.viewCount||0);
      const u = `https://www.youtube.com/watch?v=${v.id}`;
      return `**${i+1}.** [${t}](${u}) — 조회수 ${vc}`;
    }).join("\n");
    const tp = summary.topByVPD.map((v,i)=>{
      const t = cut(v.snippet?.title||"제목 없음", 60);
      const vpd = Math.round(Number(v.statistics?.viewCount||0)/Math.max(1,daysSince(v.snippet?.publishedAt)));
      const u = `https://www.youtube.com/watch?v=${v.id}`;
      return `**${i+1}.** [${t}](${u}) — 일일 ${fmtNum(vpd)}`;
    }).join("\n");
    if (tv) eb.addFields({ name: "상위 영상(조회수)", value: tv });
    if (tp) eb.addFields({ name: "상위 영상(일일 성장)", value: tp });
    return eb;
  }

  const pageVideos = pageify(videos, 10)[pageIndex-1] || [];
  const lines = pageVideos.map((v, i)=>{
    const idx = (pageIndex-1)*10 + i + 1;
    const t = cut(v.snippet?.title||"제목 없음", 80);
    const vc = fmtNum(v.statistics?.viewCount||0);
    const lk = v.statistics?.likeCount ? fmtNum(v.statistics.likeCount) : "비공개";
    const when = toKST(v.snippet?.publishedAt);
    const dura = parseISO8601Duration(v.contentDetails?.duration);
    const u = `https://www.youtube.com/watch?v=${v.id}`;
    return `**${idx}.** [${t}](${u}) • ${when} • ${dura} • 조회 ${vc} · 좋아요 ${lk}`;
  });
  eb.addFields({ name: "영상 목록", value: lines.join("\n") || "표시할 영상이 없습니다." });
  return eb;
}

function buildChannelPagerRow(sessionId, pageIndex, totalPages) {
  const prev = new ButtonBuilder()
    .setCustomId(`${CH_SESS_PREFIX}prev:${sessionId}`)
    .setLabel("이전")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(pageIndex <= 0);
  const next = new ButtonBuilder()
    .setCustomId(`${CH_SESS_PREFIX}next:${sessionId}`)
    .setLabel("다음")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(pageIndex >= totalPages - 1);
  return new ActionRowBuilder().addComponents(prev, next);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("유튜브")
    .setDescription("유튜브 검색/조회/채널분석")
    .addSubcommand(sc =>
      sc.setName("검색")
        .setDescription("유튜브에서 영상을 검색합니다.")
        .addStringOption(o =>
          o.setName("검색어")
           .setDescription("검색할 키워드")
           .setRequired(true)))
    .addSubcommand(sc =>
      sc.setName("조회")
        .setDescription("유튜브 영상 링크로 정보를 조회합니다.")
        .addStringOption(o =>
          o.setName("영상링크")
           .setDescription("https://youtu.be/... 또는 https://www.youtube.com/watch?v=...")
           .setRequired(true)))
    .addSubcommand(sc =>
      sc.setName("채널분석")
        .setDescription("채널명으로 성장 지표와 영상 현황을 분석합니다.")
        .addStringOption(o =>
          o.setName("채널명")
           .setDescription("채널 이름(검색어)")
           .setRequired(true)))
  ,
  async execute(interaction) {
    const key = process.env.YT_API_KEY;
    if (!key) {
      return interaction.reply({ content: "🔧 `YT_API_KEY` 환경변수를 설정해줘.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "검색") {
      const q = interaction.options.getString("검색어", true).trim();
      await interaction.deferReply({ ephemeral: true });

      let list = [];
      try {
        list = await ytSearch(q, key);
      } catch (e) {
        return interaction.editReply({ content: "죄송합니다, 검색 중 오류가 발생했습니다." });
      }

      if (list.length === 0) {
        return interaction.editReply({ content: "죄송합니다, 검색 결과를 찾을 수 없습니다." });
      }

      const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const owner = interaction.user.id;
      const expireAt = Date.now() + SESSION_TTL_MS;

      sessions.set(sessionId, {
        type: "search",
        query: q,
        owner,
        expireAt,
        index: 0,
        list,
        channelId: interaction.channelId,
        playerMsgId: null,
      });

      const v = list[0];
      const more = await ytVideoInfo(v.id, key);
      if (!more) {
        return interaction.editReply({ content: "죄송합니다, 검색 결과를 표시할 수 없습니다." });
      }

      const { embed, url } = buildEmbedForVideo(more.video, more.channel, more.recentComment, 0, list.length);
      const row = buildPagerRow(sessionId, 0, list.length);
      const { playerMsg } = await respondWithPlayable(interaction, { contentUrl: url, embed, components: [row] });

      const sess0 = sessions.get(sessionId);
      if (sess0) {
        sess0.playerMsgId = playerMsg?.id || null;
        sessions.set(sessionId, sess0);
      }

      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: SESSION_TTL_MS,
      });

      collector.on("collect", async (btn) => {
        try {
          const cid = btn.customId || "";
          if (!cid.startsWith(SESS_PREFIX)) return;
          const [, rest] = cid.split(SESS_PREFIX);
          const [op, sid] = rest.split(":");

          const sess = sessions.get(sid);
          if (!sess) return btn.reply({ content: "세션이 만료되었어. 다시 검색해줘!", ephemeral: true });
          if (btn.user.id !== sess.owner) {
            return btn.reply({ content: "이 검색 결과는 요청자만 조작할 수 있어.", ephemeral: true });
          }
          if (Date.now() > sess.expireAt) {
            sessions.delete(sid);
            return btn.reply({ content: "세션이 만료되었어. 다시 검색해줘!", ephemeral: true });
          }

          if (op === "prev") sess.index = Math.max(0, sess.index - 1);
          if (op === "next") sess.index = Math.min(sess.list.length - 1, sess.index + 1);

          const cur = sess.list[sess.index];
          const more2 = await ytVideoInfo(cur.id, key);
          if (!more2) return btn.deferUpdate();

          const { embed: eb2, url: u2 } = buildEmbedForVideo(more2.video, more2.channel, more2.recentComment, sess.index, sess.list.length);
          const row2 = buildPagerRow(sid, sess.index, sess.list.length);

          if (sess.playerMsgId) {
            try {
              const ch = await btn.client.channels.fetch(sess.channelId);
              const pmsg = await ch.messages.fetch(sess.playerMsgId);
              await pmsg.edit({ content: u2, allowedMentions: { parse: [] } });
            } catch {}
          }

          await btn.update({
            content: "",
            embeds: [eb2],
            components: [row2],
          });
        } catch {
          try { await btn.deferUpdate(); } catch {}
        }
      });

      collector.on("end", async () => {
        const sess = sessions.get(sessionId);
        if (sess && Date.now() > sess.expireAt) sessions.delete(sessionId);
        try {
          const cur = await interaction.fetchReply();
          const comps = cur.components?.[0]?.components || [];
          const row = new ActionRowBuilder().addComponents(
            comps.map(c => ButtonBuilder.from(c).setDisabled(true))
          );
          await interaction.editReply({ components: [row] });
        } catch {}
      });

      return;
    }

    if (sub === "조회") {
      const link = interaction.options.getString("영상링크", true).trim();
      const vid = extractVideoId(link);
      if (!vid) {
        return interaction.reply({ content: "유효한 유튜브 영상 링크/ID가 아니야.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      let info = null;
      try {
        info = await ytVideoInfo(vid, key);
      } catch {
        return interaction.editReply({ content: "조회 중 오류가 발생했어." });
      }
      if (!info || !info.video) {
        return interaction.editReply({ content: "해당 영상을 찾을 수 없어." });
      }

      const { embed, url } = buildEmbedForVideo(info.video, info.channel, info.recentComment);
      await respondWithPlayable(interaction, { contentUrl: url, embed, components: [] });
      return;
    }

    if (sub === "채널분석") {
      const name = interaction.options.getString("채널명", true).trim();
      await interaction.deferReply({ ephemeral: true });

      let chId = null;
      try {
        chId = await ytFindChannelByName(name, key);
      } catch {
        return interaction.editReply({ content: "채널 검색 중 오류가 발생했어." });
      }
      if (!chId) return interaction.editReply({ content: "해당 이름으로 채널을 찾지 못했어." });

      let pack = null;
      try {
        pack = await ytChannelUploads(chId, key, 50);
      } catch {
        return interaction.editReply({ content: "채널 데이터 조회 중 오류가 발생했어." });
      }
      const ch = pack.channel;
      const vids = pack.videos.sort((a,b)=> new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
      if (!ch) return interaction.editReply({ content: "채널 정보를 불러오지 못했어." });

      const summary = summarizeChannel(ch, vids);
      const pages = 1 + Math.max(0, Math.ceil(vids.length/10));
      const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const eb0 = buildChannelEmbeds(ch, vids, summary, 0, pages);

      await interaction.editReply({ embeds: [eb0] });
      return;

      sessions.set(sessionId, {
        type: "channel",
        owner: interaction.user.id,
        expireAt: Date.now() + SESSION_TTL_MS,
        page: 0,
        pages,
        channelData: { ch, vids, summary },
      });

      const msg = await interaction.fetchReply();
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: SESSION_TTL_MS,
      });

      collector.on("collect", async (btn) => {
        try {
          const cid = btn.customId || "";
          if (!cid.startsWith(CH_SESS_PREFIX)) return;
          const [, rest] = cid.split(CH_SESS_PREFIX);
          const [op, sid] = rest.split(":");
          const sess = sessions.get(sid);
          if (!sess) return btn.reply({ content: "세션이 만료되었어. 다시 시도해줘!", ephemeral: true });
          if (btn.user.id !== sess.owner) return btn.reply({ content: "요청자만 조작할 수 있어.", ephemeral: true });
          if (Date.now() > sess.expireAt) { sessions.delete(sid); return btn.reply({ content: "세션이 만료되었어. 다시 시도해줘!", ephemeral: true }); }

          if (op === "prev") sess.page = Math.max(0, sess.page - 1);
          if (op === "next") sess.page = Math.min(sess.pages - 1, sess.page + 1);

          const { ch, vids, summary } = sess.channelData;
          const eb = buildChannelEmbeds(ch, vids, summary, sess.page, sess.pages);
          const row = buildChannelPagerRow(sid, sess.page, sess.pages);

          await btn.update({ embeds: [eb], components: [row] });
        } catch {
          try { await btn.deferUpdate(); } catch {}
        }
      });

      collector.on("end", async () => {
        const s = sessions.get(sessionId);
        if (s && Date.now() > s.expireAt) sessions.delete(sessionId);
        try {
          const cur = await interaction.fetchReply();
          const comps = cur.components?.[0]?.components || [];
          const row = new ActionRowBuilder().addComponents(
            comps.map(c => ButtonBuilder.from(c).setDisabled(true))
          );
          await interaction.editReply({ components: [row] });
        } catch {}
      });

      return;
    }
  },
};
