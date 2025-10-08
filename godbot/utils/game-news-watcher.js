"use strict";

const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
let cheerio;
try { cheerio = require("cheerio"); } catch { throw new Error("cheerio 패키지를 설치하세요: npm i cheerio"); }

const TARGET_CHANNEL_ID = process.env.GAME_NEWS_CHANNEL_ID || "1425432550351831200";
const POLL_MS = Number(process.env.GAME_NEWS_POLL_MS || 600000);
const COOLDOWN_MS = Number(process.env.GAME_NEWS_COOLDOWN_MS || 60000);

const RIOT_URL = "https://www.riotgames.com/ko/news";
const BLIZZ_URL = "https://news.blizzard.com/ko-kr/";
const APEX_URL = "https://www.ea.com/ko/games/apex-legends/apex-legends/news?page=1&type=latest";
const GAMEMECA_LIST_URL = "https://www.gamemeca.com/news.php";

const DATA_DIR = path.join(__dirname, "../data");
const STATE_PATH = path.join(DATA_DIR, "game-news-seen.json");

let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try { _fetch = require("node-fetch"); } catch {}
  if (typeof _fetch !== "function") throw new Error("fetch 가 필요합니다. Node 18+ 또는 node-fetch 설치");
}

function ensureState() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({
      lastSentAt: 0,
      riot: null,
      blizzard: null,
      apex: null,
      gamemeca: null
    }));
  }
}
function loadState() {
  ensureState();
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const j = JSON.parse(raw);
    return {
      lastSentAt: Number(j.lastSentAt) || 0,
      riot: j.riot || null,
      blizzard: j.blizzard || null,
      apex: j.apex || null,
      gamemeca: j.gamemeca || null
    };
  } catch {
    return { lastSentAt: 0, riot: null, blizzard: null, apex: null, gamemeca: null };
  }
}
function saveState(s) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify({
      lastSentAt: Number(s.lastSentAt) || 0,
      riot: s.riot || null,
      blizzard: s.blizzard || null,
      apex: s.apex || null,
      gamemeca: s.gamemeca || null
    }));
  } catch {}
}

async function fetchText(url) {
  const res = await _fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "ko,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.text();
}
function absUrl(href, base) { try { return new URL(href, base).toString(); } catch { return null; } }
function clean(t) { return (t || "").replace(/\s+/g, " ").trim(); }
function clip(t, n) { if (!t) return ""; if (t.length <= n) return t; return t.slice(0, n - 1) + "…"; }

async function extractArticle(url, site = "") {
  try {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const ogImg = $('meta[property="og:image"]').attr("content") || $('meta[name="og:image"]').attr("content") || "";
    const ogTitle = $('meta[property="og:title"]').attr("content") || $('meta[name="og:title"]').attr("content") || "";
    const ogDesc = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "";

    let title = "";
    let date = "";
    let body = "";

    if (site === "gamemeca") {
      title = clean($("#news-head h1, .view_tit h1, h1#title, h1.view_tit, h1").first().text()) || clean(ogTitle);
      date =
        clean($(".writer, .date, .regdate, #news-head .date, .view_info .date, time").first().text()) ||
        clean($('meta[property="article:published_time"]').attr("content") || "");
      const container = $("#news-body, .vcon, .view_cont, .article-body, article, .article");
      body = clean(container.find("p, div").filter((_, el) => $(el).find("img, figure, .sns, .tag, script, style").length === 0).slice(0, 8).text())
        || clean(ogDesc);
    } else if (site === "riot") {
      title = clean($("article h1, h1, .ArticleTitle").first().text()) || clean(ogTitle);
      date = clean($("time, .MetaTime, .date").first().text());
      body = [
        $("article p").slice(0, 6).text(),
        $(".article, .Article-body, .copy").find("p").slice(0, 6).text()
      ].map(clean).find(Boolean) || clean(ogDesc);
    } else if (site === "blizzard") {
      title = clean($("article h1, .Heading, h1").first().text()) || clean(ogTitle);
      date = clean($("time, .ArticleMeta time, .ArticleListItem-date").first().text());
      body = [
        $(".ArticleBody p").slice(0, 8).text(),
        $("article p").slice(0, 8).text(),
        $(".BodyContent p").slice(0, 8).text()
      ].map(clean).find(Boolean) || clean(ogDesc);
    } else if (site === "apex") {
      title = clean($("article h1, .m-article__title, h1").first().text()) || clean(ogTitle);
      date = clean($("time, .m-article-card__date, .date").first().text());
      body = [
        $(".article-body p").slice(0, 8).text(),
        $("article p").slice(0, 8).text(),
        $(".l-article__content p").slice(0, 8).text()
      ].map(clean).find(Boolean) || clean(ogDesc);
    } else {
      title = clean($("h1").first().text()) || clean(ogTitle);
      date = clean($("time").first().text());
      body = clean($("article p").slice(0, 8).text()) || clean(ogDesc);
    }

    return {
      title: clip(title, 200),
      date: clip(date, 80),
      preview: clip(body, 1400),
      image: ogImg || null
    };
  } catch {
    return { title: "", date: "", preview: "", image: null };
  }
}

