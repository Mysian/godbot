// utils/donate-dm-listener.js

const { ChannelType, EmbedBuilder } = require('discord.js');
const DONATION_LOG_CHANNEL = '1385860310753087549';

module.exports = async (client) => {
  client.on('messageCreate', async (msg) => {
    // 1. DM에서 온 메시지 + 유저(봇 X)
    if (msg.channel.type !== ChannelType.DM) return;
    if (msg.author.bot) return;

    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      // 2. DONATION_LOG_CHANNEL 가져오기
      const logChannel = await guild.channels.fetch(DONATION_LOG_CHANNEL).catch(() => null);
      if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

      // 3. 유저별 스레드 찾기(없으면 생성)
      const threadName = `[상품후원] ${msg.author.username} (${msg.author.id})`;
      let thread = logChannel.threads.cache.find(
        t => t.name === threadName && !t.archived
      );

      if (!thread) {
        thread = await logChannel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440, // 24시간
          reason: '상품후원 DM 자동정리'
        });
      }

      // 4. 메시지 내용 + 첨부파일 정리
      let content = `**[DM 도착]** <@${msg.author.id}>`;
      if (msg.content) content += `\n\n${msg.content}`;

      // 5. 이미지/파일 첨부 처리
      if (msg.attachments.size > 0) {
        // 각 첨부파일(이미지/파일) 링크
        for (const [_, att] of msg.attachments) {
          content += `\n[파일] ${att.url}`;
        }
      }

      // 6. 스레드로 포워딩
      await thread.send({ content });

      // 7. DM 답장(확인 안내)
      try {
        await msg.reply('상품 정보가 정상적으로 접수되었습니다. 다시 한 번 진심으로 감사드립니다!');
      } catch {}
    } catch (e) {
      // 무시
    }
  });
};
