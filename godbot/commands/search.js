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
const sessions = new Map();

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
    .setDescription("실제 검색 엔진(구글/빙/네이버) 기반 웹 검색")
    .addStringOption(o =>
      o.setName("검색어").setDescription("찾을 내용").setRequired(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString("검색어", true).trim();
    if (query.length < 2) {
      return interaction.reply({ content: "검색어는 최소 2글자 이상!", ephemeral: true });
    }
    if (!interaction.guild) {
      return interaction.reply({ content: "길드에서만 사용해줘.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const [memberItem, cascade] = await Promise.all([
      findBestMemberItem(interaction.guild, query).catch(() => null),
      searchCascade(query, MAX_RESULTS).catch(() => ({ items: [], enginesUsed: [] })),
    ]);

    let items = cascade.items || [];
    let enginesUsed = cascade.enginesUsed || [];
    if (memberItem) {
      const norm = (u) => normalizeUrl(u || "");
      const filtered = items.filter(it => norm(it.url) !== norm(memberItem.url));
      items = [memberItem, ...filtered];
      if (!enginesUsed.includes("local")) enginesUsed.unshift("local");
    }

    if (!items.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🔎 검색 결과 없음")
            .setDescription(`죄송합니다, 검색 결과를 찾을 수 없습니다.\n\`${query}\`와(과) 관련된 다른 키워드로 다시 시도해 주세요.`),
        ],
      });
    }

    let heroImage = null;
    try {
      const firstWeb = items.find(x => x.url && !x._kind) || items[0];
      heroImage = await getQueryImage("duck-html", query, firstWeb?.url);
    } catch {}

    const key = `${interaction.guild.id}:${interaction.user.id}`;
    sessions.set(key, {
      query,
      engine: enginesUsed.length > 1 ? "multi" : (enginesUsed[0] || "multi"),
      items: items.slice(0, MAX_RESULTS),
      index: 0,
      heroImage,
      expireAt: Date.now() + SESSION_TTL_MS,
      imageCache: new Map(),
    });

    const payload = renderPage({
      guild: interaction.guild,
      user: interaction.user,
      query,
      engine: sessions.get(key).engine,
      items: sessions.get(key).items,
      index: 0,
      heroImage,
      imageCache: sessions.get(key).imageCache,
      forShare: false,
    });

    return interaction.editReply(payload);
  },

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
      await ensurePageImageCached(key, sess.index).catch(() => {});
      const payload = renderPage({ guild: interaction.guild, user: interaction.user, ...sess, imageCache: sess.imageCache, forShare: false });
      return interaction.update(payload);
    }
    if (id === `${CUSTOM_ID_PREFIX}next`) {
      sess.index = (sess.index + 1) % sess.items.length;
      sess.expireAt = Date.now() + SESSION_TTL_MS;
      await ensurePageImageCached(key, sess.index).catch(() => {});
      const payload = renderPage({ guild: interaction.guild, user: interaction.user, ...sess, imageCache: sess.imageCache, forShare: false });
      return interaction.update(payload);
    }
    if (id === `${CUSTOM_ID_PREFIX}share`) {
      const payload = renderPage({ guild: interaction.guild, user: interaction.user, ...sess, imageCache: sess.imageCache, forShare: true });
      try {
        await interaction.channel.send(payload);
        return interaction.reply({ content: "공유 완료!", ephemeral: true });
      } catch {
        return interaction.reply({ content: "공유 실패. 채널 권한 확인!", ephemeral: true });
      }
    }
  },
};

function truncate(s, n) {
  s = (s ?? "").toString();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, "");
}

function decodeHtml(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
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
  if (engine === "bing") return "Bing Web Search";
  if (engine === "google") return "Google Programmable Search";
  if (engine === "naver") return "Naver Search";
  if (engine === "duck") return "DuckDuckGo Instant";
  if (engine === "duck-html") return "DuckDuckGo HTML";
  if (engine === "wiki") return "Wikipedia (ko)";
  if (engine === "local") return "Discord Member";
  if (engine === "multi") return "Multi-Engine (KR priority)";
  return "Web Search";
}

