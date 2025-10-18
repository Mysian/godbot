const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("잠수함태우기")
    .setDescription("지정한 유저를 잠수방으로 이동시키기 전에 60초 경고를 보냅니다.")
    .addUserOption((option) =>
      option
        .setName("유저명")
        .setDescription("잠수방으로 이동시킬 유저")
        .setRequired(true),
    ),
  async execute(interaction) {
    const user = interaction.options.getUser("유저명");
    if (!user) {
      return await interaction.reply({ content: "❌ 유저를 찾을 수 없어요.", ephemeral: true });
    }
    const AFK_CHANNEL_ID = "1202971727915651092";
    const guild = interaction.guild;
    let member;
    try {
      member = await guild.members.fetch(user.id);
    } catch {
      return await interaction.reply({ content: "❌ 길드에서 해당 유저 정보를 불러올 수 없어요.", ephemeral: true });
    }
    if (!member.voice || !member.voice.channel) {
      return await interaction.reply({ content: "⚠️ 해당 유저는 현재 음성 채널에 접속 중이 아닙니다.", ephemeral: true });
    }
    const voiceChannel = member.voice.channel;
    let textChannel = null;
    try {
      const ch = await guild.channels.fetch(voiceChannel.id);
      if (ch && (ch.type === ChannelType.GuildText || ch.isTextBased())) {
        textChannel = ch;
      }
    } catch {}
    if (!textChannel) {
      return await interaction.reply({ content: "⚠️ 이 음성 채널에는 채팅방이 없거나 메시지를 보낼 수 없어요.", ephemeral: true });
    }
    const me = await guild.members.fetchMe();
    const perms = textChannel.permissionsFor(me);
    if (!perms || !perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
      return await interaction.reply({ content: "⚠️ 이 음성 채널 채팅방에 메시지를 보낼 권한이 없어요.", ephemeral: true });
    }
    await interaction.reply({ content: `⏳ <@${member.id}> 경고를 해당 음성 채널 채팅방에 게시했어. 60초간 활동을 확인할게.`, ephemeral: true });
    let warnMsg;
    try {
      warnMsg = await textChannel.send({
        content: `⚠️ <@${member.id}> 잠수 상태로 확인되어 잠수방으로 이동됩니다.\n이동을 원치 않으시는 경우 **60초 내에 본 채팅방에 어떠한 채팅이라도 입력**하세요.`,
      });
    } catch {
      return;
    }
    const filter = (m) => m.author.id === member.id;
    const collector = textChannel.createMessageCollector({ filter, time: 60000 });
    let canceled = false;
    collector.on("collect", async () => {
      canceled = true;
      collector.stop("canceled");
      try {
        await textChannel.send(`✅ <@${member.id}> 채팅 입력이 확인되어 잠수 이동을 취소했습니다.`);
      } catch {}
    });
    collector.on("end", async (collected, reason) => {
      if (reason === "canceled") return;
      try {
        const freshMember = await guild.members.fetch(member.id);
        if (!freshMember.voice || !freshMember.voice.channel) {
          try {
            await textChannel.send(`ℹ️ <@${member.id}> 지금은 음성 채널에 없어서 이동을 건너뜁니다.`);
          } catch {}
          return;
        }
        if (freshMember.voice.channelId !== voiceChannel.id) {
          try {
            await textChannel.send(`ℹ️ <@${member.id}> 다른 음성 채널로 이동하여 잠수 이동을 건너뜁니다.`);
          } catch {}
          return;
        }
        if (!canceled) {
          try {
            await freshMember.voice.setChannel(AFK_CHANNEL_ID);
            await textChannel.send(`✅ <@${member.id}> 60초 동안 입력이 없어 잠수방으로 이동했습니다.`);
          } catch {
            try {
              await textChannel.send(`❌ <@${member.id}> 이동 중 오류가 발생했어요.`);
            } catch {}
          }
        }
      } catch {}
      try {
        if (warnMsg && warnMsg.editable) {
          await warnMsg.edit({ content: warnMsg.content });
        }
      } catch {}
    });
  },
};
