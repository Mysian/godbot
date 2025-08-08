const { joinVoiceChannel } = require('@discordjs/voice');

const TARGET_CHANNEL_ID = '1403304289794785383';
const VOICE_CHANNEL_IDS = [
  '1222085152600096778',
  '1222085194706587730',
  '1230536383941050368',
  '1230536435526926356',
  '1207990601002389564',
  '1209157046432170015',
  '1209157237977911336',
  '1209157289555140658',
  '1209157326469210172',
  '1209157352771682304',
  '1209157451895672883',
  '1209157492207255572',
  '1209157524243091466',
  '1209157622662561813'
];
const DEBOUNCE_MS = 60 * 1000;

module.exports = function(client) {
  let debounceTimeout = null;
  let lastChanged = 0;

  function updateChannelName() {
    const guild = client.guilds.cache.find(g =>
      g.channels.cache.has(TARGET_CHANNEL_ID)
    );
    if (!guild) return;
    const targetChannel = guild.channels.cache.get(TARGET_CHANNEL_ID);
    if (!targetChannel) return;

    let total = 0;
    for (const id of VOICE_CHANNEL_IDS) {
      const ch = guild.channels.cache.get(id);
      if (!ch) continue;
      const cnt = ch.members.filter(m => !m.user.bot).size;
      total += cnt;
    }
    const newName = `서버실 [이용자: ${total}명]`;
    if (targetChannel.name !== newName) {
      targetChannel.setName(newName).catch(e => {
        console.error('[voiceWatcher] setName 실패:', e);
      });
      lastChanged = Date.now();
      console.log(`[voiceWatcher] 채널명 변경: ${newName}`);
    }
  }

  function debounceUpdate() {
    const now = Date.now();
    const delay = lastChanged + DEBOUNCE_MS - now;
    if (delay > 0) {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(updateChannelName, delay);
    } else {
      updateChannelName();
    }
  }

  client.once('ready', () => {
    updateChannelName();
    const guild = client.guilds.cache.find(g =>
      g.channels.cache.has(TARGET_CHANNEL_ID)
    );
    if (!guild) return;
    joinVoiceChannel({
      channelId: TARGET_CHANNEL_ID,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const watchedChannels = [...VOICE_CHANNEL_IDS, TARGET_CHANNEL_ID];
    if (
      (oldState.channelId && watchedChannels.includes(oldState.channelId)) ||
      (newState.channelId && watchedChannels.includes(newState.channelId))
    ) {
      debounceUpdate();
    }

    if (
      oldState.member.id === client.user.id &&
      oldState.channelId === TARGET_CHANNEL_ID &&
      !newState.channelId
    ) {
      setTimeout(() => {
        const guild = client.guilds.cache.find(g =>
          g.channels.cache.has(TARGET_CHANNEL_ID)
        );
        if (!guild) return;
        joinVoiceChannel({
          channelId: TARGET_CHANNEL_ID,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: true,
        });
      }, 2000);
    }
  });
};
