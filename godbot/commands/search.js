"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const MAX_RESULTS = 10;
const SESSION_TTL_MS = 10 * 60 * 1000;
const CUSTOM_ID_PREFIX = "wsearch:";
const sessions = new Map(); // key: `${guildId}:${userId}` -> { query, items, index, engine, heroImage, expireAt }

const CFG = {
  bingKey: process.env.BING_KEY,
  bingEndpoint: process.env.BING_ENDPOINT || "https://api.bing.microsoft.com/v7.0/search",
  bingImageEndpoint: process.env.BING_IMAGE_ENDPOINT || "https://api.bing.microsoft.com/v7.0/images/search",
  googleKey: process.env.GOOGLE_API_KEY,
  googleCseId: process.env.GOOGLE_CSE_ID,
  naverId: process.env.NAVER_CLIENT_ID,
  naverSecret: process.env.NAVER_CLIENT_SECRET,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("검색")
    .setDescription("실제 검색 엔진(구글/빙/네이버)으로 웹 검색")
    .addStringOption(o =>
      o.setName("검색어").setDescription("찾을 내용").setRequired(true)
    ),

  // /검색 실행
  async execute(interaction) {
    const query = interaction.options.getString("검색어", true).trim();
    if (query.length < 2) {
      return interaction.reply({ content: "검색어는 최소 2글자 이상!", ephemeral: true });
    }
    if (!interaction.guild) {
      return interaction.reply({ content: "길드에서만 사용해줘.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // 1) 엔진 선택 (자동 폴백)
    const engine = pickEngine();

    if (!engine) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("🔧 검색 엔진 설정 필요")
            .setDescription([
              "- Bing: `BING_KEY` (선택: `BING_ENDPOINT`, `BING_IMAGE_ENDPOINT`)",
              "- Google CSE: `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`",
              "- Naver: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`"
            ].join("\n"))
        ]
      });
    }

    // 2) 웹 검색
    let results = [];
    try {
      results = await searchWeb(engine, query, MAX_RESULTS);
    } catch (e) {
      return interaction.editReply({ content: `검색 실패: ${e.message || e}`, ephemeral: true });
    }

    if (!results || results.length === 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🔎 검색 결과 없음")
            .setDescription(`\`${query}\`에 대한 결과를 찾지 못했어.`)
        ]
      });
    }

    // 3) 대표 이미지(쿼리 이미지) 1회 조회 (페이지별 결과 썸네일 없을 때만 사용)
    let heroImage = null;
    try {
      heroImage = await getQueryImage(engine, query);
    } catch {}

    // 4) 세션 저장
    const key = `${interaction.guild.id}:${interaction.user.id}`;
    sessions.set(key, {
      query,
      engine,
      items: results.slice(0, MAX_RESULTS),
      index: 0,
      heroImage,
      expireAt: Date.now() + SESSION_TTL_MS,
    });

    // 5) 첫 페이지 렌더
    const payload = renderPage({
      guild: interaction.guild,
      user: interaction.user,
      query,
      engine,
      items: results,
      index: 0,
      heroImage,
      forShare: false,
    });

    return interaction.editReply(payload);
  },

  // 컴포넌트 라우팅
  async handleComponent(interaction) {
    if (!interaction.customId?.startsWith(CUSTOM_ID_PREFIX)) return;

    const key = `${interaction.guildId}:${interaction.user.id}`;
    const sess = sessions.get(key);
    if (!sess || Date.now() > sess.expireAt) {
      sessions.delete(key);
      return interaction.reply({ content: "세션 만료! 다시 /검색 해줘.", ephemeral: true });
    }

    const id = interaction.customId;
    if (id === `${CUSTOM_ID_PREFIX}prev`) {
      sess.index = (sess.index - 1 + sess.items.length) % sess.items.length;
      sess.expireAt = Date.now() + SESSION_TTL_MS;
      const payload = renderPage({ guild: interaction.guild, user: interaction.user, ...sess, forShare: false });
      return interaction.update(payload);
    }
    if (id === `${CUSTOM_ID_PREFIX}next`) {
      sess.index = (sess.index + 1) % sess.items.length;
      sess.expireAt = Date.now() + SESSION_TTL_MS;
      const payload = renderPage({ guild: interaction.guild, user: interaction.user, ...sess, forShare: false });
      return interaction.update(payload);
    }
    if (id === `${CUSTOM_ID_PREFIX}share`) {
      // 공개 전송 (버튼 제거)
      const payload = renderPage({ guild: interaction.guild, user: interaction.user, ...sess, forShare: true });
      try {
        await interaction.channel.send(payload);
        return interaction.reply({ content: "공유 완료!", ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: "공유 실패. 채널 권한 확인!", ephemeral: true });
      }
    }
  },
};

// ================= 유틸/공통 =================
function pickEngine() {
  if (CFG.bingKey) return "bing";
  if (CFG.googleKey && CFG.googleCseId) return "google";
  if (CFG.naverId && CFG.naverSecret) return "naver";
  return null;
}

function truncate(s, n) {
  s = (s ?? "").toString();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, "");
}

