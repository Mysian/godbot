const { ChannelType, time } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = (client, opts = {}) => {
  const LOG_CHANNEL_ID = '1433857279467192562';
  const DATA_DIR = path.join(process.cwd(), 'data');
  const DATA_FILE = path.join(DATA_DIR, 'soundboard-usage.json');
  const tz = 'Asia/Seoul';

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf8');

  const readStore = () => {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
    } catch {
      return {};
    }
  };

  const writeStore = (data) => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  };

  const incCount = (guildId, userId) => {
    const store = readStore();
    if (!store[guildId]) store[guildId] = {};
    if (!store[guildId][userId]) store[guildId][userId] = 0;
    store[guildId][userId] += 1;
    writeStore(store);
    return store[guildId][userId];
  };

  const fmtTime = (d = new Date()) => {
    const f = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    const parts = f.formatToParts(d);
    const hh = parts.find(p => p.type === 'hour')?.value ?? '00';
    const mm = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `[${hh}:${mm}]`;
  };

  client.on('voiceChannelEffectSend', async (effect) => {
    try {
      const guild = effect.guild ?? client.guilds.cache.get(effect.channelId?.split('/')[0]);
      if (!guild) return;
      const channel = guild.channels.cache.get(effect.channelId) || (await guild.channels.fetch(effect.channelId).catch(() => null));
      if (!channel || channel.type !== ChannelType.GuildVoice) return;

      const userId = effect.userId;
      const member = await guild.members.fetch(userId).catch(() => null);
      const displayName = member?.displayName || member?.user?.username || `사용자(${userId})`;

      let soundName = null;
      if (effect.soundboardSound?.name) soundName = effect.soundboardSound.name;
      if (!soundName && effect.soundId) {
        const byGuildFetch = await client.guilds.fetchSoundboardSounds({ guildIds: [guild.id] }).catch(() => null);
        const col = byGuildFetch?.get(guild.id);
        const found = col?.find(s => s.soundId === effect.soundId);
        soundName = found?.name || null;
      }
      if (!soundName && effect.emoji?.name) soundName = `이모지 효과: ${effect.emoji.name}`;
      if (!soundName && effect.soundId) soundName = `사운드 ID: ${effect.soundId}`;
      if (!soundName) soundName = '알 수 없는 효과';

      const count = incCount(guild.id, userId);

      const logChannelId = (opts.logChannelId || LOG_CHANNEL_ID);
      const logCh = client.channels.cache.get(logChannelId) || (await client.channels.fetch(logChannelId).catch(() => null));
      if (!logCh) return;

      const when = fmtTime(new Date());
      const voicePart = `음성: ${channel.name}`;
      const content = `🔊 사운드보드 | **${displayName}** 님 — '${soundName}' 재생 | ${voicePart} ${when} · 누적 ${count}회`;
      await logCh.send({ content });
    } catch {}
  });

  client.on('soundboardSounds', async (sounds, guild) => {
    try {
      const logChannelId = (opts.logChannelId || LOG_CHANNEL_ID);
      const logCh = client.channels.cache.get(logChannelId) || (await client.channels.fetch(logChannelId).catch(() => null));
      if (!logCh) return;
      const when = fmtTime(new Date());
      await logCh.send({ content: `📥 사운드보드 목록을 갱신하였습니다. (서버: ${guild?.name ?? guild?.id}) ${when}` });
    } catch {}
  });
};