async function getRiot() {
  const html = await fetchText(RIOT_URL);
  const $ = cheerio.load(html);
  let pick = null;
  const seen = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/\/ko\/news/i.test(href)) return;
    const url = absUrl(href, "https://www.riotgames.com");
    if (!url || seen.has(url)) return;
    seen.add(url);
    const art = $(a).closest("article");
    const title = clean(art.find("h3, h2, .title, .copy, .ArticleTitle").first().text()) || clean($(a).text());
    const tDate = clean(art.find("time, .MetaTime, .date").first().text());
    if (!pick) pick = { id: url, title: title || "라이엇 게임즈 소식", date: tDate || "", url, site: "riot" };
  });
  return pick;
}

async function getBlizzard() {
  const html = await fetchText(BLIZZ_URL);
  const $ = cheerio.load(html);
  let pick = null;
  const seen = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/news\.blizzard\.com\/?\/?ko-kr\//i.test(href) && !/^\/ko-kr\//i.test(href)) return;
    const url = absUrl(href, "https://news.blizzard.com");
    if (!url || seen.has(url)) return;
    seen.add(url);
    const item = $(a).closest("article, li, .ArticleListItem, .NewsListItem").first();
    const title = clean(item.find("h3, h2, .Heading, .ArticleListItem-title, .NewsListItem-title").first().text()) || clean($(a).text());
    const tDate = clean(item.find("time, .ArticleListItem-date, .MetaTime").first().text());
    if (!pick) pick = { id: url, title: title || "블리자드 게임 소식", date: tDate || "", url, site: "blizzard" };
  });
  return pick;
}

async function getApex() {
  const html = await fetchText(APEX_URL);
  const $ = cheerio.load(html);
  let pick = null;
  const seen = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/\/ko\/games\/apex-legends\/apex-legends\/news\//i.test(href)) return;
    const url = absUrl(href, "https://www.ea.com");
    if (!url || seen.has(url)) return;
    seen.add(url);
    const card = $(a).closest("article, .m-article-card, li").first();
    const title = clean(card.find("h3, h2, .m-article-card__title, .title").first().text()) || clean($(a).text());
    const tDate = clean(card.find("time, .m-article-card__date, .date").first().text());
    if (!pick) pick = { id: url, title: title || "에이펙스 레전드 소식", date: tDate || "", url, site: "apex" };
  });
  return pick;
}

