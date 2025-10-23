const { EmbedBuilder, ChannelType, Collection } = require('discord.js');

function trim(s){return (s??'').toString().trim()}
function tokensFrom(content){
  return content.split(/\n|,|\/|\||\s{2,}/g).map(t=>trim(t)).filter(t=>t.length>0)
}
function scoreMatch(member, q){
  const dn=trim(member.displayName).toLowerCase();
  const un=trim(member.user?.username).toLowerCase();
  const qq=q.toLowerCase();
  let s=0;
  if(dn===qq) s+=100;
  if(un===qq) s+=100;
  if(dn.startsWith(qq)) s+=40;
  if(un.startsWith(qq)) s+=40;
  if(dn.includes(qq)) s+=20;
  if(un.includes(qq)) s+=20;
  return s;
}

async function findMemberSmart(guild, raw){
  const idMatch = raw.match(/\d{15,25}/);
  if(idMatch){
    const id=idMatch[0];
    try{const m=await guild.members.fetch(id); if(m) return m;}catch{}
    try{const u=await guild.client.users.fetch(id); if(u) return {user:u,id:u.id,partialUserOnly:true}}catch{}
  }
  const mention=raw.match(/<@!?(\d{15,25})>/);
  if(mention){
    try{const m=await guild.members.fetch(mention[1]); if(m) return m;}catch{}
  }

  const toks=tokensFrom(raw).filter(t=>t.length>=2).slice(0,4);
  if(toks.length===0) return null;

  let best=null, bestScore=0;

  for(const q of toks){
    const cacheHit=[...guild.members.cache.values()].sort((a,b)=>0);
    for(const m of cacheHit){
      const s=scoreMatch(m,q);
      if(s>bestScore){best=m;bestScore=s}
    }
    if(bestScore>=100) return best;

    try{
      const found=await guild.members.search({query:q,limit:10});
      found.forEach(m=>{
        const s=scoreMatch(m,q);
        if(s>bestScore){best=m;bestScore=s}
      });
      if(bestScore>=100) return best;
    }catch{}
  }
  return best;
}

function extractTextFromMessage(msg){
  let t='';
  if(msg.content) t+=msg.content+'\n';
  if(msg.embeds&&msg.embeds.length){
    for(const e of msg.embeds){
      if(e.title) t+=e.title+'\n';
      if(e.description) t+=e.description+'\n';
      if(e.fields&&e.fields.length){
        for(const f of e.fields){t+=`${f.name}\n${f.value}\n`}
      }
      if(e.footer&&e.footer.text) t+=e.footer.text+'\n';
    }
  }
  return t;
}

async function findLatestRecordFromSourceChannel(client,guildId,sourceChannelId,userId){
  const ch=await client.channels.fetch(sourceChannelId).catch(()=>null);
  if(!ch||ch.guildId!==guildId) return null;
  let before, latest=null;
  for(let i=0;i<8;i++){
    const msgs=await ch.messages.fetch({limit:100,before}).catch(()=>new Collection());
    if(!msgs||msgs.size===0) break;
    for(const [,m] of msgs){
      const blob=extractTextFromMessage(m);
      if(blob.includes(userId)){
        if(!latest||m.createdTimestamp>latest.createdTimestamp) latest={message:m,text:blob};
      }
    }
    before=msgs.lastKey();
    if(!before) break;
  }
  return latest;
}

async function fetchLastUserMessageAcrossGuild(guild,userId,channelLimit=35,perChannel=50){
  const channels=guild.channels.cache
    .filter(c=>[ChannelType.GuildText,ChannelType.GuildAnnouncement,ChannelType.GuildMedia].includes(c.type))
    .filter(c=>c.viewable&&c.permissionsFor(guild.members.me).has(['ViewChannel','ReadMessageHistory']))
    .map(c=>c)
    .sort((a,b)=>(b.lastMessageId?BigInt(b.lastMessageId):0n)-(a.lastMessageId?BigInt(a.lastMessageId):0n))
    .slice(0,channelLimit);
  let best=null;
  for(const ch of channels){
    let before;
    for(let i=0;i<Math.ceil(perChannel/100);i++){
      const batch=await ch.messages.fetch({limit:Math.min(100,perChannel-i*100),before}).catch(()=>new Collection());
      if(!batch||batch.size===0) break;
      for(const [,m] of batch){
        if(m.author&&m.author.id===userId){
          if(!best||m.createdTimestamp>best.createdTimestamp) best=m;
        }
      }
      before=batch.lastKey(); if(!before) break;
    }
  }
  return best;
}