function renderPage({ guild, user, query, engine, items, index, heroImage, imageCache, forShare }) {
  const total = items.length;
  const cur = items[index];
  const og = imageCache?.get(index) || null;
  const image = cur.image || og || heroImage || guild.iconURL?.({ size: 512 }) || null;

  const eb = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: `웹 검색 • ${guild.name}`, iconURL: guild.iconURL?.({ size: 128 }) || undefined })
    .setTitle(truncate(cur.title || "(제목 없음)", 240))
    .setURL(cur.url)
    .setDescription(truncate(cur.snippet || "(요약 없음)", 1000))
    .addFields(
      { name: "도메인", value: cur.url ? `\`${domainFromUrl(cur.url)}\`` : "알 수 없음", inline: true },
      ...(cur.url ? [{ name: "바로가기", value: cur.url, inline: false }] : []),
    )
    .setFooter({ text: `${engineBadge(engine)} • ${index + 1}/${total} • 요청자: ${user.tag}` })
    .setTimestamp(new Date());

  if (image) eb.setImage(image);
  const fav = cur.url ? faviconUrl(cur.url) : null;
  if (fav) eb.setThumbnail(fav);

  if (forShare) {
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
    new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}share`).setLabel("검색 결과 공유").setStyle(ButtonStyle.Primary),
  );

  return { embeds: [eb], components: [rowNav, rowShare] };
}

async function ensurePageImageCached(key, index) {
  const sess = sessions.get(key);
  if (!sess) return;
  if (sess.imageCache.has(index)) return;
  const it = sess.items[index];
  if (!it || !it.url || it.image) return;
  try {
    const meta = await getOgMeta(it.url, 2000);
    if (meta?.image) sess.imageCache.set(index, meta.image);
    if (meta?.description && (!it.snippet || it.snippet.length < 30)) {
      it.snippet = meta.description;
    }
  } catch {}
}

function normalizeUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    if (x.hostname.startsWith("www.")) x.hostname = x.hostname.slice(4);
    return x.toString();
  } catch {
    return u || "";
  }
}

function dedupeMerge(base, add) {
  const seen = new Set(base.map(v => normalizeUrl(v.url)));
  for (const it of add || []) {
    const key = normalizeUrl(it.url);
    if (!key || seen.has(key)) continue;
    base.push(it);
    seen.add(key);
  }
  return base;
}

async function searchCascade(query, count) {
  const quota = { google: 5, naver: 3, bing: 2, wiki: 2 };
  const engines = Object.keys(quota);

  let pool = [];
  const used = [];

  for (const eng of engines) {
    let res = [];
    try {
      if (eng === "wiki") {
        res = await wikiKoSearch(query, quota[eng]);
      } else {
        res = await searchWeb(eng, query, quota[eng]);
      }
    } catch { res = []; }

    if (res?.length) {
      used.push(eng);
      pool = dedupeMerge(pool, res.slice(0, quota[eng]));
    }
  }

  if (pool.length < count) {
    try {
      const wikiRes = await wikiKoSearch(query, count - pool.length);
      pool = dedupeMerge(pool, wikiRes);
      if (!used.includes("wiki")) used.push("wiki");
    } catch {}
  }

  await enrichWithOg(pool, Math.min(PREFETCH_OG_COUNT, pool.length));

  return { items: pool.slice(0, count), enginesUsed: used };
}

async function enrichWithOg(items, n) {
  const tasks = [];
  for (let i = 0; i < n; i++) {
    const it = items[i];
    if (!it?.url) continue;
    tasks.push(
      getOgMeta(it.url, PER_OG_TIMEOUT).then(meta => {
        if (meta?.image && !it.image) it.image = meta.image;
        if (meta?.description && (!it.snippet || it.snippet.length < 30)) {
          it.snippet = meta.description;
        }
      }).catch(() => {})
    );
  }
  await Promise.all(tasks);
}

async function searchWeb(engine, query, count) {
  if (engine === "bing") return await bingWebSearch(query, count);
  if (engine === "google") return await googleCseSearch(query, count);
  if (engine === "naver") return await naverWebSearch(query, count);
  if (engine === "duck") return await duckSearch(query, count);
  throw new Error("지원하지 않는 엔진");
}

async function bingWebSearch(query, count) {
  if (!CFG.bingKey) return [];
  const url = `${CFG.bingEndpoint}?q=${encodeURIComponent(query)}&mkt=ko-KR&count=${count}&safeSearch=Strict&textDecorations=false&textFormat=Raw`;
  const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": CFG.bingKey, "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5" } });
  if (!res.ok) throw new Error(`Bing ${res.status}: ${await safeText(res)}`);
  const j = await res.json();
  const list = (j.webPages?.value || []).map(v => ({
    title: v.name,
    url: v.url,
    snippet: v.snippet,
    image: v?.image?.thumbnailUrl || null,
  }));
  return list;
}

async function googleCseSearch(query, count) {
  if (!CFG.googleKey || !CFG.googleCseId) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CFG.googleKey)}&cx=${encodeURIComponent(CFG.googleCseId)}&q=${encodeURIComponent(query)}&num=${count}&lr=lang_ko&safe=active&hl=ko&gl=kr&cr=countryKR`;
  const res = await fetch(url, { headers: { "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5" } });
  if (!res.ok) throw new Error(`Google CSE ${res.status}: ${await safeText(res)}`);
  const j = await res.json();
  const items = j.items || [];
  return items.map(it => {
    const pm = it.pagemap || {};
    const cseImg = (pm.cse_image && pm.cse_image[0]?.src) || null;
    const ogImg = (pm.metatags && pm.metatags[0]?.["og:image"]) || null;
    const twImg = (pm.metatags && pm.metatags[0]?.["twitter:image"]) || null;
    const desc = it.snippet || (pm.metatags && pm.metatags[0]?.description) || (pm.metatags && pm.metatags[0]?.["og:description"]) || "";
    return {
      title: it.title,
      url: it.link,
      snippet: truncate(stripHtml(desc), 300),
      image: cseImg || ogImg || twImg || null,
    };
  });
}

