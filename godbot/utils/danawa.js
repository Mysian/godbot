"use strict";

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
let _fetch = globalThis.fetch;
try {
  const nf = require("node-fetch");
  if (typeof nf === "function") _fetch = nf;
  else if (nf && typeof nf.default === "function") _fetch = nf.default;
} catch {}

const cheerio = require("cheerio");

const CHANNEL_ID = "1420046318474105014";
const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Mobile Safari/537.36"
];
const LANG = "ko-KR,ko;q=0.9";
const SEARCH_DESKTOP = "https://search.danawa.com/dsearch.php?query=";
const SEARCH_MOBILE = "https://msearch.danawa.com/search.php?query=";
const SEARCH_MOBILE2 = "https://m.danawa.com/mobile/search/search.danawa?keyword=";
const DETAIL_HOST = "https://prod.danawa.com";
const SESS_TTL_MS = 600000;
const MAX_ITEMS = 6;
const sessions = new Map();
const chanCooldown = new Map();

function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function now(){ return Date.now(); }
function cut(s,n){ s=(s||"").trim().replace(/\s+/g," "); return s.length>n? s.slice(0,n-1)+"…" : s; }
function num(v){ if(v===undefined||v===null) return NaN; const n = Number(String(v).replace(/[^\d.]/g,"")); return Number.isFinite(n)?n:NaN; }
function priceToStr(n){ if(!Number.isFinite(n)) return "가격정보 없음"; return "₩"+Math.round(n).toLocaleString("ko-KR"); }
function normalizeQuery(q){ return (q||"").trim().replace(/^!+/,"").replace(/\s+/g," "); }

async function ensureCanTalk(channel){
  const me = channel.guild?.members?.me;
  if(!me) return { ok:false, canEmbed:false };
  const perms = channel.permissionsFor(me);
  if(!perms) return { ok:false, canEmbed:false };
  return { ok: perms.has("SendMessages"), canEmbed: perms.has("EmbedLinks") };
}

async function safeSend(channel, payload, fallbackText){
  try{ return await channel.send(payload); }
  catch(e){
    try{
      const t = fallbackText && String(fallbackText).trim().length ? fallbackText : "전송 오류가 발생했어. 임베드 권한을 확인해줘.";
      return await channel.send({ content: t });
    }catch{}
  }
}

async function httpGetOnce(url, ua, extraHeaders, timeoutMs){
  const ctrl = typeof AbortController!=="undefined" ? new AbortController() : null;
  const t = setTimeout(()=>{ try{ ctrl&&ctrl.abort(); }catch{} }, timeoutMs||12000);
  try{
    const res = await _fetch(url, {
      redirect: "follow",
      signal: ctrl?ctrl.signal:undefined,
      headers: {
        "user-agent": ua,
        "accept-language": LANG,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "upgrade-insecure-requests": "1",
        ...(extraHeaders||{})
      }
    });
    const text = await res.text();
    if(!res.ok) throw new Error(`HTTP ${res.status} • ${cut(text.replace(/\s+/g," "), 160)}`);
    if (/__cf_chl_|Access Denied|Bot detection|robot check|Cloudflare|보안문자|자동화된 요청/i.test(text)) {
      throw new Error("차단됨(봇/보안페이지).");
    }
    return text;
  } finally { clearTimeout(t); }
}

async function httpGetRetry(urls){
  const tries = [];
  for(const u of urls){
    tries.push({ url:u.url, headers:u.headers||{} });
  }
  let lastErr;
  for(let i=0;i<tries.length;i++){
    const u = tries[i];
    for(let j=0;j<UA_POOL.length;j++){
      try{
        const html = await httpGetOnce(u.url, rand(UA_POOL), u.headers, 12000);
        return { html, finalUrl: u.url };
      }catch(e){
        lastErr = e;
        await sleep(300 + Math.random()*400);
      }
    }
  }
  throw lastErr || new Error("요청 실패");
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
  if(src && src.startsWith("//")) src = "https:"+src;
  return src||null;
}

function findPricesInText(text){
  const out = [];
  const re = /([\d][\d,\.]*)\s*원/g;
  let m;
  while((m=re.exec(text))!==null){
    const n = num(m[1]); if(Number.isFinite(n)) out.push(n);
  }
  return out;
}

function parseSearchDesktop(html){
  const $ = cheerio.load(html);
  const anchors = $('a[href*="prod.danawa.com/info/?pcode="]');
  const seen = new Set();
  const items = [];
  anchors.each((_,a)=>{
    const href = $(a).attr("href");
    const pcode = extractPcodelike(href);
    if(!pcode || seen.has(pcode)) return;
    const container = $(a).closest("div,li,dd");
    const title = cut($(a).text(),120) || cut(container.find("a").first().text(),120);
    const img = pickImageUrl(container);
    const prices = findPricesInText(container.text());
    const listPrice = prices.length? Math.min(...prices) : NaN;
    items.push({ pcode, url: `${DETAIL_HOST}/info/?pcode=${pcode}`, title, img, listPrice });
    seen.add(pcode);
  });
  return items;
}