function domainFromUrl(u) {
  try {
    const host = new URL(u).hostname;
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch { return ""; }
}

function faviconUrl(u) {
  const d = domainFromUrl(u);
  return d ? `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent("https://" + d)}` : null;
}

function engineBadge(engine) {
  if (engine === "bing")   return "Bing Web Search";
  if (engine === "google") return "Google Programmable Search";
  if (engine === "naver")  return "Naver Search";
  return "Web Search";
}

// =============== 렌더링 ===============
function renderPage({ guild, user, query, engine, items, index, heroImage, forShare }) {
  const total = items.length;
  const cur = items[index];

  const eb = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: `웹 검색 • ${guild.name}`, iconURL: guild.iconURL?.({ size: 128 }) || undefined })
    .setTitle(truncate(cur.title || "(제목 없음)", 240))
    .setURL(cur.url)
    .setDescription(truncate(cur.snippet || "(요약 없음)", 1000))
    .addFields(
      { name: "도메인", value: `\`${domainFromUrl(cur.url)}\``, inline: true },
      { name: "바로가기", value: cur.url, inline: false },
    )
    .setFooter({ text: `${engineBadge(engine)} • ${index + 1}/${total} • 요청자: ${user.tag}` })
    .setTimestamp(new Date());

  // 이미지: 결과 썸네일 > 쿼리 대표 이미지 > 서버 아이콘
  const image = cur.image || heroImage || guild.iconURL?.({ size: 512 }) || null;
  if (image) eb.setImage(image);

  // 작은 아이콘(파비콘)
  const fav = faviconUrl(cur.url);
  if (fav) eb.setThumbnail(fav);

  if (forShare) {
    // 공유 시 버튼 제거 & 공개 메시지
    return {
      content: `📣 **검색 결과 공유** — <@${user.id}>: \`${query}\``,
      embeds: [eb],
    };
  }

  const rowNav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}prev`).setLabel("◀ 이전").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}next`).setLabel("다음 ▶").setStyle(ButtonStyle.Secondary),
  );
  const rowShare = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}share`).setLabel("검색 결과 공유").setStyle(ButtonStyle.Primary)
  );

  return { embeds: [eb], components: [rowNav, rowShare] };
}

// =============== 엔진별 구현 ===============
async function searchWeb(engine, query, count) {
  if (engine === "bing")   return await bingWebSearch(query, count);
  if (engine === "google") return await googleCseSearch(query, count);
  if (engine === "naver")  return await naverWebSearch(query, count);
  throw new Error("지원하지 않는 엔진");
}

// ---- Bing Web Search ----
async function bingWebSearch(query, count) {
  const url = `${CFG.bingEndpoint}?q=${encodeURIComponent(query)}&mkt=ko-KR&count=${count}&safeSearch=Strict&textDecorations=false&textFormat=Raw`;
  const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": CFG.bingKey } });
  if (!res.ok) {
    const t = await safeText(res);
    throw new Error(`Bing ${res.status}: ${t}`);
  }
  const j = await res.json();
  const list = (j.webPages?.value || []).map(v => ({
    title: v.name,
    url: v.url,
    snippet: v.snippet,
    image: v?.image?.thumbnailUrl || null, // 있을 때만
  }));
  return list;
}

// ---- Google Programmable Search (CSE) ----
async function googleCseSearch(query, count) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CFG.googleKey)}&cx=${encodeURIComponent(CFG.googleCseId)}&q=${encodeURIComponent(query)}&num=${count}&lr=lang_ko&safe=active`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await safeText(res);
    throw new Error(`Google CSE ${res.status}: ${t}`);
  }
  const j = await res.json();
  const items = j.items || [];
  return items.map(it => {
    const pm = it.pagemap || {};
    const cseImg = (pm.cse_image && pm.cse_image[0]?.src) || null;
    const ogImg  = (pm.metatags && pm.metatags[0]?.["og:image"]) || null;
    return {
      title: it.title,
      url: it.link,
      snippet: it.snippet,
      image: cseImg || ogImg || null,
    };
  });
}

// ---- Naver Open API ----
async function naverWebSearch(query, count) {
  const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(query)}&display=${count}`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": CFG.naverId,
      "X-Naver-Client-Secret": CFG.naverSecret,
    }
  });
  if (!res.ok) {
    const t = await safeText(res);
    throw new Error(`Naver ${res.status}: ${t}`);
  }
  const j = await res.json();
  const items = j.items || [];
  return items.map(it => ({
    title: stripHtml(it.title),
    url: it.link,
    snippet: stripHtml(it.description),
    image: null, // 네이버 웹검색은 썸네일 없음 → 쿼리 대표 이미지로 대체
  }));
}

// =============== 쿼리 대표 이미지 ===============
async function getQueryImage(engine, query) {
  // 1) Bing 이미지 API 있으면 최우선
  if (CFG.bingKey && CFG.bingImageEndpoint) {
    try {
      const url = `${CFG.bingImageEndpoint}?q=${encodeURIComponent(query)}&mkt=ko-KR&count=1&safeSearch=Strict&imageType=Photo`;
      const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": CFG.bingKey } });
      if (res.ok) {
        const j = await res.json();
        const v = j.value?.[0];
        if (v?.contentUrl) return v.contentUrl;
        if (v?.thumbnailUrl) return v.thumbnailUrl;
      }
    } catch {}
  }

  // 2) Google CSE 이미지 메타를 이용(일반 검색에서 이미 뽑은 적 없을 때)
  if (CFG.googleKey && CFG.googleCseId) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CFG.googleKey)}&cx=${encodeURIComponent(CFG.googleCseId)}&q=${encodeURIComponent(query)}&searchType=image&num=1&safe=active`;
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        const v = j.items?.[0];
        if (v?.link) return v.link;
        if (v?.image?.thumbnailLink) return v.image.thumbnailLink;
      }
    } catch {}
  }

  // 3) Naver 이미지 (마지막 폴백)
  if (CFG.naverId && CFG.naverSecret) {
    try {
      const url = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=1&filter=large`;
      const res = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": CFG.naverId,
          "X-Naver-Client-Secret": CFG.naverSecret,
        }
      });
      if (res.ok) {
        const j = await res.json();
        const v = j.items?.[0];
        if (v?.link) return v.link;
        if (v?.thumbnail) return v.thumbnail;
      }
    } catch {}
  }

  return null;
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