async function naverWebSearch(query, count) {
  if (!CFG.naverId || !CFG.naverSecret) return [];
  const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(query)}&display=${count}`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": CFG.naverId,
      "X-Naver-Client-Secret": CFG.naverSecret,
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5",
    },
  });
  if (!res.ok) throw new Error(`Naver ${res.status}: ${await safeText(res)}`);
  const j = await res.json();
  const items = j.items || [];
  return items.map(it => ({
    title: stripHtml(it.title),
    url: it.link,
    snippet: stripHtml(it.description),
    image: null,
  }));
}

async function duckSearch(query, count) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=discord-bot&kl=kr-kr`;
  const res = await fetch(url, { headers: { "Accept": "application/json", "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5" } });
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}: ${await safeText(res)}`);
  const j = await res.json();

  const out = [];
  if (j.AbstractURL) {
    out.push({
      title: decodeHtml(j.Heading || j.AbstractSource || j.AbstractURL),
      url: j.AbstractURL,
      snippet: decodeHtml(j.AbstractText || j.Heading || j.AbstractURL),
      image: fixDuckImage(j.Image),
    });
  }
  if (Array.isArray(j.RelatedTopics)) {
    for (const rt of j.RelatedTopics) {
      if (rt.Topics && Array.isArray(rt.Topics)) {
        for (const t of rt.Topics) {
          if (t.FirstURL && t.Text) {
            out.push({
              title: decodeHtml(t.Text.split(" - ")[0] || t.Text),
              url: t.FirstURL,
              snippet: decodeHtml(t.Text),
              image: fixDuckImage(t.Icon?.URL),
            });
          }
        }
      } else if (rt.FirstURL && rt.Text) {
        out.push({
          title: decodeHtml(rt.Text.split(" - ")[0] || rt.Text),
          url: rt.FirstURL,
          snippet: decodeHtml(rt.Text),
          image: fixDuckImage(rt.Icon?.URL),
        });
      }
      if (out.length >= count) break;
    }
  }
  return out.slice(0, count);
}

async function duckHtmlSearch(query, count) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=kr-kr&kp=1`;
  const html = await timeoutFetchText(url, {}, 4000);
  const out = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
  let m;
  while ((m = linkRe.exec(html)) && out.length < count) {
    const rawHref = m[1];
    const title = truncate(stripHtml(decodeHtml(m[2])), 240);
    const urlReal = resolveDuckHref(rawHref);
    const tail = html.slice(m.index, m.index + 800);
    const snipMatch = tail.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(a|div)>/i);
    const snippet = snipMatch ? truncate(stripHtml(decodeHtml(snipMatch[1])), 300) : "";
    out.push({ title, url: urlReal, snippet, image: null });
  }
  return out;
}

