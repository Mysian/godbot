// utils/voiceWatcher.js
const { joinVoiceChannel } = require('@discordjs/voice');

const TARGET_CHANNEL_ID = '1403304289794785383';

const VOICE_CHANNEL_IDS = [
  '1222085152600096778', // 101호
  '1222085194706587730', // 102호
  '1230536383941050368', // 201호
  '1230536435526926356', // 202호
  '1207990601002389564', // 301호
  '1209157046432170015', // 302호
  '1209157237977911336', // 401호
  '1209157289555140658', // 402호
  '1209157326469210172', // 501호
  '1209157352771682304', // 502호
  '1209157451895672883', // 601호
  '1209157492207255572', // 602호
  '1209157524243091466', // 701호
  '1209157622662561813', // 702호
];

module.exports = function(client) {
  async function joinAndWatch() {
    try {
      const guild = client.guilds.cache.find(g =>
        g.channels.cache.has(TARGET_CHANNEL_ID)
      );
      if (!guild) return;

      const targetChannel = guild.channels.cache.get(TARGET_CHANNEL_ID);
      if (!targetChannel) return;

      joinVoiceChannel({
        channelId: TARGET_CHANNEL_ID,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true,
      });

      // *** 중요: setInterval 안에서 항상 최신 값 가져오기 ***
      setInterval(() => {
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
          total += ch.members.filter(m => !m.user.bot).size;
        }
        const newName = `서버실 [이용자: ${total}명]`;
        if (targetChannel.name !== newName) {
          targetChannel.setName(newName).catch(e => {
            console.error('[voiceWatcher] setName 실패:', e);
          });
        }
      }, 5000);
    } catch (err) {
      console.error('[voiceWatcher 에러]', err);
    }
  }

  client.once('ready', joinAndWatch);

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (
      oldState.member.id === client.user.id &&
      oldState.channelId === TARGET_CHANNEL_ID &&
      !newState.channelId
    ) {
      setTimeout(joinAndWatch, 2000);
    }
  });
};
