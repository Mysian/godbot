const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("역할현황")
    .setDescription("역할 또는 유저의 역할 현황을 확인")
    .addRoleOption(option =>
      option.setName("역할")
        .setDescription("조회할 역할 선택 (선택)")
        .setRequired(false)
    )
    .addUserOption(option =>
      option.setName("유저")
        .setDescription("조회할 유저 선택 (선택)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const role = interaction.options.getRole("역할");
    const user = interaction.options.getUser("유저");

    // 공통: 페이지네이션 유틸
    async function paginate(interaction, items, makeEmbed, pageSize = 30) {
      let page = 1;
      const totalPages = Math.ceil(items.length / pageSize);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prev").setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("next").setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1)
      );

      const msg = await interaction.reply({
        embeds: [makeEmbed(page, items, pageSize, totalPages)],
        components: [row],
        ephemeral: true,
        fetchReply: true,
      });

      if (totalPages === 1) return;

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300_000
      });

      collector.on("collect", async btnInt => {
        if (btnInt.user.id !== interaction.user.id)
          return btnInt.reply({ content: "본인만 조작할 수 있어!", ephemeral: true });

        if (btnInt.customId === "prev") page--;
        if (btnInt.customId === "next") page++;

        row.components[0].setDisabled(page === 1);
        row.components[1].setDisabled(page === totalPages);

        await btnInt.update({
          embeds: [makeEmbed(page, items, pageSize, totalPages)],
          components: [row]
        });
      });

      collector.on("end", async () => {
        row.components.forEach(btn => btn.setDisabled(true));
        await msg.edit({ components: [row] });
      });
    }

    // 1. 역할 지정 시 → 해당 역할 가진 유저 목록
    if (role) {
      const members = role.members.map(member => ({
        id: member.user.id,
        tag: member.user.tag,
        displayName: member.displayName || member.user.username,
        mention: `<@${member.user.id}>`
      }));

      if (members.length === 0)
        return interaction.reply({ content: `해당 역할을 가진 유저가 없어!`, ephemeral: true });

      members.sort((a, b) => a.displayName.localeCompare(b.displayName, "ko-KR"));

      return paginate(interaction, members, (page, items, pageSize, totalPages) => {
        const slice = items.slice((page - 1) * pageSize, page * pageSize);
        return new EmbedBuilder()
          .setTitle(`📑 역할현황: ${role.name} (${items.length}명)`)
          .setDescription(
            slice.map((m, i) =>
              `${i + 1 + (page - 1) * pageSize}. ${m.mention} / \`${m.id}\` / **${m.displayName}**`
            ).join("\n")
          )
          .setFooter({ text: `페이지 ${page} / ${totalPages}` })
          .setColor(role.color || 0x5ad2ff);
      });
    }

    // 2. 유저 지정 시 → 해당 유저가 가진 모든 역할
    if (user) {
      const member = await interaction.guild.members.fetch(user.id);
      const roles = member.roles.cache
        .filter(r => r.id !== interaction.guild.id) // @everyone 제외
        .map(r => ({
          id: r.id,
          name: r.name,
          color: r.color
        }));

      if (roles.length === 0)
        return interaction.reply({ content: `해당 유저는 역할이 없어!`, ephemeral: true });

      return paginate(interaction, roles, (page, items, pageSize, totalPages) => {
        const slice = items.slice((page - 1) * pageSize, page * pageSize);
        return new EmbedBuilder()
          .setTitle(`👤 ${member.displayName || user.username} 님의 역할 (${items.length}개)`)
          .setDescription(
            slice.map((r, i) =>
              `${i + 1 + (page - 1) * pageSize}. <@&${r.id}> (\`${r.id}\`)`
            ).join("\n")
          )
          .setFooter({ text: `페이지 ${page} / ${totalPages}` })
          .setColor(0x5ad2ff);
      });
    }

    // 3. 아무 옵션도 없을 시 → 서버 내 모든 역할
    const allRoles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id) // @everyone 제외
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.color
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));

    return paginate(interaction, allRoles, (page, items, pageSize, totalPages) => {
      const slice = items.slice((page - 1) * pageSize, page * pageSize);
      return new EmbedBuilder()
        .setTitle(`📚 서버 내 전체 역할 (${items.length}개)`)
        .setDescription(
          slice.map((r, i) =>
            `${i + 1 + (page - 1) * pageSize}. <@&${r.id}> (\`${r.id}\`)`
          ).join("\n")
        )
        .setFooter({ text: `페이지 ${page} / ${totalPages}` })
        .setColor(0x5ad2ff);
    });
  }
};
