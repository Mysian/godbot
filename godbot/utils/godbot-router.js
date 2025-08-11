const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function loadJson(p,def){ try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch{return def;} }
function saveJson(p,data){ fs.writeFileSync(p, JSON.stringify(data,null,2)); }

const DATA_DIR = path.join(__dirname,'../data');
ensureDir(DATA_DIR);
const MAP_PATH = path.join(DATA_DIR,'godbot-map.json');

const DEFAULT_MAP = {
  commandKeywords:{},
  optionKeywords:{},
  general:{
    changeVerbs:["바꿔","바꿔줘","변경","수정","rename","set"],
    nicknameWords:["닉네임","별명","이름"],
    moveVerbs:["옮겨","옮겨줘","이동","보내","보내줘","이사"],
    moveAllWords:["전부","모두","전체","다","여기","이 방"],
    kickVerbs:["내보내","내보내줘","강퇴","추방","킥"],
    roleWords:["역할","롤","role"],
    addRoleVerbs:["넣어","넣어줘","줘","부여","추가"],
    removeRoleVerbs:["빼","빼줘","제거","삭제","회수"],
    micWords:["마이크","mic","음소거"],
    muteVerbs:["꺼","꺼줘","음소거","mute"],
    unmuteVerbs:["켜","켜줘","해제","unmute"],
    headsetWords:["헤드셋","헤드폰","청취","이어폰","deaf"],
    deafenVerbs:["꺼","꺼줘","막아","deafen"],
    undeafenVerbs:["켜","켜줘","해제","undeafen"],
    moneyWords:["돈","정수","코인","포인트","점수","수당"],
    giveVerbs:["지급","줘","더해","추가","보상","페이","pay"]
  }
};

function levenshtein(a,b){
  if(a===b) return 0;
  const al=a.length, bl=b.length;
  if(al===0) return bl; if(bl===0) return al;
  const v0=new Array(bl+1), v1=new Array(bl+1);
  for(let i=0;i<=bl;i++) v0[i]=i;
  for(let i=0;i<al;i++){
    v1[0]=i+1;
    for(let j=0;j<bl;j++){
      const cost=a[i]===b[j]?0:1;
      v1[j+1]=Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
    }
    for(let j=0;j<=bl;j++) v0[j]=v1[j];
  }
  return v1[bl];
}
function sim(a,b){
  a=(a||'').toLowerCase(); b=(b||'').toLowerCase();
  const d=levenshtein(a,b), m=Math.max(a.length,b.length)||1;
  return 1 - d/m;
}

function normalizeSpaces(s){ return (s||'').replace(/\s+/g,' ').trim(); }
function plain(content){ return normalizeSpaces(content.replace(/[^\p{L}\p{N}\s]/gu,' ')); }
function pickLongestMatch(content, names){
  let best=null, bestLen=0;
  for(const name of names){ if(!name) continue;
    if(content.includes(name) && name.length>bestLen){ best=name; bestLen=name.length; }
  }
  return best;
}

function parseKoreanNumber(text){
  if(!text) return null;
  let t = text.replace(/,/g,'').toLowerCase();
  let match = t.match(/([-+]?\d*\.?\d+)\s*(천|만|억|조|k|m|b)?/);
  if(!match) return null;
  let n = parseFloat(match[1]);
  const unit = match[2];
  const mul = unit==='천'?1e3: unit==='만'?1e4: unit==='억'?1e8: unit==='조'?1e12:
              unit==='k'?1e3: unit==='m'?1e6: unit==='b'?1e9: 1;
  return Math.round(n*mul);
}
function extractAllNumbersK(text){
  const out=[];
  const re=/([-+]?\d*\.?\d+)\s*(천|만|억|조|k|m|b)?/gi;
  let m; while((m=re.exec(text))!==null){
    const v=parseKoreanNumber(m[0]);
    if(v!==null) out.push(v);
  }
  return out;
}

function includesAny(text, arr){ return (arr||[]).some(k=> text.includes(k)); }

