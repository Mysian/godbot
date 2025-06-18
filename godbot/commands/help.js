const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("이 봇에서 사용할 수 있는 주요 명령어를 안내합니다."),

  async execute(interaction) {
    const guild = interaction.guild;
    const bannerURL = guild.bannerURL({ size: 1024 }) || guild.iconURL({ size: 256 });
    const embeds = [];

    // ---- 1페이지: 프로필 시스템 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("👤 프로필 시스템")
        .setDescription("서버에서 나를 표현하는 다양한 기능들!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "\u200B", value: "__**[프로필]**__", inline: false },
          { name: "📝 /프로필등록", value: "서버에 나만의 개성있는 프로필 등록", inline: true },
          { name: "👤 /프로필", value: "자신 또는 유저의 프로필 조회", inline: true },
          { name: "🏆 /호감도순위", value: "유저 호감도 순위 확인", inline: true },
          { name: "❤️ /호감도지급", value: "선택 유저에게 호감도 +1 [하루마다 대상마다 쿨타임, 여러명 가능]", inline: false },
          { name: "💔 /호감도차감", value: "선택 유저에게 호감도 -1 [하루마다 대상마다 쿨타임, 여러명 가능]", inline: false }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 2페이지: 정수(화폐) 시스템 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("🔷 정수(화폐) 시스템")
        .setDescription("파랑 정수(BE)로 즐기는 경제 시스템!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "\u200B", value: "__**[정수/아이템]**__", inline: false },
          { name: "🎒 /인벤토리", value: "내가 소유한 정수 아이템 확인 (소모품, 스킬, 강화 아이템)", inline: true },
          { name: "🛒 /정수상점", value: "파랑 정수(BE)로 아이템 구매 (소모품, 스킬, 강화 아이템)", inline: true },
          { name: "💸 /정수송금", value: "유저간 정수 송금 (수수료 10%)", inline: true },
          { name: "🏅 /정수순위", value: "정수 보유순으로 순위 조회", inline: true },
          { name: "🔍 /정수조회", value: "유저의 정수, 가계부 확인", inline: true },
          { name: "💎 /정수획득", value: "정수 획득 (출석, 알바, 도박)", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x18b5fa)
        .setTimestamp()
    );

    // ---- 3페이지: 챔피언 시스템 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("🏆 챔피언 시스템")
        .setDescription("나만의 챔피언을 수집하고, 강화하고, 거래하고, 배틀!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "\u200B", value: "__**[챔피언]**__", inline: false },
          { name: "👥 /내챔피언", value: "본인 소유 챔피언 확인", inline: true },
          { name: "🔧 /챔피언강화", value: "소유한 챔피언 강화", inline: true },
          { name: "🔥 /챔피언한방강화", value: "챔피언 강화 5/10/20회 한 번에 진행", inline: true },
          { name: "🏅 /챔피언강화순위", value: "강화 순위 확인", inline: true },
          { name: "📊 /챔피언강화전적", value: "유저의 강화 전적 조회", inline: true },
          { name: "💱 /챔피언거래소", value: "챔피언 거래 (정수로 사고팔기)", inline: true },
          { name: "⚔️ /챔피언배틀", value: "유저와 1:1 챔피언 배틀", inline: true },
          { name: "📘 /챔피언배틀안내", value: "챔피언 배틀 시스템 설명서", inline: true },
          { name: "📈 /챔피언배틀전적", value: "유저의 배틀 전적 확인", inline: true },
          { name: "🏆 /챔피언배틀전적순위", value: "배틀 랭킹 조회", inline: true },
          { name: "🎁 /챔피언획득", value: "챔피언 랜덤 획득", inline: true },
          { name: "🗑️ /챔피언유기", value: "소유 챔피언 폐기", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x155b99)
        .setTimestamp()
    );

    // ---- 4페이지: 서버 유틸/이벤트/기타 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("🛠️ 서버 유틸 & 기타 기능")
        .setDescription("다양한 추천, 이벤트, 일정, 운세, 미니게임 등!")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "\u200B", value: "__**[유틸/이벤트/잡기능]**__", inline: false },
          { name: "🍱 /점메추", value: "오늘의 점심 메뉴 추천", inline: true },
          { name: "🍛 /저메추", value: "오늘의 저녁 메뉴 추천", inline: true },
          { name: "📅 /일정", value: "공유된 일정 확인", inline: true },
          { name: "➕ /일정추가", value: "일정 등록/공유", inline: true },
          { name: "📢 /모집", value: "모집방에 글 게시 (어디서 입력해도 모집방에 등록됨)", inline: true },
          { name: "📰 /게임뉴스", value: "최신 '게임' 뉴스 3개", inline: true },
          { name: "🎲 /게임", value: "미니게임(러시안룰렛 등)", inline: true },
          { name: "🗳️ /강퇴투표", value: "음성채널 유저 투표로 잠수방 이동", inline: true },
          { name: "👨‍💼 /스탭", value: "스탭 목록 확인/호출", inline: true },
          { name: "🔮 /오늘의운세", value: "오늘의 운세 (자정 리셋)", inline: true },
          { name: "🔊 /이동", value: "입력한 음성채널로 이동 (연결 필요)", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x777edc)
        .setTimestamp()
    );

    // ---- 5페이지: 규칙 & 신고 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📑 서버 규칙 & 신고")
        .setDescription("서버 이용 전 필독! 문의는 DM 또는 #민원센터")
        .setThumbnail(bannerURL)
        .addFields(
          { name: "ℹ️ /서버안내", value: "서버 첫 인사/소개", inline: true },
          { name: "🚨 /신고", value: "유저 신고 (익명 가능)", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x444857)
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
