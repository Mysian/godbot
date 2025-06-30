const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ComponentType } = require("discord.js");

// 롤, 스팀게임, 나머지
const ROLL_GAMES = ["소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드"];
const STEAM_GAMES = ["스팀게임"];
const ALL_GAMES = [
  "소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드", // 롤
  "스팀게임", // 스팀
  "DJ MAX", "FC", "GTA", "GTFO", "TRPG", "건파이어 리본", "구스구스 덕", "데드락", "데바데", "델타포스",
  "돈스타브", "래프트", "레인보우식스", "레포", "로스트아크", "리썰컴퍼니", "리스크 오브 레인", "마스터 듀얼",
  "마인크래프트", "마피아42", "메이플스토리", "몬스터 헌터", "문명", "발로란트", "배틀그라운드", "배틀필드",
  "백룸", "백 포 블러드", "블레이드 앤 소울", "블루아카이브", "비세라 클린업", "서든어택", "선 헤이븐",
  "스컬", "스타듀밸리", "스타크래프트", "에이펙스", "엘소드", "오버워치", "왁제이맥스", "워프레임",
  "원신", "원스 휴먼", "이터널 리턴", "좀보이드", "카운터스트라이크", "코어 키퍼", "콜오브듀티", "테라리아",
  "테이블 탑 시뮬레이터", "테일즈런너", "파스모포비아", "파워워시 시뮬레이터", "파티 애니멀즈", "팰월드", "페긴",
  "프래그 펑크", "휴먼폴플랫", "헬다이버즈", "히오스"
];

// 롤/스팀 제외 나머지 정렬
function getInitial(char) {
  const code = char.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    const initialIdx = Math.floor((code - 0xac00) / 588);
    return INITIALS[initialIdx];
  }
  if (/[a-zA-Z]/.test(char)) return char[0].toLowerCase();
  return "Ω";
}
function sortByInitial(a, b) {
  const ia = getInitial(a);
  const ib = getInitial(b);
  if (ia === ib) return a.localeCompare(b, "ko-KR");
  if (ia === "Ω") return 1;
  if (ib === "Ω") return -1;
  if (/[ㄱ-ㅎ]/.test(ia) && /[ㄱ-ㅎ]/.test(ib)) return ia.localeCompare(ib, "ko-KR");
  if (/[ㄱ-ㅎ]/.test(ia)) return -1;
  if (/[ㄱ-ㅎ]/.test(ib)) return 1;
  return ia.localeCompare(ib, "en");
}

const EXCLUDE_GAMES = [...ROLL_GAMES, ...STEAM_GAMES];
const ETC_GAMES = ALL_GAMES.filter(x => !EXCLUDE_GAMES.includes(x)).sort(sortByInitial);

const GAMES_PAGED = [ // 첫 페이지만 롤+스팀, 나머지는 10개씩 끊음
  [...ROLL_GAMES, ...STEAM_GAMES, ...ETC_GAMES.slice(0, 5)],
  ...Array.from({ length: Math.ceil((ETC_GAMES.length - 5) / 10) }, (_, i) =>
    ETC_GAMES.slice(5 + i * 10, 5 + (i + 1) * 10)
  )
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임선택")
    .setDescription("모든 게임 역할을 한 번에! (롤/스팀은 첫 페이지 최상단 고정)"),

  async execute(interaction) {
    await interaction.guild.roles.fetch();
    const member = await interaction.guild.members.fetch(interaction.user.id);

    let page = 0;
    const totalPages = GAMES_PAGED.length;

    // 역할 id, 이름 추출(실제 존재하는 역할만)
    function getPageRoles(idx) {
      const gameNames = GAMES_PAGED[idx];
      const roles = interaction.guild.roles.cache.filter(
        role => !role.managed && gameNames.includes(role.name)
      );
      // 리스트 실제 순서 유지
      const rolesInOrder = gameNames
        .map(name => roles.find(r => r.name === name))
        .filter(Boolean);
      return rolesInOrder;
    }

    async function showPage(pageIdx, updateInteraction = null) {
      const rolesThisPage = getPageRoles(pageIdx);

      // 임베드 출력
      const embed = new EmbedBuilder()
        .setTitle(`게임 역할 선택 (페이지 ${pageIdx + 1}/${totalPages})`)
        .setDescription(
          rolesThisPage.map((role, idx) =>
            `${idx + 1}. ${role.name}${member.roles.cache.has(role.id) ? " ✅" : ""}`
          ).join('\n') ||
          '선택 가능한 역할이 없습니다.'
        )
        .setColor(0x2095ff);

      // 셀렉트 메뉴(최대 25개 제한: 실제론 10개 이하)
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("game_roles_select")
        .setPlaceholder("선택/해제할 게임 역할을 체크하세요")
        .setMinValues(0)
        .setMaxValues(rolesThisPage.length)
        .addOptions(
          rolesThisPage.map(role => ({
            label: role.name.length > 100 ? role.name.slice(0, 97) + "..." : role.name,
            value: role.id,
            default: member.roles.cache.has(role.id)
          }))
        );
      const actionRow = new ActionRowBuilder().addComponents(selectMenu);

      // 페이지네이션 버튼
      const navRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId("prev").setLabel("이전").setStyle("Secondary").setDisabled(pageIdx === 0),
          new ButtonBuilder().setCustomId("next").setLabel("다음").setStyle("Secondary").setDisabled(pageIdx >= totalPages - 1)
        );

      const payload = {
        embeds: [embed],
        components: [actionRow, navRow],
        ephemeral: true
      };
      if (updateInteraction) await updateInteraction.update(payload);
      else await interaction.reply(payload);
    }

    await showPage(page);

        const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000
    });

    collector.on("collect", async i => {
      if (i.isStringSelectMenu()) {
        const selected = new Set(i.values);
        const rolesThisPage = getPageRoles(page);
        const toAdd = [];
        const toRemove = [];
        for (const role of rolesThisPage) {
          if (selected.has(role.id) && !member.roles.cache.has(role.id)) toAdd.push(role.id);
          if (!selected.has(role.id) && member.roles.cache.has(role.id)) toRemove.push(role.id);
        }
        if (toAdd.length) await member.roles.add(toAdd, "게임 역할 선택");
        if (toRemove.length) await member.roles.remove(toRemove, "게임 역할 해제");

        await i.reply({
          content: `✅ 역할이 적용되었습니다! (추가: ${toAdd.length}, 해제: ${toRemove.length})`,
          ephemeral: true
        });
      } else if (i.isButton()) {
        if (i.customId === "prev" && page > 0) {
          page -= 1;
          await showPage(page, i);
        }
        if (i.customId === "next" && page < totalPages - 1) {
          page += 1;
          await showPage(page, i);
        }
      }
    });


    collector.on("end", async () => {
      try {
        await interaction.editReply({
          components: []
        });
      } catch {}
    });
  }
};
