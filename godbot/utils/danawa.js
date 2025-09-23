"use strict";

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require("discord.js");
let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try { _fetch = require("node-fetch"); } catch {}
}
const cheerio = require("cheerio");

const CHANNEL_ID = "1420046318474105014";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const LANG = "ko-KR,ko;q=0.9";
const SEARCH_BASE = "https://search.danawa.com/dsearch.php?query=";
const DETAIL_HOST = "https://prod.danawa.com";
const SESS_TTL_MS = 10 * 60 * 1000;
const MAX_ITEMS = 6;
const sessions = new Map();
const chanCooldown = new Map();

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function now(){ return Date.now(); }
function num(v){ if(v===undefined||v===null) return NaN; const n = Number(String(v).replace(/[^\d.]/g,"")); return Number.isFinite(n)?n:NaN; }
function priceToStr(n){ if(!Number.isFinite(n)) return "가격정보 없음"; return "₩" + Math.round(n).toLocaleString("ko-KR"); }
function cut(s, n){ s = (s||"").trim().replace(/\s+/g," "); return s.length>n ? s.slice(0,n-1)+"…" : s; }
function normalizeQuery(q){ return (q||"").trim().replace(/^!+/,"").replace(/\s+/g," "); }

async function httpGet(url, init={}){
  const ctrl = typeof AbortController!=="undefined" ? new AbortController() : null;
  const t = setTimeout(()=>{ try{ ctrl&&ctrl.abort(); }catch{} }, 15000);
  try{
    const res = await _fetch(url, {redirect:"follow", signal: ctrl?ctrl.signal:undefined, headers:{ "user-agent": USER_AGENT, "accept-language": LANG, "referer": "https://search.danawa.com/" }, ...init});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text;
  } finally { clearTimeout(t); }
}

function extractPcodelike(href){
  if(!href) return null;
  const m = String(href).match(/[?&]pcode=(\d+)/i);
  return m?m[1]:null;
}

function pickImageUrl($container){
  let src = $container.find("img[src]").first().attr("src");
  if(!src) src = $container.find("img[data-src]").first().attr("data-src");
  if(!src) src = $container.find("img[data-original]").first().attr("data-original");
  if(src && src.startsWith("//")) src = "https:" + src;
  return src || null;
}

function findPricesInText(text){
  const out = [];
  const re = /([\d][\d,\.]*)\s*원/g;
  let m;
  while((m = re.exec(text))!==null){
    const n = num(m[1]);
    if(Number.isFinite(n)) out.push(n);
  }
  return out;
}

function parseSearch(html){
  const $ = cheerio.load(html);
  const anchors = $('a[href*="prod.danawa.com/info/?pcode="]');
  const seen = new Set();
  const items = [];
  anchors.each((_,a)=>{
    const href = $(a).attr("href");
    const pcode = extractPcodelike(href);
    if(!pcode || seen.has(pcode)) return;
    const container = $(a).closest("div,li,dd");
    const title = cut($(a).text(), 120) || cut(container.find("a").first().text(), 120);
    const img = pickImageUrl(container);
    const blockText = container.text();
    const prices = findPricesInText(blockText);
    const listPrice = prices.length? Math.min(...prices) : NaN;
    items.push({ pcode, url: `${DETAIL_HOST}/info/?pcode=${pcode}`, title, img, listPrice });
    seen.add(pcode);
  });
  return items;
}

function parseDetail(html){
  const $ = cheerio.load(html);
  let low = NaN;
  const allText = $.root().text();
  const m1 = allText.match(/최저가[^\d]*([\d][\d,\.]*)\s*원/);
  if(m1){ low = num(m1[1]); }
  if(!Number.isFinite(low)){
    const m2 = allText.match(/([\d][\d,\.]*)\s*원/);
    if(m2) low = num(m2[1]);
  }
  let img = $('meta[property="og:image"]').attr("content") || null;
  if(!img){
    img = pickImageUrl($);
  }
  let title = $("h1").first().text().trim();
  if(!title) title = cut($("title").text(), 120);
  return { lowPrice: low, image: img, title: cut(title, 120) };
}

async function enrichWithDetails(items, limit=3){
  const take = items.slice(0, Math.max(1, Math.min(limit, items.length)));
  const out = [];
  for(const it of take){
    try{
      const html = await httpGet(it.url);
      const d = parseDetail(html);
      out.push({ ...it, title: d.title || it.title, img: d.image || it.img, lowPrice: Number.isFinite(d.lowPrice)?d.lowPrice:it.listPrice });
      await sleep(250);
    } catch { out.push({ ...it, lowPrice: it.listPrice }); }
  }
  return out;
}

function buildEmbed(query, best, list, searchUrl){
  const e = new EmbedBuilder();
  e.setColor(0x2A84F8);
  e.setTitle(`다나와 최저가 • ${cut(query, 80)}`);
  e.setURL(searchUrl);
  let desc = "";
  if(best){
    desc += `✅ 최저가: **${priceToStr(best.lowPrice)}**\n`;
    desc += `[${cut(best.title, 100)}](${best.url})\n`;
  } else {
    desc += "결과가 없었어.\n";
  }
  if(list && list.length){
    const lines = list.map((it,i)=>`${i+1}. ${priceToStr(it.lowPrice)} · [${cut(it.title,80)}](${it.url})`);
    desc += "\n" + lines.join("\n");
  }
  e.setDescription(desc);
  if(best && best.img) e.setThumbnail(best.img);
  const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  e.setFooter({ text: `검색: ${cut(query, 50)} • ${ts}` });
  return e;
}

