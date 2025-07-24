const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("이 봇에서 사용할 수 있는 주요 명령어를 안내합니다."),

  async execute(interaction) {
    const embeds = [];

    // ---- 1페이지: 서버 이용 안내/규칙/신고/민원/스탭/주요 생활 명령어 + 관계 명령어 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 (1/4)")
        .setDescription([
          "서버 이용 안내 및 신고/문의/운영진, 주요 생활 명령어"
        ].join('\n'))
        .addFields(
          { name: "ℹ️ /서버안내", value: "서버 첫인사 & 주요정보 안내", inline: true },
          { name: "📜 /서버규칙", value: "서버 전체 규칙 확인", inline: true },
          { name: "❣️ /스탭", value: "스탭(운영진) 목록/호출", inline: true },
          { name: "🚨 /신고", value: "유저 신고 (익명 가능)", inline: true },
          { name: "📢 /민원", value: "민원/제보/문의/건의", inline: true },
          // 추가: 게임/서버 태그 설정
          { name: "🏷️ /게임태그설정", value: "게임 역할 태그를 설정", inline: true },
          { name: "🏷️ /서버태그설정", value: "서버 이용 태그를 설정", inline: true },
          { name: "\u200B", value: "------", inline: false },
          { name: "🗳️ /강퇴투표", value: "음성채널 유저 투표 추방", inline: true },
          { name: "📢 /모집", value: "모집방에 글 게시", inline: true },
          { name: "📅 /일정", value: "일정 조회/공유/관리", inline: true },
          { name: "👥 /팀짜기", value: "음성채널 유저 랜덤 두 팀 나누기", inline: true },
          { name: "🚚 /이동 [음성채널명]", value: "입력한 음성채널로 이동 (연결된 상태여야 함)", inline: true },
          { name: "\u200B", value: "------", inline: false },
          // 관계/우정 명령어 안내
          { name: "🔊 /이용현황", value: "기간별 음성채널/일반채팅 이용 현황 확인", inline: true },
          { name: "💞 /우정 [유저]", value: "자신이 특정 유저를 대하는 관계 확인", inline: true },
          { name: "🚫 /경고확인", value: "자신의 경고 이력 조회", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 2페이지: 서버 유틸/프로필/정수/호감도 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 (2/4)")
        .setDescription("서버 생활에 도움되는 유틸 & 정보 명령어")
        .addFields(
          { name: "📝 /프로필등록", value: "서버에 나만의 프로필 등록", inline: true },
          { name: "👤 /프로필 [유저명]", value: "자신 또는 다른 유저의 프로필 조회", inline: true },
          { name: "🏆 /호감도순위", value: "유저별 호감도 랭킹 확인", inline: true },
          { name: "❤️ /호감도지급 [유저]", value: "다른 유저에게 호감도 지급 (대상마다 하루 1회)", inline: true },
          { name: "💔 /호감도차감 [유저]", value: "다른 유저의 호감도 차감 (대상마다 하루 1회)", inline: true },
          { name: "💼 /인벤토리", value: "내 정수 아이템(소모품/스킬/강화) 확인", inline: true },
          { name: "🛒 /상점", value: "파랑 정수(BE)로 아이템 구매", inline: true },
          { name: "💸 /정수송금 [유저] [금액]", value: "유저에게 정수 송금 (수수료 10%)", inline: true },
          { name: "🔝 /정수순위", value: "정수 보유 랭킹 TOP 확인", inline: true },
          { name: "🔍 /정수조회 [유저]", value: "정수/가계부 내역 조회", inline: true },
          { name: "🎮 /게임검색", value: "스팀 게임을 여러 키워드, 단어로 검색", inline: true },
          { name: "📊 /전적검색", value: "닉네임#태그로 게임 전적을 조회", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 3페이지: 게임/미니게임/챔피언/겐지키우기 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 (3/4)")
        .setDescription("게임/미니게임/챔피언/모험/랭킹 명령어")
        .addFields(
          { name: "🎲 /게임", value: "미니게임 즐기기 (알바/도박/랜덤 등)", inline: true },
          { name: "🍱 /점메추", value: "점심 메뉴 추천", inline: true },
          { name: "🍛 /저메추", value: "저녁 메뉴 추천", inline: true },
          { name: "🔮 /오늘의운세", value: "매일 자정 운세 확인", inline: true },

          { name: "\u200B", value: "👑 __[챔피언 시스템]__", inline: false },
          { name: "👥 /내챔피언", value: "내 챔피언 목록 확인", inline: true },
          { name: "🎁 /챔피언획득", value: "챔피언 랜덤 획득", inline: true },
          { name: "🗑️ /챔피언유기", value: "챔피언 유기(삭제)", inline: true },
          { name: "🛒 /챔피언거래소", value: "챔피언 거래 (정수 사용)", inline: true },
          { name: "🔧 /챔피언강화", value: "챔피언 강화 (가끔 대성공)", inline: true },
          { name: "⚡ /챔피언한방강화", value: "일괄 강화", inline: true },
          { name: "🏅 /챔피언강화순위", value: "강화 TOP 랭킹", inline: true },
          { name: "📈 /챔피언강화전적 [유저]", value: "강화 전적", inline: true },
          { name: "⚔️ /챔피언배틀 [유저]", value: "챔피언 1:1 배틀", inline: true },
          { name: "🥇 /챔피언배틀전적순위", value: "배틀 승리 랭킹", inline: true },
          { name: "🌌 /모험", value: "내 챔피언으로 무한 모험", inline: true },
          { name: "🏆 /모험순위", value: "모험 스테이지별 순위", inline: true },

          { name: "\u200B", value: "🗡️ __[겐지키우기 미니게임]__", inline: false },
          { name: "🥷 /겐지키우기", value: "오버워치 겐지키우기! 점점 강해지는 영웅들을 상대로 라운드 도전", inline: true },
          { name: "🏅 /겐지랭크", value: "겐지키우기 유저 랭킹", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 4페이지: 후원 + 구독 안내 ----
embeds.push(
  new EmbedBuilder()
    .setTitle("💖 /후원 안내")
    .setDescription([
      "### 💝 후원 안내",
      "이 서버와 커뮤니티에 후원하고 싶다면 언제든 사용 가능합니다!",
      " • **후원금/상품** 모두 환영, 자세한 절차는 명령어 입력 후 안내",
      " • 후원금은 감사한 마음으로 관리, 별도 로그 채널에 안전하게 기록됩니다.",
      ""
    ].join('\n'))
    .setFooter({ text: "서버: 까리한 디스코드" })
    .setColor(0xFF69B4)
    .setTimestamp()
);

    // 페이지 버튼
    const getRow = (page, max) => new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === max)
    );

    let curPage = 0;
    const reply = await interaction.reply({
      embeds: [embeds[curPage]],
      components: [getRow(curPage, embeds.length - 1)],
      ephemeral: true
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300_000
    });

    collector.on("collect", async i => {
      if (i.customId === "prev") curPage--;
      if (i.customId === "next") curPage++;
      await i.update({
        embeds: [embeds[curPage]],
        components: [getRow(curPage, embeds.length - 1)],
        ephemeral: true
      });
    });

    collector.on("end", async () => {
      try {
        await reply.edit({ components: [] });
      } catch {}
    });
  },
};
