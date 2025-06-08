const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("이 봇에서 사용할 수 있는 주요 명령어를 안내합니다."),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("📚 도움말 안내")
      .setDescription("이 봇에서 사용할 수 있는 주요 기능들을 소개합니다.")
      .addFields(
        {
          name: "/강퇴투표",
          value: "투표를 통해 해당 유저를 음성채널에서 추방시킵니다.",
        },
        {
          name: "/게임",
          value: "러시안 룰렛을 포함한 각종 미니게임이 가능합니다.",
        },
        { name: "/게임뉴스", value: "게임 관련 최신 소식 3가지를 불러옵니다." },
        {
          name: "/계정",
          value: "계정 정보를 등록한 유저의 게임 닉네임, 태그를 확인합니다.",
        },
        { name: "/계정관리", value: "계정 정보를 새로 등록하거나 수정합니다." },
        { name: "/도움말", value: "까리한 그대가 지금 입력한 명령어입니다." },
        {
          name: "/롤티어",
          value: "특정 유저의 롤 포지션별 티어 정보를 확인합니다.",
        },
        {
          name: "/롤티어등록",
          value: "본인의 롤 티어 정보를 포지션별로 등록합니다.",
        },
        {
          name: "/롤티어순위",
          value: "전체 유저 중 평균 롤 티어 순위를 보여줍니다.",
        },
        { name: "/롤티어초기화", value: "본인의 롤 티어 정보를 초기화합니다." },
        { name: "/모집", value: "지정된 음성채널에서 함께할 유저를 모집해요." },
        {
          name: "/서버안내",
          value: "까리한 디스코드의 상세 안내글을 확인합니다.",
        },
        {
          name: "/서버부스트현황",
          value: "서버의 부스트 수치와 부스트 유저 목록을 확인해요.",
        },
        { name: "/상태", value: "특정 유저의 상태 메시지를 확인해요." },
        { name: "/상태설정", value: "본인의 상태 메시지를 등록할 수 있어요." },
        { name: "/신고", value: "유저를 신고하고 서버에 기록해요." },
        {
          name: "/옵치티어",
          value: "특정 유저의 오버워치 포지션별 티어 정보를 확인합니다.",
        },
        {
          name: "/옵치티어등록",
          value: "본인의 오버워치 티어 정보를 포지션별로 등록합니다.",
        },
        {
          name: "/옵치티어순위",
          value: "전체 유저 중 평균 오버워치 티어 순위를 보여줍니다.",
        },
        {
          name: "/옵치티어초기화",
          value: "본인의 오버워치 티어 정보를 초기화합니다.",
        },
        { name: "/일정", value: "등록된 일정을 확인해요." },
        { name: "/일정추가", value: "새로운 일정을 등록할 수 있어요." },
        { name: "/저메추", value: "저녁 메뉴를 무작위로 추천해줘요." },
        { name: "/점메추", value: "점심 메뉴를 무작위로 추천해줘요." },
      )
      .setFooter({ text: `서버: ${interaction.guild.name}` })
      .setColor(0x00bfff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
