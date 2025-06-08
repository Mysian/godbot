// commands/manage.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// 추방 제외할 역할 ID
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
          { name: "비활동 신규유저 추방", value: "newbie" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("기준날짜")
        .setDescription("inactive 옵션일 경우 기준 날짜 (예: 2025-05-01)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const option = interaction.options.getString("옵션");
    const 기준날짜입력 = interaction.options.getString("기준날짜");

    const 기준날짜 = option === "inactive" ? new Date(기준날짜입력) : null;
    const guildMembers = await interaction.guild.members.fetch();
    const activityPath = path.join(__dirname, "..", "activity.json");
    const activity = fs.existsSync(activityPath)
      ? JSON.parse(fs.readFileSync(activityPath))
      : {};

    const 추방대상 = [];

    for (const member of guildMembers.values()) {
      if (member.user.bot) continue;
      if (member.roles.cache.has(EXCLUDE_ROLE_ID)) continue;

      if (option === "inactive") {
        if (!기준날짜 || isNaN(기준날짜.getTime())) {
          return await interaction.editReply({
            content: "❗ 기준 날짜 형식이 잘못되었습니다.",
          });
        }

        const lastActive = activity[member.id];
        if (!lastActive || new Date(lastActive) < 기준날짜) {
          추방대상.push(member);
        }
      }

      if (option === "newbie") {
        const joinedAt = member.joinedAt;
        if (member.roles.cache.has(NEWBIE_ROLE_ID)) {
          const now = new Date();
          const diff = now - joinedAt;
          const daysPassed = diff / (1000 * 60 * 60 * 24);

          const lastActive = activity[member.id];
          const isInactive = !lastActive || new Date(lastActive) < joinedAt;

          if (daysPassed >= 7 && isInactive) {
            추방대상.push(member);
          }
        }
      }
    }

    const preview = new EmbedBuilder()
      .setTitle(
        `[${option === "inactive" ? "장기 미이용" : "비활동 신규유저"}] 추방 대상 미리보기`,
      )
      .setDescription(
        추방대상.length > 0
          ? 추방대상.map((m) => `• <@${m.id}> (${m.user.tag})`).join("\n")
          : "✅ 추방 대상자가 없습니다.",
      )
      .setColor(0xffcc00);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_kick")
        .setLabel("✅ 예")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancel_kick")
        .setLabel("❌ 아니오")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [preview], components: [row] });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 15000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "confirm_kick") {
        await i.update({
          content: `⏳ 추방을 진행 중입니다...`,
          embeds: [],
          components: [],
        });

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
        await i.update({
          content: "❌ 추방이 취소되었습니다.",
          embeds: [],
          components: [],
        });
      }
    });
  },
};
