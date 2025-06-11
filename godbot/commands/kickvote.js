const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const ERROR_LOG_CHANNEL_ID = "1381062597230460989";
const RESULT_LOG_CHANNEL_ID = "1380874052855529605";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("강퇴투표")
    .setDescription("음성 채널에서 유저를 과반수 투표로 이동시킵니다.")
    .addUserOption((option) =>
      option.setName("대상").setDescription("강퇴 투표할 유저").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("대상");

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const targetMember = await interaction.guild.members.fetch(target.id);

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
      const totalUsers = usersInChannel.size;

      const requiredVotes = totalUsers === 2 ? 1 : Math.floor(totalUsers / 2) + 1;

      let yesCount = 0;
      let noCount = 0;
      const voters = new Set();

      const embed = new EmbedBuilder()
        .setTitle("⚠️ 강퇴 투표 시작")
        .setDescription(
          `**<@${target.id}>** 님을 **<#1202971727915651092>** 채널로 강퇴할까요?\n🗳️ **과반수 ${requiredVotes}명** 찬성 시 이동됩니다.\n\n현재: 👍 0 / 👎 0\n\n버튼을 눌러 투표하세요. (30초)`
        )
        .setColor(0xff4444)
        .setFooter({ text: "투표는 한 번만 가능하며, 30초 뒤 자동 종료됩니다." });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("vote_yes").setLabel("찬성 👍").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("vote_no").setLabel("반대 👎").setStyle(ButtonStyle.Danger)
      );

      const message = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true,
      });

      const collector = message.createMessageComponentCollector({ time: 30000 });

      const updateEmbed = async () => {
        embed.setDescription(
          `**<@${target.id}>** 님을 **<#1202971727915651092>** 채널로 강퇴할까요?\n🗳️ **과반수 ${requiredVotes}명** 찬성 시 이동됩니다.\n\n현재: 👍 ${yesCount} / 👎 ${noCount}\n\n버튼을 눌러 투표하세요. (30초)`
        );
        await message.edit({ embeds: [embed] });
      };

      collector.on("collect", async (i) => {
        if (i.user.bot) return;
        if (voters.has(i.user.id)) {
          return i.reply({ content: "❗ 이미 투표하셨습니다.", ephemeral: true });
        }

        voters.add(i.user.id);
        if (i.customId === "vote_yes") yesCount++;
        if (i.customId === "vote_no") noCount++;

        await i.reply({ content: `투표 완료: ${i.customId === "vote_yes" ? "찬성" : "반대"}`, ephemeral: true });
        await updateEmbed();

        if (yesCount >= requiredVotes) collector.stop("success");
      });

      collector.on("end", async () => {
        await message.delete().catch(() => {});

        const resultLogChannel = await interaction.client.channels.fetch(RESULT_LOG_CHANNEL_ID).catch(() => null);

        if (yesCount >= requiredVotes) {
          const afkChannel = interaction.guild.channels.cache.get("1202971727915651092");
          if (!afkChannel || !afkChannel.isVoiceBased()) {
            return interaction.followUp({
              content: "❌ 잠수 채널이 존재하지 않거나 음성 채널이 아닙니다.",
              ephemeral: true,
            });
          }

          try {
            await targetMember.voice.setChannel(afkChannel);

            const resultEmbed = new EmbedBuilder()
              .setTitle("✅ 강퇴 처리 완료")
              .setDescription(`**${target.tag}** 님을 잠수 채널로 이동시켰습니다.`)
              .addFields({ name: "투표 결과", value: `👍 찬성: ${yesCount}명 / 👎 반대: ${noCount}명` })
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
                    .setTitle("❗ [강퇴투표 - 채널 이동 실패]")
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
            .addFields({ name: "투표 결과", value: `👍 찬성: ${yesCount}명 / 👎 반대: ${noCount}명` })
            .setColor(0xffaa00);

          await interaction.followUp({ embeds: [failEmbed] });

          if (resultLogChannel?.isTextBased()) {
            await resultLogChannel.send({ embeds: [failEmbed] });
          }
        }
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "❌ 명령어 실행 중 오류가 발생했습니다.",
        ephemeral: true,
      });

      const errorLog = await interaction.client.channels.fetch(ERROR_LOG_CHANNEL_ID).catch(() => null);
      if (errorLog?.isTextBased()) {
        await errorLog.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("❗ [강퇴투표 오류]")
              .setDescription(`\`\`\`${error.stack?.slice(0, 1900)}\`\`\``)
              .setColor(0xff0000),
          ],
        });
      }
    }
  },
};
