const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("디스코드에서 쓸 수 있는 모든 명령어 안내!"),

  async execute(interaction) {
    // 서버 배너/프로필 이미지 자동 불러오기
    const guild = interaction.guild;
    const bannerURL = guild.bannerURL({ size: 1024 }) || guild.iconURL({ size: 256 });

    // 도움말 카테고리별 임베드
    const embeds = [
      // 1. 프로필 시스템
      new EmbedBuilder()
        .setTitle("👤 프로필 시스템")
        .setDescription("서버에서 나를 표현하는 기능!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "/프로필등록", value: "서버에 개성있는 프로필 등록", inline: false },
          { name: "/프로필", value: "자신 또는 유저의 프로필 조회", inline: false },
          { name: "/호감도순위", value: "유저 호감도 순위 확인", inline: true },
          { name: "/호감도지급", value: "선택 유저에게 호감도 +1 (하루 1회, 여러명 가능)", inline: true },
          { name: "/호감도차감", value: "선택 유저에게 호감도 -1 (하루 1회, 여러명 가능)", inline: true },
        )
        .setFooter({ text: "📘 까리한 디스코드 프로필 시스템" })
        .setColor(0x19c2ff)
        .setTimestamp(),

      // 2. 정수(화폐) 시스템
      new EmbedBuilder()
        .setTitle("🔷 정수(화폐) 시스템")
        .setDescription("'파랑 정수 BE'로 즐기는 경제 시스템!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "/인벤토리", value: "내 소지품(소모품,스킬,강화아이템) 확인", inline: true },
          { name: "/정수상점", value: "정수로 아이템 구매", inline: true },
          { name: "/정수송금", value: "유저간 정수 송금 (수수료 10%)", inline: true },
          { name: "/정수순위", value: "정수 보유순 랭킹", inline: true },
          { name: "/정수조회", value: "유저별 정수 및 가계부 조회", inline: true },
          { name: "/정수획득", value: "정수 획득 (출석, 알바, 도박)", inline: true },
        )
        .setFooter({ text: "📘 까리한 디스코드 정수 시스템" })
        .setColor(0x15a3ff)
        .setTimestamp(),

      // 3. 챔피언 시스템
      new EmbedBuilder()
        .setTitle("🏆 챔피언 시스템")
        .setDescription("나만의 챔피언을 모으고, 강화하고, 배틀하라!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "/내챔피언", value: "내가 소유한 챔피언 목록 확인", inline: true },
          { name: "/챔피언강화", value: "소유 챔피언 강화", inline: true },
          { name: "/챔피언한방강화", value: "챔피언 다중 강화(5/10/20회)", inline: true },
          { name: "/챔피언강화순위", value: "강화 랭킹", inline: true },
          { name: "/챔피언강화전적", value: "개인 강화 전적", inline: true },
          { name: "/챔피언거래소", value: "챔피언 거래(정수로)", inline: true },
          { name: "/챔피언배틀", value: "유저와 1:1 배틀", inline: true },
          { name: "/챔피언배틀안내", value: "배틀 시스템 설명", inline: true },
          { name: "/챔피언배틀전적", value: "내/유저의 배틀 전적", inline: true },
          { name: "/챔피언배틀전적순위", value: "배틀 랭킹", inline: true },
          { name: "/챔피언획득", value: "랜덤 챔피언 획득", inline: true },
          { name: "/챔피언유기", value: "챔피언 폐기", inline: true },
        )
        .setFooter({ text: "📘 까리한 디스코드 챔피언 시스템" })
        .setColor(0x1076cf)
        .setTimestamp(),

      // 4. 서버 유틸 & 기타 기능
      new EmbedBuilder()
        .setTitle("🛠️ 서버 유틸 · 미니게임 · 기타")
        .setDescription("이벤트, 추천, 일정, 운세 등 잡기능!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "🍱 /점메추", value: "점심 메뉴 추천", inline: true },
          { name: "🍛 /저메추", value: "저녁 메뉴 추천", inline: true },
          { name: "📅 /일정", value: "공유 일정 확인", inline: true },
          { name: "➕ /일정추가", value: "일정 등록", inline: true },
          { name: "📢 /모집", value: "모집방에 글 게시", inline: true },
          { name: "📰 /게임뉴스", value: "최신 게임뉴스 3개 불러오기", inline: true },
          { name: "🎲 /게임", value: "미니게임(러시안룰렛 등)", inline: true },
          { name: "🗳️ /강퇴투표", value: "음성채널 내 투표로 잠수방 이동", inline: true },
          { name: "👨‍💼 /스탭", value: "스탭 목록/호출", inline: true },
          { name: "🔮 /오늘의운세", value: "오늘의 운세(자정 리셋)", inline: true },
          { name: "🔊 /이동", value: "음성채널 이동(연결 상태 필요)", inline: true },
        )
        .setFooter({ text: "📘 잡기능 & 유틸 명령어도 다양하게!" })
        .setColor(0x1c84ec)
        .setTimestamp(),

      // 5. 규칙 & 신고
      new EmbedBuilder()
        .setTitle("📑 서버 규칙 & 신고 안내")
        .setDescription("서버 이용 전 반드시 확인!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "/서버안내", value: "서버 첫 인사/소개", inline: true },
          { name: "/신고", value: "유저 신고 (익명 가능)", inline: true },
        )
        .setFooter({ text: "문의는 운영진 DM 또는 #민원센터 이용" })
        .setColor(0x444857)
        .setTimestamp(),
    ];

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
      time: 120_000
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
