const { joinVoiceChannel } = require('@discordjs/voice');

const TARGET_CHANNEL_ID = '1403304289794785383';

module.exports = function(client) {
  async function joinVoice() {
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
  }

  client.once('ready', joinVoice);

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (
      oldState.member.id === client.user.id &&
      oldState.channelId === TARGET_CHANNEL_ID &&
      !newState.channelId
    ) {
      setTimeout(joinVoice, 2000);
    }
  });
};
