const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
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

    // @here, @everyone 방지
    if (mentionRole && (mentionRole.name === "@everyone" || mentionRole.name === "@here")) {
      return await interaction.reply({
        content: "❌ @everyone, @here 역할은 태그할 수 없습니다. 게임 역할만 선택해 주세요.",
        ephemeral: true,
      });
    }

    // 모집자 id 저장 (참여의사 태그용)
    const recruiterId = interaction.user.id;

    // 마감 시간 계산용
    const startedAt = Date.now();
    const closeMs = closeHour * 60 * 60 * 1000;
    const closeAt = startedAt + closeMs;

    // 남은 시간 포맷 함수
    function getRemainStr(ms) {
      if (ms <= 0) return "마감됨";
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      if (h === 0 && m === 0) return "마감 임박!";
      return `${h > 0 ? `${h}시간` : ""}${m > 0 ? ` ${m}분` : ""}`.trim();
    }

    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle("📢 모집 글")
      .setDescription(content)
      .addFields(
        { name: "모집 인원", value: `${count}명`, inline: true },
        ...(voiceId
          ? [{ name: "음성 채널", value: `<#${voiceId}>`, inline: true }]
          : []),
        { name: "모집자", value: `<@${recruiterId}>`, inline: true },
        { name: "마감까지", value: getRemainStr(closeAt - Date.now()), inline: true },
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

    // 버튼 생성 (음성채널 있을 때만 2개)
    let row = null;
    let msgOptions = { embeds: [embed] };

    if (voiceId) {
      row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`joinvoice_${voiceId}_${Date.now()}`)
          .setLabel("음성채널 참여하기")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`joinintent_${voiceId}_${Date.now()}`)
          .setLabel("참여 의사 밝히기")
          .setStyle(ButtonStyle.Success)
      );
      msgOptions.components = [row];
    }
    if (mentionRole) msgOptions.content = `${mentionRole}`;

    // 모집글 전송
    const msg = await 모집채널.send(msgOptions);

    // 실시간 남은 시간 갱신 타이머
    let intervalTimer = null;
    if (voiceId) {
      intervalTimer = setInterval(async () => {
        const now = Date.now();
        const remain = closeAt - now;
        // 이미 마감됐으면 "마감됨"으로, 아니면 갱신
        const fields = embed.data.fields.map(f => 
          f.name === "마감까지" ? { name: "마감까지", value: getRemainStr(remain), inline: true } : f
        );
        embed.setFields(fields);
        try {
          await msg.edit({ embeds: [embed] });
        } catch (e) {}
        if (remain <= 0) {
          clearInterval(intervalTimer);
        }
      }, 60 * 1000); // 1분마다 갱신
    }

    // 버튼 유지 시간 (closeHour시간) 후 비활성화
    if (voiceId) {
      setTimeout(async () => {
        if (intervalTimer) clearInterval(intervalTimer);
        // 마지막으로 "마감됨"으로 갱신
        const fields = embed.data.fields.map(f => 
          f.name === "마감까지" ? { name: "마감까지", value: "마감됨", inline: true } : f
        );
        embed.setFields(fields);
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`disabled1`)
              .setLabel("음성채널 참여하기")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`disabled2`)
              .setLabel("참여 의사 밝히기")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
          await msg.edit({ embeds: [embed], components: [disabledRow] });
        } catch (err) {}
      }, closeMs);
    }

    // 버튼 처리 핸들러
    if (voiceId) {
      const collector = msg.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: closeMs
      });

      collector.on('collect', async btnInt => {
        try {
          if (btnInt.customId.startsWith('joinvoice_')) {
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
          }
          if (btnInt.customId.startsWith('joinintent_')) {
            await btnInt.deferReply({ ephemeral: true });
            // 명령어 유저(모집자)와 참여 의사 밝힌 유저를 동시에 태그해서 알림
            try {
              const channel = await btnInt.guild.channels.fetch(voiceId);
              if (channel && channel.isTextBased()) {
                await channel.send(
                  `@${(await btnInt.guild.members.fetch(recruiterId)).user.username} 님, <@${btnInt.user.id}> 님께서 참여를 희망하십니다.`
                );
              }
            } catch {}
            await btnInt.editReply({ content: `참여 의사가 전달되었습니다!` });
          }
        } catch (e) {
          await btnInt.editReply({ content: "⚠️ 처리에 실패했습니다!" });
        }
      });

      collector.on('end', async () => {
        if (intervalTimer) clearInterval(intervalTimer);
        // 마지막으로 "마감됨"으로 갱신
        const fields = embed.data.fields.map(f => 
          f.name === "마감까지" ? { name: "마감까지", value: "마감됨", inline: true } : f
        );
        embed.setFields(fields);
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`disabled1`)
              .setLabel("음성채널 참여하기")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
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
