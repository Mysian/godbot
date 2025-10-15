"use strict";
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const PANEL_CHANNEL_ID = process.env.YT_PANEL_CHANNEL_ID || "1427975404043505726";
const YT_SOURCE = process.env.YT_CHANNEL || "https://www.youtube.com/@YoungGod_Horror";
const REGION = "KR";
const HL = "ko_KR";
const UPDATE_MS = Math.max(1, Number(process.env.YT_PANEL_UPDATE_MS || 15 * 60 * 1000));
const DATA_DIR = path.join(__dirname, "../data");
const SNAP_PATH = path.join(DATA_DIR, "yt-panel.json");
const STORE_PATH = path.join(DATA_DIR, "yt-stats.json");

let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try { _fetch = require("node-fetch"); } catch {}
}
let _canvas;
try { _canvas = require("canvas"); } catch {}

if (!fs.existsSync(DATA_DIR)) try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

const PREFIX = "ytpanel:";
const BTN_REFRESH = `${PREFIX}refresh`;
const BTN_OPEN_CH = `${PREFIX}opench`;
const BTN_OPEN_LAST = `${PREFIX}openlast`;
const THREAD_NAME = "유튜브 피드백";

function readJson(p, d = {}) { try { if (!fs.existsSync(p)) return d; const s = fs.readFileSync(p, "utf8"); return s && s.trim() ? JSON.parse(s) : d; } catch { return d; } }
function writeJson(p, o) { try { fs.writeFileSync(p, JSON.stringify(o)); } catch {} }
function fmt(n) { if (n === undefined || n === null || Number.isNaN(n)) return "정보 없음"; return Number(n).toLocaleString("ko-KR"); }
function toKST(iso) { try { const d = new Date(iso); return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); } catch { return iso || "알 수 없음"; } }
function isoDurToSeconds(iso) { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || ""); if (!m) return 0; return (parseInt(m[1]||0,10)*3600)+(parseInt(m[2]||0,10)*60)+parseInt(m[3]||0,10); }
function isShort(v) { const sec = isoDurToSeconds(v.contentDetails?.duration || ""); const t = (v.snippet?.title||"").toLowerCase(); const d=(v.snippet?.description||"").toLowerCase(); const tag = t.includes("#shorts")||d.includes("#shorts"); return sec>0&&sec<=61?true:tag; }
function kstDateStr(d=new Date()){const k=new Date(d.toLocaleString("en-US",{timeZone:"Asia/Seoul"}));return `${k.getFullYear()}-${String(k.getMonth()+1).padStart(2,"0")}-${String(k.getDate()).padStart(2,"0")}`;}

async function httpGet(url){const r=await _fetch(url);let body=null;try{body=await r.text();}catch{}if(!r.ok){let msg=`HTTP ${r.status}`;if(body&&body.length<500)msg+=` • ${body}`;throw new Error(msg);}try{return body?JSON.parse(body):{};}catch{throw new Error("HTTP 200 but invalid JSON");}}

