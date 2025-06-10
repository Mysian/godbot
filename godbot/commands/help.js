const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("이 봇에서 사용할 수 있는 주요 명령어를 안내합니다."),

  async execute(interaction) {
    const embeds = [];

    // ---- 1페이지: 서버안내/규칙 + 프로필 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 안내 (1/3)")
        .setDescription("가장 많이 쓰는 주요 기능 명령어를 안내합니다.")
        .addFields(
          // 서버 안내/규칙
          { name: "ℹ️ /서버안내", value: "서버의 초대링크, 소개, 특징, 이용수칙을 안내합니다.", inline: false },
          { name: "📜 /서버규칙 옵션:A/B/C/D", value: "프로필/채팅/공통/관리방침 규칙을 안내합니다.", inline: false },
          // 프로필 관련
          { name: "\u200B", value: "__**[프로필 시스템]**__", inline: false },
          { name: "📝 /프로필등록", value: "나만의 프로필을 등록해요.", inline: true },
          { name: "✏️ /프로필수정", value: "등록한 프로필 정보 중 일부를 수정해요.", inline: true },
          { name: "👤 /내프로필", value: "내 프로필과 호감도, 게임 승패 정보를 확인해요.", inline: true },
          { name: "🔍 /프로필조회 유저:@닉네임", value: "다른 유저의 프로필을 확인해요.", inline: true },
          { name: "❤️ /호감도지급 유저:@닉네임", value: "다른 유저에게 호감도를 +1 줘요. [유저마다 24시간 쿨타임 존재]", inline: false },
          { name: "💔 /호감도차감 유저:@닉네임", value: "다른 유저의 호감도를 -1 깎아요. [유저마다 24시간 쿨타임 존재]", inline: false }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 2페이지: 챔피언/배틀 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 안내 (2/3)")
        .setDescription("챔피언/강화/배틀 관련 주요 명령어")
        .addFields(
          { name: "\u200B", value: "__**[챔피언 강화/배틀 시스템]**__", inline: false },
          { name: "🎁 /챔피언획득", value: "무작위 롤 챔피언을 1개 획득합니다. (1회 한정)", inline: true },
          { name: "🔧 /챔피언강화", value: "보유 챔피언을 최대 999강까지 강화할 수 있습니다.", inline: true },
          { name: "🏅 /챔피언강화순위", value: "강화 횟수 상위 순위를 보여줍니다.", inline: true },
          { name: "⚔️ /챔피언배틀", value: "상대방과 1:1로 챔피언 배틀을 시작합니다.", inline: false },
          { name: "📘 /챔피언배틀안내", value: "챔피언배틀과 관련한 상세 안내를 확인할 수 있습니다.", inline: false },
          { name: "🔍 /챔피언조회 유저:@닉네임", value: "해당 유저의 챔피언/스킬/쿨타임 정보를 확인합니다.", inline: true },
          { name: "👥 /내챔피언", value: "내가 보유한 챔피언 정보/스킬을 확인합니다.", inline: true },
          { name: "🗑️ /챔피언유기", value: "획득한 챔피언을 유기합니다.", inline: true }
        )
        .setFooter({ text: "서버: 까리한 디스코드" })
        .setColor(0x00bfff)
        .setTimestamp()
    );

    // ---- 3페이지: 기타 기능 ----
    embeds.push(
      new EmbedBuilder()
        .setTitle("📚 도움말 안내 (3/3)")
        .setDescription("기타 명령어 안내 & 참고")
        .addFields(
          { name: "\u200B", value: "__**[게임/이벤트/잡기능]**__", inline: false },
          { name: "🎮 /게임", value: "러시안룰렛 등 미니게임을 즐길 수 있습니다.", inline: true },
          { name: "🗳️ /강퇴투표", value: "음성채널 내 투표로 유저를 추방합니다.", inline: true },
          { name: "📅 /일정", value: "등록된 일정을 확인합니다.", inline: true },
          { name: "➕ /일정추가", value: "새로운 일정을 추가할 수 있습니다.", inline: true },
          { name: "🍱 /점메추", value: "점심 메뉴를 무작위로 추천합니다.", inline: true },
          { name: "🍛 /저메추", value: "저녁 메뉴를 무작위로 추천합니다.", inline: true },
          { name: "🚀 /서버부스트현황", value: "부스트 수치와 부스트 유저를 보여줍니다.", inline: true },
          { name: "📘 /도움말", value: "지금 보고 있는 이 명령어입니다!", inline: true },
          { name: "\u200B", value: "__**[도움말 및 안내]**__", inline: false },
          { name: "❓ 명령어 관련", value: "궁금한 명령어나 사용법은 언제든 /도움말로 확인하세요.", inline: false },
          { name: "📣 기타 문의", value: "운영진 DM 또는 #민원센터 채널 이용", inline: false }
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
