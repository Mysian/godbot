// commands/recruit.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const DEFAULT_IMG = "https://media.discordapp.net/attachments/1388728993787940914/1392737667514634330/----001.png?ex=68709f87&is=686f4e07&hm=1449b220ca1ebd3426465560b0ec369190f24b3c761c87cc3ba6ec6c552546ba&=&format=webp&quality=lossless";
const CLOSED_IMG = "https://media.discordapp.net/attachments/1388728993787940914/1391814250963402832/----001_1.png?ex=686d4388&is=686bf208&hm=a4289368a5fc7aa23f57d06c66d0e9e2ff3f62dd4cb21001132f74ee0ade60ac&=&format=webp&quality=lossless";
const 모집채널ID = "1209147973255036959";

const CUSTOM_EMOJIS = [
  { name: "F1_Join", id: "1361740502696726685" },
  { name: "F2_Watching", id: "1361740471331848423" },
  { name: "F7_Check", id: "1361740486561239161" }
];

function isImageUrl(url) {
  return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모집")
    .setDescription("모집 글 작성/수정/종료")
    .addSubcommand(sc =>
      sc
        .setName("작성")
        .setDescription("모집 글을 작성해요.")
        .addStringOption(o =>
          o.setName("내용").setDescription("모집 내용을 입력하세요.").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("모집인원").setDescription("모집 인원 (1~9)").setRequired(true).setMinValue(1).setMaxValue(9)
        )
        .addStringOption(o =>
          o
            .setName("음성채널")
            .setDescription("모집할 음성 채널")
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
              { name: "🎙️ 702호", value: "1209157622662561813" }
            )
        )
        .addRoleOption(o =>
          o.setName("mention_role").setDescription("알림으로 멘션할 역할 (@here/@everyone 금지)")
        )
        .addStringOption(o =>
          o.setName("이미지").setDescription("임베드 하단 이미지 URL (jpg/png/gif/webp/svg)")
        )
        .addIntegerOption(o =>
          o.setName("마감시간").setDescription("유지 시간(시간 단위, 1~24)").setMinValue(1).setMaxValue(24)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("수정")
        .setDescription("기존 모집 글을 수정해요.")
        .addStringOption(o =>
          o.setName("메시지id").setDescription("수정할 모집글 메시지 ID").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("내용").setDescription("새 모집 내용").setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName("모집인원").setDescription("새 모집 인원")
        )
        .addStringOption(o =>
          o.setName("이미지").setDescription("새 이미지 URL")
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("종료")
        .setDescription("모집 글을 강제 마감해요.")
        .addStringOption(o =>
          o.setName("메시지id").setDescription("마감할 모집글 메시지 ID").setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "작성") {
      const content = interaction.options.getString("내용");
      const count = interaction.options.getInteger("모집인원");
      const voiceId = interaction.options.getString("음성채널");
      const mentionRole = interaction.options.getRole("mention_role");
      const imageUrl = interaction.options.getString("이미지");
      let closeHour = interaction.options.getInteger("마감시간") ?? 1;
      if (closeHour < 1) closeHour = 1;
      if (closeHour > 24) closeHour = 24;
      if (mentionRole && (mentionRole.name === "@everyone" || mentionRole.name === "@here")) {
        return await interaction.reply({ content: "❌ @everyone, @here 역할은 사용할 수 없어요.", ephemeral: true });
      }
      const 모집채널 = await interaction.guild.channels.fetch(모집채널ID);
      if (!모집채널 || !모집채널.isTextBased()) {
        return await interaction.reply({ content: "❌ 모집 전용 채널을 찾을 수 없어요.", ephemeral: true });
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
          ...(voiceId ? [{ name: "음성 채널", value: `<#${voiceId}>`, inline: true }] : []),
          { name: "모집자", value: `<@${recruiterId}>`, inline: true },
          { name: "마감까지", value: `<t:${closeTimestamp}:R>`, inline: true }
        )
        .setColor(0x57c3ff)
        .setTimestamp()
        .setThumbnail(interaction.user.displayAvatarURL({ size: 128, extension: "png" }))
        .setImage(imageUrl && isImageUrl(imageUrl) ? imageUrl : DEFAULT_IMG);

      const msgOptions = { embeds: [embed] };
      if (mentionRole) msgOptions.content = `${mentionRole}`;
      const msg = await 모집채널.send(msgOptions);

      for (const emoji of CUSTOM_EMOJIS) {
        try { await msg.react(`<:${emoji.name}:${emoji.id}>`); } catch {}
      }

      setTimeout(async () => {
        try {
          embed.setDescription(`[모집 종료]\n~~${content}~~`);
          const fields = embed.data.fields.map(f =>
            f.name === "마감까지" ? { name: "마감까지", value: "마감 종료", inline: true } : f
          );
          embed.setFields(fields).setImage(CLOSED_IMG);
          await msg.edit({ embeds: [embed] });
        } catch {}
      }, closeMs);

      return await interaction.reply({ content: "✅ 모집 글을 게시했어요!", ephemeral: true });
    }

    if (sub === "수정") {
      const msgId = interaction.options.getString("메시지id");
      const newContent = interaction.options.getString("내용");
      const newCount = interaction.options.getInteger("모집인원");
      const newImage = interaction.options.getString("이미지");
      const 모집채널 = await interaction.guild.channels.fetch(모집채널ID);
      try {
        const msg = await 모집채널.messages.fetch(msgId);
        if (!msg) throw new Error();
        const embed = EmbedBuilder.from(msg.embeds[0]);
        if (!embed) throw new Error();
        const recruiterId = embed.data.fields.find(f => f.name === "모집자")?.value?.replace(/[<@>]/g, "");
        if (recruiterId && recruiterId !== interaction.user.id) {
          return await interaction.reply({ content: "❌ 모집글 작성자만 수정할 수 있어요.", ephemeral: true });
        }
        embed.setDescription(newContent);
        if (newCount) {
          embed.setFields(
            embed.data.fields.map(f =>
              f.name === "모집 인원" ? { name: "모집 인원", value: `${newCount}명`, inline: true } : f
            )
          );
        }
        let imgUrl = DEFAULT_IMG;
        if (newImage && isImageUrl(newImage)) {
          imgUrl = newImage;
        } else if (msg.embeds[0]?.data?.image?.url && isImageUrl(msg.embeds[0].data.image.url)) {
          imgUrl = msg.embeds[0].data.image.url;
        }
        embed.setImage(imgUrl);
        await msg.edit({ embeds: [embed] });
        return await interaction.reply({ content: "✅ 모집 글을 수정했어요!", ephemeral: true });
      } catch {
        return await interaction.reply({ content: "❌ 모집글을 찾을 수 없어요. 메시지 ID를 확인해 주세요.", ephemeral: true });
      }
    }

    if (sub === "종료") {
      const msgId = interaction.options.getString("메시지id");
      const 모집채널 = await interaction.guild.channels.fetch(모집채널ID);
      try {
        const msg = await 모집채널.messages.fetch(msgId);
        if (!msg) throw new Error();
        const embed = EmbedBuilder.from(msg.embeds[0]);
        if (!embed) throw new Error();
        const recruiterId = embed.data.fields.find(f => f.name === "모집자")?.value?.replace(/[<@>]/g, "");
        if (recruiterId && recruiterId !== interaction.user.id) {
          return await interaction.reply({ content: "❌ 모집글 작성자만 종료할 수 있어요.", ephemeral: true });
        }
        const prev = embed.data.description || "";
        embed
          .setDescription(`[모집 종료]\n~~${prev}~~`)
          .setFields(
            embed.data.fields.map(f =>
              f.name === "마감까지" ? { name: "마감까지", value: "마감 종료", inline: true } : f
            )
          )
          .setImage(CLOSED_IMG);
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("disabled2").setLabel("참여 의사 밝히기").setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await msg.edit({ embeds: [embed], components: [disabledRow] });
        return await interaction.reply({ content: "✅ 모집 글을 마감했어요!", ephemeral: true });
      } catch {
        return await interaction.reply({ content: "❌ 모집글을 찾을 수 없어요. 메시지 ID를 확인해 주세요.", ephemeral: true });
      }
    }
  }
};
