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
      apex: null
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
      apex: j.apex || null
    };
  } catch {
    return { lastSentAt: 0, riot: null, blizzard: null, apex: null };
  }
}
function saveState(s) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify({
      lastSentAt: Number(s.lastSentAt) || 0,
      riot: s.riot || null,
      blizzard: s.blizzard || null,
      apex: s.apex || null
    }));
  } catch {}
}

async function fetchText(url) {
  const res = await _fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.text();
}

function absUrl(href, base) {
  try { return new URL(href, base).toString(); } catch { return null; }
}
function clean(t) { return (t || "").replace(/\s+/g, " ").trim(); }

async function getRiot() {
  const html = await fetchText(RIOT_URL);
  const $ = cheerio.load(html);
  let pick = null;
  const seen = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/\/ko\/news/i.test(href)) return;
    const url = absUrl(href, "https://www.riotgames.com");
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    const art = $(a).closest("article");
    const title = clean(art.find("h3, h2, .title, .copy, .ArticleTitle, .news-title").first().text()) || clean($(a).text());
    const tDate = clean(art.find("time").first().text()) || clean(art.find(".date, .published, .MetaTime").first().text());
    if (!pick) pick = { id: url, title: title || "라이엇 게임즈 소식", date: tDate || "", url };
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
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    const item = $(a).closest("article, li, .ArticleListItem, .NewsListItem").first();
    const title = clean(item.find("h3, h2, .Heading, .ArticleListItem-title, .NewsListItem-title").first().text()) || clean($(a).text());
    const tDate = clean(item.find("time").first().text()) || clean(item.find(".ArticleListItem-date, .MetaTime").first().text());
    if (!pick) pick = { id: url, title: title || "블리자드 게임 소식", date: tDate || "", url };
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
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    const card = $(a).closest("article, .m-article-card, li").first();
    const title = clean(card.find("h3, h2, .m-article-card__title, .title").first().text()) || clean($(a).text());
    const tDate = clean(card.find("time").first().text()) || clean(card.find(".m-article-card__date, .date").first().text());
    if (!pick) pick = { id: url, title: title || "에이펙스 레전드 소식", date: tDate || "", url };
  });
  return pick;
}

function embedFor(source, item) {
  const color = source === "riot" ? 0xD13639 : source === "blizzard" ? 0x00AEEF : 0xF05023;
  const title = source === "riot" ? "라이엇 게임즈 소식" : source === "blizzard" ? "블리자드 게임 소식" : "에이펙스 레전드 소식";
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setURL(item.url)
    .setDescription(item.title || "")
    .addFields(item.date ? [{ name: "게시일", value: item.date, inline: true }] : [])
    .setTimestamp(new Date());
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

    const [riot, bliz, apex] = await Promise.allSettled([getRiot(), getBlizzard(), getApex()]);

    const updates = [];
    if (riot.status === "fulfilled" && riot.value && riot.value.id && riot.value.id !== state.riot) {
      updates.push(["riot", riot.value]);
    }
    if (bliz.status === "fulfilled" && bliz.value && bliz.value.id && bliz.value.id !== state.blizzard) {
      updates.push(["blizzard", bliz.value]);
    }
    if (apex.status === "fulfilled" && apex.value && apex.value.id && apex.value.id !== state.apex) {
      updates.push(["apex", apex.value]);
    }

    if (!updates.length && !forceSend) return;

    const channelId = TARGET_CHANNEL_ID;
    const ch = client.channels?.cache?.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!ch) return;

    const embeds = updates.length
      ? updates.map(([k, v]) => embedFor(k, v)).slice(0, 3)
      : (() => {
          const ersatz = [];
          if (riot.status === "fulfilled" && riot.value) ersatz.push(embedFor("riot", riot.value));
          if (bliz.status === "fulfilled" && bliz.value) ersatz.push(embedFor("blizzard", bliz.value));
          if (apex.status === "fulfilled" && apex.value) ersatz.push(embedFor("apex", apex.value));
          return ersatz.slice(0, 3);
        })();

    if (embeds.length) {
      await ch.send({ content: "-# 최신 게임 소식 3종", embeds }).catch(() => {});
      state.lastSentAt = Date.now();
      for (const [k, v] of updates) {
        if (k === "riot") state.riot = v.id;
        if (k === "blizzard") state.blizzard = v.id;
        if (k === "apex") state.apex = v.id;
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