function resolveDuckHref(href) {
  if (!href) return "";
  if (href.startsWith("/l/?")) {
    const u = new URL("https://duckduckgo.com" + href);
    const real = u.searchParams.get("uddg");
    if (real) {
      try { return decodeURIComponent(real); } catch { return real; }
    }
  }
  if (href.startsWith("/")) return "https://duckduckgo.com" + href;
  return href;
}

function fixDuckImage(img) {
  if (!img) return null;
  if (img.startsWith("/")) return `https://duckduckgo.com${img}`;
  if (img.startsWith("http")) return img;
  return null;
}

async function wikiKoSearch(query, count) {
  const url = `https://ko.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${count}`;
  const res = await fetch(url, { headers: { "Accept": "application/json", "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5" } });
  if (!res.ok) throw new Error(`wiki ${res.status}`);
  const j = await res.json();
  const items = j?.pages || [];
  return items.map(p => ({
    title: p.title,
    url: `https://ko.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/\s/g, "_"))}`,
    snippet: p?.description || (p?.excerpt ? stripHtml(p.excerpt) : ""),
    image: p?.thumbnail?.url ? `https:${p.thumbnail.url}`.replace(/^https:https:/, "https:") : null,
  }));
}

async function getQueryImage(engine, query, firstUrl) {
  if (CFG.bingKey && CFG.bingImageEndpoint) {
    try {
      const url = `${CFG.bingImageEndpoint}?q=${encodeURIComponent(query)}&mkt=ko-KR&count=1&safeSearch=Strict&imageType=Photo`;
      const j = await timeoutFetchJson(url, { headers: { "Ocp-Apim-Subscription-Key": CFG.bingKey } }, 2500);
      const v = j?.value?.[0];
      if (v?.contentUrl) return v.contentUrl;
      if (v?.thumbnailUrl) return v.thumbnailUrl;
    } catch {}
  }
  if (engine === "duck" || engine === "duck-html") {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=discord-bot&kl=kr-kr`;
      const j = await timeoutFetchJson(url, { headers: { "Accept": "application/json" } }, 2000);
      const img = fixDuckImage(j?.Image);
      if (img) return img;
    } catch {}
  }
  if (CFG.googleKey && CFG.googleCseId) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(CFG.googleKey)}&cx=${encodeURIComponent(CFG.googleCseId)}&q=${encodeURIComponent(query)}&searchType=image&num=1&safe=active&hl=ko&gl=kr`;
      const j = await timeoutFetchJson(url, {}, 2500);
      const v = j?.items?.[0];
      if (v?.link) return v.link;
      if (v?.image?.thumbnailLink) return v.image.thumbnailLink;
    } catch {}
  }
  if (firstUrl) {
    try {
      const og = await getOgImage(firstUrl, 2000);
      if (og) return og;
    } catch {}
  }
  return null;
}

async function getOgImage(url, timeoutMs = 2000) {
  const html = await timeoutFetchText(url, { headers: { "Accept": "text/html" } }, timeoutMs);
  const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1]
          || (html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) || [])[1];
  return og || null;
}

