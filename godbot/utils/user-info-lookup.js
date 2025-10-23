const { EmbedBuilder, ChannelType, Collection, PermissionsBitField } = require('discord.js');

function trim(s){return (s??'').toString().trim()}
function tokens(content){return content.split(/\n|,|\/|\||\s{2,}/g).map(t=>trim(t)).filter(Boolean).slice(0,4)}
function score(member,q){const dn=trim(member.displayName).toLowerCase(),un=trim(member.user?.username).toLowerCase(),qq=q.toLowerCase();let s=0;if(dn===qq)s+=100;if(un===qq)s+=100;if(dn.startsWith(qq))s+=40;if(un.startsWith(qq))s+=40;if(dn.includes(qq))s+=20;if(un.includes(qq))s+=20;return s}

async function checkChannelPerms(me, channel, needs){
  if(!channel) return { ok:false, missing:['CHANNEL_NOT_FOUND'] };
  const perms = channel.permissionsFor(me);
  if(!perms) return { ok:false, missing:['NO_PERMISSION_OBJECT'] };
  const missing = needs.filter(p => !perms.has(p));
  return { ok: missing.length===0, missing };
}

async function findMember(guild, raw){
  const id=(raw.match(/\d{15,25}/)||[])[0];
  if(id){try{const m=await guild.members.fetch(id);if(m)return m;}catch{}try{const u=await guild.client.users.fetch(id);if(u)return{user:u,id:u.id,partialUserOnly:true}}catch{}}
  const mention=raw.match(/<@!?(\d{15,25})>/); if(mention){try{const m=await guild.members.fetch(mention[1]); if(m) return m;}catch{}}
  const qs=tokens(raw).filter(t=>t.length>=2); if(qs.length===0) return null;
  let best=null,bestScore=0;
  for(const q of qs){
    for(const m of guild.members.cache.values()){const sc=score(m,q); if(sc>bestScore){best=m;bestScore=sc}}
    if(bestScore>=100) return best;
    try{const found=await guild.members.search({query:q,limit:10});found.forEach(m=>{const sc=score(m,q); if(sc>bestScore){best=m;bestScore=sc}}); if(bestScore>=100) return best;}catch{}
  }
  return best;
}

function extractText(msg){
  let t=''; if(msg.content) t+=msg.content+'\n';
  if(msg.embeds&&msg.embeds.length){for(const e of msg.embeds){if(e.title)t+=e.title+'\n'; if(e.description)t+=e.description+'\n'; if(e.fields&&e.fields.length){for(const f of e.fields){t+=`${f.name}\n${f.value}\n`}} if(e.footer?.text)t+=e.footer.text+'\n';}}
  return t;
}
function pick(re,text){const m=re.exec(text); return m?trim(m[1]):null}
function parseApproval(text){
  const o={};
  o.userIdFromMention=pick(/<@!?(\d{15,25})>/,text);
  o.userIdFromTarget=pick(/대상유저\s*=\s*.*?\((\d{15,25})\)/,text);
  o.nickname=pick(/닉네임\s*[:=]\s*([^\n]+)/,text);
  o.birthYear=pick(/출생년도\s*[:=]\s*([0-9]{4})/,text);
  o.gender=pick(/성별\s*[:=]\s*([^\n]+)/,text);
  o.referrer=pick(/추천인\s*[:=]\s*([^\n]+)/,text);
  o.ingress=pick(/(가입 경로|유입경로)\s*[:=]\s*([^\n]+)/,text)||null;
  o.playstyle=pick(/플레이스타일\s*[:=]\s*([^\n]+)/,text);
  o.gameChosen=pick(/선택\s*=\s*([^\n]+)/,text);
  o.gameRoles=pick(/부여된역할\s*=\s*([^\n]+)/,text);
  o.alertTags=pick(/알림 태그[\s\S]*?설정\s*=\s*([^\n]+)/,text);
  o.log_time=pick(/시간\s*=\s*([^\n]+)/,text);
  o.log_actor=pick(/처리자\s*=\s*([^\n]+)/,text);
  o.log_target=pick(/대상유저\s*=\s*([^\n]+)/,text);
  o.log_silent=pick(/조용히승인\s*=\s*([^\n]+)/,text);
  o.log_alt=pick(/부계정여부\s*=\s*([^\n]+)/,text);
  o.hist_reject=pick(/거절\s*=\s*([0-9]+회)/,text);
  o.hist_join=pick(/총입장\s*=\s*([0-9]+회)/,text);
  o.hist_leave=pick(/총퇴장\s*=\s*([0-9]+회)/,text);
  o.hist_click=pick(/클릭(?:\(게임장\))?\s*=\s*([0-9]+회)/,text);
  return o;
}
function matchRecordToUser(parsed, uid, member){
  if(parsed.userIdFromMention===uid) return true;
  if(parsed.userIdFromTarget===uid) return true;
  if(parsed.nickname&&member&&trim(member.displayName)===parsed.nickname) return true;
  return false;
}