async function findVoiceChannelBySubstring(guild, content){
  const vcs = guild.channels.cache.filter(c=>c.type===ChannelType.GuildVoice);
  const names = vcs.map(c=>c.name);
  const matched = pickLongestMatch(content, names);
  if(!matched) return null;
  return vcs.find(c=>c.name===matched) || null;
}
function findRoleBySubstring(guild, content){
  const roles = [...guild.roles.cache.values()].filter(r=>!r.managed);
  const names = roles.map(r=>r.name);
  const matched = pickLongestMatch(content, names);
  if(!matched) return null;
  return roles.find(r=>r.name===matched) || null;
}
function findMemberFromContent(guild, message, content){
  if (message.mentions.members && message.mentions.members.size>0) return message.mentions.members.first();
  const members = guild.members.cache;
  let candidates = [];
  for(const m of members.values()){
    const name = (m.displayName || m.user.username || '').trim();
    if(!name) continue;
    if(content.includes(name)) candidates.push({m, len:name.length});
  }
  if(candidates.length===0) return null;
  candidates.sort((a,b)=>b.len-a.len);
  return candidates[0].m;
}
async function changeNickname(member, newNick){
  const target=newNick?.trim();
  if(!target) throw new Error('닉네임 없음');
  await member.setNickname(target.slice(0,32));
}
async function moveMemberToChannel(member, channel){
  if(!member?.voice?.channelId) throw new Error('음성채널 미접속');
  if(!channel) throw new Error('대상 채널 없음');
  if(member.voice.channelId===channel.id) return 'same';
  await member.voice.setChannel(channel);
  return 'ok';
}
async function massMoveFromMemberChannel(invoker, targetChannel){
  if(!invoker?.voice?.channel) throw new Error('호출자 음성채널 미접속');
  if(!targetChannel) throw new Error('대상 채널 없음');
  const from=invoker.voice.channel;
  const members=[...from.members.values()];
  let moved=0, skipped=0;
  for(const mem of members){
    try{
      if(mem.voice.channelId===targetChannel.id){ skipped++; continue; }
      await mem.voice.setChannel(targetChannel);
      moved++; await new Promise(r=>setTimeout(r,350));
    }catch{ skipped++; }
  }
  return {moved, skipped, from: from.name, to: targetChannel.name};
}
async function muteOrUnmute(member,on){
  if(!member?.voice) throw new Error('음성 상태 없음');
  await member.voice.setMute(on);
}
async function deafenOrUndeafen(member,on){
  if(!member?.voice) throw new Error('음성 상태 없음');
  await member.voice.setDeaf(on);
}
async function kickFromVoice(target){
  if(!target?.voice?.channelId) throw new Error('대상 음성 미접속');
  if(typeof target.voice.disconnect==='function'){ await target.voice.disconnect(); }
  else { await target.voice.setChannel(null).catch(()=>{ throw new Error('권한 또는 API 제한'); }); }
}

function extractQuoted(content){
  const q = content.match(/[“”"']([^"']+)[“”"']/);
  return q ? q[1].trim() : null;
}
function extractNickname(content){
  const inQuote = extractQuoted(content);
  if(inQuote) return inQuote;
  const m = content.match(/닉네임[은를을 ]*\s*([^ \n]+)\s*로/);
  if(m && m[1]) return m[1].trim();
  const m2 = content.match(/를\s*([^ \n]+)\s*로\s*(바꿔|변경|수정)/);
  if(m2 && m2[1]) return m2[1].trim();
  return null;
}

