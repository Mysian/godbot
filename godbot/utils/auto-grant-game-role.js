const { Events } = require("discord.js");
const { ALL_GAMES } = require("../select-game.js");

const CHANNEL_WHITELIST = new Set(["1209147973255036959","1202425624061415464"]);
const EXEMPT_ROLE_IDS = new Set(["786128824365482025","1201856430580432906"]);
const GAME_SET = new Set(ALL_GAMES);

function pickMentionedGameRoles(message, member){
  if(!message.mentions || message.mentions.roles.size===0) return [];
  return message.mentions.roles
    .filter(r => GAME_SET.has(r.name) && !member.roles.cache.has(r.id))
    .map(r => r);
}

function pickContentGameRoles(message, member){
  const content = (message.content || "").trim();
  if(!content) return [];
  const hits = new Set();
  for(const name of GAME_SET){
    if(content === name || content.includes(name)) hits.add(name);
  }
  if(hits.size===0) return [];
  const addables = [];
  for(const name of hits){
    const role = message.guild.roles.cache.find(r => r.name === name);
    if(role && !member.roles.cache.has(role.id)) addables.push(role);
  }
  return addables;
}

function register(client){
  client.on(Events.MessageCreate, async (message) => {
    if(!message.guild || message.author.bot) return;
    if(!CHANNEL_WHITELIST.has(message.channelId)) return;

    const member = await message.guild.members.fetch(message.author.id).catch(()=>null);
    if(!member) return;
    if(member.roles.cache.some(r => EXEMPT_ROLE_IDS.has(r.id))) return;

    const targets = [
      ...pickMentionedGameRoles(message, member),
      ...pickContentGameRoles(message, member)
    ];

    if(targets.length===0) return;

    for(const role of targets){
      await member.roles.add(role).catch(()=>{});
    }
  });
}

module.exports = { register };
