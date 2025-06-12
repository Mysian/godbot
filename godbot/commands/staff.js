const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// 관리진 역할 ID를 여기에!
const STAFF_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
const STAFF_MENTION_TITLE = "까리한 관리진들입니다.";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("스탭")
    .setDescription("까리한 디스코드 서버 관리진 리스트를 확인하고 호출할 수 있습니다."),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const guild = interaction.guild;
    if (!guild) return interaction.editReply("서버 정보 로드 실패!");

    // 모든 관리진(중복 제거)
    let staffSet = new Set();
    for (const roleId of STAFF_ROLE_IDS) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      for (const member of role.members.values()) {
        staffSet.add(member.user.id);
      }
    }

    if (staffSet.size === 0) {
      return interaction.editReply("서버에 등록된 관리진이 없습니다!");
    }

    const staffList = [...staffSet].map(uid => guild.members.cache.get(uid)).filter(Boolean);

    // 관리진 리스트 임베드
    const embed = new EmbedBuilder()
      .setTitle("👑 까리한 관리진 소개")
      .setDescription(`${STAFF_MENTION_TITLE}\n\n${staffList.map(m => `> <@${m.user.id}> (${m.user.username})`).join('\n')}`)
      .setColor(0xfcd703)
      .setFooter({ text: "언제든지 궁금한 점이 있으면 관리진을 호출해주세요!" });

    // 관리진별 호출 버튼
    const rows = [];
    for (let i = 0; i < staffList.length; i += 5) {
      // 한 줄에 최대 5개(디스코드 제한)
      const row = new ActionRowBuilder();
      for (const member of staffList.slice(i, i + 5)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`call-staff-${member.user.id}`)
            .setLabel(`${member.displayName} 호출하기`)
            .setStyle(ButtonStyle.Primary)
        );
      }
      rows.push(row);
    }

    await interaction.editReply({ embeds: [embed], components: rows });

    // 버튼 콜렉터(60초)
    const filter = i =>
      i.isButton() &&
      i.user.id === interaction.user.id &&
      i.customId.startsWith("call-staff-");

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 60000,
      max: 1,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      const staffId = i.customId.replace("call-staff-", "");
      const staffMember = guild.members.cache.get(staffId);
      if (!staffMember) {
        return i.followUp({ content: "관리진 정보가 없습니다.", ephemeral: true });
      }

      // 실제 호출 메시지(모든 유저가 볼 수 있게)
      await interaction.followUp({
        content: `🚨 <@${staffMember.user.id}> 님, <@${interaction.user.id}> 이 호출하였습니다.`,
        allowedMentions: { users: [staffMember.user.id] }
      });
    });

    collector.on("end", (collected, reason) => {
      // 타임아웃 시 버튼 비활성화 처리(선택)
      if (collected.size === 0) {
        const disabledRows = rows.map(row => {
          row.components.forEach(btn => btn.setDisabled(true));
          return row;
        });
        interaction.editReply({ components: disabledRows }).catch(() => {});
      }
    });
  }
};
