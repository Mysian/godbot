require('dotenv').config();
const { REST, Routes } = require('discord.js');

const token = process.env.TOKEN; // 또는 process.env.DISCORD_TOKEN 네 환경에 맞게!
const clientId = process.env.CLIENT_ID; // 디스코드 개발자 포털의 애플리케이션 ID
const guildId = process.env.GUILD_ID;   // 테스트할 디스코드 서버(길드) ID

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🧹 길드 명령어 전체 삭제 시도...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] }
    );
    console.log('✅ 길드 명령어 전체 삭제 완료!');
  } catch (error) {
    console.error('❌ 명령어 삭제 실패:', error);
  }
})();