function normalizeChannelQuery(s){if(!s)return "";let q=s.trim();q=q.replace(/^https?:\/\/(www\.)?youtube\.com\//i,"");q=q.replace(/^https?:\/\/(www\.)?youtu\.be\//i,"");q=q.replace(/^@+/,"");q=q.replace(/^c\//i,"");q=q.replace(/^user\//i,"");q=q.replace(/^channel\//i,"");q=q.replace(/^[\/]+/,"");return q;}
function extractChannelFromInput(input){if(!input)return null;try{const u=new URL(input);if(!/youtu\.be|youtube\.com/.test(u.hostname))return null;if(u.pathname.startsWith("/channel/"))return{ id:u.pathname.split("/")[2]||null, query:null, viaVideo:null };if(u.pathname.startsWith("/@"))return{ id:null, query:normalizeChannelQuery(u.pathname), viaVideo:null };if(u.pathname.startsWith("/c/"))return{ id:null, query:normalizeChannelQuery(u.pathname), viaVideo:null };if(u.pathname.startsWith("/user/"))return{ id:null, query:normalizeChannelQuery(u.pathname), viaVideo:null };if(u.pathname.startsWith("/watch")||u.pathname.startsWith("/shorts/")||u.pathname.startsWith("/live/"))return{ id:null, query:null, viaVideo:extractVideoId(input) };}catch{}return null;}
function extractVideoId(input){if(!input)return null;try{if(/^[A-Za-z0-9_\-]{11}$/.test(input))return input;const url=new URL(input);if(url.pathname.startsWith("/shorts/")){const id=url.pathname.split("/")[2];if(id&&id.length>=11)return id.slice(0,11);}const v=url.searchParams.get("v");if(v&&/^[A-Za-z0-9_\-]{11}$/.test(v))return v;if(url.hostname.includes("youtu.be")){const id=url.pathname.replace("/","");if(/^[A-Za-z0-9_\-]{11}$/.test(id))return id;}}catch{}return null;}

async function ytFindChannelByName(queryOrHandle,key){const q=normalizeChannelQuery(queryOrHandle);if(/^UC[A-Za-z0-9_-]{22}$/.test(q))return q;const s=new URL("https://www.googleapis.com/youtube/v3/search");s.searchParams.set("part","snippet");s.searchParams.set("type","channel");s.searchParams.set("q",q);s.searchParams.set("maxResults","5");s.searchParams.set("regionCode",REGION);s.searchParams.set("key",key);const res=await httpGet(s.toString());const items=res.items||[];if(!items.length)return null;return items[0]?.id?.channelId||null;}
async function ytChannelCore(channelId,key){if(!channelId||!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))throw new Error("invalid channelId");const u=new URL("https://www.googleapis.com/youtube/v3/channels");u.searchParams.set("part","snippet,statistics,contentDetails");u.searchParams.set("id",channelId);u.searchParams.set("key",key);const r=await httpGet(u.toString());const ch=(r.items||[])[0];if(!ch)throw new Error("channel not found");return ch;}
async function resolveChannelId(input,key){if(!input)return null;if(/^UC[A-Za-z0-9_-]{22}$/.test(input.trim()))return input.trim();const parsed=extractChannelFromInput(input);if(parsed?.id){if(/^UC[A-Za-z0-9_-]{22}$/.test(parsed.id))return parsed.id;}if(parsed?.viaVideo){const v=await ytVideoInfo(parsed.viaVideo,key);const cid=v?.video?.snippet?.channelId||null;if(cid)return cid;}if(parsed?.query){const q=normalizeChannelQuery(parsed.query);const cid=await ytFindChannelByName(q,key);if(cid)return cid;}const fb=await ytFindChannelByName(input,key);return fb||null;}
async function ytVideoInfo(videoId,key){const vapi=new URL("https://www.googleapis.com/youtube/v3/videos");vapi.searchParams.set("part","snippet,statistics,contentDetails,liveStreamingDetails");vapi.searchParams.set("hl",HL);vapi.searchParams.set("id",videoId);vapi.searchParams.set("key",key);const vres=await httpGet(vapi.toString());return (vres.items||[])[0]||null;}
async function ytChannelUploads(channelId,key,max=30){const ch=await ytChannelCore(channelId,key);const uploads=ch.contentDetails?.relatedPlaylists?.uploads;let items=[];let pageToken=null;while(items.length<max){const u=new URL("https://www.googleapis.com/youtube/v3/playlistItems");u.searchParams.set("part","snippet,contentDetails");u.searchParams.set("playlistId",uploads);u.searchParams.set("maxResults",String(Math.min(50,max-items.length)));if(pageToken)u.searchParams.set("pageToken",pageToken);u.searchParams.set("key",key);const r=await httpGet(u.toString());items=items.concat(r.items||[]);pageToken=r.nextPageToken||null;if(!pageToken)break;}const ids=items.map(i=>i.contentDetails?.videoId).filter(Boolean);const dict=new Map();for(let i=0;i<ids.length;i+=50){const slice=ids.slice(i,i+50);const v=new URL("https://www.googleapis.com/youtube/v3/videos");v.searchParams.set("part","snippet,statistics,contentDetails");v.searchParams.set("id",slice.join(","));v.searchParams.set("key",key);const vr=await httpGet(v.toString());for(const it of(vr.items||[]))dict.set(it.id,it);}const videos=[];for(const id of ids){const it=dict.get(id);if(!it)continue;videos.push(it);}videos.sort((a,b)=>new Date(b.snippet.publishedAt)-new Date(a.snippet.publishedAt));return { channel: ch, videos };}

function updateSnapshot(ch){try{const snap=readJson(STORE_PATH,{});const cid=ch.id;const vc=Number(ch.statistics?.viewCount||0);const today=kstDateStr();if(!snap[cid])snap[cid]=[];const arr=snap[cid];const existed=arr.find(x=>x.date===today);if(existed){existed.viewCount=vc;}else{arr.push({date:today,viewCount:vc});}const cutoff=new Date();cutoff.setDate(cutoff.getDate()-450);const cutStr=kstDateStr(cutoff);snap[cid]=arr.filter(x=>x.date>=cutStr).sort((a,b)=>a.date.localeCompare(b.date));writeJson(STORE_PATH,snap);}catch{}}

function pickThumb(sn){return sn?.thumbnails?.maxres?.url||sn?.thumbnails?.standard?.url||sn?.thumbnails?.high?.url||sn?.thumbnails?.medium?.url||sn?.thumbnails?.default?.url||null;}

async function buildPanel(key, source){
  const cid=await resolveChannelId(source,key);
  if(!cid)throw new Error("채널 식별 실패");
  const pack=await ytChannelUploads(cid,key,50);
  const ch=pack.channel;
  const vids=pack.videos;
  updateSnapshot(ch);

  const sn=ch.snippet||{};
  const st=ch.statistics||{};
  const subsHidden=!!st.hiddenSubscriberCount;
  const subs=subsHidden?null:Number(st.subscriberCount||0);
  const totalViews=Number(st.viewCount||0);
  const totalVideos=Number(st.videoCount||0);

  const longVideos=vids.filter(v=>!isShort(v));
  const shortVideos=vids.filter(v=>isShort(v));

  const latestLong=longVideos[0]||null;
  const lastUrl=latestLong?`https://www.youtube.com/watch?v=${latestLong.id}`:null;

  const top3Long=[...longVideos].sort((a,b)=>Number(b.statistics?.viewCount||0)-Number(a.statistics?.viewCount||0)).slice(0,3);
  const latest3Short=shortVideos.slice(0,3);

  const top3LongLines=top3Long.length?top3Long.map((v,i)=>`${i+1}. **[${(v.snippet?.title||"제목 없음").slice(0,80)}](https://www.youtube.com/watch?v=${v.id})**`).join("\n"):"없음";
  const latest3ShortLines=latest3Short.length?latest3Short.map((v,i)=>`${i+1}. **[${(v.snippet?.title||"제목 없음").slice(0,80)}](https://www.youtube.com/watch?v=${v.id})**`).join("\n"):"없음";

  const eb=new EmbedBuilder()
    .setColor(0x00b894)
    .setTitle(`${sn.title||"채널"} • 실시간 현황`)
    .setURL(`https://www.youtube.com/channel/${ch.id}`)
    .setThumbnail(sn.thumbnails?.high?.url||sn.thumbnails?.default?.url)
    .addFields(
      {name:"구독자",value:subsHidden?"비공개":`**${fmt(subs)}**`,inline:true},
      {name:"총 조회수",value:`**${fmt(totalViews)}**`,inline:true},
      {name:"총 영상 수",value:`**${fmt(totalVideos)}**`,inline:true},
      {name:"최근 업로드(롱폼 기준)",value:latestLong?`**[${(latestLong.snippet?.title||"제목 없음").slice(0,80)}](${lastUrl})**\n${toKST(latestLong.snippet?.publishedAt)} • 롱폼`:"없음",inline:false},
      {name:"인기 롱폼 TOP 3",value:top3LongLines,inline:false},
      {name:"최근 쇼츠 3",value:latest3ShortLines,inline:false}
    )
    .setFooter({text:`마지막 갱신: ${kstDateStr()} • Asia/Seoul`});

  const latestLongThumb = latestLong ? pickThumb(latestLong.snippet) : null;
  if(latestLongThumb) eb.setImage(latestLongThumb);

  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BTN_REFRESH).setLabel("새로고침").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(BTN_OPEN_CH).setLabel("채널 열기").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BTN_OPEN_LAST).setLabel("최신 롱폼").setStyle(ButtonStyle.Secondary).setDisabled(!lastUrl)
  );

  return { embed: eb, components: [row], urls: { channel: `https://www.youtube.com/channel/${ch.id}`, last: lastUrl }, channelId: cid };
}

