const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("이 봇에서 사용할 수 있는 주요 명령어를 안내합니다."),

  async execute(interaction) {
    const embed1 = new EmbedBuilder()
      .setTitle("📚 도움말 안내 (1/2)")
      .setDescription("이 봇에서 사용할 수 있는 주요 기능들을 소개합니다.")
      .addFields(
        // 🎮 게임 관련
        { name: "🎮 /게임", value: "러시안 룰렛 등 다양한 미니게임이 가능해요." },
        { name: "🗳️ /강퇴투표", value: "음성채널 내 투표로 유저를 추방해요." },
        { name: "📅 /일정", value: "등록된 일정을 확인할 수 있어요." },
        { name: "➕ /일정추가", value: "새로운 일정을 추가할 수 있어요." },

        // 🍚 메뉴 추천
        { name: "🍱 /점메추", value: "점심 메뉴를 무작위로 추천해줘요." },
        { name: "🍛 /저메추", value: "저녁 메뉴를 무작위로 추천해줘요." },

        // 🧑‍💼 계정 관리
        { name: "🆔 /계정", value: "유저의 계정 정보를 확인해요." },
        { name: "🛠️ /계정관리", value: "계정 정보를 등록하거나 수정해요." },

        // 📢 서버 관련
        { name: "ℹ️ /서버안내", value: "까리한 디스코드의 정보를 알려줘요." },
        { name: "🚀 /서버부스트현황", value: "부스트 수치와 부스트 유저를 보여줘요." },

        // 📶 상태 메시지
        { name: "💬 /상태", value: "특정 유저의 상태 메시지를 확인해요." },
        { name: "📝 /상태설정", value: "내 상태 메시지를 등록할 수 있어요." },

        // ⚠️ 신고
        { name: "🚨 /신고", value: "유저를 신고하고 서버에 기록해요." },

        // 📘 도움말
        { name: "📘 /도움말", value: "지금 입력한 이 명령어예요!" }
      )
      .setFooter({ text: `서버: ${interaction.guild.name}` })
      .setColor(0x00bfff)
      .setTimestamp();

    const embed2 = new EmbedBuilder()
      .setTitle("📚 도움말 안내 (2/2)")
      .setDescription("랭크 및 호감도 기능, 챔피언 시스템 안내")
      .addFields(
        // ❤️ 호감도 시스템
        { name: "❤️ /호감도 유저:@닉네임", value: "해당 유저의 호감도를 확인해요." },
        { name: "⬆️ /호감도올리기", value: "특정 유저의 호감도를 올려요." },
        { name: "⬇️ /호감도내리기", value: "특정 유저의 호감도를 내려요." },
        { name: "🏆 /호감도순위", value: "호감도 높은 TOP20을 보여줘요." },
        { name: "💀 /비호감도순위", value: "호감도 낮은 TOP20을 보여줘요." },

        // 🧠 롤 티어 시스템
        { name: "🧠 /롤티어", value: "특정 유저의 롤 티어를 확인해요." },
        { name: "📌 /롤티어등록", value: "내 롤 티어를 포지션별로 등록해요." },
        { name: "📊 /롤티어순위", value: "전체 평균 롤 티어 순위를 보여줘요." },
        { name: "🗑️ /롤티어초기화", value: "내 롤 티어 정보를 초기화해요." },

        // 🔫 옵치 티어 시스템
        { name: "🔫 /옵치티어", value: "유저의 오버워치 티어 정보를 확인해요." },
        { name: "📌 /옵치티어등록", value: "내 오버워치 티어 정보를 등록해요." },
        { name: "📊 /옵치티어순위", value: "오버워치 티어 순위를 보여줘요." },
        { name: "🗑️ /옵치티어초기화", value: "오버워치 티어 정보를 초기화해요." },

        // 🧿 챔피언 강화 시스템
        { name: "🎁 /챔피언획득", value: "무작위 롤 챔피언을 1개 획득해요. (1회 한정)" },
        { name: "🔧 /챔피언강화", value: "보유 챔피언을 최대 999강까지 강화할 수 있어요." },
        { name: "🏅 /챔피언강화순위", value: "강화 순위를 확인할 수 있어요." }
      )
      .setFooter({ text: `서버: ${interaction.guild.name}` })
      .setColor(0x00bfff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed1, embed2], ephemeral: true });
  },
};
