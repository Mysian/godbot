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

// --- 코드-설명 테이블 ---
const reasonChoices = [
  // A. 프로필 정보
  { name: "A-1-가. 비속어 별명 금지", value: "A-1-가" },
  { name: "A-1-나. 호명이 불가한 별명 금지", value: "A-1-나" },
  { name: "A-1-다. 불쾌감을 유발하는 별명 금지", value: "A-1-다" },
  { name: "A-2-가. 타 디스코드 서버 링크 금지", value: "A-2-가" },
  { name: "A-2-나. 우울계/지뢰계 글 금지", value: "A-2-나" },
  { name: "A-2-다. 타인 비방 금지", value: "A-2-다" },
  { name: "A-2-라. 선정적/불쾌 요소 금지", value: "A-2-라" },
  { name: "A-2-마. 친목/우결/컨셉 글 지양", value: "A-2-마" },
  { name: "A-2-바. 정치적, 성향자, 과한 개인 어필 지양", value: "A-2-바" },
  { name: "A-3-가. 선정적/폭력적 사진 금지", value: "A-3-가" },
  { name: "A-3-나. 불쾌감을 유발하는 사진 금지", value: "A-3-나" },
  { name: "A-3-다. 타인 사진으로 본인 행세 금지", value: "A-3-다" },

  // B. 채팅/음성
  { name: "B-1-가. 분란/갈등/다툼 채팅 금지", value: "B-1-가" },
  { name: "B-1-나. 과도한 태그(맨션) 행위 금지", value: "B-1-나" },
  { name: "B-1-다. 동의없는 반말 금지", value: "B-1-다" },
  { name: "B-1-라. 동의없는 욕설 금지", value: "B-1-라" },
  { name: "B-1-마. 불쾌감 이모지/스티커 금지", value: "B-1-마" },
  { name: "B-1-바. 불쾌감 이미지/동영상 금지", value: "B-1-바" },
  { name: "B-1-사. 선정적 이모지/스티커 금지", value: "B-1-사" },
  { name: "B-1-아. 선정적 이미지/동영상 금지", value: "B-1-아" },
  { name: "B-1-자. 도배(텍스트/이모지/스티커) 금지", value: "B-1-자" },
  { name: "B-1-차. 과한 컨셉 채팅 지양", value: "B-1-차" },
  { name: "B-1-카. 과한 부정적 채팅 지양", value: "B-1-카" },
  { name: "B-1-타. 특정게임 비하채팅 지양", value: "B-1-타" },
  { name: "B-2-가. 특정성 욕설 금지", value: "B-2-가" },
  { name: "B-2-나. 실력비하/무시 발언 금지", value: "B-2-나" },
  { name: "B-2-다. 음성채널 수면/잠수 금지", value: "B-2-다" },
  { name: "B-2-라. 불필요 잡음/소음 지속 금지", value: "B-2-라" },
  { name: "B-2-마. 듣기만 하는 행위(듣보) 금지", value: "B-2-마" },
  { name: "B-2-바. 과도한 음성변조 사용 금지", value: "B-2-바" },
  { name: "B-2-사. 대화/게임 혼란 유발 금지", value: "B-2-사" },
  { name: "B-2-아. 필요이상 부정발언 지양", value: "B-2-아" },
  { name: "B-2-자. 특정게임 비하 대화 지양", value: "B-2-자" },

  // C. 공통수칙
  { name: "C-1-가. 유저 개인취득 행위 금지", value: "C-1-가" },
  { name: "C-1-나. 스팸/홍보/광고 금지", value: "C-1-나" },
  { name: "C-1-다. 남미새/여미새 행위 금지", value: "C-1-다" },
  { name: "C-1-라. 채널 목적 위반 금지", value: "C-1-라" },
  { name: "C-1-마. 게임태그 미장착 금지", value: "C-1-마" },
  { name: "C-1-바. 게임소통 없음 지양", value: "C-1-바" },
  { name: "C-1-사. 고의적 게임방해 금지", value: "C-1-사" },
  { name: "C-2-가. 미성년자 활동 금지", value: "C-2-가" },
  { name: "C-2-나. 성별조작(넷카마) 금지", value: "C-2-나" },
  { name: "C-2-다. 과한 컨셉 금지", value: "C-2-다" },
  { name: "C-2-라. 허위신고/거짓민원 금지", value: "C-2-라" },
  { name: "C-3-가. 특정유저간 소통 차단 금지", value: "C-3-가" },
  { name: "C-3-나. 즐겜러 비난/폄하 금지", value: "C-3-나" },
  { name: "C-3-다. 이성유저만 소통 금지", value: "C-3-다" },
  { name: "C-3-라. 특정유저 저격 금지", value: "C-3-라" },
  { name: "C-4-가. 거절/부정 의사 무시 금지", value: "C-4-가" },
  { name: "C-4-나. 특정인 무시/비하 금지", value: "C-4-나" },
  { name: "C-4-다. 모집 후 잠수/노쇼 금지", value: "C-4-다" },
  { name: "C-4-라. 허언(거짓말) 금지", value: "C-4-라" },
  { name: "C-4-마. 개인정보 강요 금지", value: "C-4-마" },
  { name: "C-4-바. 과한 개인정보 노출 금지", value: "C-4-바" },
  { name: "C-4-사. 타인 개인정보 제3자 노출 금지", value: "C-4-사" },

  // D. 관리 방침
  { name: "D-1-가. 민원센터 외 민원/제보 지양", value: "D-1-가" },
  { name: "D-1-나. 악질유저/행위 묵인 금지", value: "D-1-나" },
  { name: "D-1-다. 허위/불명확 신고 금지", value: "D-1-다" },
  { name: "D-2-가. 뒷서버/유저 탈취 금지", value: "D-2-가" },
  { name: "D-2-나. 시스템 결함/빈틈 악용 금지", value: "D-2-나" },
  { name: "D-2-다. 서버시스템 피해 금지", value: "D-2-다" },
  { name: "D-2-라. 의견을 공식처럼 발언 금지", value: "D-2-라" },
  { name: "D-2-마. 관리진 내부사안 발설 금지", value: "D-2-마" }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("경고")
    .setDescription("유저에게 서버 규칙에 따른 경고를 부여합니다.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName("유저").setDescription("경고를 줄 유저").setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("사유코드")
        .setDescription("경고 사유를 선택하세요.")
        .setRequired(true)
        .addChoices(...reasonChoices)
    )
    .addStringOption(option =>
      option.setName("상세사유").setDescription("어떤 사안이 발생했는지 구체적으로 작성해주세요.").setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const code = interaction.options.getString("사유코드");
    const detail = interaction.options.getString("상세사유") || "-";
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
  }
};
