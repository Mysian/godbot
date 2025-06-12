// commands/bot-restart.js
const { SlashCommandBuilder } = require("discord.js");
const { exec } = require("child_process");

// 메인스탭 역할 ID
const MAIN_STAFF_ROLE_ID = "786128824365482025";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("봇재시작")
    .setDescription("메인스탭만 사용 가능: 봇을 pm2로 재시작합니다."),

  async execute(interaction) {
    // 길드에서 실행됐는지 확인
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: "❌ 서버 내에서만 사용 가능한 명령어입니다.", ephemeral: true });
    }

    // 명령어 입력 유저가 메인스탭 역할을 갖고 있는지 체크
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(MAIN_STAFF_ROLE_ID)) {
      return interaction.reply({ content: "❌ 이 명령어는 메인스탭(관리진)만 사용할 수 있습니다.", ephemeral: true });
    }

    await interaction.reply({
      content: "♻️ 봇을 재시작합니다! 약 3~5초 뒤에 자동으로 다시 연결될 거예요.",
      ephemeral: true
    });

    // 응답 보내고 1초 뒤 pm2 restart index.js 실행 (이 시점 이후 프로세스가 바로 리스타트됨)
    setTimeout(() => {
      exec("pm2 restart index.js", (err, stdout, stderr) => {
        // 재시작되면 이 콜백엔 거의 못 옴(프로세스가 바로 죽기 때문)
      });
    }, 1000);
  }
};
