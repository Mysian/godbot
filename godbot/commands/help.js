const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("이 봇에서 사용할 수 있는 주요 명령어를 안내합니다."),

  async execute(interaction) {
    const embeds = [];

    // ---- 1페이지: 프로필/호감도/정수 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 안내 (1/4)")
        .setDescription("주요 시스템 명령어를 소개합니다. (프로필/호감도/정수)")
        .addFields(
          { name: "🌟 __[프로필 시스템]__", value: "\u200B" },
          { name: "📝 /프로필등록", value: "서버에 나만의 프로필을 등록해요.", inline: true },
          { name: "👤 /프로필 [유저명]", value: "자신 또는 다른 유저의 프로필을 조회해요.", inline: true },
          { name: "🏆 /호감도순위", value: "유저별 호감도 랭킹을 확인해요.", inline: true },
          { name: "❤️ /호감도지급 [유저]", value: "다른 유저에게 호감도를 지급! (대상마다 하루 1회 가능)", inline: true },
          { name: "💔 /호감도차감 [유저]", value: "다른 유저의 호감도를 차감! (대상마다 하루 1회 가능)", inline: true },

          { name: "\u200B", value: "💠 __[정수 (서버 화폐)]__", inline: false },
          { name: "💼 /인벤토리", value: "내가 가진 정수 아이템(소모품/스킬/강화)을 확인!", inline: true },
          { name: "🛒 /정수상점", value: "파랑 정수(BE)로 아이템 구매!", inline: true },
          { name: "💸 /정수송금 [유저] [금액]", value: "다른 유저에게 정수 송금 (수수료 10%)", inline: true },
          { name: "🔝 /정수순위", value: "정수 보유 랭킹 TOP 확인", inline: true },
          { name: "🔍 /정수조회 [유저]", value: "유저별 정수/가계부 내역 조회", inline: true },
          { name: "🎁 /정수획득", value: "정수 획득! (출석, 알바, 도박 등)", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 2페이지: 챔피언/배틀/모험 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 안내 (2/4)")
        .setDescription("챔피언 시스템/배틀/거래/모험 명령어")
        .addFields(
          { name: "👑 __[챔피언 시스템]__", value: "\u200B" },
          { name: "👥 /내챔피언", value: "내가 소유한 챔피언 목록 확인!", inline: true },
          { name: "🎁 /챔피언획득", value: "챔피언 랜덤 획득!", inline: true },
          { name: "🗑️ /챔피언유기", value: "원하는 챔피언을 유기(삭제)!", inline: true },
          { name: "🛒 /챔피언거래소", value: "챔피언 사고팔기 (정수 사용)", inline: true },

          { name: "\u200B", value: "🛠️ __[챔피언 강화/랭킹/전적]__", inline: false },
          { name: "🔧 /챔피언강화", value: "챔피언 강화! 가끔 대성공 발생", inline: true },
          { name: "⚡ /챔피언한방강화", value: "5/10/20회 일괄 강화!", inline: true },
          { name: "🏅 /챔피언강화순위", value: "챔피언 강화 TOP 랭킹!", inline: true },
          { name: "📈 /챔피언강화전적 [유저]", value: "유저별 강화 전적", inline: true },

          { name: "\u200B", value: "⚔️ __[챔피언 배틀]__", inline: false },
          { name: "⚔️ /챔피언배틀 [유저]", value: "유저와 챔피언 1:1 배틀!", inline: true },
          { name: "📖 /챔피언배틀안내", value: "챔피언 배틀 설명서", inline: true },
          { name: "📊 /챔피언배틀전적 [유저]", value: "배틀 전적 확인", inline: true },
          { name: "🥇 /챔피언배틀전적순위", value: "배틀 승리 랭킹!", inline: true },

          { name: "\u200B", value: "🌌 __[모험 시스템]__", inline: false },
          { name: "🌌 /모험", value: "자신의 챔피언으로 무한의 모험을 떠납니다.", inline: true },
          { name: "🏆 /모험순위", value: "모험 스테이지별 순위 확인!", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 3페이지: 서버 유틸/이벤트 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 안내 (3/4)")
        .setDescription("서버 생활을 도와주는 유틸 & 이벤트 명령어")
        .addFields(
          { name: "📅 /일정", value: "공유된 일정 확인", inline: true },
          { name: "➕ /일정추가", value: "일정 공유 등록", inline: true },
          { name: "🍱 /점메추", value: "점심 메뉴 추천!", inline: true },
          { name: "🍛 /저메추", value: "저녁 메뉴 추천!", inline: true },
          { name: "📰 /게임뉴스", value: "최신 게임 뉴스 3개!", inline: true },
          { name: "🕹️ /게임", value: "미니게임 즐기기!", inline: true },
          { name: "🗳️ /강퇴투표", value: "음성채널 유저 투표 추방!", inline: true },
          { name: "👑 /스탭", value: "스탭(운영진) 목록/호출", inline: true },
          { name: "🔮 /오늘의운세", value: "매일 자정 운세 확인!", inline: true },
          { name: "🚚 /이동 [음성채널명]", value: "입력한 음성채널로 이동 (연결된 상태여야 함)", inline: true },
          { name: "📢 /모집", value: "모집방에 글 게시 (어디서든 사용 가능)", inline: true },
          { name: "📚 /도움말", value: "지금 보는 이 도움말!", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 4페이지: 서버 안내/규칙/신고 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 안내 (4/4)")
        .setDescription("서버 안내, 규칙, 신고 명령어")
        .addFields(
          { name: "ℹ️ /서버안내", value: "서버 첫인사 & 주요정보 안내", inline: true },
          { name: "📜 /서버규칙", value: "서버 전체 규칙 확인", inline: true },
          { name: "🚨 /신고", value: "유저 신고 (익명 가능)", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
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
