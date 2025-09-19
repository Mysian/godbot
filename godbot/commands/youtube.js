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
const https = require("https");
const { URL } = require("url");

// ===== 설정 =====
const REGION = "KR";
const HL = "ko";
const SEARCH_PAGE_SIZE = 10;
const SESSION_TTL_MS = 10 * 60 * 1000;
const REQ_TIMEOUT_MS = 10000;
const SESS_PREFIX = "yt:";
const sessions = new Map();

// Invidious API 인스턴스(백업용)
const INVIDIOUS_ENDPOINTS = [
  "https://yewtu.be",
  "https://invidious.projectsegfau.lt",
  "https://invidious.slipfox.xyz",
  "https://iv.ggtyler.dev",
  "https://invidious.protokolla.fi",
];


// Piped API 인스턴스(안정적인 pipedapi.* 우선)
const PIPED_ENDPOINTS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.privacydev.net",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.r4fo.com",
  "https://pipedapi.colinslegacy.com",
  "https://pipedapi.smnz.de",
  "https://piped-api.cfe.re",
  "https://pipedapi.palveluntarjoaja.eu",
  "https://pipedapi.us.projectsegfau.lt",
  "https://pipedapi-libre.kavin.rocks",
];

// ===== 공용 유틸 =====
function fmtNum(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "정보 없음";
  return Number(n).toLocaleString("ko-KR");
}
function cut(str, n) { if (!str) return ""; return str.length > n ? (str.slice(0, n - 1) + "…") : str; }
function parseLenToHHMMSS(x) {
  if (typeof x === "number") {
    const s = Math.max(0, x|0);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const parts = []; if (h > 0) parts.push(String(h));
    parts.push(String(m).padStart(2,"0")); parts.push(String(sec).padStart(2,"0"));
    return parts.join(":");
  }
  if (!x) return "알 수 없음";
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(x);
  if (!m) return "알 수 없음";
  const hh = parseInt(m[1]||0,10), mi = parseInt(m[2]||0,10), ss = parseInt(m[3]||0,10);
  const parts = []; if (hh>0) parts.push(String(hh));
  parts.push(String(mi).padStart(2,"0")); parts.push(String(ss).padStart(2,"0"));
  return parts.join(":");
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
const ytSearchUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const ytWatchUrl  = (id) => `https://www.youtube.com/watch?v=${id}`;

// ===== HTTP (https 내장) =====
function httpGetJsonRaw(fullUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const opt = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + (u.search || ""),
      method: "GET",
      headers: {
  "user-agent": "godbot/yt (discord.js)",
  "accept": "application/json,text/plain,*/*",
  "accept-language": "ko-KR,ko;q=0.9,en;q=0.5",
  "accept-encoding": "identity",
},
...
res.on("end", () => {
  if (statusCode >= 500) {
    return reject(new Error(`업스트림 5xx (${statusCode})`));
  }
  if (statusCode < 200 || statusCode >= 300) {
    return reject(new Error(`HTTP ${statusCode}`));
  }
  try {
    const j = JSON.parse(data);
    resolve(j);
  } catch (e) {
    if (typeof data === "string" && data.trim().startsWith("<")) {
      return reject(new Error("JSON 파싱 실패(HTML 응답)"));
    }
    reject(new Error("JSON 파싱 실패"));
  }
});

    req.on("timeout", () => { req.destroy(new Error("요청 타임아웃")); });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

async function pipedGet(pathWithQuery) {
  let lastErr;
  for (const base of PIPED_ENDPOINTS) {
    try {
      const j = await httpGetJsonRaw(base + pathWithQuery);
      return { data: j, base };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("모든 Piped 인스턴스 실패");
}

// ===== Piped API 래퍼 =====
async function ytSearchNoKey(query) {
  try {
    // 1차: Piped
    const q = encodeURIComponent(query);
    const { data } = await pipedGet(`/api/v1/search?q=${q}&region=${REGION}&hl=${HL}&filter=videos`);
    const list = Array.isArray(data) ? data : [];
    if (list.length) return list.slice(0, SEARCH_PAGE_SIZE);
    // 비어 있으면 인비디우스로 폴백
    return await invSearchNoKey(query);
  } catch (e) {
    // Piped가 5xx로 죽으면 바로 인비디우스로 폴백
    try {
      return await invSearchNoKey(query);
    } catch (e2) {
      // 둘 다 실패 시 원인 합쳐서 던짐
      throw new Error(`백엔드 불안정(Piped: ${e.message || e}, Invidious: ${e2.message || e2})`);
    }
  }
}


async function invidiousGet(pathWithQuery) {
  let lastErr;
  for (const base of INVIDIOUS_ENDPOINTS) {
    try {
      const j = await httpGetJsonRaw(base + pathWithQuery);
      return { data: j, base };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("모든 Invidious 인스턴스 실패");
}

async function invSearchNoKey(query) {
  const q = encodeURIComponent(query);
  // /api/v1/search?type=video
  const { data } = await invidiousGet(`/api/v1/search?q=${q}&type=video&region=${REGION}`);
  const arr = Array.isArray(data) ? data : [];
  // Piped 검색 아이템 인터페이스에 맞춰 최소 필드만 매핑
  return arr.slice(0, SEARCH_PAGE_SIZE).map(v => ({
    id: v.videoId,
    title: v.title,
    uploaderName: v.author,
    uploadDate: v.publishedText,          // 예: "3 days ago"
    duration: Number(v.lengthSeconds || 0),
    views: Number(v.viewCount || 0),
    thumbnail: (Array.isArray(v.videoThumbnails) && v.videoThumbnails.length)
      ? v.videoThumbnails[v.videoThumbnails.length - 1].url
      : `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
    shortDescription: v.description || "",
  }));
}


async function ytVideoInfoNoKey(videoId) {
  // 공식 문서 기준: /streams/:videoId 를 사용
  const { data: v } = await pipedGet(`/api/v1/streams/${videoId}?region=${REGION}&hl=${HL}`);
  if (!v || !v.title) return null;

  // 업로더 채널(있으면)
  let ch = null;
  const uploaderUrl = v.uploaderUrl; // e.g. "/channel/UCxxxx"
  const chId = uploaderUrl && uploaderUrl.startsWith("/channel/") ? uploaderUrl.split("/")[2] : null;
  if (chId) {
    try {
      const { data: chData } = await pipedGet(`/api/v1/channel/${chId}`);
      ch = chData || null;
    } catch {}
  }

  // 최근 댓글 1개(있으면)
  let recent = null;
  try {
    const { data: c } = await pipedGet(`/api/v1/comments/${videoId}?region=${REGION}&hl=${HL}&sort=new`);
    const arr = Array.isArray(c?.comments) ? c.comments : [];
    recent = arr[0] || null;
  } catch {}

  return { v, ch, recent };
}

// ===== Embed 빌더 =====
function buildEmbedForSearchItem(item, indexPos, total, queryForLink) {
  const vid = item.id || (item.url && item.url.includes("v=") ? item.url.split("v=")[1] : null);
  const url = vid ? ytWatchUrl(vid) : (item.url || ytSearchUrl(queryForLink));
  const title = item.title || "제목 없음";
  const chName = item.uploaderName || item.uploader || "채널 정보 없음";
  const uploaded = item.uploadDate || item.uploadedDate || "업로드 정보 없음";
  const views = fmtNum(item.views);
  const dur = parseLenToHHMMSS(item.duration ?? 0);
  const thumb = item.thumbnail || item.thumbnailUrl;

  const eb = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(title)
    .setURL(url)
    .setDescription([
      `채널: **${chName}**`,
      `업로드: **${uploaded}**`,
      `길이: **${dur}**`,
      `조회수: **${views}**`,
    ].join("\n"))
    .setFooter({ text: `결과 ${indexPos + 1}/${total}` });
  if (thumb) eb.setThumbnail(thumb);

  const vdesc = item.shortDescription || item.description;
  if (vdesc) eb.addFields({ name: "영상 설명", value: cut(vdesc, 600) });

  return { embed: eb, url };
}

function buildEmbedFromPiped({ v, ch, recent }) {
  const vid = v.id || v.videoId;
  const url = ytWatchUrl(vid);
  const title = v.title || "제목 없음";
  const chName = v.uploader || "채널 정보 없음";
  const uploaded = v.uploadDate || "업로드 정보 없음";
  const views = fmtNum(v.views);
  const likes = v.likeCount != null ? fmtNum(v.likeCount) : (v.likes != null ? fmtNum(v.likes) : "공개 안 됨");
  const dur = parseLenToHHMMSS(v.duration ?? v.contentLengthSeconds ?? 0);
  const thumb = v.thumbnailUrl || (Array.isArray(v.thumbnails) ? v.thumbnails[0] : null);

  const eb = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(title)
    .setURL(url)
    .setDescription([
      `채널: **${chName}**`,
      `업로드: **${uploaded}**`,
      `길이: **${dur}**`,
      `조회수: **${views}** · 좋아요: **${likes}**`,
    ].join("\n"));

  if (thumb) eb.setThumbnail(thumb);

  const videoDesc = v.shortDescription || v.description;
  if (videoDesc) eb.addFields({ name: "영상 설명", value: cut(videoDesc, 600) });

  if (ch && ch.name) {
    const subs = ch.subscriberCount != null ? fmtNum(ch.subscriberCount) : "비공개";
    const vids = Array.isArray(ch.relatedStreams) ? fmtNum(ch.relatedStreams.length)
              : (ch.videos != null ? fmtNum(ch.videos) : "정보 없음");
    eb.addFields({
      name: "업로더",
      value: `이름: **${ch.name}**\n구독자: **${subs}**, 업로드 영상 수: **${vids}**`,
      inline: false,
    });
  }

  if (recent && (recent.commentText || recent.content)) {
    const rn = recent.author ?? recent.authorName ?? "익명";
    const rt = recent.commentedTime ?? recent.commentedAt ?? recent.uploaded ?? "";
    const rv = cut(recent.commentText || recent.content || "", 300) || "(내용 없음)";
    eb.addFields({ name: "최근 댓글 (최신순)", value: `**${rn}** • ${rt}\n${rv}` });
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

function buildSearchLinkRow(query) {
  const link = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("유튜브에서 전체 검색 결과 보기")
    .setURL(ytSearchUrl(query));
  return new ActionRowBuilder().addComponents(link);
}

async function respondWithPlayable(interaction, payload) {
  const { content, embed, components } = payload;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content, embeds: [embed], components });
  } else {
    await interaction.reply({ content, embeds: [embed], components, ephemeral: false });
  }
}

// ===== Slash 구현 =====
module.exports = {
  data: new SlashCommandBuilder()
    .setName("유튜브")
    .setDescription("유튜브 검색/조회 (API 키 불필요)")
    .addSubcommand(sc =>
      sc.setName("검색")
        .setDescription("유튜브에서 영상을 검색합니다.")
        .addStringOption(o =>
          o.setName("검색어").setDescription("검색할 키워드").setRequired(true)))
    .addSubcommand(sc =>
      sc.setName("조회")
        .setDescription("유튜브 영상 링크/ID로 정보를 조회합니다.")
        .addStringOption(o =>
          o.setName("영상링크").setDescription("https://youtu.be/... 또는 영상 ID(11자리)").setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "검색") {
      const q = interaction.options.getString("검색어", true).trim();
      await interaction.deferReply();

      let list = [];
      try {
        list = await ytSearchNoKey(q);
      } catch (e) {
        const msg = (e && e.message) ? e.message : "원인 불명";
        // 최소한 유튜브 검색 링크는 제공
        return interaction.editReply({
          content: `죄송합니다, 검색 중 오류가 발생했습니다. (${msg})\n검색 링크: ${ytSearchUrl(q)}`
        });
      }
      if (!list.length) {
        return interaction.editReply({
          content: `죄송합니다, 검색 결과를 찾을 수 없습니다.\n검색 링크: ${ytSearchUrl(q)}`
        });
      }

      const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const owner = interaction.user.id;
      const expireAt = Date.now() + SESSION_TTL_MS;

      sessions.set(sessionId, { type: "search", query: q, owner, expireAt, index: 0, list });

      const first = list[0];
      const { embed, url } = buildEmbedForSearchItem(first, 0, list.length, q);
      const row = buildPagerRow(sessionId, 0, list.length);
      const linkRow = buildSearchLinkRow(q);

      await respondWithPlayable(interaction, {
        content: `${url}\n검색 전체 보기: ${ytSearchUrl(q)}`,
        embed,
        components: [row, linkRow],
      });

      const msgObj = await interaction.fetchReply();
      const collector = msgObj.createMessageComponentCollector({
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
          const { embed: eb2, url: u2 } = buildEmbedForSearchItem(cur, sess.index, sess.list.length, sess.query);
          const row2 = buildPagerRow(sid, sess.index, sess.list.length);
          const linkRow2 = buildSearchLinkRow(sess.query);
          await btn.update({
            content: `${u2}\n검색 전체 보기: ${ytSearchUrl(sess.query)}`,
            embeds: [eb2],
            components: [row2, linkRow2],
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
          const rows = cur.components || [];
          const disabled = rows.map(r => {
            const comps = r.components?.map(c => ButtonBuilder.from(c).setDisabled(true)) || [];
            return new ActionRowBuilder().addComponents(comps);
          });
          await interaction.editReply({ components: disabled });
        } catch {}
      });

      return;
    }

    if (sub === "조회") {
      const link = interaction.options.getString("영상링크", true).trim();
      const vid = extractVideoId(link) || link;
      if (!/^[A-Za-z0-9_\-]{11}$/.test(vid)) {
        return interaction.reply({ content: "유효한 유튜브 영상 링크/ID가 아니야.", ephemeral: true });
      }

      await interaction.deferReply();
      try {
        const info = await ytVideoInfoNoKey(vid);
        if (!info) return interaction.editReply({ content: "해당 영상을 찾을 수 없어." });
        const { embed, url } = buildEmbedFromPiped(info);

        const linkBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("유튜브에서 보기").setURL(url)
        );
        await respondWithPlayable(interaction, { content: url, embed, components: [linkBtn] });
      } catch (e) {
        const msg = (e && e.message) ? e.message : "원인 불명";
        return interaction.editReply({ content: `조회 중 오류가 발생했어. (${msg})\n직접 보기: ${ytWatchUrl(vid)}` });
      }
      return;
    }
  },
};
