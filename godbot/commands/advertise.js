const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType 
} = require("discord.js");

// 간단한 이미지 URL 검증 (jpg/png/gif/webp/svg)
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
    ),

  async execute(interaction) {
    const content = interaction.options.getString("내용");
    const count = interaction.options.getInteger("모집인원");
    const voiceId = interaction.options.getString("음성채널");
    const mentionRole = interaction.options.getRole("mention_role");
    const imageUrl = interaction.options.getString("이미지");

    // @here, @everyone 방지
    if (mentionRole && (mentionRole.name === "@everyone" || mentionRole.name === "@here")) {
      return await interaction.reply({
        content: "❌ @everyone, @here 역할은 태그할 수 없습니다. 게임 역할만 선택해 주세요.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📢 모집 글")
      .setDescription(content)
      .addFields(
        { name: "모집 인원", value: `${count}명`, inline: true },
        ...(voiceId
          ? [{ name: "음성 채널", value: `<#${voiceId}>`, inline: true }]
          : []),
        { name: "모집자", value: `<@${interaction.user.id}>`, inline: true },
      )
      .setColor(0x57c3ff)
      .setTimestamp();

    // 이미지 URL 있으면 하단에 이미지 삽입
    if (imageUrl && isImageUrl(imageUrl)) {
      embed.setImage(imageUrl);
    }

    const 모집채널 = await interaction.guild.channels.fetch(
      "1209147973255036959",
    );

    if (!모집채널 || !모집채널.isTextBased()) {
      return await interaction.reply({
        content: "❌ 모집 전용 채널을 찾을 수 없어요.",
        ephemeral: true,
      });
    }

    // 버튼 생성
    let row = null;
    let msgOptions = { embeds: [embed] };
    if (voiceId) {
      row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`joinvoice_${voiceId}_${Date.now()}`)
          .setLabel("음성채널 참여하기")
          .setStyle(ButtonStyle.Primary)
      );
      msgOptions.components = [row];
    }
    if (mentionRole) msgOptions.content = `${mentionRole}`;

    // 모집글 전송
    const msg = await 모집채널.send(msgOptions);

    // 15분 뒤 버튼 비활성화
    if (voiceId) {
      setTimeout(async () => {
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`disabled`)
              .setLabel("음성채널 참여하기")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
          await msg.edit({ components: [disabledRow] });
        } catch (err) {}
      }, 15 * 60 * 1000);
    }

    // 버튼 처리 핸들러
    if (voiceId) {
      const collector = msg.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 15 * 60 * 1000 
      });

      collector.on('collect', async btnInt => {
        try {
          await btnInt.deferReply({ ephemeral: true });
          const guild = btnInt.guild;
          const member = await guild.members.fetch(btnInt.user.id);
          const channel = await guild.channels.fetch(voiceId);

          if (!channel || channel.type !== 2) {
            return await btnInt.editReply({ content: "❌ 해당 음성채널을 찾을 수 없어요." });
          }
          const limit = channel.userLimit;
          const curr = channel.members.size;
          if (limit > 0 && curr >= limit) {
            return await btnInt.editReply({ content: "❌ 이미 해당 음성채널이 가득 찼어요!" });
          }
          await member.voice.setChannel(channel).catch(() => null);
          await btnInt.editReply({ content: `✅ [${channel.name}] 음성채널로 이동 완료!` });
        } catch (e) {
          await btnInt.editReply({ content: "⚠️ 음성채널 이동에 실패했습니다!" });
        }
      });
    }

    await interaction.reply({
      content: "✅ 모집 글이 전용 채널에 정상적으로 게시되었어요!",
      ephemeral: true,
    });
  },
};
