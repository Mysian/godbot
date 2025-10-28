const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, Collection } = require('discord.js');

const LOG_CHANNEL_ID = '1432529598327033957';
const QUERY_CHANNEL_ID = '1338400164142121073';
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'avatar-history.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }), 'utf8');
}
function loadStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { users: {} };
  }
}
function saveStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8');
}
function toKRTime(ts) {
  try {
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Seoul' }).format(ts instanceof Date ? ts : new Date(ts));
  } catch {
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toISOString();
  }
}
function avatarUrlFromUser(user) {
  try {
    return user.displayAvatarURL({ size: 1024 });
  } catch {
    return user.avatarURL ? user.avatarURL({ size: 1024 }) : null;
  }
}
function avatarUrlFromMember(member) {
  try {
    if (member.avatar) return member.displayAvatarURL({ size: 1024 });
    return null;
  } catch {
    return null;
  }
}
function pushHistory(store, userId, record) {
  if (!store.users[userId]) store.users[userId] = [];
  const arr = store.users[userId];
  if (arr.length === 0 || arr[arr.length - 1].url !== record.url) {
    arr.push(record);
    if (arr.length > 500) arr.splice(0, arr.length - 500);
  }
}
function uniqueByUrl(list) {
  const seen = new Set();
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (!seen.has(it.url)) {
      seen.add(it.url);
      out.push(it);
    }
  }
  return out.reverse();
}
async function logEmbed(channel, user, url, kind, ts) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${user.tag || user.username || user.id}`, iconURL: user.displayAvatarURL ? user.displayAvatarURL({ size: 128 }) : undefined })
    .setTitle(kind === 'guild' ? '서버 프로필 사진 변경' : '프로필 사진 변경')
    .setDescription(`<@${user.id}> 님이 프로필 사진을 변경했습니다.`)
    .setImage(url)
    .addFields(
      { name: '유저', value: `<@${user.id}> (${user.id})`, inline: true },
      { name: '종류', value: kind === 'guild' ? '서버 전용 아바타' : '전역 아바타', inline: true },
      { name: '시간', value: toKRTime(ts), inline: false }
    )
    .setColor(kind === 'guild' ? 0x2f6fff : 0x00b894)
    .setTimestamp(ts instanceof Date ? ts : new Date(ts));
  await channel.send({ embeds: [embed] });
}

async function handleQueryMessage(message, store) {
  if (message.channelId !== QUERY_CHANNEL_ID) return;
  if (message.author?.bot) return;
  const content = message.content.trim();
  if (!content.startsWith('!프사')) return;

  const args = content.slice('!프사'.length).trim();
  let target = null;

  if (message.mentions.users.size > 0) {
    target = message.mentions.users.first();
  }
  if (!target && args) {
    const idMatch = args.match(/\d{15,25}/);
    if (idMatch) {
      try {
        target = await message.client.users.fetch(idMatch[0]);
      } catch {}
    }
  }
  if (!target && args) {
    const guild = message.guild;
    if (guild) {
      await guild.members.fetch().catch(() => {});
      const byNick = guild.members.cache.find(m => m.nickname && m.nickname.toLowerCase() === args.toLowerCase());
      if (byNick) target = byNick.user;
      if (!target) {
        const byTag = guild.members.cache.find(m => (m.user.tag || '').toLowerCase() === args.toLowerCase());
        if (byTag) target = byTag.user;
      }
      if (!target) {
        const byUser = guild.members.cache.find(m => m.user.username && m.user.username.toLowerCase() === args.toLowerCase());
        if (byUser) target = byUser.user;
      }
    }
  }
  if (!target) target = message.author;

  const userId = target.id;
  const raw = store.users[userId] || [];
  const unique = uniqueByUrl(raw);
  if (unique.length === 0) {
    const current = avatarUrlFromUser(target);
    if (current) unique.push({ url: current, kind: 'user', ts: Date.now() });
  }
  if (unique.length === 0) {
    await message.reply({ content: '해당 유저의 프사 기록이 없습니다.' });
    return;
  }

  let index = unique.length - 1;
  const total = unique.length;

  const makeEmbed = (i) => {
    const rec = unique[i];
    const embed = new EmbedBuilder()
      .setAuthor({ name: `${target.tag || target.username || target.id}`, iconURL: target.displayAvatarURL ? target.displayAvatarURL({ size: 128 }) : undefined })
      .setTitle('프로필 사진 히스토리')
      .setDescription(`<@${userId}> 님의 프사 기록`)
      .setImage(rec.url)
      .addFields(
        { name: '순번', value: `${i + 1} / ${total}`, inline: true },
        { name: '종류', value: rec.kind === 'guild' ? '서버 전용 아바타' : '전역 아바타', inline: true },
        { name: '기록 시간', value: toKRTime(rec.ts), inline: false }
      )
      .setColor(0x6c5ce7)
      .setTimestamp(rec.ts instanceof Date ? rec.ts : new Date(rec.ts));
    return embed;
  };

  const rows = () => [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`av_prev_${message.id}_${message.author.id}`).setLabel('이전').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`av_next_${message.id}_${message.author.id}`).setLabel('다음').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`av_stop_${message.id}_${message.author.id}`).setLabel('닫기').setStyle(ButtonStyle.Danger)
    )
  ];

  const sent = await message.channel.send({ embeds: [makeEmbed(index)], components: rows() });

  const collector = sent.createMessageComponentCollector({ time: 120000 });
  collector.on('collect', async (it) => {
    if (it.user.id !== message.author.id) {
      await it.reply({ content: '요청자만 조작할 수 있습니다.', ephemeral: true });
      return;
    }
    const id = it.customId;
    if (!id.includes(`_${message.id}_${message.author.id}`)) return;
    if (id.startsWith('av_prev_')) {
      index = (index - 1 + total) % total;
      await it.update({ embeds: [makeEmbed(index)], components: rows() });
    } else if (id.startsWith('av_next_')) {
      index = (index + 1) % total;
      await it.update({ embeds: [makeEmbed(index)], components: rows() });
    } else if (id.startsWith('av_stop_')) {
      collector.stop('stop');
      await it.update({ embeds: [makeEmbed(index)], components: [] });
    }
  });
  collector.on('end', async (_, reason) => {
    if (reason !== 'stop') {
      try {
        await sent.edit({ components: [] });
      } catch {}
    }
  });
}

function registerAvatarHistory(client) {
  ensureStore();

  const pendingUserUpdate = new Collection();
  const pendingMemberUpdate = new Collection();

  client.on('userUpdate', async (oldUser, newUser) => {
    try {
      if (!oldUser || !newUser) return;
      const oldHash = oldUser.avatar;
      const newHash = newUser.avatar;
      if (oldHash === newHash) return;
      const url = avatarUrlFromUser(newUser);
      if (!url) return;
      const store = loadStore();
      pushHistory(store, newUser.id, { url, kind: 'user', ts: Date.now() });
      saveStore(store);
      pendingUserUpdate.set(newUser.id, { url, ts: Date.now() });
      const ch = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) await logEmbed(ch, newUser, url, 'user', Date.now());
    } catch {}
  });

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      if (!oldMember || !newMember) return;
      const oldGuildHash = oldMember.avatar;
      const newGuildHash = newMember.avatar;
      if (oldGuildHash === newGuildHash) return;
      const url = avatarUrlFromMember(newMember);
      if (!url) return;
      const store = loadStore();
      pushHistory(store, newMember.id, { url, kind: 'guild', ts: Date.now() });
      saveStore(store);
      pendingMemberUpdate.set(newMember.id, { url, ts: Date.now() });
      const ch = await newMember.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) await logEmbed(ch, newMember.user, url, 'guild', Date.now());
    } catch {}
  });

  client.on('messageCreate', async (message) => {
    try {
      await handleQueryMessage(message, loadStore());
    } catch {}
  });

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of pendingUserUpdate) if (now - v.ts > 600000) pendingUserUpdate.delete(k);
    for (const [k, v] of pendingMemberUpdate) if (now - v.ts > 600000) pendingMemberUpdate.delete(k);
  }, 60000);
}

module.exports = { registerAvatarHistory };