async function scanSource(client,guildId,sourceChannelId,uid,member){
  const ch=await client.channels.fetch(sourceChannelId).catch(()=>null);
  if(!ch||ch.guildId!==guildId) return {record:null,parsed:null,reason:'SOURCE_NOT_FOUND',channel:null,perm:{ok:false,missing:['CHANNEL_NOT_FOUND']}};
  const me = ch.guild.members.me;
  const perm = await checkChannelPerms(me, ch, [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]);
  if(!perm.ok) return {record:null,parsed:null,reason:'NO_SOURCE_PERMISSION',channel:ch,perm};
  let before, latest=null, latestParsed=null;
  for(let i=0;i<15;i++){
    const msgs=await ch.messages.fetch({limit:100,before}).catch(()=>new Collection());
    if(!msgs||msgs.size===0) break;
    for(const [,m] of msgs){
      const blob=extractText(m);
      const parsed=parseApproval(blob);
      if(matchRecordToUser(parsed,uid,member)){
        if(!latest||m.createdTimestamp>latest.createdTimestamp){latest={message:m,text:blob}; latestParsed=parsed;}
      }
    }
    before=msgs.lastKey(); if(!before) break;
  }
  return {record:latest,parsed:latestParsed,reason:latest?'OK':'NOT_FOUND',channel:ch,perm};
}

async function lastMessage(guild,uid,channelLimit=40,perChannel=60){
  const channels=guild.channels.cache
    .filter(c=>[ChannelType.GuildText,ChannelType.GuildAnnouncement,ChannelType.GuildMedia].includes(c.type))
    .filter(c=>c.viewable&&c.permissionsFor(guild.members.me)?.has([PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.ReadMessageHistory]))
    .map(c=>c)
    .sort((a,b)=>(b.lastMessageId?BigInt(b.lastMessageId):0n)-(a.lastMessageId?BigInt(a.lastMessageId):0n))
    .slice(0,channelLimit);
  let best=null;
  for(const ch of channels){
    let before;
    for(let i=0;i<Math.ceil(perChannel/100);i++){
      const batch=await ch.messages.fetch({limit:Math.min(100,perChannel-i*100),before}).catch(()=>new Collection());
      if(!batch||batch.size===0) break;
      for(const [,m] of batch){ if(m.author?.id===uid){ if(!best||m.createdTimestamp>best.createdTimestamp) best=m; } }
      before=batch.lastKey(); if(!before) break;
    }
  }
  return best;
}

function baseEmbed(guild,target){
  const user=target.user||target;
  const member=guild.members.cache.get(target.id)||null;
  const roles=member?member.roles.cache.filter(r=>r.id!==guild.id).sort((a,b)=>b.position-a.position).map(r=>`<@&${r.id}>`).slice(0,25).join(' ')||'없음':'길드 미가입';
  const created=`<t:${Math.floor(user.createdTimestamp/1000)}:F> (<t:${Math.floor(user.createdTimestamp/1000)}:R>)`;
  const joined=member&&member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:F> (<t:${Math.floor(member.joinedTimestamp/1000)}:R>)`:'정보 없음';
  const nick=member?.displayName||'정보 없음';
  const booster=member?.premiumSince?`<t:${Math.floor(member.premiumSinceTimestamp/1000)}:F>`:'아님';
  const eb=new EmbedBuilder()
    .setColor(member?.displayHexColor||0x2b2d31)
    .setAuthor({name:`${user.username}#${user.discriminator==='0'?'':user.discriminator}`.trim(),iconURL:user.displayAvatarURL({size:256})})
    .setTitle('유저 정보')
    .addFields(
      {name:'유저',value:`<@${user.id}>`,inline:true},
      {name:'유저 ID',value:user.id,inline:true},
      {name:'닉네임',value:nick,inline:true},
      {name:'계정 생성일',value:created,inline:true},
      {name:'서버 합류일',value:joined,inline:true},
      {name:'부스트',value:booster,inline:true},
      {name:'역할',value:roles,inline:false},
    )
    .setTimestamp(new Date());
  if(member?.avatar) eb.setThumbnail(member.displayAvatarURL({size:256}));
  return eb;
}

