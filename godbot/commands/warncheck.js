const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/warnings.json");

function loadWarnings() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

const rulePages = [
  {
    title: "A. 프로필 정보",
    desc: `1. 별명
가. 비속어 별명 금지  
나. 호명이 불가한 별명 금지  
다. 불쾌감을 유발하는 별명 금지

2. 자기소개  
가. 타 디스코드 서버 링크 금지  
나. 우울계/지뢰계 글 금지  
다. 타인 비방 금지  
라. 선정적/불쾌 요소 금지  
마. 친목/우결/컨셉 글 지양  
바. 정치적, 성향자, 과한 개인 어필 지양

3. 프로필 사진  
가. 선정적이고 폭력적인 사진 금지  
나. 불쾌감을 유발하는 사진 금지  
다. 타인의 사진으로 본인 행세 금지`
  },
  {
    title: "B. 채팅과 음성 대화",
    desc: `1. 채팅  
가. 분란, 갈등, 다툼을 유발하는 채팅 금지  
나. 과도한 태그(맨션) 행위 금지  
다. 동의되지 않은 타인에게 반말 금지  
라. 동의되지 않은 타인에게 욕설 금지  
마. 불쾌감을 유발하는 이모지/스티커 금지  
바. 불쾌감을 유발하는 이미지/동영상 금지  
사. 선정적인 이모지/스티커 금지  
아. 선정적인 이미지/동영상 금지  
자. 도배하는 채팅 금지  
차. 과한 컨셉의 채팅 지양  
카. 과한 부정적 채팅 지양  
타. 특정 게임을 비하하는 채팅 지양

2. 음성 대화  
가. 특정성이 성립되는 욕설 금지  
나. 실력 비하 및 무시하는 발언 금지  
다. 음성채널에서 수면/잠수 금지  
라. 잡음 및 소음 지속 금지  
마. 듣기만 하는 행위 금지  
바. 과도한 음성 변조 사용 금지  
사. 혼란 야기 발언 금지  
아. 과한 부정 발언 지양  
자. 게임 비하 대화 지양`
  },
  {
    title: "C. 공통 수칙",
    desc: `1. 잘못된 이용방법  
가. 개인적으로 유저 취하는 행위 금지  
나. 스팸, 홍보, 광고 금지  
다. 남미새 / 여미새 금지  
라. 채널 이용목적 위반 금지  
마. 게임 태그 미장착 금지  
바. 소통 일절 없음 지양  
사. 고의 게임 방해 금지

2. 거짓된 행동  
가. 미성년자 활동 금지  
나. 성별 조작 금지  
다. 과한 컨셉 금지  
라. 허위 신고 금지

3. 유저 차별  
가. 소통 방해 금지  
나. 즐겜러 비난 금지  
다. 이성 유저만 소통 금지  
라. 특정 유저 저격 금지

4. 상호존중  
가. 거절 의사 무시 금지  
나. 특정인 무시/비하 금지  
다. 모집 후 잠수/노쇼 금지  
라. 허언 금지  
마. 개인정보 강요 금지  
바. 개인정보 과노출 금지  
사. 제3자 노출 금지`
  },
  {
    title: "D. 관리 방침",
    desc: `1. 민원과 제보  
가. 민원센터 외 경로 지양  
나. 악질적 유저 묵인 금지  
다. 허위/불명확 신고 금지

2. 서버 기만 행위  
가. 뒷서버/유저 탈취 금지  
나. 시스템 빈틈 악용 금지  
다. 서버 시스템 피해 금지  
라. 개인 의견을 공식처럼 발언 금지  
마. 관리진 내부 사안 발설 금지`
  }
];

async function sendRuleEmbed(interaction) {
  let page = 0;

  const embed = new EmbedBuilder()
    .setTitle(`📚 서버 규칙 - ${rulePages[page].title}`)
    .setDescription(rulePages[page].desc)
    .setColor("Blue");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("prev").setLabel("◀ 이전").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("next").setLabel("다음 ▶").setStyle(ButtonStyle.Secondary)
  );

  const msg = await interaction.followUp({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 2 * 60 * 1000
  });

  collector.on("collect", async i => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: "이 버튼은 당신의 명령어에만 작동해요!", ephemeral: true });
    if (i.customId === "prev") page = (page - 1 + rulePages.length) % rulePages.length;
    else if (i.customId === "next") page = (page + 1) % rulePages.length;

    const newEmbed = EmbedBuilder.from(embed)
      .setTitle(`📚 서버 규칙 - ${rulePages[page].title}`)
      .setDescription(rulePages[page].desc);

    await i.update({ embeds: [newEmbed] });
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("경고확인")
    .setDescription("자신이 받은 경고 내용을 확인합니다."),

  async execute(interaction) {
    const warnings = loadWarnings();
    const userWarnings = warnings[interaction.user.id];

    if (!userWarnings || userWarnings.length === 0) {
      await interaction.reply({
        content: "✅ 당신은 현재 받은 경고가 없습니다.",
        ephemeral: true
      });
    } else {
      const embed = new EmbedBuilder()
        .setTitle("🚨 나의 경고 목록")
        .setColor("Red")
        .setDescription(`총 ${userWarnings.length}회의 경고 기록이 있습니다.`)
        .addFields(
          ...userWarnings.map((w, i) => ({
            name: `${i + 1}. [${w.code}]`,
            value: `• 사유: ${w.detail}\n• 일시: <t:${Math.floor(new Date(w.date).getTime() / 1000)}:f>\n• 담당 관리자: <@${w.mod}>`
          }))
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await sendRuleEmbed(interaction);
  }
};
