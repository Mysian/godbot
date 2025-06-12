const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("역할")
    .setDescription("특정 유저에게 역할을 부여/해제합니다.")
    .addUserOption(opt =>
      opt.setName("유저명")
        .setDescription("대상 유저를 선택하세요.")
        .setRequired(true))
    .addRoleOption(opt =>
      opt.setName("역할")
        .setDescription("부여/해제할 역할을 선택하세요.")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("유저명");
    const targetRole = interaction.options.getRole("역할");

    // 서버 내 member 객체 불러오기
    const member = await interaction.guild.members.fetch(targetUser.id);

    const hasRole = member.roles.cache.has(targetRole.id);
    const stateMsg = hasRole
      ? "이 유저는 해당 역할이 **있습니다**. 역할을 **해제** 하시겠습니까?"
      : "이 유저는 해당 역할이 **없습니다**. 역할을 **부여** 하시겠습니까?";

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("role_yes")
        .setLabel("예")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("role_no")
        .setLabel("아니오")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: stateMsg,
      components: [row],
      ephemeral: true
    });

    // 콜렉터 (버튼 대기)
    const filter = i =>
      i.user.id === interaction.user.id &&
      ["role_yes", "role_no"].includes(i.customId);

    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000, max: 1 });

    collector.on("collect", async i => {
      if (i.customId === "role_no") {
        await i.update({ content: "❌ 작업이 취소되었습니다.", components: [] });
        return;
      }

      // 예 클릭: 역할 부여/해제 처리
      try {
        if (hasRole) {
          await member.roles.remove(targetRole);
          await i.update({
            content: `✅ **${targetUser.username}** 님에게서 **${targetRole.name}** 역할을 **해제**했습니다.`,
            components: []
          });
        } else {
          await member.roles.add(targetRole);
          await i.update({
            content: `✅ **${targetUser.username}** 님에게 **${targetRole.name}** 역할을 **부여**했습니다.`,
            components: []
          });
        }
      } catch (err) {
        await i.update({
          content: "❌ 역할 변경 중 오류가 발생했습니다.\n" + String(err),
          components: []
        });
      }
    });

    collector.on("end", async collected => {
      if (collected.size === 0) {
        await interaction.editReply({ content: "⏰ 시간이 초과되어 작업이 취소되었습니다.", components: [] });
      }
    });
  }
};