function enrichWithParsed(eb, parsed){
  if(!parsed) return eb;
  const prof=[]; if(parsed.nickname) prof.push(`닉네임: ${parsed.nickname}`); if(parsed.birthYear) prof.push(`출생년도: ${parsed.birthYear}`); if(parsed.gender) prof.push(`성별: ${parsed.gender}`); if(parsed.ingress) prof.push(`유입경로: ${parsed.ingress}`); if(parsed.referrer) prof.push(`추천인: ${parsed.referrer}`); if(parsed.playstyle) prof.push(`플레이스타일: ${parsed.playstyle}`); if(prof.length) eb.addFields({name:'프로필',value:prof.join('\n'),inline:false});
  const game=[]; if(parsed.gameChosen) game.push(`선택: ${parsed.gameChosen}`); if(parsed.gameRoles) game.push(`부여된역할: ${parsed.gameRoles}`); if(game.length) eb.addFields({name:'게임 태그',value:game.join('\n'),inline:false});
  if(parsed.alertTags) eb.addFields({name:'알림 태그',value:`설정: ${parsed.alertTags}`,inline:false});
  const hist=[]; if(parsed.hist_reject) hist.push(`거절: ${parsed.hist_reject}`); if(parsed.hist_join) hist.push(`총입장: ${parsed.hist_join}`); if(parsed.hist_leave) hist.push(`총퇴장: ${parsed.hist_leave}`); if(parsed.hist_click) hist.push(`클릭: ${parsed.hist_click}`); if(hist.length) eb.addFields({name:'이력 요약',value:hist.join('\n'),inline:false});
  const log=[]; if(parsed.log_time) log.push(`시간: ${parsed.log_time}`); if(parsed.log_actor) log.push(`처리자: ${parsed.log_actor}`); if(parsed.log_target) log.push(`대상유저: ${parsed.log_target}`); if(parsed.log_alt) log.push(`부계정여부: ${parsed.log_alt}`); if(parsed.log_silent) log.push(`조용히승인: ${parsed.log_silent}`); if(log.length) eb.addFields({name:'입장 승인 로그',value:log.join('\n'),inline:false});
  return eb;
}
function addRecordPreview(eb, record){const preview=record?(record.text.length>1024?record.text.slice(0,1021)+'…':record.text):'해당 채널에서 기록을 찾지 못함'; eb.addFields({name:'기록 채널 최근 기록',value:preview,inline:false})}
function addLastMessage(eb, guild, msg){const value=msg?`채널: <#${msg.channelId}>\n시간: <t:${Math.floor(msg.createdTimestamp/1000)}:F>\n내용: ${msg.content&&trim(msg.content)!==''?(msg.content.length>900?msg.content.slice(0,897)+'…':msg.content):(msg.embeds?.length?'(임베드/첨부 메시지)':'(내용 없음)')}\n링크: https://discord.com/channels/${guild.id}/${msg.channelId}/${msg.id}`:'최근 메시지 없음'; eb.addFields({name:'가장 최근 메시지',value,inline:false})}

let wired=false;
function registerUserInfoLookup(client,{sourceChannelId,triggerChannelId}){
  if(wired) return; wired=true;
  client.on('messageCreate',async(message)=>{
    try{
      if(!message.guild||message.author.bot) return;
      if(triggerChannelId&&message.channelId!==triggerChannelId) return;

      const me = message.guild.members.me;
      const triggerPermCheck = await checkChannelPerms(me, message.channel, [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks
      ]);
      if(!triggerPermCheck.ok){
        const miss = triggerPermCheck.missing.join(', ');
        await message.channel.send(`트리거 채널 권한 부족: ${miss}`);
        return;
      }

      const base=message.mentions.users.first()?.id?`<@${message.mentions.users.first().id}>`:message.content;
      const target=await Promise.race([findMember(message.guild,base),new Promise(r=>setTimeout(()=>r(null),5000))]);
      if(!target){await message.reply('대상 못 찾았어. 맨션/ID/닉네임으로 다시 보내줘.');return;}

      await message.channel.sendTyping();

      const uid=target.id||target.user.id;
      const member=message.guild.members.cache.get(uid)||null;

      const [sourceScan, lastMsg] = await Promise.all([
        scanSource(client,message.guild.id,sourceChannelId,uid,member),
        lastMessage(message.guild,uid,40,80)
      ]);

      let eb=baseEmbed(message.guild,target);
      if(sourceScan.parsed) eb=enrichWithParsed(eb,sourceScan.parsed);
      addRecordPreview(eb, sourceScan.record);
      addLastMessage(eb, message.guild, lastMsg);

      let footerNote=[];
      if(sourceScan.reason==='SOURCE_NOT_FOUND') footerNote.push('기록 채널을 찾지 못함');
      if(sourceScan.reason==='NO_SOURCE_PERMISSION') footerNote.push(`기록 채널 권한 부족: ${sourceScan.perm?.missing?.join(', ')||'확인 불가'}`);
      if(footerNote.length) eb.setFooter({text:footerNote.join(' | ')});

      await message.channel.send({embeds:[eb]});
    }catch(e){
      try{await message.reply('실패: 내부 오류. 봇 콘솔 로그를 확인해줘.');}catch{}
    }
  });
}

module.exports={ registerUserInfoLookup };