function parseSearchMobile(html){
  const $ = cheerio.load(html);
  const items = [];
  $("a.prod_link, a.search_product, a.link, a.item").each((_,a)=>{
    const href = $(a).attr("href");
    const pcode = extractPcodelike(href);
    if(!pcode) return;
    const li = $(a).closest("li,div");
    const title = cut($(a).text() || li.find(".prod_name,.name,.tit,.title").text(), 120);
    const img = pickImageUrl(li);
    const prices = findPricesInText(li.text());
    const listPrice = prices.length? Math.min(...prices) : NaN;
    items.push({ pcode, url: `${DETAIL_HOST}/info/?pcode=${pcode}`, title, img, listPrice });
  });
  return items;
}

function parseDetail(html){
  const $ = cheerio.load(html);
  let low = NaN;
  const allText = $.root().text();
  const m1 = allText.match(/최저가[^\d]*([\d][\d,\.]*)\s*원/);
  if(m1) low = num(m1[1]);
  if(!Number.isFinite(low)){
    const m2 = allText.match(/([\d][\d,\.]*)\s*원/);
    if(m2) low = num(m2[1]);
  }
  let img = $('meta[property="og:image"]').attr("content") || null;
  if(!img) img = pickImageUrl($);
  let title = $("h1").first().text().trim();
  if(!title) title = cut($("title").text(),120);
  return { lowPrice: low, image: img, title: cut(title,120) };
}

async function enrichWithDetails(items, limit){
  const take = items.slice(0, Math.max(1, Math.min(limit||3, items.length)));
  const out = [];
  for(const it of take){
    try{
      const { html } = await httpGetRetry([{ url: it.url }]);
      const d = parseDetail(html);
      out.push({ ...it, title: d.title||it.title, img: d.image||it.img, lowPrice: Number.isFinite(d.lowPrice)?d.lowPrice:it.listPrice });
      await sleep(200);
    }catch{
      out.push({ ...it, lowPrice: it.listPrice });
    }
  }
  return out;
}

function buildEmbed(query, best, list, searchUrl){
  const e = new EmbedBuilder();
  e.setColor(0x2A84F8);
  e.setTitle(`다나와 최저가 • ${cut(query,80)}`);
  e.setURL(searchUrl);
  let desc = "";
  if(best){
    desc += `✅ 최저가: **${priceToStr(best.lowPrice)}**\n`;
    desc += `[${cut(best.title,100)}](${best.url})\n`;
  }else{
    desc += "결과가 없었어.\n";
  }
  if(list && list.length){
    const lines = list.map((it,i)=>`${i+1}. ${priceToStr(it.lowPrice)} · [${cut(it.title,80)}](${it.url})`);
    desc += "\n"+lines.join("\n");
  }
  e.setDescription(desc);
  if(best && best.img) e.setThumbnail(best.img);
  const ts = new Date().toLocaleString("ko-KR",{ timeZone:"Asia/Seoul" });
  e.setFooter({ text:`검색: ${cut(query,50)} • ${ts}` });
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
    const select = new StringSelectMenuBuilder()
      .setCustomId(`danawa:${sid}`)
      .setPlaceholder("다른 후보 보기")
      .addOptions(options.slice(0,25).map(it=>({ label: cut(it.title||"상품",100), description: cut(priceToStr(it.lowPrice||NaN),100), value: it.pcode })));
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  return rows;
}

function storeSession(sid, data){
  const obj = { ...data, t: now() };
  sessions.set(sid, obj);
  const timer = setTimeout(()=>{
    const v = sessions.get(sid);
    if(v && v.t===obj.t) sessions.delete(sid);
  }, SESS_TTL_MS);
  if (typeof timer.unref==="function") { try{ timer.unref(); }catch{} }
}

async function parseSearchWithFallbacks(query){
  const uDesktop = SEARCH_DESKTOP + encodeURIComponent(query);
  const uMobile = SEARCH_MOBILE + encodeURIComponent(query);
  const uMobile2 = SEARCH_MOBILE2 + encodeURIComponent(query);
  try{
    const { html } = await httpGetRetry([{ url: uDesktop }]);
    let items = parseSearchDesktop(html);
    if(items.length) return { items, searchUrl: uDesktop };
    items = parseSearchMobile(html);
    if(items.length) return { items, searchUrl: uDesktop };
  }catch{}
  try{
    const { html } = await httpGetRetry([{ url: uMobile, headers: { "user-agent": UA_POOL[3] } }]);
    const items = parseSearchMobile(html);
    if(items.length) return { items, searchUrl: uMobile };
  }catch{}
  try{
    const { html } = await httpGetRetry([{ url: uMobile2, headers: { "user-agent": UA_POOL[3] } }]);
    const items = parseSearchMobile(html);
    if(items.length) return { items, searchUrl: uMobile2 };
  }catch{}
  return { items: [], searchUrl: uDesktop };
}