function buildInfoEmbed(guild,target,record,lastMsg){
  const user=target.user||target;
  const member=guild.members.cache.get(target.id)||null;
  const roles=member?member.roles.cache.filter(r=>r.id!==guild.id).sort((a,b)=>b.position-a.position).map(r=>`<@&${r.id}>`).slice(0,25).join(' ')||'없음':'길드 미가입';
  const created=`<t:${Math.floor(user.createdTimestamp/1000)}:F> (<t:${Math.floor(user.createdTimestamp/1000)}:R>)`;
  const joined=member&&member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:F> (<t:${Math.floor(member.joinedTimestamp/1000)}:R>)`:'정보 없음';
  const nick=member&&member.displayName?member.displayName:'정보 없음';
  const booster=member&&member.premiumSince?`<t:${Math.floor(member.premiumSinceTimestamp/1000)}:F>`:'아님';
  const recText=record?(record.text.length>1024?record.text.slice(0,1021)+'…':record.text):'해당 채널에서 기록을 찾지 못함';
  const lastMsgField=lastMsg?`채널: <#${lastMsg.channelId}>\n시간: <t:${Math.floor(lastMsg.createdTimestamp/1000)}:F>\n내용: ${lastMsg.content&&trim(lastMsg.content)!==''?(lastMsg.content.length>900?lastMsg.content.slice(0,897)+'…':lastMsg.content):(lastMsg.embeds?.length?'(임베드/첨부 메시지)':'(내용 없음)')}\n링크: https://discord.com/channels/${guild.id}/${lastMsg.channelId}/${lastMsg.id}`:'최근 메시지 없음';
  const eb=new EmbedBuilder()
    .setColor(member&&member.displayHexColor?member.displayHexColor:0x2b2d31)
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
      {name:'기록 채널 최근 기록',value:recText,inline:false},
      {name:'가장 최근 메시지',value:lastMsgField,inline:false}
    )
    .setTimestamp(new Date());
  if(member&&member.avatar) eb.setThumbnail(member.displayAvatarURL({size:256}));
  return eb;
}

let wired=false;
function registerUserInfoLookup(client,{sourceChannelId,triggerChannelId}){
  if(wired) return; wired=true;
  client.on('messageCreate',async(message)=>{
    try{
      if(!message.guild||message.author.bot) return;
      if(triggerChannelId&&message.channelId!==triggerChannelId) return;

      const base = message.mentions.users.first()?.id
        ? `<@${message.mentions.users.first().id}>`
        : message.content;

      const target = await Promise.race([
        findMemberSmart(message.guild, base),
        new Promise(res=>setTimeout(()=>res(null),5000))
      ]);

      if(!target){
        await message.reply('대상을 못 찾았어. 맨션/ID/닉네임 조각으로 다시 입력해줘.');
        return;
      }

      await message.channel.sendTyping();

      const uid = target.id || target.user.id;
      const [record,lastMsg]=await Promise.all([
        findLatestRecordFromSourceChannel(client,message.guild.id,sourceChannelId,uid),
        fetchLastUserMessageAcrossGuild(message.guild,uid,35,80)
      ]);

      const embed=buildInfoEmbed(message.guild,target,record,lastMsg);
      await message.channel.send({embeds:[embed]});
    }catch(e){
      try{await message.reply('조회 중 오류가 발생했어. 권한 또는 채널 설정을 확인해줘.');}catch{}
    }
  });
}

module.exports={ registerUserInfoLookup };
