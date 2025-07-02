// commands/level-guide.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const pages = [
  {
    title: '🌈 레벨 가이드 ①',
    content: `
**@🎂오늘 생일** : 추가 경험치 부스트 +100  
**@Booster** : 추가 경험치 부스트 +66, 그라데이션 닉네임, AI채팅 해금  
**@회귀자** : 레벨 2,000 환생 2회차 플레이어

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
`
  },
  {
    title: '🌈 레벨 가이드 ②',
    content: `
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
`
  },
  {
    title: '🌈 레벨 가이드 ③',
    content: `
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
`
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('레벨가이드')
    .setDescription('레벨별 권한 및 혜택 안내'),
  async execute(interaction) {
    let page = 0;

    const getEmbed = (page) => new EmbedBuilder()
      .setTitle(pages[page].title)
      .setDescription(pages[page].content)
      .setColor(0x7DDFFF)
      .setFooter({ text: `까리한 디스코드 레벨 시스템 • ${page + 1} / 3` })
      .setTimestamp();

    const getRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('이전')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('next')
        .setLabel('다음')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === pages.length - 1)
    );

    const reply = await interaction.reply({
  embeds: [getEmbed(page)],
  components: [getRow()],
  ephemeral: true,
  fetchReply: true
});

const collector = reply.createMessageComponentCollector({
  componentType: ComponentType.Button,
  time: 300_000
});

collector.on("collect", async (btn) => {
  if (btn.user.id !== interaction.user.id) {
    return btn.reply({ content: "본인만 조작 가능합니다.", ephemeral: true });
  }
  if (btn.customId === "prev" && page > 0) page -= 1;
  else if (btn.customId === "next" && page < pages.length - 1) page += 1;

  await btn.deferUpdate();
  await interaction.editReply({ embeds: [getEmbed(page)], components: [getRow()] });
});

collector.on("end", async () => {
  try {
    await interaction.editReply({ components: [] });
  } catch {}
});
