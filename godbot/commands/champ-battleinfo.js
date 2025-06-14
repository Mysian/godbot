const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언배틀안내")
    .setDescription("챔피언 배틀 시스템의 모든 것을 친절하게 설명해줍니다!"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("⚔️ 챔피언 배틀 시스템 안내")
      .setColor(0x406adc)
      .setDescription(
        "챔피언 배틀은 내가 보유한 챔피언으로 1:1 실시간 전투를 즐기는 컨텐츠야.\n\n"
        + "전투에서 승리하면 전적이 기록되고, 다양한 효과/강화/전략이 펼쳐져!\n"
        + "아래는 주요 배틀 시스템에 대한 상세 안내야."
      )
      .addFields(
        {
          name: "1. 배틀 시작 방법",
          value:
            "- `/챔피언배틀 상대:@닉네임` 으로 대전을 신청해!\n"
            + "- 상대가 수락해야만 전투가 시작돼.\n"
            + "- 한 번에 한 판만 진행 가능하고, 중복/다중 배틀은 불가!"
        },
        {
          name: "2. 행동 종류",
          value:
            "- 내 차례마다 아래 중 1가지만 선택 가능:\n"
            + "  • **🗡️ 평타**: 기본 공격(대미지)\n"
            + "  • **🛡️ 무빙**: 방어/회피 효과 (일부 챔피언은 특수효과 발동)\n"
            + "  • **✨ 스킬**: 챔피언 고유 스킬 (최소 턴, 쿨타임 있음)"
        },
        {
          name: "3. 스킬 사용/쿨타임 규칙",
          value:
            "- 각 챔피언마다 한 가지 고유 스킬이 있어!\n"
            + "- **스킬은 내 턴이 N번 오기 전까지(최소턴/쿨타임) 사용 불가**\n"
            + "- 쿨타임이 2턴인 스킬은 \"내 차례 2번이 지나야\" 다시 쓸 수 있음\n"
            + "- 스킬 사용 실패(쿨/최소턴 미달) 시에는 턴이 넘어가지 않음\n"
            + "- **평타/무빙**만이 턴을 넘긴다!"
        },
        {
          name: "4. 능력치/스킬/상태 실시간 표시",
          value:
            "- 배틀창에 두 유저의 HP, 공격력, 방어력 등 모든 스탯 실시간 표시!\n"
            + "- 스킬 쿨타임 및 사용 가능 여부도 배틀창에서 바로 확인 가능\n"
            + "- 버프/디버프/기절 등 주요 상태도 이모지로 시각적으로 보여줌"
        },
        {
          name: "5. 승리/패배 및 기록",
          value:
            "- 체력이 0이 되면 패배, 상대가 승리자로 기록!\n"
            + "- 승리/패배 전적은 모두 저장\n"
            + "- 패배 시에는 임베드로 짤막한 챔피언/유저 설명이 표시됨"
        },
        {
          name: "6. 추가 꿀팁 & 유의사항",
          value:
            "- 챔피언 효과/스킬은 [챔피언조회], [내챔피언]에서 직접 확인해!\n"
            + "- 일부 스킬은 추가 행동, 연속타, 상태이상, 체력회복 등 다양한 효과가 존재\n"
            + "- 본인 턴에 60초간 행동이 없으면 전투가 자동 종료됨"
        }
      )
      .setFooter({ text: "더 궁금한 점은 /도움말, /챔피언조회, /내챔피언 명령어를 이용해보세요! | 까리한 디스코드" });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  },
};
