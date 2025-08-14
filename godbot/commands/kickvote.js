const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require("discord.js");

const ERROR_LOG_CHANNEL_ID = "1381062597230460989";
const RESULT_LOG_CHANNEL_ID = "1380874052855529605";
const AFK_CHANNEL_ID = "1202971727915651092";

const activeVotes = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("강퇴투표")
    .setDescription("음성 채널에서 유저를 과반수 투표로 이동시킵니다.")
    .addUserOption((option) =>
      option.setName("대상").setDescription("강퇴 투표할 유저").setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild?.() && !interaction.guild) {
      return interaction.reply({ content: "❌ 길드 컨텍스트에서만 사용할 수 있습니다.", ephemeral: true });
    }

    const me = interaction.guild.members.me;
    if (!me || !me.permissions.has(PermissionsBitField.Flags.MoveMembers)) {
      return interaction.reply({ content: "❌ 봇에 음성 이동 권한이 없습니다. (Move Members)", ephemeral: true });
    }

    const targetUser = interaction.options.getUser("대상");
    const member = interaction.member;
    let targetMember = interaction.options.getMember("대상") ?? interaction.guild.members.resolve(targetUser.id);
    if (!targetMember) targetMember = await interaction.guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: "❌ 대상을 찾지 못했습니다.", ephemeral: true });
    }

    const myVc = member.voice?.channel;
    const tgVc = targetMember.voice?.channel;
    if (!myVc || !tgVc || myVc.id !== tgVc.id) {
      return interaction.reply({ content: "❌ 대상 유저는 같은 음성채널에 접속 중이어야 합니다.", ephemeral: true });
    }
    if (interaction.user.id === targetUser.id) {
      return interaction.reply({ content: "❌ 자신에게는 투표를 진행할 수 없습니다.", ephemeral: true });
    }

    const voteKey = `${myVc.id}:${targetUser.id}`;
    if (activeVotes.has(voteKey)) {
      return interaction.reply({ content: "❗ 이미 해당 대상에 대한 투표가 진행 중입니다.", ephemeral: true });
    }
    activeVotes.set(voteKey, true);

    const modal = new ModalBuilder().setCustomId("kick_reason_modal").setTitle("📋 잠수 채널 이동 사유 입력");
    const reasonInput = new TextInputBuilder()
      .setCustomId("reason_input")
      .setLabel("이동 사유를 입력하세요.")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("예: 잠수")
      .setValue("잠수");
    const modalRow = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(modalRow);

    await interaction.showModal(modal);

    const submitted = await interaction
      .awaitModalSubmit({
        time: 30000,
        filter: (i) => i.user.id === interaction.user.id && i.customId === "kick_reason_modal",
      })
      .catch(() => null);

    if (!submitted) {
      activeVotes.delete(voteKey);
      return interaction.followUp({ content: "⏰ 시간 초과로 취소되었습니다.", ephemeral: true });
    }

    const reason = submitted.fields.getTextInputValue("reason_input");
    const voiceChannel = myVc;
    if (!voiceChannel || !voiceChannel.members) {
      activeVotes.delete(voteKey);
      return submitted.reply({ content: "❌ 유효한 음성 채널이 아닙니다.", ephemeral: true });
    }

    let usersInChannel = voiceChannel.members.filter((m) => !m.user.bot);
    let totalUsers = usersInChannel.size;
    let requiredVotes = totalUsers === 2 ? 1 : Math.floor(totalUsers / 2) + 1;

    const voterChoices = {};
    voterChoices[interaction.user.id] = "yes";
    let yesCount = 1;
    let noCount = 0;

    let votingFinished = false;
    let leftSeconds = 30;

    const makeDescription = () =>
      `**<@${targetUser.id}>** 님을 **<#${AFK_CHANNEL_ID}>** 채널로 이동할까요?\n` +
      `🗳️ **과반수 ${requiredVotes}명** 찬성 시 이동됩니다.\n\n사유: **${reason}**\n\n` +
      `총 투표 인원: ${totalUsers}명\n` +
      `👍 찬성: ${yesCount} / 👎 반대: ${noCount}\n\n버튼을 눌러 투표(변경)하세요. (최대 30초)`;

    const embed = new EmbedBuilder()
      .setTitle("⚠️ 강퇴 투표 시작")
      .setDescription(makeDescription())
      .setColor(0xff4444)
      .setFooter({ text: "투표는 30초 내 언제든 수정 가능하며, 최대 30초 뒤 자동 종료됩니다." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("vote_yes").setLabel("찬성 👍").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("vote_no").setLabel("반대 👎").setStyle(ButtonStyle.Danger)
    );

    await submitted.reply({
      content: `⏰ 남은 시간: **${leftSeconds}초**`,
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });
    const message = await submitted.fetchReply();

    const collector = message.createMessageComponentCollector({ time: 30000 });

    const voiceStateListener = (oldState, newState) => {
      if (targetMember.id !== oldState.id) return;
      if (
        (oldState.channelId === voiceChannel.id && newState.channelId !== voiceChannel.id) ||
        (oldState.channelId === voiceChannel.id && !newState.channelId)
      ) {
        collector.stop("target_left");
      }
    };
    interaction.client.on("voiceStateUpdate", voiceStateListener);

    async function updateEmbed(extraMsg) {
      embed.setDescription(makeDescription());
      if (extraMsg) embed.setFooter({ text: extraMsg });
      await message
        .edit({
          content: `⏰ 남은 시간: **${leftSeconds}초**`,
          embeds: [embed],
          components: [row],
        })
        .catch(() => {});
    }

    const interval = setInterval(async () => {
      if (votingFinished) return;
      leftSeconds -= 1;
      usersInChannel = voiceChannel.members.filter((m) => !m.user.bot);
      totalUsers = usersInChannel.size;
      const newRequiredVotes = totalUsers === 2 ? 1 : Math.floor(totalUsers / 2) + 1;
      if (newRequiredVotes !== requiredVotes) {
        requiredVotes = newRequiredVotes;
        await updateEmbed();
      }
      if (leftSeconds >= 0) {
        await message
          .edit({
            content: `⏰ 남은 시간: **${leftSeconds}초**`,
            embeds: [embed],
            components: [row],
          })
          .catch(() => {});
      }
      if (totalUsers < 2) collector.stop("not_enough_members");
      if (leftSeconds <= 0) {
        if (yesCount > noCount && yesCount >= requiredVotes) collector.stop("success");
        else collector.stop("fail");
      }
    }, 1000);

    collector.on("collect", async (i) => {
      if (i.user.bot) return;
      const vMem =
        interaction.guild.members.resolve(i.user.id) ||
        (await interaction.guild.members.fetch({ user: i.user.id, force: true }).catch(() => null));
      if (!vMem || !vMem.voice?.channel || vMem.voice.channel.id !== voiceChannel.id) {
        return i.reply({ content: "❌ 이 투표는 현재 음성채널에 있는 사람만 참여할 수 있어요.", ephemeral: true });
      }

      const prev = voterChoices[i.user.id] || null;
      if (i.customId === "vote_yes") {
        if (prev === "yes") return i.reply({ content: "이미 찬성으로 투표하셨습니다.", ephemeral: true });
        if (prev === "no") noCount--;
        voterChoices[i.user.id] = "yes";
        yesCount++;
        await i.reply({ content: "찬성(👍)으로 투표가 반영되었습니다.", ephemeral: true });
      } else if (i.customId === "vote_no") {
        if (prev === "no") return i.reply({ content: "이미 반대로 투표하셨습니다.", ephemeral: true });
        if (prev === "yes") yesCount--;
        voterChoices[i.user.id] = "no";
        noCount++;
        await i.reply({ content: "반대(👎)로 투표가 반영되었습니다.", ephemeral: true });
      }
      await updateEmbed();
      if (yesCount >= requiredVotes && !votingFinished) collector.stop("success");
      if (noCount > yesCount && noCount >= requiredVotes && !votingFinished) collector.stop("fail");
    });

    collector.on("end", async (_, endReasonRaw) => {
      let endReason = endReasonRaw;
      votingFinished = true;
      clearInterval(interval);
      interaction.client.removeListener("voiceStateUpdate", voiceStateListener);
      activeVotes.delete(voteKey);
      await message.delete().catch(() => {});

      if (endReason === "target_left") {
        return interaction.followUp({ content: "❌ 투표 대상이 음성채널에서 나가 투표가 종료되었습니다.", ephemeral: true });
      }
      if (endReason === "not_enough_members") {
        return interaction.followUp({ content: "❗ 인원 부족으로 투표가 종료되었습니다.", ephemeral: true });
      }
      if (endReason === "fail") {
        const failEmbed = new EmbedBuilder()
          .setTitle("🛑 강퇴 투표 종료")
          .setDescription(`동점 또는 반대표가 더 많아 이동되지 않았습니다.`)
          .addFields({ name: "투표 결과", value: `총 투표 인원: ${totalUsers}명\n👍 찬성: ${yesCount} / 👎 반대: ${noCount}` })
          .setColor(0xff0000);
        return interaction.followUp({ embeds: [failEmbed] });
      }
      if (endReason === "timeout") {
        if (yesCount > noCount && yesCount >= requiredVotes) endReason = "success";
        else endReason = "fail";
      }

      if (endReason === "success" && yesCount > noCount) {
        const resultLogChannel = await interaction.client.channels.fetch(RESULT_LOG_CHANNEL_ID).catch(() => null);
        const afkChannel = await interaction.guild.channels.fetch(AFK_CHANNEL_ID).catch(() => null);
        if (!afkChannel || !afkChannel.isVoiceBased()) {
          return interaction.followUp({ content: "❌ 잠수 채널이 존재하지 않거나 음성 채널이 아닙니다.", ephemeral: true });
        }
        try {
          const freshTarget =
            interaction.guild.members.resolve(targetUser.id) ||
            (await interaction.guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null));
          if (!freshTarget || !freshTarget.voice?.channel) {
            return interaction.followUp({ content: "❗ 대상이 이미 채널을 떠났습니다.", ephemeral: true });
          }
          await freshTarget.voice.setChannel(afkChannel);
          const resultEmbed = new EmbedBuilder()
            .setTitle("✅ 강퇴 처리 완료")
            .setDescription(
              `<#${voiceChannel.id}> 에서 (사유: ${reason})로 인해 <@${targetUser.id}> 님을 잠수 채널로 이동시켰습니다.`
            )
            .addFields({ name: "투표 결과", value: `총 투표 인원: ${totalUsers}명\n👍 찬성: ${yesCount} / 👎 반대: ${noCount}` })
            .setColor(0x00cc66);
          await interaction.followUp({ embeds: [resultEmbed] });
          if (resultLogChannel?.isTextBased()) await resultLogChannel.send({ embeds: [resultEmbed] });
        } catch (err) {
          await interaction.followUp({ content: "❌ 채널 이동 중 오류가 발생했어요.", ephemeral: true });
          const errorLog = await interaction.client.channels.fetch(ERROR_LOG_CHANNEL_ID).catch(() => null);
          if (errorLog?.isTextBased()) {
            await errorLog.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle(`❗ <#${voiceChannel.id}> 에서 <@${targetUser.id}> 님 [강퇴투표 - 채널 이동 실패]`)
                  .setDescription(`\`\`\`${String(err?.stack || err).slice(0, 1900)}\`\`\``)
                  .setColor(0xff0000),
              ],
            });
          }
        }
      } else {
        const failEmbed = new EmbedBuilder()
          .setTitle("🛑 강퇴 투표 종료")
          .setDescription(`과반수 미달로 이동되지 않았습니다.`)
          .addFields({ name: "투표 결과", value: `총 투표 인원: ${totalUsers}명\n👍 찬성: ${yesCount} / 👎 반대: ${noCount}` })
          .setColor(0xffaa00);
        await interaction.followUp({ embeds: [failEmbed] });
      }
    });
  },
};