async function getGameMeca() {
  const html = await fetchText(GAMEMECA_LIST_URL);
  const $ = cheerio.load(html);
  let url = null;
  const seen = new Set();
  const anchors = $('a[href*="view.php?gid="], a[href*="/view.php?gid="]');
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors.eq(i);
    const href = (a.attr("href") || "").trim();
    const u = absUrl(href, "https://www.gamemeca.com");
    if (!u || seen.has(u)) continue;
    seen.add(u);
    url = u;
    break;
  }
  if (!url) return null;
  const meta = await extractArticle(url, "gamemeca");
  const title = meta.title || "게임메카 뉴스";
  const date = meta.date || "";
  return { id: url, title, date, url, site: "gamemeca" };
}

function embedFor(source, item, meta) {
  const color = source === "riot" ? 0xD13639 : source === "blizzard" ? 0x00AEEF : source === "apex" ? 0xF05023 : 0x222222;
  const header = source === "riot" ? "라이엇 게임즈 소식" : source === "blizzard" ? "블리자드 게임 소식" : source === "apex" ? "에이펙스 레전드 소식" : "게임메카 뉴스";
  const finalTitle = meta.title || item.title || header;
  const finalDate = meta.date || item.date || "";
  const descTop = finalTitle ? `**${finalTitle}**\n\n` : "";
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(header)
    .setURL(item.url)
    .setDescription(descTop + (meta.preview || "") + (item.url ? `\n\n[전체 글 보기](${item.url})` : ""))
    .addFields(finalDate ? [{ name: "게시일", value: finalDate, inline: true }] : [])
    .setTimestamp(new Date());
  if (meta.image) e.setThumbnail(meta.image);
  return e;
}

let timer = null;
let running = false;

async function pollOnce(client, forceSend = false) {
  if (running) return;
  running = true;
  try {
    const state = loadState();
    const now = Date.now();
    if (!forceSend && now - state.lastSentAt < COOLDOWN_MS) return;

    const results = await Promise.allSettled([getRiot(), getBlizzard(), getApex(), getGameMeca()]);
    const [riot, bliz, apex, gm] = results;

    const updates = [];
    if (riot.status === "fulfilled" && riot.value && riot.value.id && riot.value.id !== state.riot) updates.push(["riot", riot.value]);
    if (bliz.status === "fulfilled" && bliz.value && bliz.value.id && bliz.value.id !== state.blizzard) updates.push(["blizzard", bliz.value]);
    if (apex.status === "fulfilled" && apex.value && apex.value.id && apex.value.id !== state.apex) updates.push(["apex", apex.value]);
    if (gm.status === "fulfilled" && gm.value && gm.value.id && gm.value.id !== state.gamemeca) updates.push(["gamemeca", gm.value]);

    if (!updates.length && !forceSend) return;

const baseItems = (forceSend && !updates.length)
  ? [riot, bliz, apex, gm]
      .filter(x => x.status === "fulfilled" && x.value)
      .map(x => x.value)
  : updates.map(x => x[1]);

    const enriched = await Promise.all(baseItems.map(async (it) => {
      const meta = await extractArticle(it.url, it.site);
      return { it, meta };
    }));

    const ch = client.channels?.cache?.get(TARGET_CHANNEL_ID) || await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (!ch) return;

    const embeds = enriched.map(({ it, meta }) => embedFor(it.site, it, meta)).slice(0, 4);
    if (embeds.length) {
      await ch.send({ embeds }).catch(() => {});
      state.lastSentAt = Date.now();
      for (const [k, v] of updates) {
        if (k === "riot") state.riot = v.id;
        if (k === "blizzard") state.blizzard = v.id;
        if (k === "apex") state.apex = v.id;
        if (k === "gamemeca") state.gamemeca = v.id;
      }
      saveState(state);
    }
  } catch {
  } finally {
    running = false;
  }
}

function start(client) {
  if (timer) return;
  pollOnce(client);
  timer = setInterval(() => pollOnce(client), POLL_MS);
}
function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}
async function now(client) { await pollOnce(client, true); }

module.exports = { start, stop, now };
