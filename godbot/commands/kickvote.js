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

    const voteKey = `${member.voice?.channelId}:${target.id}`;
    // *** 동시 진입 방지: 명령어 진입 즉시 set ***
    if (activeVotes.has(voteKey)) {
      return interaction.reply({
        content: "❗ 이미 해당 대상에 대한 투표가 진행 중입니다.",
        ephemeral: true,
      });
    }
    activeVotes.set(voteKey, true);

    if (
      !member.voice.channel ||
      !targetMember.voice.channel ||
      member.voice.channel.id !== targetMember.voice.channel.id
    ) {
      activeVotes.delete(voteKey);
      return interaction.reply({
        content: "❌ 대상 유저는 같은 음성채널에 접속 중이어야 합니다.",
        ephemeral: true,
      });
    }
    if (interaction.user.id === target.id) {
      activeVotes.delete(voteKey);
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
      activeVotes.delete(voteKey);
      return interaction.followUp({ content: "⏰ 시간 초과로 취소되었습니다.", ephemeral: true });
    }

    const reason = submitted.fields.getTextInputValue("reason_input");
    const voiceChannel = member.voice.channel;
    let usersInChannel = voiceChannel.members.filter((m) => !m.user.bot);
    let totalUsers = usersInChannel.size;
    let requiredVotes = totalUsers === 2 ? 1 : Math.floor(totalUsers / 2) + 1;

    // 투표 결과 관리(아이디→"yes"|"no")
    const voterChoices = {};
    // 명령어 입력자는 자동 찬성 처리
    voterChoices[interaction.user.id] = "yes";

    // 투표자 수 집계
    let yesCount = 1;
    let noCount = 0;

    let votingFinished = false;
    let kickScheduled = false;
    let leftSeconds = 30;

    const makeDescription = () =>
      `**<@${target.id}>** 님을 **<#${AFK_CHANNEL_ID}>** 채널로 이동할까요?\n` +
      `🗳️ **과반수 ${requiredVotes}명** 찬성 시 이동됩니다.\n\n사유: **${reason}**\n\n` +
      `총 투표 인원: ${totalUsers}명\n` +
      `👍 찬성: ${yesCount} / 👎 반대: ${noCount}\n\n버튼을 눌러 투표(변경)하세요. (최대 30초)`;

    const embed = new EmbedBuilder()
      .setTitle("⚠️ 강퇴 투표 시작")
      .setDescription(makeDescription())
      .setColor(0xff4444)
      .setFooter({ text: "투표는 30초 내 언제든 수정 가능하며, 최대 30초 뒤 자동 종료됩니다." })
      .setImage("https://media.discordapp.net/attachments/1388728993787940914/1393024803488927744/Image_fx.jpg?ex=6871aaf2&is=68705972&hm=2a6831a918c89470fc5ab03d675b0b2d52cee21a6791ba18a6747e164a1e29cf&=&format=webp");

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
      // 남은 시간 0이면 종료. (이 시점에서 yes/no 비교)
      if (leftSeconds <= 0) {
        if (yesCount > noCount && yesCount >= requiredVotes) collector.stop("success");
        else collector.stop("fail");
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

      // 투표(중복/번복 허용)
      const prev = voterChoices[i.user.id] || null;
      if (i.customId === "vote_yes") {
        if (prev === "yes") {
          await i.reply({ content: "이미 찬성으로 투표하셨습니다.", ephemeral: true });
          return;
        }
        if (prev === "no") noCount--;
        voterChoices[i.user.id] = "yes";
        yesCount++;
        await i.reply({ content: "찬성(👍)으로 투표가 반영되었습니다.", ephemeral: true });
      } else if (i.customId === "vote_no") {
        if (prev === "no") {
          await i.reply({ content: "이미 반대로 투표하셨습니다.", ephemeral: true });
          return;
        }
        if (prev === "yes") yesCount--;
        voterChoices[i.user.id] = "no";
        noCount++;
        await i.reply({ content: "반대(👎)로 투표가 반영되었습니다.", ephemeral: true });
      }
      await updateEmbed();

      // 1. **여기 추가:** 과반수 도달 시 즉시 종료
      if (yesCount >= requiredVotes && !votingFinished) {
        collector.stop("success");
        return;
      }
      // 반대표도 과반이면 즉시 종료 (동점은 이동X)
      if (noCount > yesCount && noCount >= requiredVotes && !votingFinished) {
        collector.stop("fail");
      }
    });

    // 시그니처 수정
    collector.on("end", async (collected, endReason) => {
      votingFinished = true;
      clearInterval(interval);
      interaction.client.removeListener("voiceStateUpdate", voiceStateListener);
      activeVotes.delete(voteKey); // 멀티 투표 해제

      await message.delete().catch(() => {});

      // 사유별 안내
      if (endReason === "target_left") {
        return interaction.followUp({
          content: "❌ 투표 대상이 음성채널에서 나가 투표가 종료되었습니다.",
          ephemeral: true,
        });
      }
      if (endReason === "not_enough_members") {
        return interaction.followUp({
          content: "❗ 인원 부족으로 투표가 종료되었습니다.",
          ephemeral: true,
        });
      }
      if (endReason === "fail") {
        const failEmbed = new EmbedBuilder()
          .setTitle("🛑 강퇴 투표 종료")
          .setDescription(`동점 또는 반대표가 더 많아 이동되지 않았습니다.`)
          .addFields({ 
            name: "투표 결과", 
            value: `총 투표 인원: ${totalUsers}명\n👍 찬성: ${yesCount} / 👎 반대: ${noCount}` 
          })
          .setColor(0xff0000);
        return interaction.followUp({ embeds: [failEmbed] });
      }
      if (endReason === "timeout") {
        if (yesCount > noCount && yesCount >= requiredVotes) {
          endReason = "success";
        } else {
          endReason = "fail";
        }
      }
      if (endReason === "success" && yesCount > noCount) {
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
            .addFields({ 
              name: "투표 결과", 
              value: `총 투표 인원: ${totalUsers}명\n👍 찬성: ${yesCount} / 👎 반대: ${noCount}` 
            })
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
      } else if (endReason === "fail") {
        // 이미 위에서 fail 안내
      } else {
        const failEmbed = new EmbedBuilder()
          .setTitle("🛑 강퇴 투표 종료")
          .setDescription(`과반수 미달로 이동되지 않았습니다.`)
          .addFields({ 
            name: "투표 결과", 
            value: `총 투표 인원: ${totalUsers}명\n👍 찬성: ${yesCount} / 👎 반대: ${noCount}` 
          })
          .setColor(0xffaa00);
        await interaction.followUp({ embeds: [failEmbed] });
      }
    });
  },
};