function buildRows(best, searchUrl, sid, options){
  const rows = [];
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("최저가 제품").setStyle(ButtonStyle.Link).setURL(best?best.url:searchUrl),
    new ButtonBuilder().setLabel("검색 전체").setStyle(ButtonStyle.Link).setURL(searchUrl)
  );
  rows.push(row1);
  if(options && options.length){
    const select = new StringSelectMenuBuilder().setCustomId(`danawa:${sid}`).setPlaceholder("다른 후보 보기").addOptions(
      options.slice(0,25).map(it=>({ label: cut(it.title||"상품", 100), description: cut(priceToStr(it.lowPrice||NaN), 100), value: it.pcode }))
    );
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  return rows;
}

function storeSession(sid, data){
  sessions.set(sid, { ...data, t: now() });
  setTimeout(()=>{ const v = sessions.get(sid); if(v && v.t === data.t) sessions.delete(sid); }, SESS_TTL_MS).unref?.();
}

async function handleQuery(client, channel, authorId, raw){
  const last = chanCooldown.get(channel.id)||0;
  if(now()-last<2000) return;
  chanCooldown.set(channel.id, now());
  const query = normalizeQuery(raw);
  if(!query || query.length<2) return;
  await channel.sendTyping().catch(()=>{});
  const searchUrl = SEARCH_BASE + encodeURIComponent(query);
  let html;
  try{ html = await httpGet(searchUrl); } catch(e){
    const err = new EmbedBuilder().setColor(0xea4335).setTitle("다나와 검색 실패").setDescription("검색 페이지에 접속할 수 없었어. 잠시 후 다시 시도해줘.").setFooter({ text: String(e.message||e).slice(0,100) });
    await channel.send({ embeds:[err] }).catch(()=>{});
    return;
  }
  let items = parseSearch(html);
  if(!items.length){
    const empty = new EmbedBuilder().setColor(0xf39c12).setTitle(`결과 없음 • ${cut(query,80)}`).setURL(searchUrl).setDescription("관련 상품을 찾지 못했어. 검색어를 조금 바꿔볼래?");
    await channel.send({ embeds:[empty], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("다나와 열기").setStyle(ButtonStyle.Link).setURL(searchUrl))] }).catch(()=>{});
    return;
  }
  const detailed = await enrichWithDetails(items, Math.min(MAX_ITEMS, items.length));
  detailed.sort((a,b)=>{
    const aa = Number.isFinite(a.lowPrice)?a.lowPrice:Number.MAX_SAFE_INTEGER;
    const bb = Number.isFinite(b.lowPrice)?b.lowPrice:Number.MAX_SAFE_INTEGER;
    if(aa!==bb) return aa-bb;
    return (a.title||"").localeCompare(b.title||"");
  });
  const best = detailed[0] || null;
  const list = detailed.slice(0, Math.min(5, detailed.length));
  const sid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
  storeSession(sid, { query, searchUrl, items: detailed });
  const embed = buildEmbed(query, best, list, searchUrl);
  const rows = buildRows(best, searchUrl, sid, detailed.slice(0, Math.min(10, detailed.length)));
  await channel.send({ embeds:[embed], components: rows }).catch(()=>{});
}

module.exports = function registerDanawa(client){
  if(!client || typeof client.on!=="function") throw new Error("client required");
  client.on("messageCreate", async (msg)=>{
    try{
      if(!msg || msg.author?.bot) return;
      if(msg.channelId !== CHANNEL_ID) return;
      const content = String(msg.content||"").trim();
      if(!content.startsWith("!")) return;
      await handleQuery(client, msg.channel, msg.author.id, content);
    } catch {}
  });
  client.on("interactionCreate", async (itx)=>{
    try{
      if(!itx.isStringSelectMenu()) return;
      if(!itx.customId || !itx.customId.startsWith("danawa:")) return;
      const sid = itx.customId.slice("danawa:".length);
      const sess = sessions.get(sid);
      if(!sess){ await itx.reply({ content:"세션이 만료되었어. 새로 검색해줘.", ephemeral:true }).catch(()=>{}); return; }
      const pcode = itx.values && itx.values[0];
      const pick = sess.items.find(x=>x.pcode===pcode) || sess.items[0];
      let enriched = pick;
      if(!Number.isFinite(pick.lowPrice) || !pick.img){
        try{
          const html = await httpGet(pick.url);
          const d = parseDetail(html);
          enriched = { ...pick, title: d.title||pick.title, lowPrice: Number.isFinite(d.lowPrice)?d.lowPrice:pick.lowPrice, img: d.image||pick.img };
        } catch {}
      }
      const list = sess.items.slice(0, Math.min(5, sess.items.length));
      const embed = buildEmbed(sess.query, enriched, list, sess.searchUrl);
      const rows = buildRows(enriched, sess.searchUrl, sid, sess.items.slice(0, Math.min(10, sess.items.length)));
      await itx.update({ embeds:[embed], components: rows }).catch(async()=>{ await itx.reply({ content:"업데이트에 실패했어.", ephemeral:true }).catch(()=>{}); });
      storeSession(sid, sess);
    } catch {}
  });
};
