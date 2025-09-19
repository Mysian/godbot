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
const SEARCH_PAGE_SIZE = 10;     // 한 번에 받아올 검색 결과 수
const SESSION_TTL_MS = 10 * 60 * 1000; // 10분
const SESS_PREFIX = "yt:";
const sessions = new Map();

// ===== fetch 확보 =====
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
  // PT#H#M#S -> hh:mm:ss
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
    // 순수 ID로 들어오면 그대로
    if (/^[A-Za-z0-9_\-]{11}$/.test(input)) return input;

    const url = new URL(input);
    // shorts
    // https://www.youtube.com/shorts/VIDEOID
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      if (id && id.length >= 11) return id.slice(0,11);
    }
    // watch?v=
    const v = url.searchParams.get("v");
    if (v && /^[A-Za-z0-9_\-]{11}$/.test(v)) return v;

    // youtu.be/VIDEOID
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      if (/^[A-Za-z0-9_\-]{11}$/.test(id)) return id;
    }
  } catch {}
  return null;
}

async function ytSearch(query, key) {
  // 1) 검색으로 videoId 모으기
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

  // 2) videos.list 로 메타/통계/길이
  const vapi = new URL("https://www.googleapis.com/youtube/v3/videos");
  vapi.searchParams.set("part", "snippet,statistics,contentDetails");
  vapi.searchParams.set("hl", HL);
  vapi.searchParams.set("id", ids.join(","));
  vapi.searchParams.set("key", key);

  const vres = await httpGet(vapi.toString());
  const dict = new Map();
  for (const it of (vres.items || [])) dict.set(it.id, it);

  // 검색 결과 순서 유지
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

  // 채널 정보
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

  // 최신 댓글 1개
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
  } catch {
    // 댓글 비활성/권한 문제 등
  }

  return { video: v, channel: ch, recentComment: recentC };
}

function buildEmbedForVideo(v, ch, recent, indexPos = null, total = null) {
  const vid = v.id;
  const sn = v.snippet || {};
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

async function respondWithPlayable(interaction, payload, mode = "single") {
  const { contentUrl, embed, components } = payload;

  if (mode === "split") {
    // 1) 임베드 먼저 (공개 메시지)
    if (interaction.deferred || interaction.replied) {
  await interaction.editReply({ content: "", embeds: [embed], components });
} else {
  await interaction.reply({ content: "", embeds: [embed], components, ephemeral: false });
}

const url = videoUrl;
await interaction.channel.send({
  content: url,    
  allowedMentions: { parse: [] },
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("유튜브")
    .setDescription("유튜브 검색/조회")
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
  ,
  async execute(interaction) {
    const key = process.env.YT_API_KEY;
    if (!key) {
      return interaction.reply({ content: "🔧 `YT_API_KEY` 환경변수를 설정해줘.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "검색") {
      const q = interaction.options.getString("검색어", true).trim();
      await interaction.deferReply();

      let list = [];
      try {
        list = await ytSearch(q, key);
      } catch (e) {
        return interaction.editReply({ content: "죄송합니다, 검색 중 오류가 발생했습니다." });
      }

      if (list.length === 0) {
        return interaction.editReply({ content: "죄송합니다, 검색 결과를 찾을 수 없습니다." });
      }

      // 세션 만들고 첫 페이지 렌더
      const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const owner = interaction.user.id;
      const expireAt = Date.now() + SESSION_TTL_MS;

      sessions.set(sessionId, {
        type: "search",
        query: q,
        owner,
        expireAt,
        index: 0,
        list, // videos.list 결과 배열
      });

      const v = list[0];
      const more = await ytVideoInfo(v.id, key);
      if (!more) {
        return interaction.editReply({ content: "죄송합니다, 검색 결과를 표시할 수 없습니다." });
      }

      const { embed, url } = buildEmbedForVideo(more.video, more.channel, more.recentComment, 0, list.length);
      const row = buildPagerRow(sessionId, 0, list.length);
      await respondWithPlayable(interaction, { contentUrl: url, embed, components: [row] });

      // 버튼 콜렉터
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

          // 요청자 제한
          if (btn.user.id !== sess.owner) {
            return btn.reply({ content: "이 검색 결과는 요청자만 조작할 수 있어.", ephemeral: true });
          }

          // 만료 체크
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
          await btn.update({ content: u2, embeds: [eb2], components: [row2] });
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
          // 버튼 비활성화 처리
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

      await interaction.deferReply();
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
      // 조회 명령은 페이저 없음
      await respondWithPlayable(interaction, { contentUrl: url, embed, components: [] }, "split");
      return;
    }
  },
};