async function publish(client){
  const key=process.env.YT_API_KEY;
  if(!key)throw new Error("YT_API_KEY 미설정");
  const panel=await buildPanel(key,YT_SOURCE);
  const ch=await client.channels.fetch(PANEL_CHANNEL_ID);
  const store=readJson(SNAP_PATH,{});
  const prevId=store.messageId||null;
  const payload={ embeds:[panel.embed], components:panel.components, allowedMentions:{parse:[]} };
  let msg=null;
  if(prevId){
    try{const m=await ch.messages.fetch(prevId);await m.edit(payload);msg=m;}
    catch{msg=await ch.send(payload);}
  }else{
    msg=await ch.send(payload);
  }
  store.messageId=msg.id;
  store.channelId=PANEL_CHANNEL_ID;
  store.ytChannelId=panel.channelId;
  store.urls=panel.urls;
  writeJson(SNAP_PATH,store);
  return msg;
}

async function handleButtons(client,interaction){
  const id=interaction.customId||"";
  if(!id.startsWith(PREFIX))return false;
  const store=readJson(SNAP_PATH,{});
  if(id===BTN_OPEN_CH){
    const url=store.urls?.channel;
    return interaction.reply({ content:url?url:"채널 링크를 알 수 없어.", ephemeral:true });
  }
  if(id===BTN_OPEN_LAST){
    const url=store.urls?.last;
    return interaction.reply({ content:url?url:"최신 롱폼이 없어요.", ephemeral:true });
  }
  if(id===BTN_REFRESH){
    await interaction.deferReply({ ephemeral:true });
    try{await publish(client);return interaction.editReply({ content:"갱신 완료!" });}
    catch(e){return interaction.editReply({ content:`갱신 실패: ${String(e.message||e)}` });}
  }
  return true;
}

let _timer=null;
async function setup(client){
  client.removeListener?.("interactionCreate", _onIC);
  client.on("interactionCreate", _onIC);
  if(_timer)clearInterval(_timer);
  try{await publish(client);}catch{}
  _timer=setInterval(async()=>{try{await publish(client);}catch{}}, UPDATE_MS);
}
async function destroy(){if(_timer)clearInterval(_timer);_timer=null;}
async function _onIC(interaction){
  try{
    if(interaction.isButton())return await handleButtons(interaction.client,interaction);
  }catch{}
}

module.exports = { setup, publish, destroy };
