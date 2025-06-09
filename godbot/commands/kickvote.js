// 📁 commands/kick-vote.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const LOG_CHANNEL_ID = "1381062597230460989";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("강퇴투표")
    .setDescription("음성 채널에서 유저를 과반수 투표로 이동시킵니다.")
    .addUserOption((option) =>
      option
        .setName("대상")
        .setDescription("강퇴 투표할 유저")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("대상");

    try {
      // 🔄 최신 정보 강제 가져오기
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const targetMember = await interaction.guild.members.fetch(target.id);

      // ❌ 같은 음성 채널인지 확인
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

      const voiceChannel = member.voice.channel;
      const usersInChannel = voiceChannel.members.filter((m) => !m.user.bot);
      const requiredVotes = Math.ceil(usersInChannel.size / 2) + 1;

      const embed = new EmbedBuilder()
        .setTitle("⚠️ 강퇴 투표 시작")
        .setDescription(
          `**<@${target.id}>** 님을 **<#1202971727915651092>** 채널로 강퇴할까요?\n🗳️ 과반수(${requiredVotes}명) 찬성 시 이동됩니다.`
        )
        .setColor(0xff4444)
        .setFooter({ text: "30초 이내로 🟩을 눌러주세요. 30초 뒤 처리됩니다." });

      const voteMsg = await interaction.reply({
        embeds: [embed],
        fetchReply: true,
      });
      await voteMsg.react("🟩");

      // ⏱️ 30초 대기 후 처리
      setTimeout(async () => {
        try {
          const updatedMsg = await voteMsg.fetch();
          const reactions = updatedMsg.reactions.cache.get("🟩");
          const voters = (await reactions.users.fetch()).filter((u) => !u.bot);

          if (voters.size >= requiredVotes) {
            const afkChannel = interaction.guild.channels.cache.get("1202971727915651092");
            if (!afkChannel || !afkChannel.isVoiceBased()) {
              return interaction.followUp({
                content: "❌ 잠수 채널이 존재하지 않거나 음성 채널이 아닙니다.",
                ephemeral: true,
              });
            }

            await targetMember.voice.setChannel(afkChannel);
            await interaction.followUp({
              content: `✅ **<@${target.id}>** 님이 과반수 투표로 이동되었습니다.`,
            });
          } else {
            await interaction.followUp("🛑 시간 초과로 투표가 종료되었습니다. (과반수 미달)");
          }
        } catch (err) {
          console.error(err);
          await interaction.followUp({
            content: "❌ 투표 후 처리 중 오류가 발생했어요.",
            ephemeral: true,
          });

          const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
          if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`❗ **[강퇴투표 - 후속 처리 오류]**\n\`\`\`\n${err.stack?.slice(0, 1900)}\n\`\`\``);
          }
        }
      }, 30000);

    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ 명령어 실행 중 오류가 발생했습니다.",
        ephemeral: true,
      });

      const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send(`❗ **[강퇴투표 오류]**\n\`\`\`\n${error.stack?.slice(0, 1900)}\n\`\`\``);
      }
    }
  },
};
