const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ComponentType } = require("discord.js");

// [카테고리별 게임 역할 목록]
const GAME_ROLE_CATEGORIES = {
  "스팀게임": [
    "스팀게임"
  ],
  "LOL": [
    "소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드"
  ],
  "FPS": [
    "레인보우식스", "서든어택", "발로란트", "카운터스트라이크", "콜오브듀티", "배틀필드", "오버워치", "에이펙스"
  ],
  "생존/샌드박스": [
    "마인크래프트", "돈스타브", "래프트", "로스트아크", "백 포 블러드", "좀보이드", "테라리아", "원스 휴먼", "헬다이버즈"
    // "스팀게임" 제거됨!
  ],
  "파티/협동": [
    "파티 애니멀즈", "휴먼폴플랫", "백룸", "파스모포비아", "프래그 펑크", "비세라 클린업", "왁제이맥스", "코어 키퍼"
  ],
  "캐주얼/퍼즐": [
    "DJ MAX", "테이블 탑 시뮬레이터", "마피아42", "스타듀밸리", "스컬"
  ],
  "기타": [
    "GTFO", "건파이어 리본", "구스구스 덕", "데드락", "데바데", "델타포스", "레포", "리썰컴퍼니", "리스크 오브 레인", "마스터 듀얼",
    "몬스터 헌터", "문명", "블레이드 앤 소울", "블루아카이브", "선 헤이븐", "스타크래프트", "엘소드", "워프레임", "원신", "이터널 리턴",
    "테일즈런너", "파워워시 시뮬레이터", "팰월드", "페긴"
  ]
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임선택")
    .setDescription("원하는 게임 역할을 카테고리별로 선택/해제할 수 있습니다."),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    // 역할 정보를 미리 캐싱
    await interaction.guild.roles.fetch();

    // 각 카테고리별 select 메뉴 생성
    const actionRows = [];
    let hasAnyRole = false;

    for (const [category, gameNames] of Object.entries(GAME_ROLE_CATEGORIES)) {
      // 카테고리 내 실제 역할만 추출 (이름 완전 일치)
      const roles = interaction.guild.roles.cache.filter(role =>
        !role.managed && gameNames.includes(role.name)
      );
      if (roles.size === 0) continue; // 역할 없는 카테고리는 건너뜀

      hasAnyRole = true;
      const roleArray = Array.from(roles.values()).sort((a, b) => b.position - a.position);
      for (let i = 0; i < roleArray.length; i += 25) {
        const chunk = roleArray.slice(i, i + 25);
        actionRows.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`game_roles_${category}_${i / 25}`)
              .setPlaceholder(`[${category}] 선택/해제`)
              .setMinValues(0)
              .setMaxValues(chunk.length)
              .addOptions(chunk.map(role => ({
                label: role.name.length > 100 ? role.name.slice(0, 97) + "..." : role.name,
                value: role.id,
                default: member.roles.cache.has(role.id)
              })))
          )
        );
      }
    }

    if (!hasAnyRole) {
      await interaction.reply({ content: "선택 가능한 게임 역할이 없습니다.", ephemeral: true });
      return;
    }

    await interaction.reply({
      content: "카테고리별로 원하는 게임 역할을 선택하거나 해제할 수 있습니다.",
      components: actionRows,
      ephemeral: true
    });

    // 선택 콜렉터 (최초 1회만)
    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.message.id === interaction.message.id,
      componentType: ComponentType.StringSelect,
      time: 60_000
    });

    collector.on("collect", async selectInteraction => {
      // 이 메뉴에서 선택된 역할만 처리
      const selectedRoleIds = new Set(selectInteraction.values);

      // 이 메뉴에 해당하는 역할 id만 추출
      const menu = selectInteraction.component;
      const optionIds = menu.options.map(option => option.value);

      // 추가/해제
      const toAdd = [];
      const toRemove = [];
      for (const roleId of optionIds) {
        if (selectedRoleIds.has(roleId) && !member.roles.cache.has(roleId)) {
          toAdd.push(roleId);
        } else if (!selectedRoleIds.has(roleId) && member.roles.cache.has(roleId)) {
          toRemove.push(roleId);
        }
      }
      if (toAdd.length) await member.roles.add(toAdd, "카테고리별 게임 역할 선택");
      if (toRemove.length) await member.roles.remove(toRemove, "카테고리별 게임 역할 해제");

      await selectInteraction.reply({
        content: `✅ 역할이 적용되었습니다! (추가: ${toAdd.length}, 해제: ${toRemove.length})`,
        ephemeral: true
      });
      // collector.stop(); // 여러 카테고리 연속 조작 원하면 이 줄 주석
    });

    collector.on("end", async () => {
      try {
        for (const row of actionRows) {
          row.components[0].setDisabled(true);
        }
        await interaction.editReply({
          components: actionRows
        });
      } catch {}
    });
  }
};
