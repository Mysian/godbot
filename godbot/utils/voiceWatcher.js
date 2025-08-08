const { joinVoiceChannel } = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');

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
const EMBED_MSG_ID = '1403366474160017489';

module.exports = function(client) {
  async function joinAndWatch() {
    try {
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

      const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) return;

      async function updateEmbed() {
        let total = 0;
        for (const id of VOICE_CHANNEL_IDS) {
          const ch = guild.channels.cache.get(id);
          if (!ch) continue;
          total += ch.members.filter(m => !m.user.bot).size;
        }
        const embed = new EmbedBuilder()
          .setTitle('🌹 음성채널 실시간 이용 현황')
          .setColor(0x2eccfa)
          .setDescription(`현재 **${total}명**이 이용 중입니다.\n\n${VOICE_CHANNEL_IDS.map((id, idx) => {
            const ch = guild.channels.cache.get(id);
            const cnt = ch ? ch.members.filter(m => !m.user.bot).size : 0;
            return `• ${ch ? ch.name : `채널${idx+1}`} : ${cnt}명`;
          }).join('\n')}`);
        try {
          const msg = await channel.messages.fetch(EMBED_MSG_ID).catch(() => null);
          if (msg) {
            await msg.edit({ embeds: [embed] });
          }
        } catch (e) {}
      }

      await updateEmbed();
      setInterval(updateEmbed, 60000);

      client.on('voiceStateUpdate', (oldState, newState) => {
        const watchedChannels = [...VOICE_CHANNEL_IDS, TARGET_CHANNEL_ID];
        if (
          (oldState.channelId && watchedChannels.includes(oldState.channelId)) ||
          (newState.channelId && watchedChannels.includes(newState.channelId))
        ) {
          updateEmbed();
        }
      });

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
