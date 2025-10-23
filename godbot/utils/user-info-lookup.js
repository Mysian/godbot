const { EmbedBuilder, ChannelType, Collection } = require('discord.js');

function normalize(s) {
  if (!s) return '';
  return s.toString().trim();
}

async function findMemberByLooseInput(guild, content) {
  const idMatch = content.match(/\d{15,25}/);
  if (idMatch) {
    const id = idMatch[0];
    try {
      const m = await guild.members.fetch(id);
      if (m) return m;
    } catch {}
    try {
      const u = await guild.client.users.fetch(id);
      if (u) {
        try {
          const m2 = await guild.members.fetch(u.id);
          if (m2) return m2;
        } catch {}
        return { user: u, id: u.id, guild: guild, partialUserOnly: true };
      }
    } catch {}
  }
  const mention = content.match(/<@!?(\d{15,25})>/);
  if (mention) {
    const id = mention[1];
    try {
      const m = await guild.members.fetch(id);
      if (m) return m;
    } catch {}
  }
  const text = content.replace(/<@!?(\d+)>/g, '').replace(/\d{15,25}/g, '').trim().toLowerCase();
  if (text) {
    await guild.members.fetch();
    const byDisplay = guild.members.cache.find(m => normalize(m.displayName).toLowerCase().includes(text));
    if (byDisplay) return byDisplay;
    const byUser = guild.members.cache.find(m => normalize(m.user.username).toLowerCase().includes(text));
    if (byUser) return byUser;
  }
  return null;
}

function extractTextFromMessage(msg) {
  let t = '';
  if (msg.content) t += msg.content + '\n';
  if (msg.embeds && msg.embeds.length) {
    for (const e of msg.embeds) {
      if (e.title) t += e.title + '\n';
      if (e.description) t += e.description + '\n';
      if (e.fields && e.fields.length) {
        for (const f of e.fields) {
          t += `${f.name}\n${f.value}\n`;
        }
      }
      if (e.footer && e.footer.text) t += e.footer.text + '\n';
    }
  }
  return t;
}

async function findLatestRecordFromSourceChannel(client, guildId, sourceChannelId, userId) {
  const ch = await client.channels.fetch(sourceChannelId).catch(() => null);
  if (!ch || ch.guildId !== guildId) return null;
  let before;
  let latest = null;
  for (let i = 0; i < 10; i++) {
    const msgs = await ch.messages.fetch({ limit: 100, before }).catch(() => new Collection());
    if (!msgs || msgs.size === 0) break;
    for (const [, m] of msgs) {
      const blob = extractTextFromMessage(m);
      if (blob.includes(userId)) {
        if (!latest || m.createdTimestamp > latest.createdTimestamp) latest = { message: m, text: blob };
      }
    }
    before = msgs.lastKey();
  }
  return latest;
}

async function fetchLastUserMessageAcrossGuild(guild, userId, channelLimit = 40, perChannel = 50) {
  const channels = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.GuildForum || c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice || c.type === ChannelType.GuildMedia)
    .filter(c => c.viewable && c.permissionsFor(guild.members.me).has(['ViewChannel','ReadMessageHistory']))
    .map(c => c)
    .sort((a, b) => (b.lastMessageId ? BigInt(b.lastMessageId) : 0n) - (a.lastMessageId ? BigInt(a.lastMessageId) : 0n))
    .slice(0, channelLimit);
  let best = null;
  for (const ch of channels) {
    if (!(ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement || ch.type === ChannelType.GuildMedia)) continue;
    let before;
    for (let i = 0; i < Math.ceil(perChannel / 100); i++) {
      const batch = await ch.messages.fetch({ limit: Math.min(100, perChannel - i * 100), before }).catch(() => new Collection());
      if (!batch || batch.size === 0) break;
      for (const [, m] of batch) {
        if (m.author && m.author.id === userId) {
          if (!best || m.createdTimestamp > best.createdTimestamp) best = m;
        }
      }
      before = batch.lastKey();
      if (!before) break;
    }
  }
  return best;
}

