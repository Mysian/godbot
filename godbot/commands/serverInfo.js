// 📁 commands/serverInfo.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("서버안내")
    .setDescription("까리한 디스코드 서버 정보를 안내합니다."),

  async execute(interaction) {
    await interaction.reply({
      ephemeral: true, // ✅ 추가된 부분: 입력자에게만 보이게
      embeds: [
        {
          title: "📌 까리한 디스코드 서버 안내",
          description: "**20세 이상 게이밍 유저들의 커뮤니티 서버입니다.**",
          color: 0xffcc00,
          fields: [
            {
              name: "🔗 초대 링크",
              value: "<https://discord.gg/kkari>",
            },
            {
              name: "📜 이용 수칙",
              value: "<#1211656980012212264>",
              inline: true,
            },
            {
              name: "📘 서버 규칙",
              value: "<#1351845690426261515>",
              inline: true,
            },
            {
              name: "⚠️ 유의사항",
              value:
                "• **미성년자 이용 불가**\n• **레벨 0 상태로 7일 이상 경과 시 추방**\n• **30일 이상 미접속 시 추방**",
            },
            {
              name: "📖 서버 탄생 배경",
              value:
                "아주 오래전, 소수의 지인들과 함께 오버워치, 레식, 에이펙스를 하며 소중한 시간을 보냈던 서버입니다. 시간이 흘러 각자 바빠졌지만, 어느 날 '리썰 컴퍼니'라는 게임이 등장했고, 그 계기로 다시 함께 모이게 되었죠. 웃고, 장난치고, 감탄하던 그 시절의 감정을 다시금 느끼게 되었고, 이 경험을 나누고자 서버를 홍보하게 되었습니다. 그렇게 **‘까리한 디스코드’**가 태어났습니다.",
            },
          ],
          footer: {
            text: "⚡ 함께하는 그 순간이 소중하니까!",
          },
        },
      ],
    });
  },
};
