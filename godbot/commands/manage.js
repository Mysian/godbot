const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const EXCLUDE_ROLE_ID = "1371476512024559756";
const NEWBIE_ROLE_ID = "1295701019430227988";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("관리")
    .setDescription("서버 관리 명령어입니다.")
    .addStringOption((option) =>
      option
        .setName("옵션")
        .setDescription("실행할 관리 기능을 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "장기 미이용 유저 추방", value: "inactive" },
          { name: "비활동 신규유저 추방", value: "newbie" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const option = interaction.options.getString("옵션");

    const guild = interaction.guild;
    const activityPath = path.join(__dirname, "..", "activity.json");
    const activity = fs.existsSync(activityPath)
      ? JSON.parse(fs.readFileSync(activityPath))
      : {};

    if (option === "inactive" || option === "newbie") {
      const 기준날짜 = new Date(Date.now() - (option === "inactive" ? 90 : 7) * 24 * 60 * 60 * 1000);
      const members = await guild.members.fetch();
      const 추방대상 = [];

      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(EXCLUDE_ROLE_ID)) continue;

        const lastActive = activity[member.id];

        if (option === "inactive") {
          if (!lastActive || new Date(lastActive) < 기준날짜) {
            추방대상.push(member);
          }
        } else if (option === "newbie") {
          const joinedAt = member.joinedAt;
          const isNewbie = member.roles.cache.has(NEWBIE_ROLE_ID);
          const inactive = !lastActive || new Date(lastActive) < joinedAt;
          const daysPassed = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);

          if (isNewbie && inactive && daysPassed >= 7) {
            추방대상.push(member);
          }
        }
      }

      const descList = [];
      let totalLength = 0;
      for (const m of 추방대상) {
        const line = `• <@${m.id}> (${m.user.tag})`;
        if (totalLength + line.length + 1 < 4000) {
          descList.push(line);
          totalLength += line.length + 1;
        } else {
          descList.push(`외 ${추방대상.length - descList.length}명...`);
          break;
        }
      }

      const preview = new EmbedBuilder()
        .setTitle(`[${option === "inactive" ? "장기 미이용" : "비활동 신규유저"}] 추방 대상 미리보기`)
        .setDescription(추방대상.length ? descList.join("\n") : "✅ 추방 대상자가 없습니다.")
        .setColor(0xffcc00);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("confirm_kick").setLabel("✅ 예").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel_kick").setLabel("❌ 아니오").setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [preview], components: [row] });

      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 15000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "confirm_kick") {
          await i.update({ content: "⏳ 추방을 진행 중입니다...", embeds: [], components: [] });
          for (const member of 추방대상) {
            try {
              await member.kick("자동 추방: 활동 없음");
            } catch (err) {
              console.error(`❗ ${member.user.tag} 추방 실패: ${err}`);
            }
          }
          await interaction.followUp({
            content: `✅ ${추방대상.length}명의 유저를 추방했습니다.`,
            ephemeral: true,
          });
        } else {
          await i.update({ content: "❌ 추방이 취소되었습니다.", embeds: [], components: [] });
        }
      });

      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: "⏰ 시간이 초과되어 추방이 취소되었습니다.",
            embeds: [],
            components: [],
          });
        }
      });
    }
  },
};
