"use strict";
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
} = require("discord.js");
const crypto = require("crypto");

let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try { _fetch = require("node-fetch"); } catch {}
}
let _canvas;
try { _canvas = require("canvas"); } catch {}

const REGION = "KR";
const HL = "ko_KR";
const SESSION_TTL_MS = 10 * 60 * 1000;
const PAGE_TTL_MS = 5 * 60 * 1000;
const PREFIX_SEARCH = "yts:";
const PREFIX_VIEW = "ytv:";
const PREFIX_CHAN = "ytc:";
const sessions = new Map();

const PIPED_INSTANCES = [
  "https://piped.video",
  "https://piped.lunar.icu",
  "https://piped.projectsegfau.lt",
  "https://piped.privacydev.net",
  "https://piped.privacy.com.de",
  "https://piped.lunar.icu"
];
let pipedIdx = Math.floor(Math.random() * PIPED_INSTANCES.length);

const RPM_KRW_PER_1K_MIN = Number(process.env.YT_RPM_KRW_MIN || 500);
const RPM_KRW_PER_1K_MAX = Number(process.env.YT_RPM_KRW_MAX || 3000);
const DEFAULT_RPM_KRW_PER_1K = Number(process.env.YT_RPM_KRW || 1500);

function nowMs() { return Date.now(); }
function toKST(iso) { try { const d = new Date(iso); return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); } catch { return iso || "알 수 없음"; } }
function fmtNum(n) { if (n === undefined || n === null || Number.isNaN(n)) return "정보 없음"; return Number(n).toLocaleString("ko-KR"); }
function isYouTubeUrl(s) { try { const u = new URL(s); return /(^|\.)youtube\.com$/.test(u.hostname) || /(^|\.)youtu\.be$/.test(u.hostname); } catch { return false; } }
function parseYouTubeIdFromUrl(s) {
  try {
    const u = new URL(s);
    if (/youtu\.be$/.test(u.hostname)) { return { videoId: u.pathname.replace(/^\/+/, "") || null, channelId: null }; }
    if (/youtube\.com$/.test(u.hostname)) {
      const path = u.pathname;
      const v = u.searchParams.get("v");
      if (path.startsWith("/watch") && v) return { videoId: v, channelId: null };
      if (path.startsWith("/shorts/")) return { videoId: path.split("/")[2], channelId: null };
      if (path.startsWith("/live/")) return { videoId: path.split("/")[2], channelId: null };
      if (path.startsWith("/channel/")) return { videoId: null, channelId: path.split("/")[2] };
      if (path.startsWith("/c/") || path.startsWith("/@")) return { videoId: null, channelId: path };
    }
  } catch {}
  return { videoId: null, channelId: null };
}
async function httpJson(url) { const res = await _fetch(url, { headers: { "accept-language": HL } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); }
function pickPiped() { for (let i = 0; i < PIPED_INSTANCES.length; i++) { const idx = (pipedIdx + i) % PIPED_INSTANCES.length; return { base: PIPED_INSTANCES[idx], idx }; } }
function rotatePiped() { pipedIdx = (pipedIdx + 1) % PIPED_INSTANCES.length; }

async function pipedSearchAll(query, filter = "all") {
  let lastErr;
  for (let i = 0; i < PIPED_INSTANCES.length; i++) {
    const { base } = pickPiped();
    const url = `${base}/api/v1/search?region=${encodeURIComponent(REGION)}&q=${encodeURIComponent(query)}&hl=${encodeURIComponent(HL)}${filter && filter !== "all" ? `&filter=${filter}` : ""}`;
    try {
      const data = await httpJson(url);
      if (Array.isArray(data)) return { instance: base, results: data };
      rotatePiped();
    } catch (e) { lastErr = e; rotatePiped(); }
  }
  if (lastErr) throw lastErr;
  return { instance: null, results: [] };
}
async function pipedSearchVideos(query) { return pipedSearchAll(query, "videos"); }
async function pipedSearchChannel(query) { return pipedSearchAll(query, "channels"); }

async function pipedGetVideo(videoId) {
  let lastErr;
  for (let i = 0; i < PIPED_INSTANCES.length; i++) {
    const { base } = pickPiped();
    try {
      const data = await httpJson(`${base}/api/v1/video/${encodeURIComponent(videoId)}`);
      return { instance: base, data };
    } catch (e) { lastErr = e; rotatePiped(); }
  }
  if (lastErr) throw lastErr;
  throw new Error("Video fetch failed");
}

async function pipedGetChannelById(channelId) {
  let lastErr;
  const id = channelId.startsWith("/@") || channelId.startsWith("/c/") ? channelId : encodeURIComponent(channelId);
  for (let i = 0; i < PIPED_INSTANCES.length; i++) {
    const { base } = pickPiped();
    try {
      const data = await httpJson(`${base}/api/v1/channel/${id}`);
      return { instance: base, data };
    } catch (e) { lastErr = e; rotatePiped(); }
  }
  if (lastErr) throw lastErr;
  throw new Error("Channel fetch failed");
}

async function pipedGetChannelVideos(channelId, nextToken = "", sort = "videos") {
  let lastErr;
  const id = channelId.startsWith("/@") || channelId.startsWith("/c/") ? channelId : encodeURIComponent(channelId);
  for (let i = 0; i < PIPED_INSTANCES.length; i++) {
    const { base } = pickPiped();
    let url = `${base}/api/v1/channel/${id}/videos?sort=${encodeURIComponent(sort)}&hl=${encodeURIComponent(HL)}`;
    if (nextToken) url += `&nextpage=${encodeURIComponent(nextToken)}`;
    try {
      const data = await httpJson(url);
      const videos = Array.isArray(data?.relatedStreams) ? data.relatedStreams : Array.isArray(data?.videos) ? data.videos : [];
      const next = data?.nextpage || null;
      return { instance: base, videos, next };
    } catch (e) { lastErr = e; rotatePiped(); }
  }
  if (lastErr) throw lastErr;
  return { instance: null, videos: [], next: null };
}

function toViewsNum(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v);
  const m = s.match(/([\d,.]+)/);
  if (!m) return 0;
  return Number(m[1].replace(/[.,]/g,"")) || 0;
}

