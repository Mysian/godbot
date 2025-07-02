// commands/level-guide.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const content = `
**🎂오늘 생일** : 추가 경험치 부스트 +100  
**서버 부스터 유저** : 추가 경험치 부스트 +66, 그라데이션 닉네임, AI채팅 해금  
**회귀자** : 레벨 2,000 환생 2회차 플레이어

**레벨별 권한/혜택 안내**

🔰 **Lv.0**  
- 신규 가입자 (⚠️ 7일간 0레벨이면 추방)
  
🌱 **Lv.1**  
- 스레드 메시지 보내기 권한

🌱 **Lv.2**  
- 애옹봇, 마냥봇 사용 가능

🌱 **Lv.3**  
- 파일 첨부 권한  
- \`📢│그리운_사람을_불러봅니다\` 채널 사용 가능

🌱 **Lv.4**  
- 링크 첨부, 화면 공유 권한  
- \`💜│크시ㆍ채팅방\`, \`🎮│크시ㆍ끝말잇기\` 사용 가능

🌱 **Lv.5**  
- 생일축하ㆍ등록, 노래봇(뽀삐/여우) 채널 사용 가능

✨ **Lv.10**  
- 외부 이모지/사운드보드 권한  
- \`📷│갤러리ㆍ추억\` 사용 가능

✨ **Lv.15**  
- 외부 스티커/외부 사운드 권한  
- 노래봇(하리) 채널 사용 가능

✨ **Lv.20**  
- 공개 스레드(일반채팅방) 생성  
- 스테이지 채널 발언권 요청 가능

✨ **Lv.30**  
- 이벤트 생성  
- \`📝│Diaryㆍ일기\` 사용 가능

✨ **Lv.40**  
- 투표 만들기  
- \`🕹│게임봇ㆍ미니게임\` 사용 가능

🌟 **Lv.50**  
- '활동' 사용, /디데이 해금

🌟 **Lv.60**  
- 비공개 스레드 만들기 권한

🌟 **Lv.70**  
- /afk(부재응답) 해금

🔥 **Lv.100**  
- 외부 앱 사용  
- \`🎴│아리ㆍ채널③\` 사용 가능

💎 **Lv.200**  
- /다운로드(채널 전체 파일 다운) 해금

🚀 **Lv.500**  
- /tts(까미봇) 해금

🏅 **Lv.1000**  
- 이모지, 스티커, 사운드보드 추가 가능

🏆 **Lv.2000**  
- 별명 자유 변경 가능

---
**레벨이 오를 때마다 추가 경험치 부스트가 증가합니다!**
`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('레벨가이드')
    .setDescription('레벨별 권한 및 혜택 안내'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🌈 레벨 가이드')
      .setDescription(content)
      .setColor(0x7DDFFF)
      .setFooter({ text: "까리한 디스코드 레벨 시스템" })
      .setTimestamp();
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
