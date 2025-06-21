const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/warnings.json");

function loadWarnings() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveWarnings(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
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
    .setName("경고")
    .setDescription("유저에게 서버 규칙에 따른 경고를 부여합니다.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName("유저").setDescription("경고를 줄 유저").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("사유코드")
        .setDescription("서버 규칙에 따른 사유 코드 (예: A-1-가)")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("상세사유")
        .setDescription("어떤 사안이 발생했는지 구체적으로 작성해주세요.")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const code = interaction.options.getString("사유코드");
    const detail = interaction.options.getString("상세사유");

    const warnings = loadWarnings();
    const id = target.id;
    if (!warnings[id]) warnings[id] = [];
    warnings[id].push({
      code,
      detail,
      date: new Date().toISOString(),
      mod: interaction.user.id
    });

    const count = warnings[id].length;
    saveWarnings(warnings);

    const member = await interaction.guild.members.fetch(id).catch(() => null);
    if (member) {
      let duration = 0;
      if (count === 1) duration = 1000 * 60 * 60 * 24;
      else if (count === 2) duration = 1000 * 60 * 60 * 24 * 7;
      else if (count >= 3) {
        await member.kick(`누적 경고 3회 (${code})`);
      }
      if (duration > 0) {
        await member.timeout(duration, `경고 누적 (${code})`);
      }
    }

    try {
      await target.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🚫 경고 알림")
            .setDescription(`서버 규칙 **${code}** 위반으로 경고가 부여되었습니다.`)
            .addFields(
              { name: "📌 사유", value: detail },
              { name: "📅 일시", value: `<t:${Math.floor(Date.now() / 1000)}:f>` },
              { name: "📎 경고 누적", value: `${count}회` }
            )
            .setColor("Red")
        ]
      });
    } catch (e) {}

    await interaction.reply({
      content: `✅ <@${target.id}> 유저에게 경고를 부여했습니다. (총 ${count}회)`,
      ephemeral: true
    });

    // 서버규칙 버튼
    await sendRuleEmbed(interaction);
  }
};
