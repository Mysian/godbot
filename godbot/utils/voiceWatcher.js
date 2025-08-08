// voiceWatcher.js
const { joinVoiceChannel } = require('@discordjs/voice');
const VOICE_CHANNEL_ID = '1403304289794785383';
const VOICE_CHANNEL_CATEGORY_ID = '1207980297854124032';

module.exports = function(client) {
  async function joinAndWatch() {
    try {
      const guild = client.guilds.cache.find(g => 
        g.channels.cache.has(VOICE_CHANNEL_ID)
      );
      if (!guild) return;

      const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
      if (!channel) return;

      joinVoiceChannel({
        channelId: VOICE_CHANNEL_ID,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });

      setInterval(async () => {
        if (channel.parentId !== VOICE_CHANNEL_CATEGORY_ID) return;
        const userCount = channel.members.filter(m => !m.user.bot).size;
        const newName = `서버실 [이용자: ${userCount}명]`;
        if (channel.name !== newName) await channel.setName(newName).catch(() => {});
      }, 5000);
    } catch (err) {
      console.error('[voiceWatcher 에러]', err);
    }
  }

  client.once('ready', joinAndWatch);

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (
      oldState.member.id === client.user.id &&
      oldState.channelId === VOICE_CHANNEL_ID &&
      !newState.channelId
    ) {
      setTimeout(joinAndWatch, 2000);
    }
  });
};