async function handleQuery(client, channel, authorId, raw){
  const last = chanCooldown.get(channel.id)||0;
  if(now()-last<2000) return;
  chanCooldown.set(channel.id, now());
  const query = normalizeQuery(raw);
  if(!query || query.length<2) return;
  await channel.sendTyping().catch(()=>{});
  const delayWarn = setTimeout(()=>{ safeSend(channel, { content: "잠깐만! 가격 데이터 가져오는 중이야…" }); }, 3000);
  let items, searchUrl;
  try{
    const res = await parseSearchWithFallbacks(query);
    items = res.items; searchUrl = res.searchUrl;
  }catch(e){
    clearTimeout(delayWarn);
    await safeSend(channel, { content: `검색 접속 실패: ${cut(String(e.message||e),120)}` }, `다나와 검색 실패 • ${searchUrl}`);
    return;
  }
  if(!items || !items.length){
    clearTimeout(delayWarn);
    const empty = new EmbedBuilder().setColor(0xf39c12).setTitle(`결과 없음 • ${cut(query,80)}`).setURL(searchUrl).setDescription("관련 상품을 찾지 못했어. 검색어를 조금 바꿔볼래?");
    await safeSend(channel, { embeds:[empty], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("다나와 열기").setStyle(ButtonStyle.Link).setURL(searchUrl))] }, `결과 없음 • ${query}\n${searchUrl}`);
    return;
  }
  let detailed;
  try{ detailed = await enrichWithDetails(items, Math.min(MAX_ITEMS, items.length)); }
  catch{ detailed = items.slice(0, Math.min(MAX_ITEMS, items.length)); }
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
  const perm = await ensureCanTalk(channel);
  const embed = buildEmbed(query, best, list, searchUrl);
  const rows = buildRows(best, searchUrl, sid, detailed.slice(0, Math.min(10, detailed.length)));
  const fallbackLines = list.map((it,i)=>`${i+1}. ${priceToStr(it.lowPrice)} · ${it.title} · ${it.url}`).join("\n");
  const fallbackText = `다나와 최저가 • ${query}\n${best ? `최저가: ${priceToStr(best.lowPrice)}\n${best.title}\n${best.url}\n\n` : ""}${fallbackLines || "결과가 없었어."}\n${searchUrl}`;
  clearTimeout(delayWarn);
  if(!perm.ok){
    await safeSend(channel, { content: "메시지를 보낼 권한이 없어서 결과를 보여줄 수 없어. 채널 권한을 확인해줘." }, fallbackText);
    return;
  }
  if(perm.canEmbed){
    await safeSend(channel, { embeds:[embed], components: rows }, fallbackText);
  }else{
    await safeSend(channel, { content: fallbackText });
  }
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
    }catch(e){
      const m = String(e && (e.cause?.message || e.message || e)).trim();
      await safeSend(msg.channel, { content: `요청 처리 중 오류가 발생했어: ${cut(m,150)}` });
    }
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
          const { html } = await httpGetRetry([{ url: pick.url }]);
          const d = parseDetail(html);
          enriched = { ...pick, title: d.title||pick.title, lowPrice: Number.isFinite(d.lowPrice)?d.lowPrice:pick.lowPrice, img: d.image||pick.img };
        }catch{}
      }
      const list = sess.items.slice(0, Math.min(5, sess.items.length));
      const embed = buildEmbed(sess.query, enriched, list, sess.searchUrl);
      const rows = buildRows(enriched, sess.searchUrl, sid, sess.items.slice(0, Math.min(10, sess.items.length)));
      await itx.update({ embeds:[embed], components: rows }).catch(async()=>{
        const fallbackLines = list.map((it,i)=>`${i+1}. ${priceToStr(it.lowPrice)} · ${it.title} · ${it.url}`).join("\n");
        const fallbackText = `다나와 최저가 • ${sess.query}\n${enriched ? `최저가: ${priceToStr(enriched.lowPrice)}\n${enriched.title}\n${enriched.url}\n\n` : ""}${fallbackLines || "결과가 없었어."}\n${sess.searchUrl}`;
        try{ await itx.reply({ content: fallbackText, ephemeral:true }); }catch{}
      });
      storeSession(sid, sess);
    }catch(e){
      try{ if(itx.isRepliable()) await itx.reply({ content:`업데이트에 실패했어: ${cut(String(e.message||e),120)}`, ephemeral:true }); }catch{}
    }
  });
};