function canUse(member, roleId){
  if(!member) return false;
  if(!roleId) return true;
  if(member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.has(roleId);
}

function loadMap(){ return loadJson(MAP_PATH, DEFAULT_MAP); }
function saveMap(m){ saveJson(MAP_PATH, m); }

function tokenizeK(text){
  const stop=["갓봇","갓봇아","갓봇님","좀","좀만","좀만요","좀요","나","내","나한테","에게","한테","좀만","좀만","좀더","해줘","해주세요","시켜줘","시켜","줘","좀만줘","좀줘","이거","그거","저거","을","를","은","는","이","가","과","와","으로","로","에서","에게","한테","주세요"];
  const toks = plain(text).split(' ').filter(Boolean).filter(t=>!stop.includes(t));
  return toks;
}

function scanCommands(commandsDir){
  const result=[];
  function walk(dir){
    for(const f of fs.readdirSync(dir)){
      const p=path.join(dir,f);
      const st=fs.statSync(p);
      if(st.isDirectory()) walk(p);
      else if(st.isFile() && f.endsWith('.js')){
        try{
          const mod = require(p);
          const exp = mod?.default || mod;
          let meta = null;
          if(exp?.data && typeof exp.data.toJSON==='function'){
            const j = exp.data.toJSON();
            meta = {
              name: j.name,
              description: j.description || '',
              options: j.options || [],
              path:p,
              execute: exp.execute || exp.run || null,
              handleNlp: exp.handleNlp || exp.runNlp || null,
              aliases: exp.aliases || []
            };
          }else{
            const name = exp?.name || exp?.commandName || path.basename(f,'.js');
            meta = {
              name, description: exp?.description || '', options: exp?.options || [],
              path:p, execute: exp?.execute || exp?.run || null,
              handleNlp: exp?.handleNlp || exp?.runNlp || null,
              aliases: exp?.aliases || []
            };
          }
          if(meta?.name) result.push(meta);
        }catch(e){ /* skip broken */ }
      }
    }
  }
  try{ walk(commandsDir); }catch{ }
  return result;
}

function buildIndex(cmds, map){
  const idx=new Map();
  for(const c of cmds){
    const key=c.name;
    const keywords = new Set([c.name, ...(c.aliases||[])]);
    const extra = map.commandKeywords?.[key]||[];
    for(const w of extra) keywords.add(w);
    const fromDesc = (c.description||'').split(/[,\s/·\|\-]+/).filter(Boolean).slice(0,8);
    fromDesc.forEach(w=>keywords.add(w));
    idx.set(key,{...c, keywords:[...keywords]});
  }
  return idx;
}

function scoreCommand(msgTokens, cmd, map){
  let s=0;
  for(const t of msgTokens){
    for(const k of cmd.keywords) s=Math.max(s, sim(t,k));
    if(cmd.name && t.includes(cmd.name)) s+=0.2;
  }
  if(s>1) s=1;
  return s;
}

function parseTargets(message, content){
  const guild=message.guild;
  const member = content.includes('나')||content.includes('내') ? message.member : (findMemberFromContent(guild, message, content) || message.member);
  const voiceTargetPromise = findVoiceChannelBySubstring(guild, content);
  const role = findRoleBySubstring(guild, content);
  const numbers = extractAllNumbersK(content);
  return {member, role, numbers, voiceTargetPromise};
}

function buildOptionBag(cmd, parsed, content){
  const bag = new Map();
  const optList = cmd.options || [];
  for(const opt of optList){
    const type = opt.type; // 3:String 4:Integer 10:Number 6:User 7:Channel 8:Role 5:Boolean
    const name = opt.name;
    if(type===6){ bag.set(name, parsed.member?.user || null); continue; }
    if(type===8){ bag.set(name, parsed.role || null); continue; }
    if(type===7){ /* 채널은 아래에서 주입 */ continue; }
    if(type===4||type===10){
      const v = parsed.numbers[0]??null;
      bag.set(name, v);
      continue;
    }
    if(type===5){
      const v = /(켜|on|true|활성)/i.test(content) ? true : (/(꺼|off|false|비활성)/i.test(content)?false:null);
      bag.set(name, v);
      continue;
    }
    if(type===3){
      const q = extractQuoted(content);
      bag.set(name, q || content);
      continue;
    }
  }
  return bag;
}

function makeFakeOptions(bag, channelVal){
  const store = new Map(bag);
  if(channelVal){ for(const [k,v] of store){} }
  return {
    getString:(n)=> store.get(n)??null,
    getInteger:(n)=> store.get(n)??null,
    getNumber:(n)=> store.get(n)??null,
    getUser:(n)=> store.get(n)??null,
    getRole:(n)=> store.get(n)??null,
    getChannel:(n)=> channelVal || store.get(n) || null,
    getBoolean:(n)=> store.get(n)??null
  };
}

function makeFakeInteraction(message, client, cmdName, optionsBag){
  let lastMessage=null;
  const chan = message.channel;
  return {
    client,
    guild: message.guild,
    channel: chan,
    user: message.author,
    member: message.member,
    commandName: cmdName,
    createdTimestamp: Date.now(),
    options: optionsBag,
    deferred:false,
    replied:false,
    isChatInputCommand:()=>true,
    reply: async (payload)=>{
      let toSend = payload;
      if(typeof payload === 'object' && payload !== null){
        if(payload.content || payload.embeds || payload.files || payload.components) toSend = payload;
        else toSend = { content: '✅ 처리됨' };
      }
      lastMessage = await chan.send(toSend);
      return lastMessage;
    },
    deferReply: async ()=>{ return; },
    followUp: async (payload)=>{ return await chan.send(payload); },
    editReply: async (payload)=>{ if(lastMessage) return await lastMessage.edit(payload); return; },
    fetchReply: async ()=> lastMessage
  };
}

async function runBuiltin(message, map){
  const c = normalizeSpaces(message.content);
  const g = map.general;

  if(includesAny(c, g.nicknameWords) && includesAny(c, g.changeVerbs)){
    const name = extractNickname(c) || extractQuoted(c);
    await changeNickname(message.member, name);
    await message.reply(`닉네임 변경: ${name}`);
    return true;
  }
  if(includesAny(c, g.moveAllWords) && includesAny(c, g.moveVerbs)){
    const target = await findVoiceChannelBySubstring(message.guild, c);
    const res = await massMoveFromMemberChannel(message.member, target);
    await message.reply(`전체이동: ${res.from} → ${res.to} | ${res.moved}명 이동, ${res.skipped}명 스킵`);
    return true;
  }
  if(includesAny(c, g.moveVerbs)){
    const target = await findVoiceChannelBySubstring(message.guild, c);
    const r = await moveMemberToChannel(message.member, target);
    await message.reply(r==='same'?`이미 ${target?.name}에 있어.`:`이동: ${target?.name}`);
    return true;
  }
  if(includesAny(c, g.micWords) && includesAny(c, g.muteVerbs)){ await muteOrUnmute(message.member,true); await message.reply('마이크 음소거'); return true; }
  if(includesAny(c, g.micWords) && includesAny(c, g.unmuteVerbs)){ await muteOrUnmute(message.member,false); await message.reply('마이크 해제'); return true; }
  if(includesAny(c, g.headsetWords) && includesAny(c, g.deafenVerbs)){ await deafenOrUndeafen(message.member,true); await message.reply('청취 비활성'); return true; }
  if(includesAny(c, g.headsetWords) && includesAny(c, g.undeafenVerbs)){ await deafenOrUndeafen(message.member,false); await message.reply('청취 해제'); return true; }
  if(includesAny(c, g.roleWords) && includesAny(c, g.addRoleVerbs)){ const role=findRoleBySubstring(message.guild,c); if(!role) throw new Error('역할 없음'); await message.member.roles.add(role); await message.reply(`역할 추가: ${role.name}`); return true; }
  if(includesAny(c, g.roleWords) && includesAny(c, g.removeRoleVerbs)){ const role=findRoleBySubstring(message.guild,c); if(!role) throw new Error('역할 없음'); await message.member.roles.remove(role); await message.reply(`역할 제거: ${role.name}`); return true; }
  if(includesAny(c, g.kickVerbs)){ const tm=findMemberFromContent(message.guild,message,c); if(!tm) throw new Error('대상 없음'); await kickFromVoice(tm); await message.reply(`음성 강퇴: ${tm.displayName||tm.user.username}`); return true; }

  return false;
}

function handleTrainingText(msg, map, index){
  const t = normalizeSpaces(msg.content);
  if(!t.startsWith('갓봇')) return false;
  let m = t.match(/갓봇\s+학습\s+보기\s+([^\s]+)/);
  if(m){
    const cmd=m[1]; const k=map.commandKeywords?.[cmd]||[]; const opt=map.optionKeywords?.[cmd]||{};
    msg.reply(`명령어:${cmd}\n키워드:${k.join(', ')||'-'}\n옵션키:${Object.keys(opt).length?JSON.stringify(opt):'-'}`);
    return true;
  }
  m = t.match(/갓봇\s+학습\s+명령어\s+([^\s]+)\s+키워드\s+(.+)/);
  if(m){
    const cmd=m[1]; const words=m[2].split(/[,\s]+/).filter(Boolean);
    map.commandKeywords[cmd]=Array.from(new Set([...(map.commandKeywords[cmd]||[]), ...words]));
    saveMap(map); msg.reply(`학습 완료: ${cmd} ← ${words.join(', ')}`);
    return true;
  }
  m = t.match(/갓봇\s+학습\s+옵션\s+([^\s]+)\s+([^\s]+)\s+(.+)/);
  if(m){
    const cmd=m[1], opt=m[2], words=m[3].split(/[,\s]+/).filter(Boolean);
    map.optionKeywords[cmd]=map.optionKeywords[cmd]||{};
    map.optionKeywords[cmd][opt]=Array.from(new Set([...(map.optionKeywords[cmd][opt]||[]), ...words]));
    saveMap(map); msg.reply(`옵션 학습: ${cmd}.${opt} ← ${words.join(', ')}`);
    return true;
  }
  if(/갓봇\s+학습\s+리빌드/.test(t)){
    index.__needsRebuild = true;
    msg.reply('명령 인덱스 리빌드 예약됨');
    return true;
  }
  m = t.match(/갓봇\s+학습\s+제거\s+명령어\s+([^\s]+)\s+(.+)/);
  if(m){
    const cmd=m[1], word=m[2].trim();
    map.commandKeywords[cmd]=(map.commandKeywords[cmd]||[]).filter(w=>w!==word);
    saveMap(map); msg.reply(`학습 제거: ${cmd} - ${word}`);
    return true;
  }
  m = t.match(/갓봇\s+학습\s+제거\s+옵션\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/);
  if(m){
    const cmd=m[1], opt=m[2], word=m[3];
    map.optionKeywords[cmd]=map.optionKeywords[cmd]||{};
    map.optionKeywords[cmd][opt]=(map.optionKeywords[cmd][opt]||[]).filter(w=>w!==word);
    saveMap(map); msg.reply(`옵션 키워드 제거: ${cmd}.${opt} - ${word}`);
    return true;
  }
  return false;
}

async function tryRouteToSlash(message, client, indexObj, map){
  const content = plain(message.content).replace(/^갓봇(아|님)?\s*/,'').trim();
  const tokens = tokenizeK(content);
  const cmds = indexObj.list;
  let best=null, bestScore=0;
  for(const c of cmds){
    const s = scoreCommand(tokens, c, map);
    if(s>bestScore){ best=c; bestScore=s; }
  }
  if(!best || bestScore<0.45) return false;

  const parsed = parseTargets(message, content);
  const cmd = best;
  const optionBag = buildOptionBag(cmd, parsed, content);
  const voiceCh = await parsed.voiceTargetPromise;
  const options = makeFakeOptions(optionBag, voiceCh);
  const fake = makeFakeInteraction(message, client, cmd.name, options);

  if(typeof cmd.handleNlp === 'function'){
    await cmd.handleNlp({ message, options, tokens, numbers: parsed.numbers });
    return true;
  }
  if(typeof cmd.execute === 'function'){
    try{
      await cmd.execute(fake);
      return true;
    }catch(e){
      await message.reply('명령 실행 실패: ' + (e?.message||'오류'));
      return true;
    }
  }
  return false;
}

function shouldHandle(msg){
  const c = msg.content||'';
  return /(^|\s)갓봇(아|님|!|,|\s)/.test(c) || c.trim().startsWith('갓봇');
}

function init(client, opts={}){
  const roleId = opts.roleId || '1404486995564167218';
  const commandsDir = opts.commandsDir || path.join(__dirname,'../commands');
  const map = loadMap();

  const indexObj = {
    list: scanCommands(commandsDir).map(c=>c),
    __needsRebuild:false
  };
  const rebuild = ()=>{ indexObj.list = buildIndex(scanCommands(commandsDir), map); indexObj.__needsRebuild=false; };
  rebuild();
  setInterval(()=>{ if(indexObj.__needsRebuild) rebuild(); }, 5000);

  client.on('messageCreate', async (message)=>{
    try{
      if(message.author.bot) return;
      if(!message.guild) return;
      if(!shouldHandle(message)) return;

      if(!canUse(message.member, roleId)){ await message.reply('권한이 없어.'); return; }

      if(handleTrainingText(message, map, indexObj)) return;

      try{
        const builtinDone = await runBuiltin(message, map);
        if(builtinDone) return;
      }catch(e){ await message.reply('실패: ' + (e?.message||'오류')); return; }

      const ok = await tryRouteToSlash(message, client, indexObj, map);
      if(ok) return;

      await message.reply('무슨 명령인지 확신이 없어. "갓봇 학습 명령어 [이름] 키워드 [단어…]"로 가르쳐줘.');
    }catch(e){
      try{ await message.reply('에러: ' + (e?.message||'오류')); }catch{}
    }
  });
}

module.exports = { init };
