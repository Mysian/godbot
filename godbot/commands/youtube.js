"use strict";
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");

const REGION = "KR";
const HL = "ko_KR";
const SEARCH_PAGE_SIZE = 10;
const SESSION_TTL_MS = 10 * 60 * 1000;
const PAGE_TTL_MS = 5 * 60 * 1000;
const SESS_PREFIX = "yt:";
const CH_SESS_PREFIX = "ytc:";
const sessions = new Map();

const RPM_KRW_PER_1K_MIN = Number(process.env.YT_RPM_KRW_MIN || 500);
const RPM_KRW_PER_1K_MAX = Number(process.env.YT_RPM_KRW_MAX || 3000);
const DEFAULT_RPM_KRW_PER_1K = Number(process.env.YT_RPM_KRW || 1500);

let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try { _fetch = require("node-fetch"); } catch {}
}
let _canvas;
try { _canvas = require("canvas"); } catch {}

async function httpGet(url) {
  const res = await _fetch(url);
  let body = null;
  try { body = await res.text(); } catch {}
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (body && body.length < 500) msg += ` • ${body}`;
    throw new Error(msg);
  }
  try { return body ? JSON.parse(body) : {}; } catch { throw new Error("HTTP 200 but invalid JSON"); }
}

function fmtNum(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return "정보 없음";
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
      if (id && id.length >= 11) return id.slice(0, 11);
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
function normalizeChannelQuery(s) {
  if (!s) return "";
  let q = s.trim();
  q = q.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");
  q = q.replace(/^https?:\/\/(www\.)?youtu\.be\//i, "");
  q = q.replace(/^@+/, "");
  q = q.replace(/^c\//i, "");
  q = q.replace(/^user\//i, "");
  q = q.replace(/^channel\//i, "");
  q = q.replace(/^[\/]+/, "");
  return q;
}
function extractChannelFromInput(input) {
  if (!input) return null;
  try {
    const u = new URL(input);
    if (!/youtu\.be|youtube\.com/.test(u.hostname)) return null;
    if (u.pathname.startsWith("/channel/")) return { id: u.pathname.split("/")[2] || null, query: null, viaVideo: null };
    if (u.pathname.startsWith("/@")) return { id: null, query: normalizeChannelQuery(u.pathname), viaVideo: null };
    if (u.pathname.startsWith("/c/")) return { id: null, query: normalizeChannelQuery(u.pathname), viaVideo: null };
    if (u.pathname.startsWith("/user/")) return { id: null, query: normalizeChannelQuery(u.pathname), viaVideo: null };
    if (u.pathname.startsWith("/watch") || u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/live/")) return { id: null, query: null, viaVideo: extractVideoId(input) };
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

function theStatsGuard(v) { if (!v.statistics) v.statistics = {}; }

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
  if (videoDesc) eb.addFields({ name: "영상 설명", value: videoDesc });
  if (ch) {
    const cSn = ch.snippet || {};
    const cSt = ch.statistics || {};
    const subs = cSt.hiddenSubscriberCount ? "비공개" : fmtNum(cSt.subscriberCount);
    const vids = fmtNum(cSt.videoCount);
    eb.addFields({
      name: "업로더",
      value: [`이름: **${cSn.title || "정보 없음"}**`,`구독자: **${subs}**, 업로드 영상 수: **${vids}**`].join("\n"),
      inline: false,
    });
  }
  if (recent) {
    const r = recent.snippet?.topLevelComment?.snippet;
    if (r) {
      const rn = r.authorDisplayName || "익명";
      const rt = toKST(r.publishedAt || r.updatedAt);
      const rv = cut(r.textDisplay || r.textOriginal || "", 300) || "(내용 없음)";
      eb.addFields({ name: "최근 댓글 (최신순)", value: `**${rn}** • ${rt}\n${rv}` });
    }
  }
  return { embed: eb, url };
}

function buildPagerRow(sessionId, index, total) {
  const prev = new ButtonBuilder().setCustomId(`${SESS_PREFIX}prev:${sessionId}`).setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(index <= 0);
  const next = new ButtonBuilder().setCustomId(`${SESS_PREFIX}next:${sessionId}`).setLabel("다음").setStyle(ButtonStyle.Secondary).setDisabled(index >= total - 1);
  return new ActionRowBuilder().addComponents(prev, next);
}
function buildChannelPagerRow(sessionId, pageIndex, totalPages) {
  const prev = new ButtonBuilder().setCustomId(`${CH_SESS_PREFIX}prev:${sessionId}`).setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(pageIndex <= 0);
  const next = new ButtonBuilder().setCustomId(`${CH_SESS_PREFIX}next:${sessionId}`).setLabel("다음").setStyle(ButtonStyle.Secondary).setDisabled(pageIndex >= totalPages - 1);
  const close = new ButtonBuilder().setCustomId(`${CH_SESS_PREFIX}close:${sessionId}`).setLabel("닫기").setStyle(ButtonStyle.Danger);
  return new ActionRowBuilder().addComponents(prev, next, close);
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

async function ytFindChannelByName(queryOrHandle, key) {
  const q = normalizeChannelQuery(queryOrHandle);
  if (/^UC[A-Za-z0-9_-]{22}$/.test(q)) return q;
  const s = new URL("https://www.googleapis.com/youtube/v3/search");
  s.searchParams.set("part", "snippet");
  s.searchParams.set("type", "channel");
  s.searchParams.set("q", q);
  s.searchParams.set("maxResults", "5");
  s.searchParams.set("regionCode", REGION);
  s.searchParams.set("key", key);
  const res = await httpGet(s.toString());
  const items = res.items || [];
  if (!items.length) return null;
  return items[0]?.id?.channelId || null;
}

async function ytChannelCore(channelId, key) {
  if (!channelId || !/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) throw new Error("invalid channelId");
  const u = new URL("https://www.googleapis.com/youtube/v3/channels");
  u.searchParams.set("part", "snippet,statistics,contentDetails");
  u.searchParams.set("id", channelId);
  u.searchParams.set("key", key);
  const r = await httpGet(u.toString());
  const ch = (r.items || [])[0];
  if (!ch) throw new Error("channel not found");
  return ch;
}

async function ytChannelUploads(channelId, key, max = 50) {
  const ch = await ytChannelCore(channelId, key);
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
    u.searchParams.set("key", key);
    const r = await httpGet(u.toString());
    items = items.concat(r.items || []);
    pageToken = r.nextPageToken || null;
    if (!pageToken) break;
  }
  const ids = items.map(i => i.contentDetails?.videoId).filter(Boolean);
  if (ids.length === 0) return { channel: ch, videos: [] };
const dict = new Map();
for (let i = 0; i < ids.length; i += 50) {
  const slice = ids.slice(i, i + 50);
  const v = new URL("https://www.googleapis.com/youtube/v3/videos");
  v.searchParams.set("part", "snippet,statistics,contentDetails");
  v.searchParams.set("id", slice.join(","));
  v.searchParams.set("key", key);
  const vr = await httpGet(v.toString());
  for (const it of (vr.items || [])) dict.set(it.id, it);
}
const videos = [];
for (const id of ids) {
  const it = dict.get(id);
  if (!it) continue;
  theStatsGuard(it);
  videos.push(it);
}

  videos.sort((a,b)=> new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
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
  return Math.max(0, (now - t) / 86400000);
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
  const last30DaysViews = videos.filter(v => daysSince(v.snippet.publishedAt) <= 30)
    .reduce((acc, v)=> acc + Number(v.statistics?.viewCount || 0), 0);
  const lastN = videos.slice(0, 12);
  const viewsSeries = lastN.map(v => Number(v.statistics?.viewCount || 0)).reverse();
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
    uploads28: videos.filter(v => daysSince(v.snippet.publishedAt) <= 28).length,
    last30DaysViews,
    viewsSeries,
    avatar: sn.thumbnails?.high?.url || sn.thumbnails?.default?.url,
    url: `https://www.youtube.com/channel/${ch.id}`,
  };
}

function estimateRevenueKRW(views, rpmPer1k = DEFAULT_RPM_KRW_PER_1K) {
  const vv = Math.max(0, Number(views) || 0);
  const rpm = Math.max(RPM_KRW_PER_1K_MIN, Math.min(rpmPer1k, RPM_KRW_PER_1K_MAX));
  return Math.round((vv / 1000) * rpm);
}

async function makeGrowthChart(viewsSeries = [], label = "최근 업로드 뷰 추이") {
  if (!_canvas) return null;
  const { createCanvas } = _canvas;
  const W = 800, H = 360, PAD = 50;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0f1117";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#2a2f3a";
  ctx.strokeRect(0.5, 0.5, W-1, H-1);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "bold 20px Sans-Serif";
  ctx.fillText(label, PAD, PAD - 15);
  if (!viewsSeries || viewsSeries.length < 2) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "16px Sans-Serif";
    ctx.fillText("데이터가 부족합니다.", PAD, H/2);
  } else {
    const n = viewsSeries.length;
    const minV = Math.min(...viewsSeries);
    const maxV = Math.max(...viewsSeries);
    const yMin = Math.floor(minV * 0.95);
    const yMax = Math.ceil(maxV * 1.05) || 1;
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 1;
    for (let i=0;i<=4;i++){
      const y = PAD + ((H - PAD*2) * i/4);
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W-PAD, y); ctx.stroke();
      const val = Math.round(yMax - (yMax - yMin) * (i/4));
      ctx.fillStyle = "#9ca3af"; ctx.font = "12px Sans-Serif";
      ctx.fillText(val.toLocaleString("ko-KR"), 8, y - 4);
    }
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i=0;i<n;i++){
      const x = PAD + (W - PAD*2) * (i/(n-1));
      const norm = (viewsSeries[i] - yMin) / Math.max(1, (yMax - yMin));
      const y = H - PAD - (H - PAD*2) * norm;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.fillStyle = "#93c5fd";
    for (let i=0;i<n;i++){
      const x = PAD + (W - PAD*2) * (i/(n-1));
      const norm = (viewsSeries[i] - yMin) / Math.max(1, (yMax - yMin));
      const y = H - PAD - (H - PAD*2) * norm;
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    }
  }
  const buffer = canvas.toBuffer("image/png");
  const fileName = `channel-growth-${Date.now()}.png`;
  return new AttachmentBuilder(buffer, { name: fileName });
}

function computeGrowthPotential({ subs = 0, viewsSeries = [], uploadPerWeek = 0 }) {
  const n = viewsSeries.length;
  let slope = 0;
  if (n >= 3) {
    const xs = viewsSeries.map((_, i) => i + 1);
    const xbar = xs.reduce((a,b)=>a+b,0)/n;
    const ybar = viewsSeries.reduce((a,b)=>a+b,0)/n;
    const num = xs.reduce((acc, x, i)=> acc + (x - xbar) * (viewsSeries[i] - ybar), 0);
    const den = xs.reduce((acc, x)=> acc + Math.pow((x - xbar), 2), 0) || 1;
    slope = num / den;
    const scale = (ybar || 1);
    slope = Math.max(-1, Math.min(1, slope / scale));
  }
  const sTrend = (slope + 1) * 50;
  const sFreq  = Math.min(100, uploadPerWeek * 25);
  const sSize  = Math.min(100, Math.log10((subs||1)) * 25);
  const score = sTrend * 0.45 + sFreq * 0.35 + sSize * 0.20;
  const pct = Math.round(Math.max(0, Math.min(100, score)));
  let note;
  if (pct >= 85) note = "🔥 폭발 직전";
  else if (pct >= 70) note = "📈 고성장 구간";
  else if (pct >= 55) note = "🌱 성장 가능";
  else if (pct >= 40) note = "⚖️ 관망";
  else note = "🧪 리빌딩 필요";
  return { pct, note };
}

function pageify(arr, size) {
  const out = [];
  for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
  return out;
}

function buildChannelPage(ch, summary, videos, pageIndex, totalPages, rpmKRW, graphAttachment) {
  const eb = new EmbedBuilder()
    .setColor(0xff0033)
    .setTitle(`${summary.title} • 채널 분석`)
    .setURL(summary.url)
    .setThumbnail(summary.avatar)
    .setFooter({ text: `페이지 ${pageIndex+1}/${totalPages}` });

  if (pageIndex === 0) {
    const subsTxt = summary.subsHidden ? "비공개" : fmtNum(summary.subs || 0);
    const cadence = summary.avgInterval ? `${summary.perWeek.toFixed(2)}/주 (평균 간격 ${summary.avgInterval.toFixed(2)}일)` : "정보 부족";
    const growth = computeGrowthPotential({ subs: summary.subs || 0, viewsSeries: summary.viewsSeries, uploadPerWeek: summary.perWeek });
    eb.addFields(
      { name: "기본 지표", value: [`구독자: **${subsTxt}**`,`총 조회수: **${fmtNum(summary.totalViews)}**`,`총 영상 수: **${fmtNum(summary.totalVideos)}**`,`개설일: **${toKST(summary.created)} (KST)**`].join("\n") },
      { name: "최근 30개 영상 요약", value: [`평균 조회수: **${fmtNum(summary.avgViews)}**`,`중앙값 조회수: **${fmtNum(summary.medViews)}**`,`평균 일일조회(영상별): **${fmtNum(summary.avgVpd)}**`,`업로드 빈도(추정): **${cadence}**`,`최근 28일 업로드 수: **${fmtNum(summary.uploads28)}**`].join("\n") },
      { name: "채널의 성장 가능성", value: `**${growth.pct}%** · ${growth.note}` }
    );
    return { embeds: [eb], files: [] };
  }

  const revenuePage = 1;
  const graphPage = totalPages - 1;
  if (pageIndex === revenuePage) {
    const monthly = estimateRevenueKRW(summary.last30DaysViews, rpmKRW);
    const lastNAvg = Math.round(avg(videos.slice(0,12).map(v => Number(v.statistics?.viewCount||0))));
    const perVideo = estimateRevenueKRW(lastNAvg, rpmKRW);
    eb.setColor(0x00B894).setTitle("수익 추정");
    eb.addFields(
      { name: "한달 예상 수익(₩)", value: `**${fmtNum(monthly)}**`, inline: true },
      { name: "영상 1개당 예상 수익(₩)", value: `**${fmtNum(perVideo)}**`, inline: true },
      { name: "전제", value: `RPM(₩/1,000뷰): **${fmtNum(rpmKRW)}**\n최근 30일 조회수: **${fmtNum(summary.last30DaysViews)}**\n최근 12개 평균 조회: **${fmtNum(lastNAvg)}**` }
    );
    return { embeds: [eb], files: [] };
  }

  if (pageIndex === graphPage) {
    eb.setColor(0x4DABF7).setTitle("성장 분석 그래프");
    if (graphAttachment) eb.setImage(`attachment://${graphAttachment.name}`);
    return { embeds: [eb], files: graphAttachment ? [graphAttachment] : [] };
  }

  const listStartPage = 2;
  const pageVideos = pageify(videos, 10)[pageIndex - listStartPage] || [];
  const lines = pageVideos.map((v, i)=>{
    const idx = (pageIndex - listStartPage)*10 + i + 1;
    const t = cut(v.snippet?.title||"제목 없음", 80);
    const vc = fmtNum(v.statistics?.viewCount||0);
    const lk = v.statistics?.likeCount ? fmtNum(v.statistics.likeCount) : "비공개";
    const when = toKST(v.snippet?.publishedAt);
    const dura = parseISO8601Duration(v.contentDetails?.duration);
    const u = `https://www.youtube.com/watch?v=${v.id}`;
    return `**${idx}.** [${t}](${u}) • ${when} • ${dura} • 조회 ${vc} · 좋아요 ${lk}`;
  });
  eb.setTitle("최근 업로드").addFields({ name: "영상 목록", value: lines.join("\n") || "표시할 영상이 없습니다." });
  return { embeds: [eb], files: [] };
}

async function handleSearch(interaction, query, key) {
  await interaction.deferReply({ ephemeral: true });
  let list = [];
  try {
    list = await ytSearch(query, key);
  } catch (e) {
    return interaction.editReply({ content: `죄송합니다, 검색 중 오류가 발생했습니다.\n오류: ${String(e.message || e)}` });
  }
  if (list.length === 0) return interaction.editReply({ content: "죄송합니다, 검색 결과를 찾을 수 없습니다." });
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const owner = interaction.user.id;
  const expireAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionId, { type: "search", owner, expireAt, index: 0, list, channelId: interaction.channelId, playerMsgId: null });
  const v = list[0];
  let more = null;
  try { more = await ytVideoInfo(v.id, key); } catch (e) { return interaction.editReply({ content: `상세 조회 실패: ${String(e.message || e)}` }); }
  if (!more) return interaction.editReply({ content: "죄송합니다, 검색 결과를 표시할 수 없습니다." });
  const { embed, url } = buildEmbedForVideo(more.video, more.channel, more.recentComment, 0, list.length);
  const row = buildPagerRow(sessionId, 0, list.length);
  const { playerMsg } = await respondWithPlayable(interaction, { contentUrl: url, embed, components: [row] });
  const sess0 = sessions.get(sessionId);
  if (sess0) { sess0.playerMsgId = playerMsg?.id || null; sessions.set(sessionId, sess0); }
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: PAGE_TTL_MS });
  collector.on("collect", async (btn) => {
    try {
      const cid = btn.customId || "";
      if (!cid.startsWith(SESS_PREFIX)) return;
      const [, rest] = cid.split(SESS_PREFIX);
      const [op, sid] = rest.split(":");
      const sess = sessions.get(sid);
      if (!sess) return btn.reply({ content: "세션이 만료되었어. 다시 검색해줘!", ephemeral: true });
      if (btn.user.id !== sess.owner) return btn.reply({ content: "이 검색 결과는 요청자만 조작할 수 있어.", ephemeral: true });
      if (Date.now() > sess.expireAt) { sessions.delete(sid); return btn.reply({ content: "세션이 만료되었어. 다시 검색해줘!", ephemeral: true }); }
      if (op === "prev") sess.index = Math.max(0, sess.index - 1);
      if (op === "next") sess.index = Math.min(sess.list.length - 1, sess.index + 1);
      const cur = sess.list[sess.index];
      let more2 = null;
      try { more2 = await ytVideoInfo(cur.id, key); } catch { return btn.deferUpdate(); }
      const { embed: eb2, url: u2 } = buildEmbedForVideo(more2.video, more2.channel, more2.recentComment, sess.index, sess.list.length);
      const row2 = buildPagerRow(sid, sess.index, sess.list.length);
      if (sess.playerMsgId) {
        try {
          const ch = await btn.client.channels.fetch(sess.channelId);
          const pmsg = await ch.messages.fetch(sess.playerMsgId);
          await pmsg.edit({ content: u2, allowedMentions: { parse: [] } });
        } catch {}
      }
      await btn.update({ content: "", embeds: [eb2], components: [row2] });
    } catch { try { await btn.deferUpdate(); } catch {} }
  });
  collector.on("end", async () => {
    try {
      const cur = await interaction.fetchReply();
      const comps = cur.components?.[0]?.components || [];
      const rowD = new ActionRowBuilder().addComponents(comps.map(c => ButtonBuilder.from(c).setDisabled(true)));
      await interaction.editReply({ components: [rowD] });
    } catch {}
  });
}

async function resolveChannelId(input, key) {
  if (!input) return null;
  if (/^UC[A-Za-z0-9_-]{22}$/.test(input.trim())) return input.trim();
  const parsed = extractChannelFromInput(input);
  if (parsed?.id) {
    if (/^UC[A-Za-z0-9_-]{22}$/.test(parsed.id)) return parsed.id;
  }
  if (parsed?.viaVideo) {
    const vi = await ytVideoInfo(parsed.viaVideo, key);
    const cid = vi?.video?.snippet?.channelId || null;
    if (cid) return cid;
  }
  if (parsed?.query) {
    const q = normalizeChannelQuery(parsed.query);
    const cid = await ytFindChannelByName(q, key);
    if (cid) return cid;
  }
  const fallback = await ytFindChannelByName(input, key);
  return fallback || null;
}

function buildChannelPageSet(ch, summary, vids, rpmKRW, graphAttachment) {
  const videosPages = Math.ceil(Math.max(0, vids.length) / 10);
  const totalPages = 2 + videosPages + 1;
  return { totalPages, rpmKRW, graphAttachment, summary, vids, ch };
}

async function handleChannelAnalyze(interaction, input, key) {
  await interaction.deferReply();
  let chId = null;
  try { chId = await resolveChannelId(input, key); }
  catch (e) { return interaction.editReply({ content: `채널 식별 실패: ${String(e.message || e)}` }); }
  if (!chId) return interaction.editReply({ content: "채널을 찾지 못했어. 채널명 또는 채널/영상 링크를 확인해줘." });

  let pack = null;
  try { pack = await ytChannelUploads(chId, key, 60); }
  catch (e) { return interaction.editReply({ content: `채널 데이터 조회 중 오류가 발생했어.\n오류: ${String(e.message || e)}` }); }

  const ch = pack.channel;
  const vids = pack.videos;
  if (!ch) return interaction.editReply({ content: "채널 정보를 불러오지 못했어." });

  const summary = summarizeChannel(ch, vids);
  const rpmKRW = DEFAULT_RPM_KRW_PER_1K;
  let graphAttachment = null;
  try { graphAttachment = await makeGrowthChart(summary.viewsSeries, "최근 업로드 뷰 추이"); } catch {}

  const { totalPages } = buildChannelPageSet(ch, summary, vids, rpmKRW, graphAttachment);
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  sessions.set(sessionId, {
    type: "channel",
    owner: interaction.user.id,
    expireAt: Date.now() + SESSION_TTL_MS,
    page: 0,
    totalPages,
    channelData: { ch, vids, summary, rpmKRW, graphAttachment },
  });

  const first = buildChannelPage(ch, summary, vids, 0, totalPages, rpmKRW, graphAttachment);
  const row = buildChannelPagerRow(sessionId, 0, totalPages);
  await interaction.editReply({ embeds: first.embeds, files: first.files, components: [row] });

  const replyMsg = await interaction.fetchReply();
const collector = interaction.channel.createMessageComponentCollector({
  componentType: ComponentType.Button,
  time: PAGE_TTL_MS,
  filter: (i) =>
    i.customId.startsWith(CH_SESS_PREFIX) &&
    i.user.id === interaction.user.id &&
    i.message.id === replyMsg.id
});
collector.on("collect", async (btn) => {
  try {
    const cid = btn.customId || "";
    const [, rest] = cid.split(CH_SESS_PREFIX);
    const [op, sid] = rest.split(":");
    const sess = sessions.get(sid);
    if (!sess) return btn.reply({ content: "세션이 만료되었어. 다시 시도해줘!", ephemeral: true });
    if (Date.now() > sess.expireAt) { sessions.delete(sid); return btn.reply({ content: "세션이 만료되었어. 다시 시도해줘!", ephemeral: true }); }
    if (op === "close") { sessions.delete(sid); try { await btn.update({ components: [], content: "분석을 종료했습니다." }); } catch {} return; }
    if (op === "prev") sess.page = Math.max(0, sess.page - 1);
    if (op === "next") sess.page = Math.min(sess.totalPages - 1, sess.page + 1);
    const { ch, vids, summary, rpmKRW, graphAttachment } = sess.channelData;
    const out = buildChannelPage(ch, summary, vids, sess.page, sess.totalPages, rpmKRW, graphAttachment);
    const row2 = buildChannelPagerRow(sid, sess.page, sess.totalPages);
    await btn.update({ embeds: out.embeds, files: out.files, components: [row2] });
  } catch { try { await btn.deferUpdate(); } catch {} }
});
collector.on("end", async () => {
  try {
    const cur = await interaction.fetchReply();
    const comps = cur.components?.[0]?.components || [];
    const rowD = new ActionRowBuilder().addComponents(comps.map(c => ButtonBuilder.from(c).setDisabled(true)));
    await interaction.editReply({ components: [rowD] });
  } catch {}
});

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
        .setDescription("채널명 또는 링크(영상/채널)로 단일 채널 집중 분석")
        .addStringOption(o =>
          o.setName("채널")
           .setDescription("채널명 또는 유튜브 링크(영상/채널)")
           .setRequired(true))),
  async execute(interaction) {
    const key = process.env.YT_API_KEY;
    if (!key) return interaction.reply({ content: "🔧 `YT_API_KEY` 환경변수를 설정해줘.", ephemeral: true });

    const sub = interaction.options.getSubcommand();
    if (sub === "검색") {
      const q = interaction.options.getString("검색어", true).trim();
      return handleSearch(interaction, q, key);
    }
    if (sub === "조회") {
      const input = interaction.options.getString("영상링크", true).trim();
      return handleView(interaction, input, key);
    }
    if (sub === "채널분석") {
      const input = interaction.options.getString("채널", true).trim();
      return handleChannelAnalyze(interaction, input, key);
    }
  },
};
