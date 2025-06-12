const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// 역할 ID
const MAIN_STAFF_ROLE_ID = "786128824365482025";
const SUB_STAFF_ROLE_ID = "1201856430580432906";
// 예외처리(리스트에 뜨면 안 되는 유저/봇 ID)
const EXCLUDE_IDS = ["638742607861645372", "1224168358552010796"];
const SERVER_NAME = "까리한 디스코드";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("스탭")
    .setDescription(`${SERVER_NAME} 까리 서버 관리진을 확인하거나 호출합니다.`),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }); // 명령어 입력자에게만 보이게!

    const guild = interaction.guild;
    if (!guild) return interaction.editReply("서버 정보 로드 실패!");

    // 역할별 관리진 목록 구하기 (중복 제거, 예외 유저 제외)
    const getStaffMembers = (roleId) => {
      const role = guild.roles.cache.get(roleId);
      if (!role) return [];
      return Array.from(role.members.values())
        .filter(m => !EXCLUDE_IDS.includes(m.user.id))
        .filter(m => !m.user.bot); // 혹시 추가로 봇 필터링
    };

    const mainStaff = getStaffMembers(MAIN_STAFF_ROLE_ID);
    const subStaff = getStaffMembers(SUB_STAFF_ROLE_ID)
      .filter(m => !mainStaff.find(ms => ms.id === m.id)); // 메인스탭에 중복 포함된 일반스탭 제외

    // 아무도 없을 때
    if (mainStaff.length === 0 && subStaff.length === 0) {
      return interaction.editReply("서버에 등록된 관리진이 없습니다!");
    }

    // 임베드 세팅
    let desc = "👑 까리한 관리진들입니다.\n\n";
    if (mainStaff.length > 0) {
      desc += `**💎 메인스탭**\n`;
      desc += mainStaff.map(m => `> <@${m.user.id}> (${m.displayName})`).join('\n') + "\n\n";
    }
    if (subStaff.length > 0) {
      desc += `**✨ 일반스탭**\n`;
      desc += subStaff.map(m => `> <@${m.user.id}> (${m.displayName})`).join('\n') + "\n";
    }

    const embed = new EmbedBuilder()
      .setTitle(`🛡️ ${SERVER_NAME} STAFF LIST`)
      .setDescription(desc)
      .setColor(0xfcd703)
      .setFooter({ text: "도움이 필요하신가요? 호출을 눌러주세요!" });

    // 버튼 행 준비 (메인/일반 구분, 색상 다르게)
    const rows = [];
    if (mainStaff.length > 0) {
      const row = new ActionRowBuilder();
      for (const m of mainStaff) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`call-staff-main-${m.user.id}`)
            .setLabel(`${m.displayName} 호출`)
            .setStyle(ButtonStyle.Danger) // 메인스탭: 빨강
        );
      }
      rows.push(row);
    }
    if (subStaff.length > 0) {
      const row = new ActionRowBuilder();
      for (const m of subStaff) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`call-staff-sub-${m.user.id}`)
            .setLabel(`${m.displayName} 호출`)
            .setStyle(ButtonStyle.Primary) // 일반스탭: 파랑
        );
      }
      rows.push(row);
    }

    await interaction.editReply({ embeds: [embed], components: rows });

    // 버튼 콜렉터
    const filter = i =>
      i.isButton() &&
      i.user.id === interaction.user.id &&
      (i.customId.startsWith("call-staff-main-") || i.customId.startsWith("call-staff-sub-"));

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 60000,
      max: 1,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();
      const staffId = i.customId.split("-").pop();
      const staffMember = guild.members.cache.get(staffId);
      if (!staffMember) {
        return i.followUp({ content: "관리진 정보가 없습니다.", ephemeral: true });
      }

      // 실제 호출 메시지(채널 전체 공개, 관리자 멘션)
      await interaction.channel.send({
        content: `🚨 <@${staffMember.user.id}> 님, <@${interaction.user.id}> 이 호출하였습니다.`,
        allowedMentions: { users: [staffMember.user.id] }
      });
    });

    collector.on("end", (collected, reason) => {
      // 타임아웃 시 버튼 비활성화
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
