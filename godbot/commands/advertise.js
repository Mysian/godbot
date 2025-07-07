// ==== commands/advertise.js ====
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType 
} = require("discord.js");

const DEFAULT_IMG = 'https://media.discordapp.net/attachments/1388728993787940914/1391812043044163635/----001.png?ex=686d4179&is=686beff9&hm=2481678a47e56ca5b5d3a5c03d0baf47a23df8051da0bec166f8d253e96e32d2&=&format=webp&quality=lossless';
const CLOSED_IMG = 'https://media.discordapp.net/attachments/1388728993787940914/1391814250963402832/----001_1.png?ex=686d4388&is=686bf208&hm=a4289368a5fc7aa23f57d06c66d0e9e2ff3f62dd4cb21001132f74ee0ade60ac&=&format=webp&quality=lossless';

function isImageUrl(url) {
  return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모집")
    .setDescription("함께 게임하거나 소통할 유저를 모집해요!")
    .addStringOption((option) =>
      option
        .setName("내용")
        .setDescription("모집 내용을 입력하세요.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("모집인원")
        .setDescription("모집할 인원을 선택하세요. (1~9)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(9),
    )
    .addStringOption((option) =>
      option
        .setName("음성채널")
        .setDescription("모집할 음성 채널을 선택하세요.")
        .setRequired(false)
        .addChoices(
          { name: "🎙️ 101호", value: "1222085152600096778" },
          { name: "🎙️ 102호", value: "1222085194706587730" },
          { name: "🎙️ 201호", value: "1230536383941050368" },
          { name: "🎙️ 202호", value: "1230536435526926356" },
          { name: "🎙️ 301호", value: "1207990601002389564" },
          { name: "🎙️ 302호", value: "1209157046432170015" },
          { name: "🎙️ 401호", value: "1209157237977911336" },
          { name: "🎙️ 402호", value: "1209157289555140658" },
          { name: "🎙️ 501호", value: "1209157326469210172" },
          { name: "🎙️ 502호", value: "1209157352771682304" },
          { name: "🎙️ 601호", value: "1209157451895672883" },
          { name: "🎙️ 602호", value: "1209157492207255572" },
          { name: "🎙️ 701호", value: "1209157524243091466" },
          { name: "🎙️ 702호", value: "1209157622662561813" },
        ),
    )
    .addRoleOption(option =>
      option
        .setName("mention_role")
        .setDescription("알림 보낼 @역할을 선택하세요. (@here, @everyone 금지)")
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName("이미지")
        .setDescription("임베드 하단에 크게 띄울 이미지 URL (jpg/png/gif/webp/svg)")
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName("마감시간")
        .setDescription("버튼이 유지될 시간(단위: 시간, 1~24, 기본 24)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(24)
    ),

  async execute(interaction) {
    const content = interaction.options.getString("내용");
    const count = interaction.options.getInteger("모집인원");
    const voiceId = interaction.options.getString("음성채널");
    const mentionRole = interaction.options.getRole("mention_role");
    const imageUrl = interaction.options.getString("이미지");
    let closeHour = interaction.options.getInteger("마감시간") || 24;
    if (closeHour < 1) closeHour = 1;
    if (closeHour > 24) closeHour = 24;

    if (mentionRole && (mentionRole.name === "@everyone" || mentionRole.name === "@here")) {
      return await interaction.reply({
        content: "❌ @everyone, @here 역할은 태그할 수 없습니다. 게임 역할만 선택해 주세요.",
        ephemeral: true,
      });
    }

    const recruiterId = interaction.user.id;
    const startedAt = Date.now();
    const closeMs = closeHour * 60 * 60 * 1000;
    const closeAt = startedAt + closeMs;
    const closeTimestamp = Math.floor(closeAt / 1000);

    const embed = new EmbedBuilder()
      .setTitle("📢 모집 글")
      .setDescription(content)
      .addFields(
        { name: "모집 인원", value: `${count}명`, inline: true },
        ...(voiceId
          ? [{ name: "음성 채널", value: `<#${voiceId}>`, inline: true }]
          : []),
        { name: "모집자", value: `<@${recruiterId}>`, inline: true },
        { name: "마감까지", value: `<t:${closeTimestamp}:R>`, inline: true }, // ex: "1시간 후"
      )
      .setColor(0x57c3ff)
      .setTimestamp();

    // 이미지 URL 자동 대체 (입력 안했거나, 이상하면 기본 이미지)
    let imgUrl = DEFAULT_IMG;
    if (imageUrl && isImageUrl(imageUrl)) {
      imgUrl = imageUrl;
    }
    embed.setImage(imgUrl);

    const 모집채널 = await interaction.guild.channels.fetch(
      "1209147973255036959",
    );

    if (!모집채널 || !모집채널.isTextBased()) {
      return await interaction.reply({
        content: "❌ 모집 전용 채널을 찾을 수 없어요.",
        ephemeral: true,
      });
    }

    let row = null;
    let msgOptions = { embeds: [embed] };

    if (voiceId) {
      row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`joinintent_${voiceId}_${Date.now()}`)
          .setLabel("참여 의사 밝히기")
          .setStyle(ButtonStyle.Success)
      );
      msgOptions.components = [row];
    }
    if (mentionRole) msgOptions.content = `${mentionRole}`;

    const msg = await 모집채널.send(msgOptions);

    // 마감시간 이후 버튼 비활성화
    if (voiceId) {
      setTimeout(async () => {
  try {
    const prevContent = embed.data.description || '';
    embed.setDescription(`[마감되었습니다.]\n~~${prevContent}~~`);
    const fields = embed.data.fields.map(f =>
      f.name === "마감까지"
        ? { name: "마감까지", value: "마감됨", inline: true }
        : f
    );
    embed.setFields(fields);
    embed.setImage(CLOSED_IMG);
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`disabled2`)
        .setLabel("참여 의사 밝히기")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await msg.edit({ embeds: [embed], components: [disabledRow] });
  } catch (err) {}
}, closeMs);

// collector.on('end')
collector.on('end', async () => {
  const prevContent = embed.data.description || '';
  embed.setDescription(`[마감되었습니다.]\n~~${prevContent}~~`);
  const fields = embed.data.fields.map(f =>
    f.name === "마감까지"
      ? { name: "마감까지", value: "마감됨", inline: true }
      : f
  );
  embed.setFields(fields);
  embed.setImage(CLOSED_IMG);
  try {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`disabled2`)
        .setLabel("참여 의사 밝히기")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await msg.edit({ embeds: [embed], components: [disabledRow] });
  } catch (e) {}
});
    }

    await interaction.reply({
      content: "✅ 모집 글이 전용 채널에 정상적으로 게시되었어요!",
      ephemeral: true,
    });
  },
};
