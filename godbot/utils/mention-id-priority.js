const fs = require("fs");
const path = require("path");
const { EmbedBuilder, ChannelType, Collection } = require("discord.js");

const TRIGGER_CHANNEL_ID = "1345775748526510201";
const SOURCE_CHANNEL_IDS = ["1211601490137980988","1202425624061415464"];
const SOURCE_CATEGORY_ID = "1207980297854124032";
const DATA_DIR = path.join(__dirname, "../data");
const COOLDOWN_MS = 2000;

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function norm(s){ return (s||"").replace(/^@+/,"").replace(/\s+/g,"").toLowerCase().trim(); }
function extractAtNames(content){
  if(!content) return [];
  if(content.includes("<@")) return [];
  const out=[]; const re=/(^|\s)@([^\s@#<:][^\s<]*)/g; let m;
  while((m=re.exec(content))!==null){ let t=m[2]||""; t=t.replace(/[.,!?…，。！？]+$/g,""); if(t.length) out.push(t); }
  return [...new Set(out)].slice(0,10);
}
function bestScoreForToken(token,names){
  const q=norm(token); if(!q) return 0;
  let best=0;
  for(const name of names){
    const k=norm(name); if(!k) continue;
    if(k===q){ if(100>best) best=100; if(best===100) break; }
    else if(k.startsWith(q)){ if(90>best) best=90; }
    else if(k.includes(q)){ if(75>best) best=75; }
  }
  return best;
}
async function getOrderedSourceChannels(guild){
  const arr=[];
  for(const id of SOURCE_CHANNEL_IDS){
    const ch=guild.channels.cache.get(id);
    if(ch && ch.type===ChannelType.GuildText) arr.push(ch);
  }
  const cat=guild.channels.cache.get(SOURCE_CATEGORY_ID);
  if(cat && cat.type===ChannelType.GuildCategory){
    const children=[...guild.channels.cache.filter(c=>c.parentId===cat.id && c.type===ChannelType.GuildText).values()]
      .sort((a,b)=>a.rawPosition-b.rawPosition);
    for(const ch of children){
      if(!arr.find(x=>x.id===ch.id)) arr.push(ch);
    }
  }
  return arr;
}
function pickWinner(candidates){
  candidates.sort((a,b)=>b.score-a.score);
  const seen=new Set(); const out=[];
  for(const c of candidates){ if(seen.has(c.id)) continue; seen.add(c.id); out.push(c); if(out.length>=3) break; }
  return out;
}
function buildEmbed(guild,map){
  const eb=new EmbedBuilder().setTitle("사용자 ID 조회 결과").setColor(0x5865F2).setTimestamp(new Date()).setFooter({text:guild?.name||""});
  const lines=[];
  for(const [token,res] of map){
    if(!res || res.length===0){ lines.push(`• @${token} → 일치 없음`); continue; }
    const best=res[0];
    const others=res.slice(1).map(x=>`<@${x.id}> (${x.id})`).join(", ");
    if(others.length) lines.push(`• @${token} → <@${best.id}> (${best.id}) | 후보: ${others}`);
    else lines.push(`• @${token} → <@${best.id}> (${best.id})`);
  }
  eb.addFields({name:"결과",value:lines.join("\n").slice(0,1024)||"없음"});
  return eb;
}
async function scanChannelForTokens(channel,tokens,resolved){
  const unresolved=new Set(tokens.filter(t=>!resolved.has(t)));
  if(unresolved.size===0) return;
  let lastId=undefined;
  for(;;){
    const batch=await channel.messages.fetch({limit:100,before:lastId}).catch(()=>new Collection());
    if(!batch || batch.size===0) break;
    for(const [,msg] of batch){
      const u=msg.author;
      const names=new Set([u?.username||"",u?.globalName||"",msg.member?.displayName||msg.member?.nickname||""]);
      for(const t of [...unresolved]){
        const score=bestScoreForToken(t,names);
        if(score>0){
          const prev=resolved.get(t)||[];
          prev.push({id:u.id,score});
          resolved.set(t,prev);
          if(score===100) unresolved.delete(t);
        }
      }
      if(unresolved.size===0) break;
    }
    if(unresolved.size===0) break;
    lastId=batch.last()?.id;
    if(!lastId) break;
  }
  for(const t of [...resolved.keys()]){
    const list=resolved.get(t)||[];
    if(list.length) resolved.set(t,pickWinner(list));
  }
}
module.exports=function(client){
  const cooldown=new Set();
  client.on("messageCreate",async message=>{
    try{
      if(message.author.bot) return;
      if(message.channelId!==TRIGGER_CHANNEL_ID) return;
      const tokens=extractAtNames(message.content);
      if(tokens.length===0) return;
      if(cooldown.has(message.id)) return;
      const guild=message.guild;
      const sources=await getOrderedSourceChannels(guild);
      const resolved=new Map();
      for(const ch of sources){
        const pending=tokens.filter(t=>!resolved.has(t));
        if(pending.length===0) break;
        await scanChannelForTokens(ch,pending,resolved);
      }
      const eb=buildEmbed(guild,resolved);
      cooldown.add(message.id);
      await message.reply({embeds:[eb]}).catch(()=>{});
      setTimeout(()=>cooldown.delete(message.id),COOLDOWN_MS);
    }catch{}
  });
};
