"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    .setDescription("실제 검색 엔진(구글/빙/네이버/덕덕고)으로 웹 검색")
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
    const engine = pickEngine(); // bing/google/naver/duck

    // 2) 웹 검색 (선택 엔진 실패 시 DuckDuckGo로 2차 폴백)
    let results = [];
    let usedEngine = engine;
    try {
      results = await searchWeb(engine, query, MAX_RESULTS);
      if (!results || results.length === 0) throw new Error("no results");
    } catch (e) {
      if (engine !== "duck") {
        try {
          results = await duckSearch(query, MAX_RESULTS);
          usedEngine = "duck";
        } catch {
          return interaction.editReply({ content: `검색 실패: ${e.message || e}`, ephemeral: true });
        }
      } else {
        return interaction.editReply({ content: `검색 실패: ${e.message || e}`, ephemeral: true });
      }
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
      heroImage = await getQueryImage(usedEngine, query, results[0]?.url);
    } catch {}

    // 4) 세션 저장
    const key = `${interaction.guild.id}:${interaction.user.id}`;
    sessions.set(key, {
      query,
      engine: usedEngine,
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
      engine: usedEngine,
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
  return "duck"; // 키 없으면 덕덕고 기본 동작
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
  if (engine === "duck")   return "DuckDuckGo Instant";
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
  if (engine === "duck")   return await duckSearch(query, count);
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
    image: v?.image?.thumbnailUrl || null,
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

// ---- DuckDuckGo Instant Answer (키 불필요, 기본 폴백) ----
async function duckSearch(query, count) {
  // 참고: 비공식 크롤링 아님. Instant Answer JSON 사용.
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=discord-bot`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const t = await safeText(res);
    throw new Error(`DuckDuckGo ${res.status}: ${t}`);
  }
  const j = await res.json();

  const out = [];
  // 1) 메인 요약
  if (j.AbstractURL) {
    out.push({
      title: j.Heading || j.AbstractSource || j.AbstractURL,
      url: j.AbstractURL,
      snippet: j.AbstractText || j.Heading || j.AbstractURL,
      image: fixDuckImage(j.Image),
    });
  }
  // 2) 관련 토픽(섹션 포함)
  if (Array.isArray(j.RelatedTopics)) {
    for (const rt of j.RelatedTopics) {
      if (rt.Topics && Array.isArray(rt.Topics)) {
        for (const t of rt.Topics) {
          if (t.FirstURL && t.Text) {
            out.push({
              title: t.Text.split(" - ")[0] || t.Text,
              url: t.FirstURL,
              snippet: t.Text,
              image: fixDuckImage(t.Icon?.URL),
            });
          }
        }
      } else if (rt.FirstURL && rt.Text) {
        out.push({
          title: rt.Text.split(" - ")[0] || rt.Text,
          url: rt.FirstURL,
          snippet: rt.Text,
          image: fixDuckImage(rt.Icon?.URL),
        });
      }
      if (out.length >= count) break;
    }
  }

  // 결과가 부족할 때는 메인 Heading만이라도
  if (out.length === 0 && (j.Heading || j.AbstractText || j.AbstractURL)) {
    out.push({
      title: j.Heading || j.AbstractURL || query,
      url: j.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: j.AbstractText || query,
      image: fixDuckImage(j.Image),
    });
  }

  return out.slice(0, count);
}

function fixDuckImage(img) {
  if (!img) return null;
  // ex) "/i/xxxxxxxxx.png" → "https://duckduckgo.com/i/xxxxxxxxx.png"
  if (img.startsWith("/")) return `https://duckduckgo.com${img}`;
  if (img.startsWith("http")) return img;
  return null;
}

// =============== 쿼리 대표 이미지 ===============
async function getQueryImage(engine, query, firstUrl) {
  // 1) Bing 이미지 API
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

  // 2) DuckDuckGo Instant Answer 이미지
  if (engine === "duck") {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=discord-bot`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const j = await res.json();
        const img = fixDuckImage(j.Image);
        if (img) return img;
      }
    } catch {}
  }

  // 3) Google CSE 이미지 검색 (키 있을 때만)
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

  // 4) 마지막 폴백: 첫 결과 페이지의 OG 이미지 시도
  if (firstUrl) {
    try {
      const html = await fetch(firstUrl, { headers: { "Accept": "text/html" } }).then(r => r.ok ? r.text() : "");
      const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1];
      if (og) return og;
    } catch {}
  }

  return null;
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
