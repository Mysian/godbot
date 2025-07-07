// ==== commands/advertise-edit.js ====
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const DEFAULT_IMG = 'https://media.discordapp.net/attachments/1388728993787940914/1391812043044163635/----001.png?ex=686d4179&is=686beff9&hm=2481678a47e56ca5b5d3a5c03d0baf47a23df8051da0bec166f8d253e96e32d2&=&format=webp&quality=lossless';

function isImageUrl(url) {
  return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('모집수정')
    .setDescription('기존 모집글 내용을 수정해요.')
    .addStringOption(opt =>
      opt.setName('메시지id')
        .setDescription('수정할 모집글 메시지 ID')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('내용')
        .setDescription('새 모집 내용을 입력하세요')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('모집인원')
        .setDescription('새 모집 인원(선택)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('이미지')
        .setDescription('새 이미지 URL')
        .setRequired(false)),
  async execute(interaction) {
    const msgId = interaction.options.getString('메시지id');
    const newContent = interaction.options.getString('내용');
    const newCount = interaction.options.getInteger('모집인원');
    const newImage = interaction.options.getString('이미지');
    const 모집채널 = await interaction.guild.channels.fetch('1209147973255036959');
    try {
      const msg = await 모집채널.messages.fetch(msgId);
      if (!msg) throw new Error('메시지 없음');
      const embed = EmbedBuilder.from(msg.embeds[0]);
      if (!embed) throw new Error('임베드 없음');

      // 모집자만 수정 가능
      const recruiterId = embed.data.fields.find(f => f.name === '모집자')?.value?.replace(/[<@>]/g, '');
      if (recruiterId && recruiterId !== interaction.user.id) {
        return await interaction.reply({ content: '❌ 모집글 작성자만 수정할 수 있습니다.', ephemeral: true });
      }

      embed.setDescription(newContent);
      if (newCount) {
        embed.setFields(
          embed.data.fields.map(f => f.name === '모집 인원'
            ? { name: '모집 인원', value: `${newCount}명`, inline: true }
            : f)
        );
      }

      // 이미지: 새로 입력한 게 있으면 우선, 없으면 기존, 둘 다 없거나 이상하면 기본 이미지
      let imgUrl = DEFAULT_IMG;
      if (newImage && isImageUrl(newImage)) {
        imgUrl = newImage;
      } else if (msg.embeds[0]?.data?.image?.url && isImageUrl(msg.embeds[0].data.image.url)) {
        imgUrl = msg.embeds[0].data.image.url;
      }
      embed.setImage(imgUrl);

      await msg.edit({ embeds: [embed] });
      await interaction.reply({ content: '✅ 모집글이 성공적으로 수정됐어요!', ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: '❌ 모집글을 찾을 수 없어요. 메시지ID를 확인해 주세요.', ephemeral: true });
    }
  }
};