function buildInfoEmbed(guild, target, record, lastMsg) {
  const user = target.user || target;
  const member = target.id && guild.members.cache.get(target.id) || null;
  const roles = member ? member.roles.cache.filter(r => r.id !== guild.id).sort((a,b)=>b.position-a.position).map(r => `<@&${r.id}>`).slice(0, 25).join(' ') || '없음' : '길드 미가입';
  const created = `<t:${Math.floor(user.createdTimestamp/1000)}:F> (<t:${Math.floor(user.createdTimestamp/1000)}:R>)`;
  const joined = member && member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp/1000)}:F> (<t:${Math.floor(member.joinedTimestamp/1000)}:R>)` : '정보 없음';
  const nick = member && member.displayName ? member.displayName : '정보 없음';
  const booster = member && member.premiumSince ? `<t:${Math.floor(member.premiumSinceTimestamp/1000)}:F>` : '아님';
  const recText = record ? (record.text.length > 1024 ? record.text.slice(0, 1021) + '…' : record.text) : '해당 채널에서 기록을 찾지 못함';
  const lastMsgField = lastMsg ? `채널: <#${lastMsg.channelId}>\n시간: <t:${Math.floor(lastMsg.createdTimestamp/1000)}:F>\n내용: ${lastMsg.content && lastMsg.content.trim() !== '' ? (lastMsg.content.length>900?lastMsg.content.slice(0,897)+'…':lastMsg.content) : lastMsg.embeds?.length ? '(임베드/첨부 메시지)' : '(내용 없음)'}\n링크: https://discord.com/channels/${guild.id}/${lastMsg.channelId}/${lastMsg.id}` : '최근 메시지 없음';
  const eb = new EmbedBuilder()
    .setColor(member && member.displayHexColor ? member.displayHexColor : 0x2b2d31)
    .setAuthor({ name: `${user.username}#${user.discriminator === '0' ? '' : user.discriminator}`.trim(), iconURL: user.displayAvatarURL({ size: 256 }) })
    .setTitle('유저 정보')
    .addFields(
      { name: '유저', value: `<@${user.id}>`, inline: true },
      { name: '유저 ID', value: user.id, inline: true },
      { name: '닉네임', value: nick, inline: true },
      { name: '계정 생성일', value: created, inline: true },
      { name: '서버 합류일', value: joined, inline: true },
      { name: '부스트', value: booster, inline: true },
      { name: '역할', value: roles, inline: false },
      { name: '기록 채널 최근 기록', value: recText, inline: false },
      { name: '가장 최근 메시지', value: lastMsgField, inline: false }
    )
    .setTimestamp(new Date());
  if (member && member.avatar) eb.setThumbnail(member.displayAvatarURL({ size: 256 }));
  return eb;
}

let bound = false;

function registerUserInfoLookup(client, { sourceChannelId, triggerChannelId }) {
  if (bound) return;
  bound = true;
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (triggerChannelId && message.channelId !== triggerChannelId) return;
      const targetMention = message.mentions.users.first();
      let targetMember = null;
      if (targetMention) {
        try {
          targetMember = await message.guild.members.fetch(targetMention.id);
        } catch {
          targetMember = { user: targetMention, id: targetMention.id, guild: message.guild, partialUserOnly: true };
        }
      } else {
        targetMember = await findMemberByLooseInput(message.guild, message.content);
      }
      if (!targetMember) return;
      await message.channel.sendTyping();
      const record = await findLatestRecordFromSourceChannel(client, message.guild.id, sourceChannelId, targetMember.id || targetMember.user?.id);
      const lastMsg = await fetchLastUserMessageAcrossGuild(message.guild, targetMember.id || targetMember.user.id, 50, 100);
      const embed = buildInfoEmbed(message.guild, targetMember, record, lastMsg);
      await message.channel.send({ embeds: [embed] });
    } catch (e) {}
  });
}

module.exports = { registerUserInfoLookup };
