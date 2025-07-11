// utils/approve-log.js

const { EmbedBuilder } = require('discord.js');
const LOG_CHANNEL_ID = '1393144927155785759';

function sendApproveLog({ type, action, by, target, timeTaken }, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`[승인 테스트] 처리 로그`)
    .addFields(
      { name: '처리 방식', value: type, inline: true },
      { name: '동작', value: action, inline: true },
      { name: '관리자', value: `<@${by.id}>`, inline: true },
      { name: '대상 유저', value: `<@${target.id}>`, inline: true },
      { name: '소요 시간', value: `${timeTaken}s`, inline: true },
    )
    .setTimestamp()
    .setColor(type === '버튼' ? 0x2ecc71 : 0xe74c3c);

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) logChannel.send({ embeds: [embed] });
}
module.exports = { sendApproveLog };
