const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ComponentType
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

const ruleMap = {
  "A-1-가": "비속어 별명 금지",
  "A-1-나": "호명이 불가한 별명 금지",
  "A-1-다": "불쾌감을 유발하는 별명 금지",
  "A-2-가": "타 디스코드 서버 링크 금지",
  "A-2-나": "우울계/지뢰계 글 금지",
  "A-2-다": "타인 비방 금지",
  "A-2-라": "선정적/불쾌 요소 금지",
  "A-2-마": "친목/우결/컨셉 글 지양",
  "A-2-바": "정치적, 성향자, 과한 개인 어필 지양",
  "A-3-가": "선정적이고 폭력적인 사진 금지",
  "A-3-나": "불쾌감을 유발하는 사진 금지",
  "A-3-다": "타인의 사진으로 본인 행세 금지",
  "B-1-가": "분란, 갈등, 다툼을 유발하는 채팅 금지",
  "B-1-나": "과도한 태그(맨션) 행위 금지",
  "B-1-다": "동의되지 않은 타인에게 반말 금지",
  "B-1-라": "동의되지 않은 타인에게 욕설 금지",
  "B-1-마": "불쾌감을 유발하는 이모지/스티커 금지",
  "B-1-바": "불쾌감을 유발하는 이미지/동영상 금지",
  "B-1-사": "선정적인 이모지/스티커 금지",
  "B-1-아": "선정적인 이미지/동영상 금지",
  "B-1-자": "도배하는 채팅(텍스트, 이모지, 스티커 등) 금지",
  "B-1-차": "과한 컨셉의 채팅 지양",
  "B-1-카": "과한 부정적 채팅 지양",
  "B-1-타": "특정 게임을 비하하는 채팅 지양",
  "B-2-가": "특정성이 성립되는 욕설 금지",
  "B-2-나": "실력 비하 및 무시하는 발언 금지",
  "B-2-다": "공용 음성채널에서 수면 및 장시간 잠수 금지",
  "B-2-라": "불필요한 잡음 및 소음을 지속하는 행위 금지",
  "B-2-마": "지속적으로 듣기만 하는 행위(듣보) 금지",
  "B-2-바": "과도한 음성 변조 사용 금지",
  "B-2-사": "진행중인 대화 및 게임 브리핑과 관련 없는 이야기로 혼란 야기 금지",
  "B-2-아": "필요 이상의 부정적 발언 지양",
  "B-2-자": "특정 게임을 비하하는 대화 지양",
  "C-1-가": "서버 유저를 개인적으로 취하는 행위 금지",
  "C-1-나": "스팸, 홍보, 광고 행위 금지",
  "C-1-다": "남미새 / 여미새 행위 금지",
  "C-1-라": "각 채널을 이용 목적에 맞지 않게 사용 금지",
  "C-1-마": "게임 태그를 장착하지 않는 행위 금지",
  "C-1-바": "게임과 관련한 소통이 일절 없는 경우를 지양",
  "C-1-사": "고의적으로 게임을 망치는 행위 금지",
  "C-2-가": "미성년자의 활동 금지",
  "C-2-나": "성별 조작(넷카마) 행위 금지",
  "C-2-다": "불쾌감을 유발하는 과한 컨셉 행위 금지",
  "C-2-라": "허위 신고 및 거짓 민원 금지",
  "C-3-가": "특정 유저간의 소통을 막는 행위 금지",
  "C-3-나": "'즐겜러' 태그 유저 비난 및 폄하 금지",
  "C-3-다": "이성 유저하고만 소통하는 행위 금지",
  "C-3-라": "특정 유저를 저격하는 행위 금지",
  "C-4-가": "거절 및 부정 의사를 밝힌 유저에게 집착 및 문제 야기 금지",
  "C-4-나": "특정인을 무시하거나 비하하는 분위기 조성 금지",
  "C-4-다": "모집방에서 유저를 모집한 뒤 잠수 및 노쇼 금지",
  "C-4-라": "사실 위조 및 허언(거짓말) 금지",
  "C-4-마": "타 유저의 개인정보 강요하는 행위 금지",
  "C-4-바": "게임과 연관 없이 과한 개인정보 노출하는 행위 금지",
  "C-4-사": "타인의 개인정보를 제3자에게 노출하는 행위 금지",
  "D-1-가": "민원센터를 통하지 않는 민원 및 제보를 지양",
  "D-1-나": "서버 내 악질적 유저 및 행태를 묵인하는 행위 금지",
  "D-1-다": "허위 제보와 불명확한 신고 금지",
  "D-2-가": "'뒷서버' 생성 및 유저 탈취 행위 금지",
  "D-2-나": "서버 시스템의 결함 및 빈틈 악용 금지",
  "D-2-다": "서버 시스템에 해를 가하는 행위 금지",
  "D-2-라": "개인의 의견을 서버 공식 입장처럼 발언 금지",
  "D-2-마": "관리진 내부 사안의 발설 금지"
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("경고")
    .setDescription("유저에게 서버 규칙에 따른 경고를 부여합니다.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt =>
      opt.setName("유저").setDescription("경고를 줄 유저").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");

    const select = new StringSelectMenuBuilder()
      .setCustomId("warn_rule")
      .setPlaceholder("경고 사유를 선택하세요")
      .addOptions(
        Object.entries(ruleMap).map(([code, desc]) => ({
          label: `[${code}]`,
          description: desc.slice(0, 50),
          value: `${code}_${target.id}`
        }))
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      content: `💡 <@${target.id}> 유저에게 적용할 **경고 사유**를 선택하세요.`,
      components: [row],
      ephemeral: true
    });

    const collector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000,
      max: 1
    });

    collector.on("collect", async sel => {
      if (sel.user.id !== interaction.user.id) {
        return sel.reply({ content: "이 선택은 명령어 실행자만 가능합니다.", ephemeral: true });
      }

      const [code, uid] = sel.values[0].split("_");
      const reasonText = ruleMap[code];

      const modal = new ModalBuilder()
        .setCustomId(`warn_modal_${uid}_${code}`)
        .setTitle("경고 상세 사유 입력");

      const input = new TextInputBuilder()
        .setCustomId("detail")
        .setLabel("해당 위반에 대한 구체적인 설명")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue(reasonText);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await sel.showModal(modal);
    });
  },

  async modalSubmit(interaction) {
    const [_, userId, code] = interaction.customId.split("_");
    const detail = interaction.fields.getTextInputValue("detail");

    const warnings = loadWarnings();
    if (!warnings[userId]) warnings[userId] = [];
    warnings[userId].push({
      code,
      detail,
      date: new Date().toISOString(),
      mod: interaction.user.id
    });

    const count = warnings[userId].length;
    saveWarnings(warnings);

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
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
      await interaction.client.users.send(userId, {
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
      content: `✅ <@${userId}> 유저에게 경고가 부여되었습니다. (총 ${count}회)`,
      ephemeral: true
    });
  }
};