async function getOgMeta(url, timeoutMs = 2000) {
  const html = await timeoutFetchText(url, { headers: { "Accept": "text/html" } }, timeoutMs);
  const image =
    (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1] ||
    (html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) || [])[1] ||
    null;
  const desc =
    (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1] ||
    (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || [])[1] ||
    null;
  return {
    image,
    description: desc ? truncate(stripHtml(desc), 300) : null,
  };
}

async function timeoutFetchText(url, options = {}, timeoutMs = 3000) {
  const res = await timeoutFetch(url, options, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function timeoutFetchJson(url, options = {}, timeoutMs = 3000) {
  const res = await timeoutFetch(url, options, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function timeoutFetch(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { ...(options.headers || {}), "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5" };
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}

const PREFETCH_OG_COUNT = 5;
const PER_OG_TIMEOUT = 1500;

function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function simScore(a, b) {
  a = normalizeName(a);
  b = normalizeName(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 2 && (b.includes(a) || a.includes(b))) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 0.9 * ratio + 0.1;
  }
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - d / maxLen;
}

function bestNameFields(member) {
  const names = [];
  if (member.displayName) names.push(member.displayName);
  if (member.user && member.user.globalName) names.push(member.user.globalName);
  if (member.user && member.user.username) names.push(member.user.username);
  return names;
}

function formatKST(date) {
  try {
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(date);
  } catch {
    return date.toISOString();
  }
}

function memberToItem(member) {
  const highest = member.roles?.highest?.name || "역할 없음";
  const roleCount = Math.max(0, (member.roles?.cache?.size || 0) - 1);
  const joined = member.joinedTimestamp ? formatKST(new Date(member.joinedTimestamp)) : "알 수 없음";
  const created = member.user?.createdAt ? formatKST(new Date(member.user.createdAt)) : "알 수 없음";
  const avatar = member.user?.displayAvatarURL?.({ size: 512 }) || null;
  const disp = member.displayName || member.user?.globalName || member.user?.username || `사용자 ${member.id}`;
  const uname = member.user?.username ? ` (@${member.user.username})` : "";
  const booster = member.premiumSince ? " • 서버 부스트 중" : "";
  const snippet = [
    `멘션: <@${member.id}>${booster}`,
    `서버 합류: ${joined}`,
    `계정 생성: ${created}`,
    `역할: ${roleCount}개 • 최고: ${highest}`,
    `ID: ${member.id}`,
  ].join("\n");
  return {
    title: `디스코드 유저: ${disp}${uname}`,
    url: `https://discord.com/users/${member.id}`,
    snippet,
    image: avatar,
    _kind: "local-member",
  };
}

async function findBestMemberItem(guild, raw) {
  const mention = raw.match(/<@!?(\d+)>/);
  if (mention && mention[1]) {
    try {
      const m = await guild.members.fetch(mention[1]);
      if (m) return memberToItem(m);
    } catch {}
  }
  const idOnly = raw.match(/^\d{16,20}$/);
  if (idOnly) {
    try {
      const m = await guild.members.fetch(idOnly[0]);
      if (m) return memberToItem(m);
    } catch {}
  }

  const q = normalizeName(raw);
  if (!q) return null;

  let coll = null;
  if (typeof guild.members.search === "function") {
    try {
      coll = await guild.members.search({ query: raw, limit: 10 });
    } catch {}
  }
  if (!coll || coll.size === 0) {
    try {
      if (guild.members.cache.size < Math.min(guild.memberCount || 1000, 2000)) {
        await guild.members.fetch();
      }
    } catch {}
    coll = guild.members.cache;
  }

  let best = null;
  let bestScore = 0;
  for (const m of coll.values()) {
    const fields = bestNameFields(m);
    let s = 0;
    for (const f of fields) {
      s = Math.max(s, simScore(q, f));
    }
    if (s > bestScore) {
      best = m;
      bestScore = s;
    }
  }

  const exactCandidate = (() => {
    for (const m of coll.values()) {
      const fields = bestNameFields(m).map(normalizeName);
      if (fields.includes(q)) return m;
    }
    return null;
  })();

  if (exactCandidate) return memberToItem(exactCandidate);
  if (best && bestScore >= 0.72) return memberToItem(best);
  return null;
}
