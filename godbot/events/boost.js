// events/boost.js
const { EmbedBuilder } = require('discord.js');

const LOG_CHANNEL_ID = '1264514955269640252';

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const logChannel = newMember.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const oldBoost = !!oldMember.premiumSince;
    const newBoost = !!newMember.premiumSince;

    if (!oldBoost && newBoost) {
      const ts = newMember.premiumSince ? newMember.premiumSince.getTime() : Date.now();
      const embed = new EmbedBuilder()
        .setColor(0xf47fff)
        .setTitle('🚀 서버 부스트 시작')
        .setDescription(`<@${newMember.id}> 님이 서버 부스트를 시작했습니다!`)
        .setTimestamp(ts);
      await logChannel.send({ embeds: [embed] });
      return;
    }

    if (oldBoost && !newBoost) {
      await logChannel.send(`-# <@${newMember.id}> 님이 서버 부스트를 해제했습니다.`);
    }
  }
};