function computeGrowthPotential({ subs = 0, viewsSeries = [], uploadPerWeek = 0, avgCtr = 0, avgViewDurMin = 0 }) {
  const n = viewsSeries.length;
  let slope = 0;
  if (n >= 3) {
    const xs = viewsSeries.map((_, i) => i + 1);
    const xbar = xs.reduce((a,b)=>a+b,0)/n;
    const ybar = viewsSeries.reduce((a,b)=>a+b,0)/n;
    const num = xs.reduce((acc, x, i)=> acc + (x - xbar) * (viewsSeries[i] - ybar), 0);
    const den = xs.reduce((acc, x)=> acc + Math.pow(x - xbar, 2), 0) || 1;
    slope = num / den;
    const scale = (ybar || 1);
    slope = Math.max(-1, Math.min(1, slope / scale));
  }
  const sTrend = (slope + 1) * 50;
  const sFreq  = Math.min(100, uploadPerWeek * 25);
  const sCtr   = Math.max(0, Math.min(100, (avgCtr || 0) * 20));
  const sDur   = Math.min(100, (avgViewDurMin || 0) * 10);
  const sSize  = Math.min(100, Math.log10((subs||1)) * 25);
  const score = sTrend * 0.28 + sFreq * 0.24 + sCtr * 0.22 + sDur * 0.18 + sSize * 0.08;
  const pct = Math.round(Math.max(0, Math.min(100, score)));
  let note;
  if (pct >= 85) note = "🔥 폭발 직전";
  else if (pct >= 70) note = "📈 고성장 구간";
  else if (pct >= 55) note = "🌱 성장 가능";
  else if (pct >= 40) note = "⚖️ 관망";
  else note = "🧪 리빌딩 필요";
  return { pct, note };
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

function estimateRevenueKRW(views, rpmPer1k = DEFAULT_RPM_KRW_PER_1K) {
  const vv = Math.max(0, Number(views) || 0);
  const rpm = Math.max(RPM_KRW_PER_1K_MIN, Math.min(rpmPer1k, RPM_KRW_PER_1K_MAX));
  return Math.round((vv / 1000) * rpm);
}

function pickBestChannelMatch(results, needle) {
  const q = (needle || "").toLowerCase();
  let best = null; let bestScore = -1;
  for (const r of results) {
    const title = String(r.name || r.title || "").toLowerCase();
    const handle = String(r?.uploaderUrl || r?.url || r?.url || "").toLowerCase();
    let score = 0;
    if (title === q) score += 100;
    if (title.includes(q)) score += 50;
    if (handle.includes(q)) score += 30;
    if (r?.verified) score += 10;
    if (r?.subscribers) score += Math.min(10, Math.log10((r.subscribers || 1)) * 5);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best || results[0] || null;
}

function buildPagerRow(prefix, sessionId, page, totalPages) {
  const prev = new ButtonBuilder().setCustomId(`${prefix}${sessionId}:prev`).setStyle(ButtonStyle.Secondary).setLabel("이전").setDisabled(page <= 0);
  const next = new ButtonBuilder().setCustomId(`${prefix}${sessionId}:next`).setStyle(ButtonStyle.Secondary).setLabel("다음").setDisabled(page >= totalPages - 1);
  const close = new ButtonBuilder().setCustomId(`${prefix}${sessionId}:close`).setStyle(ButtonStyle.Danger).setLabel("닫기");
  return new ActionRowBuilder().addComponents(prev, next, close);
}

function buildJumpRow(prefix, sessionId, options) {
  const menu = new StringSelectMenuBuilder().setCustomId(`${prefix}${sessionId}:jump`).setPlaceholder("페이지 이동").addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function makeSearchVideoEmbed(item) {
  const title = item?.title || "제목 없음";
  const url = item?.url || (item?.url && item?.url.startsWith("http") ? item.url : (item?.url ? `https://www.youtube.com${item.url}` : null));
  const eb = new EmbedBuilder()
    .setColor(0xE11D48)
    .setTitle(title.slice(0, 256))
    .setURL(url || null)
    .setThumbnail(item?.thumbnail || item?.thumbnailUrl || item?.thumbnail?.[0]?.url || null)
    .addFields(
      { name: "채널", value: item?.uploaderName || item?.uploader || "알 수 없음", inline: true },
      { name: "조회수", value: fmtNum(toViewsNum(item?.views || item?.shortViewCountText)), inline: true },
      { name: "업로드", value: String(item?.uploadedDate || item?.uploaded || item?.publishedText || ""), inline: true }
    );
  return eb;
}

function makeViewVideoEmbed(v) {
  const eb = new EmbedBuilder()
    .setColor(0xF59E0B)
    .setTitle((v?.title || "제목 없음").slice(0, 256))
    .setURL(v?.url || (v?.id ? `https://www.youtube.com/watch?v=${v.id}` : null))
    .setThumbnail(v?.thumbnailURL || v?.thumbnailUrl || v?.thumbnail?.[0]?.url || null)
    .setDescription(v?.description ? String(v.description).slice(0, 800) : null)
    .addFields(
      { name: "채널", value: v?.uploader || v?.uploaderName || "알 수 없음", inline: true },
      { name: "조회수", value: fmtNum(toViewsNum(v?.views)), inline: true },
      { name: "좋아요", value: fmtNum(toViewsNum(v?.likes || v?.likeCount)), inline: true },
      { name: "게시일", value: v?.uploadedDate ? String(v.uploadedDate) : (v?.published ? toKST(v.published) : "알 수 없음"), inline: true },
      { name: "길이", value: v?.duration || v?.lengthSeconds ? `${v?.duration || `${Math.floor((v.lengthSeconds||0)/60)}:${String((v.lengthSeconds||0)%60).padStart(2,"0")}`}` : "알 수 없음", inline: true }
    );
  return eb;
}

function makeOverviewEmbed(ctx) {
  const { channel, meta, growth, rpmUsedKRW, views30d, uploadPerWeek } = ctx;
  const eb = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`채널 분석: ${channel?.name || meta?.name || "알 수 없음"}`)
    .setURL(channel?.url || meta?.url || null)
    .setThumbnail(channel?.avatarUrl || meta?.avatarUrl || null)
    .addFields(
      { name: "핵심 지표", value: `구독자: **${fmtNum(meta.subscribers)}**\n총 영상: **${fmtNum(meta.videoCount)}**\n업로드/주: **${uploadPerWeek}**`, inline: true },
      { name: "최근 30일 뷰", value: `**${fmtNum(views30d)}**`, inline: true },
      { name: "성장 가능성", value: `**${growth.pct}%** · ${growth.note}`, inline: true }
    )
    .setFooter({ text: `분석 기준: 최근 업로드 중심 · RPM(₩/1,000뷰)≈${fmtNum(rpmUsedKRW)}` })
    .setTimestamp(new Date());
  return eb;
}

function makeRevenueEmbed(ctx) {
  const { views30d, rpmUsedKRW, avgViewsPerVideo, uploadPerWeek } = ctx;
  const monthly = estimateRevenueKRW(views30d, rpmUsedKRW);
  const perVideo = estimateRevenueKRW(avgViewsPerVideo, rpmUsedKRW);
  const eb = new EmbedBuilder()
    .setColor(0x00B894)
    .setTitle("수익 추정")
    .addFields(
      { name: "한달 예상 수익(₩)", value: `**${fmtNum(monthly)}**`, inline: true },
      { name: "영상 1개당 예상 수익(₩)", value: `**${fmtNum(perVideo)}**`, inline: true },
      { name: "전제", value: `RPM(₩/1,000뷰): **${fmtNum(rpmUsedKRW)}**\n최근 30일 조회수: **${fmtNum(views30d)}**\n평균 조회/영상: **${fmtNum(Math.round(avgViewsPerVideo))}**\n업로드/주: **${uploadPerWeek}**` }
    )
    .setTimestamp(new Date());
  return eb;
}

function makeVideosEmbed(ctx) {
  const { recentVideos = [] } = ctx;
  const lines = recentVideos.slice(0, 10).map((v, i) => {
    const title = v?.title ? String(v.title).slice(0, 70) : "제목 없음";
    const views = fmtNum(toViewsNum(v?.views));
    const when = v?.uploaded || v?.uploadedDate || v?.published || v?.publishedText || "";
    const url = v?.url || null;
    return `${i+1}. ${title}\n조회수 ${views} • ${when}${url ? `\n${url}` : ""}`;
  }).join("\n\n") || "데이터 없음";
  const eb = new EmbedBuilder().setColor(0xFFB020).setTitle("최근 업로드").setDescription(lines).setTimestamp(new Date());
  return eb;
}

async function makeGraphEmbedWithAttachment(ctx) {
  const { viewsSeries } = ctx;
  const attachment = await makeGrowthChart(viewsSeries, "최근 업로드 뷰 추이");
  const eb = new EmbedBuilder().setColor(0x4DABF7).setTitle("성장 분석 그래프");
  if (attachment) eb.setImage(`attachment://${attachment.name}`);
  return { eb, attachment };
}

function buildChannelPages(ctx) {
  const pages = [];
  const overview = makeOverviewEmbed(ctx);
  pages.push({ type: "embed", content: overview, files: [] });
  const revenue = makeRevenueEmbed(ctx);
  pages.push({ type: "embed", content: revenue, files: [] });
  const videos = makeVideosEmbed(ctx);
  pages.push({ type: "embed", content: videos, files: [] });
  pages.push({ type: "graph", content: null, files: [] });
  return pages;
}

async function renderChannelPage(interaction, sessionId, state) {
  const page = state.page;
  const total = state.pages.length;
  const row1 = buildPagerRow(PREFIX_CHAN, sessionId, page, total);
  const row2 = buildJumpRow(PREFIX_CHAN, sessionId, [
    { label: "개요", value: "0" },
    { label: "수익 추정", value: "1" },
    { label: "최근 업로드", value: "2" },
    { label: "성장 그래프", value: "3" }
  ]);
  let payload = { embeds: [], components: [row2, row1], files: [] };
  const p = state.pages[page];
  if (p.type === "embed") {
    payload.embeds = [p.content];
  } else if (p.type === "graph") {
    if (!state._graphBuilt) {
      const g = await makeGraphEmbedWithAttachment(state.ctx);
      state._graphBuilt = { eb: g.eb, file: g.attachment };
    }
    payload.embeds = [state._graphBuilt.eb];
    if (state._graphBuilt.file) payload.files = [state._graphBuilt.file];
  }
  await interaction.editReply(payload);
  state.lastRenderAt = nowMs();
}

async function collectAndAnalyzeChannel(input) {
  let channelMeta = null;
  let recentVideos = [];
  if (isYouTubeUrl(input)) {
    const ids = parseYouTubeIdFromUrl(input);
    if (ids.channelId) {
      const ch = await pipedGetChannelById(ids.channelId);
      channelMeta = ch.data || null;
    } else if (ids.videoId) {
      const v = await pipedGetVideo(ids.videoId);
      const cid = v.data?.uploaderUrl || v.data?.uploaderUrlText || null;
      if (cid) {
        const ch = await pipedGetChannelById(cid);
        channelMeta = ch.data || null;
      }
    }
    if (!channelMeta) throw new Error("채널 정보를 찾지 못했습니다.");
  } else {
    const found = await pipedSearchChannel(input);
    if (!found?.results?.length) throw new Error("검색 결과가 없습니다.");
    const best = pickBestChannelMatch(found.results, input);
    const cid = best?.url || best?.uploaderUrl || best?.channelUrl || best?.channelId || best?.urlText || null;
    if (!cid) throw new Error("채널 식별에 실패했습니다.");
    const ch = await pipedGetChannelById(cid);
    channelMeta = ch.data || null;
  }
  const meta = {
    id: channelMeta?.id || channelMeta?.channelId || channelMeta?.ucid || null,
    name: channelMeta?.name || channelMeta?.title || "",
    avatarUrl: channelMeta?.avatarUrl || channelMeta?.avatar || channelMeta?.authorThumbnails?.[0]?.url || null,
    subscribers: toViewsNum(channelMeta?.subscriberCount || channelMeta?.subscribers || channelMeta?.subCount),
    videoCount: toViewsNum(channelMeta?.videosCount || channelMeta?.videoCount || channelMeta?.video_count),
    url: channelMeta?.url || channelMeta?.uploaderUrl || (channelMeta?.id ? `https://www.youtube.com/channel/${channelMeta.id}` : null),
    verified: !!channelMeta?.verified,
    description: channelMeta?.description || ""
  };
  let next = null;
  let loops = 0;
  while (recentVideos.length < 60 && loops < 5) {
    const page = await pipedGetChannelVideos(meta.id || channelMeta?.id || channelMeta?.ucid || "", next, "videos");
    recentVideos.push(...page.videos);
    if (!page.next) break;
    next = page.next;
    loops++;
  }
  const vids = recentVideos.map(v => ({
    title: v?.title,
    views: toViewsNum(v?.views) || toViewsNum(v?.shortViewCountText) || toViewsNum(v?.viewCount || 0),
    uploaded: v?.uploadedDate || v?.uploaded || v?.publishedText || v?.published || "",
    url: v?.url ? (v.url.startsWith("http") ? v.url : `https://www.youtube.com${v.url}`) : null,
    publishedAt: v?.published || null
  }));
  const now = Date.now();
  const days30 = 30 * 24 * 3600 * 1000;
  const views30d = vids.filter(v => { const t = Date.parse(v.publishedAt || "") || 0; return t && (now - t) <= days30; }).reduce((a, b) => a + (b.views || 0), 0);
  const lastN = vids.slice(0, 12);
  const viewsSeries = lastN.map(v => v.views || 0).reverse();
  const uploadPerWeek = (() => {
    const fourWeeksAgo = now - 28 * 24 * 3600 * 1000;
    const cnt = vids.filter(v => { const t = Date.parse(v.publishedAt || "") || 0; return t >= fourWeeksAgo; }).length;
    return +(cnt / 4).toFixed(2);
  })();
  const avgViewsPerVideo = (() => {
    const arr = lastN.map(v => v.views || 0).filter(x => Number.isFinite(x) && x >= 0);
    if (!arr.length) return 0;
    return arr.reduce((a,b)=>a+b,0)/arr.length;
  })();
  const growth = computeGrowthPotential({ subs: meta.subscribers, viewsSeries, uploadPerWeek, avgCtr: 0, avgViewDurMin: 0 });
  const rpmUsedKRW = DEFAULT_RPM_KRW_PER_1K;
  return {
    channel: { name: meta.name, url: meta.url, avatarUrl: meta.avatarUrl },
    meta,
    recentVideos: vids,
    viewsSeries,
    views30d,
    uploadPerWeek,
    avgViewsPerVideo,
    growth,
    rpmUsedKRW
  };
}

function buildSearchSession(results) {
  const items = results.filter(r => r?.type === "video" || r?.title);
  return { items, page: 0 };
}

async function handleSearch(interaction, query) {
  await interaction.deferReply();
  let pack;
  try {
    const { results } = await pipedSearchVideos(query);
    if (!results?.length) { await interaction.editReply({ content: "죄송합니다, 검색 결과를 찾을 수 없습니다." }); return; }
    pack = buildSearchSession(results);
  } catch (e) {
    await interaction.editReply({ content: `검색 중 오류가 발생했습니다.\n오류: ${e.message || e}` });
    return;
  }
  const sessionId = crypto.randomBytes(8).toString("hex");
  const state = {
    kind: "search",
    prefix: PREFIX_SEARCH,
    sessionId,
    createdAt: nowMs(),
    page: 0,
    items: pack.items,
    lastMessageId: null
  };
  sessions.set(sessionId, state);
  setTimeout(() => { sessions.delete(sessionId); }, SESSION_TTL_MS);
  const cur = state.items[state.page];
  const eb = makeSearchVideoEmbed(cur);
  const url = cur?.url ? (cur.url.startsWith("http") ? cur.url : `https://www.youtube.com${cur.url}`) : null;
  const openBtn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("유튜브에서 보기").setURL(url || "https://www.youtube.com");
  const rowNav = buildPagerRow(PREFIX_SEARCH, sessionId, state.page, state.items.length);
  const rowLink = new ActionRowBuilder().addComponents(openBtn);
  const msg = await interaction.editReply({ embeds: [eb], components: [rowLink, rowNav], content: url || null });
  state.lastMessageId = msg.id;
}

async function handleView(interaction, input) {
  await interaction.deferReply();
  let videoId = null;
  if (isYouTubeUrl(input)) {
    const ids = parseYouTubeIdFromUrl(input);
    videoId = ids.videoId;
  } else {
    videoId = input;
  }
  if (!videoId) { await interaction.editReply({ content: "영상 링크 또는 ID를 확인해 주세요." }); return; }
  try {
    const { data } = await pipedGetVideo(videoId);
    const eb = makeViewVideoEmbed({
      id: data?.id || videoId,
      title: data?.title,
      url: data?.url || (data?.id ? `https://www.youtube.com/watch?v=${data.id}` : null),
      thumbnailURL: Array.isArray(data?.thumbnailUrl) ? data.thumbnailUrl[0] : data?.thumbnailURL || data?.thumbnailUrl,
      description: data?.description,
      uploader: data?.uploader,
      views: data?.views,
      likes: data?.likes,
      uploadedDate: data?.uploadedDate,
      duration: data?.duration,
      lengthSeconds: data?.lengthSeconds,
      published: data?.published
    });
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const openBtn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("유튜브에서 보기").setURL(url);
    const row = new ActionRowBuilder().addComponents(openBtn);
    await interaction.editReply({ embeds: [eb], components: [row], content: url });
  } catch (e) {
    await interaction.editReply({ content: `영상 조회 중 오류가 발생했습니다.\n오류: ${e.message || e}` });
  }
}

async function handleChannelAnalyze(interaction, input) {
  await interaction.deferReply();
  let ctx;
  try { ctx = await collectAndAnalyzeChannel(input); }
  catch (e) { await interaction.editReply({ content: `채널 분석 중 오류가 발생했습니다.\n오류: ${e.message || e}` }); return; }
  const pages = buildChannelPages(ctx);
  const sessionId = crypto.randomBytes(8).toString("hex");
  const state = { kind: "channel", prefix: PREFIX_CHAN, sessionId, createdAt: nowMs(), lastRenderAt: 0, page: 0, pages, ctx, lastMessageId: null };
  sessions.set(sessionId, state);
  setTimeout(() => { const s = sessions.get(sessionId); if (!s) return; sessions.delete(sessionId); }, SESSION_TTL_MS);
  await renderChannelPage(interaction, sessionId, state);
  const msg = await interaction.fetchReply();
  state.lastMessageId = msg.id;
}

async function onComponent(interaction) {
  const id = interaction.customId || "";
  if (!(id.startsWith(PREFIX_SEARCH) || id.startsWith(PREFIX_VIEW) || id.startsWith(PREFIX_CHAN))) return false;
  const [prefixAndSess, action] = id.split(":");
  const prefix = prefixAndSess.slice(0, 4);
  const sessId = prefixAndSess.slice(4);
  const st = sessions.get(sessId);
  if (!st) { try { await interaction.reply({ content: "세션이 만료되었습니다.", ephemeral: true }); } catch {} return true; }
  if (interaction.user.id !== st.ownerId && st.ownerId && interaction.user.id !== st.ownerId) { try { await interaction.reply({ content: "요청자만 조작할 수 있습니다.", ephemeral: true }); } catch {} return true; }
  if (action === "close") {
    sessions.delete(sessId);
    try { await interaction.update({ components: [], content: "분석을 종료했습니다." }); } catch {}
    return true;
  }
  if (action === "prev") {
    st.page = Math.max(0, st.page - 1);
    try { await interaction.deferUpdate(); } catch {}
    if (st.kind === "search") {
      const cur = st.items[st.page];
      const eb = makeSearchVideoEmbed(cur);
      const url = cur?.url ? (cur.url.startsWith("http") ? cur.url : `https://www.youtube.com${cur.url}`) : null;
      const openBtn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("유튜브에서 보기").setURL(url || "https://www.youtube.com");
      const rowNav = buildPagerRow(PREFIX_SEARCH, st.sessionId, st.page, st.items.length);
      const rowLink = new ActionRowBuilder().addComponents(openBtn);
      try { await interaction.editReply({ embeds: [eb], components: [rowLink, rowNav], content: url || null }); } catch {}
    } else if (st.kind === "channel") {
      await renderChannelPage(interaction, st.sessionId, st);
    }
    return true;
  }
  if (action === "next") {
    if (st.kind === "search") st.page = Math.min(st.items.length - 1, st.page + 1);
    else if (st.kind === "channel") st.page = Math.min(st.pages.length - 1, st.page + 1);
    try { await interaction.deferUpdate(); } catch {}
    if (st.kind === "search") {
      const cur = st.items[st.page];
      const eb = makeSearchVideoEmbed(cur);
      const url = cur?.url ? (cur.url.startsWith("http") ? cur.url : `https://www.youtube.com${cur.url}`) : null;
      const openBtn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("유튜브에서 보기").setURL(url || "https://www.youtube.com");
      const rowNav = buildPagerRow(PREFIX_SEARCH, st.sessionId, st.page, st.items.length);
      const rowLink = new ActionRowBuilder().addComponents(openBtn);
      try { await interaction.editReply({ embeds: [eb], components: [rowLink, rowNav], content: url || null }); } catch {}
    } else if (st.kind === "channel") {
      await renderChannelPage(interaction, st.sessionId, st);
    }
    return true;
  }
  if (action === "jump" && interaction.isStringSelectMenu()) {
    const v = Number(interaction.values?.[0] || 0) | 0;
    if (st.kind === "search") st.page = Math.max(0, Math.min(st.items.length - 1, v));
    else if (st.kind === "channel") st.page = Math.max(0, Math.min(st.pages.length - 1, v));
    try { await interaction.deferUpdate(); } catch {}
    if (st.kind === "search") {
      const cur = st.items[st.page];
      const eb = makeSearchVideoEmbed(cur);
      const url = cur?.url ? (cur.url.startsWith("http") ? cur.url : `https://www.youtube.com${cur.url}`) : null;
      const openBtn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("유튜브에서 보기").setURL(url || "https://www.youtube.com");
      const rowNav = buildPagerRow(PREFIX_SEARCH, st.sessionId, st.page, st.items.length);
      const rowLink = new ActionRowBuilder().addComponents(openBtn);
      try { await interaction.editReply({ embeds: [eb], components: [rowLink, rowNav], content: url || null }); } catch {}
    } else if (st.kind === "channel") {
      await renderChannelPage(interaction, st.sessionId, st);
    }
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("유튜브")
    .setDescription("유튜브 도우미")
    .addSubcommand(sub => sub.setName("검색").setDescription("유튜브 영상 검색").addStringOption(o => o.setName("검색어").setDescription("검색어").setRequired(true)))
    .addSubcommand(sub => sub.setName("조회").setDescription("유튜브 영상 조회").addStringOption(o => o.setName("영상").setDescription("유튜브 링크 또는 영상 ID").setRequired(true)))
    .addSubcommand(sub => sub.setName("채널분석").setDescription("채널명 또는 링크로 단일 채널 집중 분석").addStringOption(o => o.setName("채널").setDescription("채널명 또는 유튜브 링크(영상/채널)").setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "검색") {
      const q = interaction.options.getString("검색어", true);
      await handleSearch(interaction, q);
      const collector = interaction.channel.createMessageComponentCollector({ time: PAGE_TTL_MS });
      collector.on("collect", async (i) => { await onComponent(i); });
      collector.on("end", async () => {
        for (const [sid, st] of Array.from(sessions.entries())) {
          if (st.prefix !== PREFIX_SEARCH) continue;
          try {
            const row = buildPagerRow(PREFIX_SEARCH, sid, st.page, st.items.length);
            for (const b of row.components) b.setDisabled(true);
            const cur = st.items[st.page];
            const eb = makeSearchVideoEmbed(cur);
            const url = cur?.url ? (cur.url.startsWith("http") ? cur.url : `https://www.youtube.com${cur.url}`) : null;
            const openBtn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("유튜브에서 보기").setURL(url || "https://www.youtube.com");
            const rowLink = new ActionRowBuilder().addComponents(openBtn);
            await interaction.editReply({ embeds: [eb], components: [rowLink, row], content: url || null });
          } catch {}
        }
      });
      return;
    }
    if (sub === "조회") {
      const input = interaction.options.getString("영상", true);
      await handleView(interaction, input);
      return;
    }
    if (sub === "채널분석") {
      const input = interaction.options.getString("채널", true);
      await handleChannelAnalyze(interaction, input);
      const collector = interaction.channel.createMessageComponentCollector({ time: PAGE_TTL_MS });
      collector.on("collect", async (i) => { await onComponent(i); });
      collector.on("end", async () => {
        for (const [sid, st] of Array.from(sessions.entries())) {
          if (st.prefix !== PREFIX_CHAN) continue;
          try {
            const row = buildPagerRow(PREFIX_CHAN, sid, st.page, st.pages.length);
            for (const b of row.components) b.setDisabled(true);
            const row2 = buildJumpRow(PREFIX_CHAN, sid, [
              { label: "개요", value: "0" },
              { label: "수익 추정", value: "1" },
              { label: "최근 업로드", value: "2" },
              { label: "성장 그래프", value: "3" }
            ]);
            for (const c of row2.components) c.setDisabled(true);
            const cur = st.pages[st.page];
            let embeds = [];
            let files = [];
            if (cur.type === "embed") {
              embeds = [cur.content];
            } else {
              if (st._graphBuilt) {
                embeds = [st._graphBuilt.eb];
                if (st._graphBuilt.file) files = [st._graphBuilt.file];
              } else {
                embeds = [new EmbedBuilder().setColor(0x999999).setDescription("세션 만료")];
              }
            }
            await interaction.editReply({ embeds, files, components: [row2, row] });
          } catch {}
        }
      });
      return;
    }
  }
};
