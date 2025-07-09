const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const ERROR_LOG_CHANNEL_ID = "1381062597230460989";
const RESULT_LOG_CHANNEL_ID = "1380874052855529605";
const AFK_CHANNEL_ID = "1202971727915651092";

// 멀티 투표 방지용 Map (채널ID:대상ID -> true)
const activeVotes = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("강퇴투표")
    .setDescription("음성 채널에서 유저를 과반수 투표로 이동시킵니다.")
    .addUserOption((option) =>
      option.setName("대상").setDescription("강퇴 투표할 유저").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("대상");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const targetMember = await interaction.guild.members.fetch(target.id);

    // 멀티 투표 방지
    const voteKey = `${member.voice?.channelId}:${target.id}`;
    if (activeVotes.has(voteKey)) {
      return interaction.reply({
        content: "❗ 이미 해당 대상에 대한 투표가 진행 중입니다.",
        ephemeral: true,
      });
    }

    if (
      !member.voice.channel ||
      !targetMember.voice.channel ||
      member.voice.channel.id !== targetMember.voice.channel.id
    ) {
      return interaction.reply({
        content: "❌ 대상 유저는 같은 음성채널에 접속 중이어야 합니다.",
        ephemeral: true,
      });
    }
    if (interaction.user.id === target.id) {
      return interaction.reply({
        content: "❌ 자신에게는 투표를 진행할 수 없습니다.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("kick_reason_modal")
      .setTitle("📋 잠수 채널 이동 사유 입력");
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

    const submitted = await interaction.awaitModalSubmit({
      time: 30000,
      filter: (i) => i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!submitted) {
      return interaction.followUp({ content: "⏰ 시간 초과로 취소되었습니다.", ephemeral: true });
    }

    const reason = submitted.fields.getTextInputValue("reason_input");
    const voiceChannel = member.voice.channel;
    let usersInChannel = voiceChannel.members.filter((m) => !m.user.bot);
    let totalUsers = usersInChannel.size;
    let requiredVotes = totalUsers === 2 ? 1 : Math.floor(totalUsers / 2) + 1;

    let yesCount = 0;
    let noCount = 0;
    const voters = new Set();
    let votingFinished = false;
    let kickScheduled = false;
    let kickTimeout = null;
    let leftSeconds = 30;

    activeVotes.set(voteKey, true); // 투표 시작 기록

    const makeDescription = () =>
      `**<@${target.id}>** 님을 **<#${AFK_CHANNEL_ID}>** 채널로 이동할까요?\n` +
      `🗳️ **과반수 ${requiredVotes}명** 찬성 시 이동됩니다.\n\n사유: **${reason}**\n\n현재: 👍 ${yesCount} / 👎 ${noCount}\n\n버튼을 눌러 투표하세요. (최대 30초)`;

    const embed = new EmbedBuilder()
      .setTitle("⚠️ 강퇴 투표 시작")
      .setDescription(makeDescription())
      .setColor(0xff4444)
      .setFooter({ text: "투표는 한 번만 가능하며, 최대 30초 뒤 자동 종료됩니다." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("vote_yes").setLabel("찬성 👍").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("vote_no").setLabel("반대 👎").setStyle(ButtonStyle.Danger)
    );

    // 투표 시작(남은시간 메시지와 함께)
    await submitted.reply({
      content: `⏰ 남은 시간: **${leftSeconds}초**`,
      embeds: [embed],
      components: [row],
      fetchReply: true
    });
    const message = await submitted.fetchReply();

    // 투표 메인 collector
    const collector = message.createMessageComponentCollector({ time: 30000 });

    // 실시간 인원 체크 + 남은 시간 카운터 (1초마다)
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
      // 남은 시간 표시 content 업데이트
      if (leftSeconds >= 0) {
        await message.edit({
          content: `⏰ 남은 시간: **${leftSeconds}초**`,
          embeds: [embed],
          components: [row]
        }).catch(() => {});
      }
      // 인원이 1명 이하가 되면 투표 종료
      if (totalUsers < 2) {
        collector.stop("not_enough_members");
      }
      // 남은 시간 0이면 종료
      if (leftSeconds <= 0) {
        collector.stop("timeout");
      }
    }, 1000);

    // 대상이 퇴장/이동하면 즉시 종료
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

    // 실시간 embed 업데이트
    async function updateEmbed(extraMsg) {
      embed.setDescription(makeDescription());
      if (extraMsg) embed.setFooter({ text: extraMsg });
      await message.edit({
        content: `⏰ 남은 시간: **${leftSeconds}초**`,
        embeds: [embed],
        components: [row]
      }).catch(() => {});
    }

    // collector.on collect
    collector.on("collect", async (i) => {
      if (i.user.bot) return;
      const voterMember = await interaction.guild.members.fetch(i.user.id);
      // 인원 변화 체크
      if (!voterMember.voice.channel || voterMember.voice.channel.id !== voiceChannel.id) {
        return i.reply({
          content: "❌ 이 투표는 현재 음성채널에 있는 사람만 참여할 수 있어요.",
          ephemeral: true,
        });
      }
      if (voters.has(i.user.id)) {
        return i.reply({ content: "❗ 이미 투표하셨습니다.", ephemeral: true });
      }
      voters.add(i.user.id);
      if (i.customId === "vote_yes") yesCount++;
      if (i.customId === "vote_no") noCount++;
      await i.reply({ content: `투표 완료: ${i.customId === "vote_yes" ? "찬성" : "반대"}`, ephemeral: true });
      await updateEmbed();

      // 찬성표 모두 모였는지 체크
      if (yesCount >= requiredVotes && !kickScheduled) {
        kickScheduled = true;
        leftSeconds = 10;
        // 임박 안내 + 10초 보장
        embed.setFooter({ text: "추방 임박! 반대표가 있으면 10초 안에 투표하세요." });
        await message.edit({
          content: `⏰ 남은 시간: **${leftSeconds}초**`,
          embeds: [embed],
          components: [row]
        }).catch(() => {});
        kickTimeout = setTimeout(() => {
          if (!votingFinished) collector.stop("success");
        }, Math.max(0, Math.min(10000, leftSeconds * 1000))); // 남은시간이 10초 이하면 그만큼만 대기
      }
      // 반대표도 과반이면 즉시 종료
      if (noCount >= requiredVotes && !votingFinished) {
        collector.stop("fail");
      }
    });

    collector.on("end", async (endReason) => {
      votingFinished = true;
      clearInterval(interval);
      if (kickTimeout) clearTimeout(kickTimeout);
      interaction.client.removeListener("voiceStateUpdate", voiceStateListener);
      activeVotes.delete(voteKey); // 멀티 투표 해제

      await message.delete().catch(() => {});

      // 사유별 안내
      if (reason === "target_left") {
        return interaction.followUp({
          content: "❌ 투표 대상이 음성채널에서 나가 투표가 종료되었습니다.",
          ephemeral: true,
        });
      }
      if (reason === "not_enough_members") {
        return interaction.followUp({
          content: "❗ 인원 부족으로 투표가 종료되었습니다.",
          ephemeral: true,
        });
      }
      if (reason === "fail") {
        const failEmbed = new EmbedBuilder()
          .setTitle("🛑 강퇴 투표 종료")
          .setDescription(`반대표가 과반을 넘어 투표가 즉시 종료되었습니다.`)
          .addFields({ name: "투표 결과", value: `👍 찬성: ${yesCount} / 👎 반대: ${noCount}` })
          .setColor(0xff0000);
        return interaction.followUp({ embeds: [failEmbed] });
      }
      if (reason === "timeout") {
        // 일반 타임아웃
        if (yesCount >= requiredVotes) {
          reason = "success";
        }
      }
      if (yesCount >= requiredVotes) {
        const resultLogChannel = await interaction.client.channels.fetch(RESULT_LOG_CHANNEL_ID).catch(() => null);
        const afkChannel = interaction.guild.channels.cache.get(AFK_CHANNEL_ID);
        if (!afkChannel?.isVoiceBased()) {
          return interaction.followUp({
            content: "❌ 잠수 채널이 존재하지 않거나 음성 채널이 아닙니다.",
            ephemeral: true,
          });
        }
        try {
          await targetMember.voice.setChannel(afkChannel);
          const resultEmbed = new EmbedBuilder()
            .setTitle("✅ 강퇴 처리 완료")
            .setDescription(`<#${voiceChannel.id}> 에서 (사유: ${reason})로 인해 <@${target.id}> 님을 잠수 채널로 이동시켰습니다.`)
            .addFields({ name: "투표 결과", value: `👍 찬성: ${yesCount} / 👎 반대: ${noCount}` })
            .setColor(0x00cc66);
          await interaction.followUp({ embeds: [resultEmbed] });
          if (resultLogChannel?.isTextBased()) {
            await resultLogChannel.send({ embeds: [resultEmbed] });
          }
        } catch (err) {
          console.error(err);
          await interaction.followUp({
            content: "❌ 채널 이동 중 오류가 발생했어요.",
            ephemeral: true,
          });
          const errorLog = await interaction.client.channels.fetch(ERROR_LOG_CHANNEL_ID).catch(() => null);
          if (errorLog?.isTextBased()) {
            await errorLog.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle(`❗ <#${voiceChannel.id}> 에서 <@${target.id}> 님 [강퇴투표 - 채널 이동 실패]`)
                  .setDescription(`\`\`\`${err.stack?.slice(0, 1900)}\`\`\``)
                  .setColor(0xff0000),
              ],
            });
          }
        }
      } else {
        const failEmbed = new EmbedBuilder()
          .setTitle("🛑 강퇴 투표 종료")
          .setDescription(`과반수 미달로 이동되지 않았습니다.`)
          .addFields({ name: "투표 결과", value: `👍 찬성: ${yesCount} / 👎 반대: ${noCount}` })
          .setColor(0xffaa00);
        await interaction.followUp({ embeds: [failEmbed] });
      }
    });
  },
};
