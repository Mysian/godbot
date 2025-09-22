"use strict";

const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
let cheerio;
try { cheerio = require("cheerio"); } catch { throw new Error("cheerio 패키지를 설치하세요: npm i cheerio"); }

const TARGET_CHANNEL_ID = process.env.DISASTER_WATCH_CHANNEL_ID || "1419724916055347211";
const POLL_MS = Number(process.env.DISASTER_WATCH_POLL_MS || 120000);
const LIST_URL = "https://www.safetydata.go.kr/disaster-data/disasterNotification?cntPerPage=20&currentPage=1";
const DATA_DIR = path.join(__dirname, "../data");
const SEEN_PATH = path.join(DATA_DIR, "disaster-seen.json");

let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try { _fetch = require("node-fetch"); } catch {}
  if (typeof _fetch !== "function") throw new Error("fetch 가 필요합니다. Node 18+ 또는 node-fetch 설치");
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEEN_PATH)) fs.writeFileSync(SEEN_PATH, "[]");
}
function loadSeen() {
  try {
    const raw = fs.readFileSync(SEEN_PATH, "utf8").trim();
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}
function saveSeen(seenSet) {
  try { fs.writeFileSync(SEEN_PATH, JSON.stringify([...seenSet])); } catch {}
}
function parseKST(dateStr) {
  try {
    // 입력 예: 2025/09/22 21:18:14
    const [d, t] = dateStr.split(" ");
    const [yy, mm, dd] = d.split("/").map(Number);
    const [HH, MM, SS] = t.split(":").map(Number);
    const local = new Date(Date.UTC(yy, mm - 1, dd, HH - 9, MM, SS));
    return local;
  } catch {
    return new Date();
  }
}
async function fetchText(url) {
  const res = await _fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
function extractList(html) {
  const $ = cheerio.load(html);
  const list = [];
  $("a[href*='disasterNotificationDetail']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const url = new URL(href, "https://www.safetydata.go.kr");
    const sn = url.searchParams.get("sn");
    if (!sn) return;
    const tr = $(a).closest("tr");
    const cols = tr.find("td");
    const title = $(a).text().replace(/\s+/g, " ").trim();
    const date = (cols.length ? cols.last().text() : "").replace(/\s+/g, " ").trim();
    list.push({ sn, title, date, link: url.toString() });
  });
  return list;
}
function buildEmbed(item) {
  const regionMatch = item.title.match(/\[([^\]]+)\]\s*$/);
  const region = regionMatch ? regionMatch[1] : "전국/미상";
  const cleanMsg = regionMatch ? item.title.replace(/\s*\[[^\]]+\]\s*$/, "").trim() : item.title;
  const ts = item.date ? parseKST(item.date) : new Date();
  const e = new EmbedBuilder()
    .setColor(0xD61F1F)
    .setTitle("📢 재난 문자")
    .setURL(item.link)
    .setDescription(cleanMsg)
    .addFields(
      { name: "지역", value: region, inline: true },
      { name: "등록일(KST)", value: item.date || "알 수 없음", inline: true }
    )
    .setFooter({ text: "재난안전데이터공유플랫폼" })
    .setTimestamp(ts);
  return e;
}

let timer = null;
let running = false;

async function pollOnce(client) {
  if (running) return;
  running = true;
  try {
    ensureDir();
    const seen = loadSeen();
    const html = await fetchText(LIST_URL);
    const items = extractList(html);
    if (!items.length) return;
    const channelId = TARGET_CHANNEL_ID;
    const channel = client.channels?.cache?.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    // 최신 글부터 처리
    items.sort((a, b) => Number(b.sn) - Number(a.sn));
    const newOnes = items.filter(x => !seen.has(x.sn));
    if (!newOnes.length) return;

    // 최신 최대 10개까지만 한 번에 전송
    for (const it of newOnes.slice(0, 10)) {
      const embed = buildEmbed(it);
      await channel.send({ embeds: [embed] }).catch(() => {});
      seen.add(it.sn);
    }
    saveSeen(seen);
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
async function now(client) { await pollOnce(client); }

module.exports = { start, stop, now };
