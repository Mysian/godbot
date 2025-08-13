const { ChannelType, PermissionFlagsBits } = require("discord.js");

const TRIGGER = "갓봇!";
const ADMIN_ROLE_ID = "1404486995564167218";
const BAN_ROLE_ID = "1403748042666151936";

function n(x){return (x||"").toString().toLowerCase().replace(/[<>\[\]\(\)\{\}"'`]/g," ").replace(/[@#!?.:,/\\\-_*+=|~^$%]/g," ").replace(/\s+/g," ").trim()}
function stripKoPost(x){return n(x).replace(/\b(에게|한테|님에게|님께|께|에게서|에서|으로|로|의|은|는|이|가|을|를|과|와|랑|이랑|들|꺼|께서|뿐|마저|조차|까지|라도|라도의)\b/g," ").replace(/\s+/g," ").trim()}
function grams2(s){const a=[];for(let i=0;i<s.length-1;i++)a.push(s.slice(i,i+2));return a}
function sim(a,b){a=stripKoPost(a);b=stripKoPost(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return 0.98;const A=new Set(grams2(a));const B=new Set(grams2(b));let inter=0;A.forEach(x=>{if(B.has(x))inter++});const u=A.size+B.size-inter;return u?inter/u:0}
function splitMulti(str){return (str||"").split(/[,，、\s]+/g).map(s=>s.trim()).filter(Boolean)}
function pickBest(items,labeler,query,min=0.45,count=1){const q=stripKoPost(query);const scored=items.map(x=>({x,score:sim(labeler(x),q)})).filter(o=>o.score>=min).sort((a,b)=>b.score-a.score);return count===1?(scored[0]?.x||null):scored.slice(0,count).map(o=>o.x)}
function uniq(arr){const s=new Set();const out=[];for(const v of arr){const k=typeof v==="string"?v: v?.id||JSON.stringify(v);if(!s.has(k)){s.add(k);out.push(v)}}return out}
function extractChunks(content){
  const raw=n(content);
  const quoted=[...content.matchAll(/["“”](.+?)["“”]/g)].map(m=>m[1]).concat([...content.matchAll(/\((.+?)\)/g)].map(m=>m[1])).concat([...content.matchAll(/\[(.+?)\]/g)].map(m=>m[1]));
  const tokens=splitMulti(raw).filter(t=>t.length>=2);
  const chunks=uniq(quoted.concat(tokens)).slice(0,50);
  return chunks;
}
const kw={
  mic:["마이크","mic","음성입력","입","말","말하기","음성","입열","입닫","음소거","뮤트","언뮤트"],
  spk:["스피커","이어폰","헤드폰","청음","소리","귀","청취","청음차단","청음해제","청취차단","청취해제","디프","디afen","deafen","undeafen"],
  off:["꺼","끊","닫","차단","음소거","mute","막","비활성","제한","못하게","꺼줘","꺼라","꺼줬","끄"],
  on:["켜","열","해제","언뮤트","unmute","활성","가능","켜줘","켜라","켜줬"],
  all:["모두","전원","전부","전체","싹다","싸그리","all","다같이","다"],
  move:["이동","옮겨","무브","보내","이사","이송","이관","이동시켜","옮겨줘","데려가","데려다","이동처리","이동진행","이동해"],
  here:["여기","현재","지금","이곳","현채널","현 보이스","내자리"],
  ppl:["유저들","인원","사람들","전부","모두","전체","참가자","멤버들"],
  give:["지급","줘","드려","부여","넣어","삽입","추가","부여해","부여해줘","부여시켜","부여시키"],
  take:["해제","취소","빼","삭제","회수","제거","빼줘","없애","뺏어","박탈"],
  ban:["차단","제한","서버 차단","서버 제한","이용 제한","금지","금지해","블락","밴","밴해","밴시켜"]
};
function hasAny(content,arr){const c=stripKoPost(content);return arr.some(w=>c.includes(stripKoPost(w)))}
function parseIntent(text){
  const t=stripKoPost(text);
  const isMic=hasAny(t,kw.mic);
  const isSpk=hasAny(t,kw.spk);
  const actOff=hasAny(t,kw.off);
  const actOn=hasAny(t,kw.on);
  const isMove=hasAny(t,kw.move);
  const isAll=hasAny(t,kw.all)||hasAny(t,kw.ppl);
  const isHere=hasAny(t,kw.here);
  const isGive=hasAny(t,kw.give);
  const isTake=hasAny(t,kw.take);
  const isBan=hasAny(t,kw.ban);
  return {isMic,isSpk,actOff,actOn,isMove,isAll,isHere,isGive,isTake,isBan};
}
async function findMembers(guild,terms,max=5){
  const all=[...guild.members.cache.values()];
  const out=[];
  for(const term of terms){
    if(!term) continue;
    const mentionId=(term.match(/<@!?(\d+)>/)||[])[1];
    if(mentionId){const m=guild.members.cache.get(mentionId);if(m) out.push(m);continue;}
    const best=pickBest(all,m=>[m.displayName,m.user?.username,m.nickname].filter(Boolean).join(" "),term,0.5,1);
    if(best) out.push(best);
  }
  return uniq(out).slice(0,max);
}
async function findVoiceChannels(guild,terms,max=5){
  const vcs=[...guild.channels.cache.values()].filter(c=>c?.type===ChannelType.GuildVoice);
  const out=[];
  for(const term of terms){
    if(!term) continue;
    const id=(term.match(/<#?(\d+)>/)||[])[1];
    if(id){const ch=guild.channels.cache.get(id);if(ch&&ch.type===ChannelType.GuildVoice) out.push(ch);continue;}
    const best=pickBest(vcs,c=>[c.name].join(" "),term,0.5,1);
    if(best) out.push(best);
  }
  return uniq(out).slice(0,max);
}
async function findCategories(guild,terms,max=5){
  const cats=[...guild.channels.cache.values()].filter(c=>c?.type===ChannelType.GuildCategory);
  const out=[];
  for(const term of terms){
    if(!term) continue;
    const id=(term.match(/<#?(\d+)>/)||[])[1];
    if(id){const ch=guild.channels.cache.get(id);if(ch&&ch.type===ChannelType.GuildCategory) out.push(ch);continue;}
    const best=pickBest(cats,c=>[c.name].join(" "),term,0.5,1);
    if(best) out.push(best);
  }
  return uniq(out).slice(0,max);
}
async function findRoles(guild,terms,max=5){
  const roles=[...guild.roles.cache.values()];
  const out=[];
  for(const term of terms){
    if(!term) continue;
    const id=(term.match(/<@&(\d+)>/)||[])[1];
    if(id){const r=guild.roles.cache.get(id);if(r) out.push(r);continue;}
    const best=pickBest(roles,r=>[r.name].join(" "),term,0.5,1);
    if(best) out.push(best);
  }
  return uniq(out).slice(0,max);
}
function ensureAdmin(interactionOrMessage){
  const m=interactionOrMessage;
  const member=m.member||m.guild?.members?.cache?.get(m.author?.id);
  if(!member) return false;
  const ok = member.roles?.cache?.has(ADMIN_ROLE_ID) || member.permissions?.has(PermissionFlagsBits.Administrator);
  return !!ok;
}
async function setMemberMic(member,on,reason){
  if(!member?.voice?.channelId) return {ok:false,msg:"보이스 채널에 없음"};
  await member.voice.setMute(!on,reason||"");
  return {ok:true};
}
async function setMemberSpk(member,on,reason){
  if(!member?.voice?.channelId) return {ok:false,msg:"보이스 채널에 없음"};
  await member.voice.setDeaf(!on,reason||"");
  return {ok:true};
}
async function bulkMembersFromVoiceChannel(channel){
  if(!channel||channel.type!==ChannelType.GuildVoice) return [];
  return [...channel.members.values()];
}
async function bulkMembersFromCategory(cat){
  if(!cat||cat.type!==ChannelType.GuildCategory) return [];
  const guild=cat.guild;
  const vcs=[...guild.channels.cache.values()].filter(c=>c.parentId===cat.id && c.type===ChannelType.GuildVoice);
  const all=[];
  for(const ch of vcs){all.push(...[...ch.members.values()])}
  return uniq(all);
}
function parseTargets(content){
  const chunks=extractChunks(content);
  return {chunks};
}
async function resolveEntities(guild,author,content){
  const {chunks}=parseTargets(content);
  const members=await findMembers(guild,chunks,20);
  const roles=await findRoles(guild,chunks,10);
  const vcs=await findVoiceChannels(guild,chunks,10);
  const cats=await findCategories(guild,chunks,10);
  return {members,roles,vcs,cats};
}
function pickFirst(arr){return Array.isArray(arr)&&arr.length?arr[0]:null}
function formatNames(arr){return arr.map(x=>x.name||x.displayName||x.user?.username||x.id).join(", ")}
async function handleMicSpk(message,intent,entities){
  const guild=message.guild;
  const on = intent.actOn && !intent.actOff;
  const off = intent.actOff && !intent.actOn;
  const turnOn = on || (!on && !off ? false : false) ? on : false;
  const targetMembers=entities.members.length?entities.members: [];
  const isAll=intent.isAll;
  const here=intent.isHere;
  const res=[];
  if(isAll||(!targetMembers.length&& (entities.vcs.length||entities.cats.length||here))){
    let members=[];
    if(here){
      const me=guild.members.cache.get(message.author.id);
      if(me?.voice?.channel){members=await bulkMembersFromVoiceChannel(me.voice.channel)}
    }
    if(!members.length&&entities.vcs.length){for(const ch of entities.vcs){const xs=await bulkMembersFromVoiceChannel(ch);members.push(...xs)}}
    if(!members.length&&entities.cats.length){for(const ca of entities.cats){const xs=await bulkMembersFromCategory(ca);members.push(...xs)}}
    const targets=uniq(members);
    for(const m of targets){
      if(intent.isMic){const r=await setMemberMic(m, !intent.actOff, "godbot mic");res.push(r)}
      if(intent.isSpk){const r=await setMemberSpk(m, !intent.actOff, "godbot spk");res.push(r)}
    }
    return res.length?`처리됨: ${targets.length}명`: "대상 없음";
  }else{
    const targets=targetMembers.length?targetMembers.slice(0,20):[];
    if(!targets.length) return "대상 없음";
    for(const m of targets){
      if(intent.isMic){await setMemberMic(m, !intent.actOff, "godbot mic")}
      if(intent.isSpk){await setMemberSpk(m, !intent.actOff, "godbot spk")}
    }
    return `처리됨: ${formatNames(targets)}`;
  }
}
async function handleMove(message,intent,entities){
  const guild=message.guild;
  const dest = pickFirst(entities.vcs);
  if(!dest) return "이동 대상 채널을 찾지 못함";
  let sources=[];
  const here=intent.isHere;
  if(entities.vcs.length>=2){
    const src=entities.vcs[0].id===dest.id?entities.vcs[1]:entities.vcs[0];
    sources=[...src.members.values()];
  }else if(here){
    const me=guild.members.cache.get(message.author.id);
    if(me?.voice?.channel) sources=[...me.voice.channel.members.values()];
  }else if(entities.members.length){
    sources=[...entities.members];
  }else{
    const me=guild.members.cache.get(message.author.id);
    if(me?.voice?.channel) sources=[...me.voice.channel.members.values()];
  }
  sources=uniq(sources).filter(m=>m?.voice?.channelId);
  if(!sources.length) return "이동할 유저가 없음";
  for(const m of sources){await m.voice.setChannel(dest,"godbot move")}
  return `이동 완료: ${sources.length}명 → ${dest.name}`;
}
async function handleRole(message,intent,entities){
  const guild=message.guild;
  const members=entities.members.length?entities.members.slice(0,10):[];
  const roles=entities.roles.length?entities.roles.slice(0,10):[];
  let banMode=false;
  if(intent.isBan){banMode=true}
  if(banMode && !roles.find(r=>r.id===BAN_ROLE_ID)){const r=guild.roles.cache.get(BAN_ROLE_ID);if(r) roles.unshift(r)}
  if(!members.length) return "대상 유저 없음";
  if(!roles.length) return "대상 역할 없음";
  const give=intent.isGive||banMode;
  const take=intent.isTake&&!banMode;
  if(!give&&!take) return "역할 처리 동사 없음";
  for(const m of members){
    for(const r of roles){
      if(give){if(!m.roles.cache.has(r.id)) await m.roles.add(r,"godbot role add")}
      if(take){if(m.roles.cache.has(r.id)) await m.roles.remove(r,"godbot role remove")}
    }
  }
  if(give) return `역할 지급 완료: ${formatNames(members)} ← ${roles.map(r=>r.name).join(", ")}`;
  if(take) return `역할 해제 완료: ${formatNames(members)} × ${roles.map(r=>r.name).join(", ")}`;
  return "완료";
}
function wantsMicOrSpk(intent){return (intent.isMic||intent.isSpk) && (intent.actOn||intent.actOff||true)}
function wantsMove(intent){return intent.isMove}
function wantsRole(intent){return intent.isGive||intent.isTake||intent.isBan}
function isGodCall(content){return n(content).startsWith(n(TRIGGER))}
async function processMessage(message){
  if(!message?.guild || message.author?.bot) return;
  if(!isGodCall(message.content)) return;
  if(!ensureAdmin(message)){try{await message.reply({content:"당신은 '갓봇 마스터'가 아니기 때문에 갓봇을 부를 수 없습니다.",allowedMentions:{repliedUser:false}})}catch(e){} return}
  const text=message.content.slice(message.content.indexOf(TRIGGER)+TRIGGER.length).trim();
  const intent=parseIntent(text);
  const entities=await resolveEntities(message.guild,message.author,text);
  if(wantsMicOrSpk(intent)){
    const r=await handleMicSpk(message,intent,entities);
    try{await message.reply({content:r,allowedMentions:{repliedUser:false}})}catch(e){}
    return;
  }
  if(wantsMove(intent)){
    const r=await handleMove(message,intent,entities);
    try{await message.reply({content:r,allowedMentions:{repliedUser:false}})}catch(e){}
    return;
  }
  if(wantsRole(intent)){
    const r=await handleRole(message,intent,entities);
    try{await message.reply({content:r,allowedMentions:{repliedUser:false}})}catch(e){}
    return;
  }
  try{await message.reply({content:"무엇을 도와줄까?",allowedMentions:{repliedUser:false}})}catch(e){}
}
function initGodbotNLP(client){
  client.on("messageCreate",processMessage);
}
module.exports={ initGodbotNLP };
