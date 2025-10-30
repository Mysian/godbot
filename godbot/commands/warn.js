const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/warnings.json");

const LOG_CHANNEL_ID = "1380874052855529605"; // 관리진 공유 채널ID

// ---- 경고 사유 데이터 ----
const categories = [
  {
    id: "A",
    label: "A. 프로필 정보",
    reasons: [
      { value: "A-1-가", label: "1.별명 - 가. 비속어 별명 금지" },
      { value: "A-1-나", label: "1.별명 - 나. 호명이 불가한 별명 금지" },
      { value: "A-1-다", label: "1.별명 - 다. 불쾌감을 유발하는 별명 금지" },
      { value: "A-2-가", label: "2.자기소개 - 가. 타 디스코드 서버 링크 금지" },
      { value: "A-2-나", label: "2.자기소개 - 나. 우울계/지뢰계 글 금지" },
      { value: "A-2-다", label: "2.자기소개 - 다. 타인 비방이나 욕설, 혐오 표현 등 금지" },
      { value: "A-2-라", label: "2.자기소개 - 라. 선정적/불쾌 요소 금지" },
      { value: "A-2-마", label: "2.자기소개 - 마. 친목/우결/컨셉 글 지양" },
      { value: "A-2-바", label: "2.자기소개 - 바. 정치적, 성향자, 과한 개인 어필 지양" },
      { value: "A-3-가", label: "3.프로필 사진 - 가. 선정적/폭력적 사진 금지" },
      { value: "A-3-나", label: "3.프로필 사진 - 나. 불쾌감을 유발하는 사진 금지" },
      { value: "A-3-다", label: "3.프로필 사진 - 다. 타인의 사진으로 본인 행세 금지" },
    ],
  },
  {
    id: "B",
    label: "B. 채팅과 음성 대화",
    reasons: [
      { value: "B-1-가", label: "1.채팅 - 가. 분란, 갈등, 다툼 유발 채팅 금지" },
      { value: "B-1-나", label: "1.채팅 - 나. 과도한 태그(맨션) 행위 금지" },
      { value: "B-1-다", label: "1.채팅 - 다. 동의되지 않은 반말 금지" },
      { value: "B-1-라", label: "1.채팅 - 라. 동의되지 않은 욕설 금지" },
      { value: "B-1-마", label: "1.채팅 - 마. 불쾌감 이모지/스티커 금지" },
      { value: "B-1-바", label: "1.채팅 - 바. 불쾌감 이미지/동영상 금지" },
      { value: "B-1-사", label: "1.채팅 - 사. 선정적 이모지/스티커 금지" },
      { value: "B-1-아", label: "1.채팅 - 아. 선정적 이미지/동영상 금지" },
      { value: "B-1-자", label: "1.채팅 - 자. 도배(텍스트/이모지/스티커) 금지" },
      { value: "B-1-차", label: "1.채팅 - 차. 과한 컨셉 채팅 지양" },
      { value: "B-1-카", label: "1.채팅 - 카. 과한 부정적 채팅 지양" },
      { value: "B-1-타", label: "1.채팅 - 타. 특정 게임 비하 채팅 지양" },
      { value: "B-2-가", label: "2.음성 - 가. 특정성 욕설 금지" },
      { value: "B-2-나", label: "2.음성 - 나. 실력비하/무시 발언 금지" },
      { value: "B-2-다", label: "2.음성 - 다. 음성채널 수면/잠수 금지" },
      { value: "B-2-라", label: "2.음성 - 라. 불필요 잡음/소음 지속 금지" },
      { value: "B-2-마", label: "2.음성 - 마. 듣기만 하는 행위 금지" },
      { value: "B-2-바", label: "2.음성 - 바. 과도한 음성변조 금지" },
      { value: "B-2-사", label: "2.음성 - 사. 혼란 유발 발언 금지" },
      { value: "B-2-아", label: "2.음성 - 아. 필요이상 부정발언 지양" },
      { value: "B-2-자", label: "2.음성 - 자. 특정게임 비하 대화 지양" },
    ],
  },
  {
    id: "C",
    label: "C. 공통 수칙",
    reasons: [
      { value: "C-1-가", label: "1. 잘못된 이용방법 - 가. 유저 개인취득 금지" },
      { value: "C-1-나", label: "1. 잘못된 이용방법 - 나. 스팸/홍보/광고 금지" },
      { value: "C-1-다", label: "1. 잘못된 이용방법 - 다. 남미새/여미새 행위 금지" },
      { value: "C-1-라", label: "1. 잘못된 이용방법 - 라. 채널목적 위반 금지" },
      { value: "C-1-마", label: "1. 잘못된 이용방법 - 마. 게임태그 미장착 금지" },
      { value: "C-1-바", label: "1. 잘못된 이용방법 - 바. 소통 없음 지양" },
      { value: "C-1-사", label: "1. 잘못된 이용방법 - 사. 고의적 게임방해 금지" },
      { value: "C-2-가", label: "2. 거짓된 행동 - 가. 미성년자 활동 금지" },
      { value: "C-2-나", label: "2. 거짓된 행동 - 나. 성별조작(넷카마) 금지" },
      { value: "C-2-다", label: "2. 거짓된 행동 - 다. 과한 컨셉 금지" },
      { value: "C-2-라", label: "2. 거짓된 행동 - 라. 허위신고/거짓민원 금지" },
      { value: "C-3-가", label: "3. 유저차별 - 가. 특정유저간 소통 차단 금지" },
      { value: "C-3-나", label: "3. 유저차별 - 나. 즐겜러 비난/폄하 금지" },
      { value: "C-3-다", label: "3. 유저차별 - 다. 이성유저만 소통 금지" },
      { value: "C-3-라", label: "3. 유저차별 - 라. 특정유저 저격 금지" },
      { value: "C-4-가", label: "4. 상호존중 - 가. 거절/부정 의사 무시 금지" },
      { value: "C-4-나", label: "4. 상호존중 - 나. 특정인 무시/비하 금지" },
      { value: "C-4-다", label: "4. 상호존중 - 다. 모집 후 잠수/노쇼 금지" },
      { value: "C-4-라", label: "4. 상호존중 - 라. 허언(거짓말) 금지" },
      { value: "C-4-마", label: "4. 상호존중 - 마. 개인정보 강요 금지" },
      { value: "C-4-바", label: "4. 상호존중 - 바. 과한 개인정보 노출 금지" },
      { value: "C-4-사", label: "4. 상호존중 - 사. 타인 개인정보 제3자 노출 금지" },
    ],
  },
  {
    id: "D",
    label: "D. 관리 방침",
    reasons: [
      { value: "D-1-가", label: "1. 민원과 제보 - 가. 민원센터 외 민원/제보 지양" },
      { value: "D-1-나", label: "1. 민원과 제보 - 나. 악질유저/행위 묵인 금지" },
      { value: "D-1-다", label: "1. 민원과 제보 - 다. 허위/불명확 신고 금지" },
      { value: "D-2-가", label: "2. 서버 기만 행위 - 가. 뒷서버/유저 탈취 금지" },
      { value: "D-2-나", label: "2. 서버 기만 행위 - 나. 시스템 결함/빈틈 악용 금지" },
      { value: "D-2-다", label: "2. 서버 기만 행위 - 다. 서버시스템 피해 금지" },
      { value: "D-2-라", label: "2. 서버 기만 행위 - 라. 의견을 공식처럼 발언 금지" },
      { value: "D-2-마", label: "2. 서버 기만 행위 - 마. 관리진 내부사안 발설 금지" },
    ],
  },
];

// ⚡ 강력경고(즉시 차단) 옵션
const STRONG_WARN_OPTION = { label: "⚡ 강력경고(즉시 차단)", value: "STRONG_BAN" };
// 🧮 카운트만 기록 옵션
const COUNT_ONLY_OPTION = { label: "🧮 경고 카운트만(처벌/DM 없음)", value: "COUNT_ONLY" };

// ---- 저장 함수 ----
function loadWarnings() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}
function saveWarnings(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// ---- /경고 명령어 ----
module.exports = {
  data: new SlashCommandBuilder()
    .setName("경고")
    .setDescription("유저에게 서버 규칙에 따른 경고를 부여합니다.")
    .addUserOption(opt => opt.setName("유저").setDescription("경고를 줄 유저").setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    if (!target) return interaction.reply({ content: "❌ 대상 유저를 찾을 수 없습니다.", ephemeral: true });

    // 1단계: 처리 모드 선택 (일반 / 카운트만 / 강력경고)
    const modeMenu = new StringSelectMenuBuilder()
      .setCustomId(`warn_option_${target.id}`)
      .setPlaceholder("처리 모드를 선택하세요.")
      .addOptions([
        { label: "일반 경고(처벌/DM)", value: "NORMAL" },
        COUNT_ONLY_OPTION,
        STRONG_WARN_OPTION
      ]);
    const row = new ActionRowBuilder().addComponents(modeMenu);

    await interaction.reply({
      content: `<@${target.id}> 경고 처리 **모드**를 선택하세요.\n\n- 일반: 누적에 따라 타임아웃/차단 + DM 통지\n- 카운트만: 경고 이력만 기록 (처벌/DM 없음)\n- 강력경고: 즉시 차단`,
      components: [row],
      ephemeral: true
    });
  },

  // SelectMenu & Modal 처리 (index.js에서 interaction.customId로 호출)
  async handleSelect(interaction) {
    // 1단계: 처리 모드 선택
    if (interaction.customId.startsWith("warn_option_")) {
      const userId = interaction.customId.replace("warn_option_", "");
      const selected = interaction.values[0];

      // 강력경고 즉시 처리
      if (selected === "STRONG_BAN") {
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.ban({ reason: "⚡ 강력경고: 관리진 즉시 차단" });
        }

        const warnings = loadWarnings();
        if (!warnings[userId]) warnings[userId] = [];
        warnings[userId].push({
          code: "STRONG_BAN",
          desc: "강력경고(즉시 차단)",
          detail: "-",
          date: new Date().toISOString(),
          mod: interaction.user.id
        });
        saveWarnings(warnings);

        try {
          const user = await interaction.client.users.fetch(userId);
          await user.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("🚫 서버 강력경고 및 차단 알림")
                .setDescription("⚡ **관리진의 강력경고로 인해 즉시 서버 차단 처리**되었습니다.\n(사유: 규칙 위반·도 넘는 언행 등)")
                .setColor("DarkRed")
                .addFields({ name: "📅 일시", value: `<t:${Math.floor(Date.now() / 1000)}:f>` })
            ]
          });
        } catch (e) {}

        try {
          const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
          if (logChannel) {
            await logChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setTitle("🚫 강력경고(즉시 차단) 처리 로그")
                  .setDescription(`<@${userId}> (${userId}) 즉시 차단됨`)
                  .addFields(
                    { name: "코드", value: "STRONG_BAN", inline: true },
                    { name: "설명", value: "강력경고(즉시 차단)", inline: true },
                    { name: "처리자", value: `<@${interaction.user.id}>` },
                    { name: "일시", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
                  )
                  .setColor("DarkRed")
              ]
            });
          }
        } catch (e) {}

        await interaction.update({
          content: `⚡ <@${userId}> 유저에게 **강력경고**가 적용되어 즉시 차단되었습니다.`,
          components: [],
          ephemeral: true
        });
        return;
      }

      // 일반 / 카운트만 → 카테고리 선택으로 진행
      const optFlag = selected === "COUNT_ONLY" ? "C" : "N";
      const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId(`warn_category_${userId}_${optFlag}`)
        .setPlaceholder("경고 카테고리를 선택하세요.")
        .addOptions(categories.map(cat => ({ label: cat.label, value: cat.id })));
      const row = new ActionRowBuilder().addComponents(categoryMenu);

      await interaction.update({
        content: `<@${userId}>에게 적용할 **경고 카테고리**를 선택하세요.\n(현재 모드: ${optFlag === "C" ? "🧮 카운트만" : "일반"})`,
        components: [row],
        ephemeral: true
      });
      return;
    }

    // 2단계: 카테고리 선택 → 사유 선택
    if (interaction.customId.startsWith("warn_category_")) {
      const arr = interaction.customId.split("_");
      const userId = arr[2];
      const optFlag = arr[3] || "N";
      const category = categories.find(cat => cat.id === interaction.values[0]);
      if (!category) return interaction.update({ content: "❌ 카테고리 오류", components: [] });

      const reasonMenu = new StringSelectMenuBuilder()
        .setCustomId(`warn_reason_${userId}_${category.id}_${optFlag}`)
        .setPlaceholder("세부 경고 사유를 선택하세요.")
        .addOptions(category.reasons);
      const row = new ActionRowBuilder().addComponents(reasonMenu);

      await interaction.update({
        content: `<@${userId}>에게 적용할 **세부 경고 사유**를 선택하세요.\n(현재 모드: ${optFlag === "C" ? "🧮 카운트만" : "일반"})`,
        components: [row],
        ephemeral: true
      });
      return;
    }

    // 3단계: 세부사유 선택 → 상세사유 모달
    if (interaction.customId.startsWith("warn_reason_")) {
      const arr = interaction.customId.split("_");
      const userId = arr[2];
      const categoryId = arr[3];
      const optFlag = arr[4] || "N";
      const code = interaction.values[0];

      const selectedReason = categories
        .find(c => c.id === categoryId)
        ?.reasons.find(r => r.value === code);
      if (!selectedReason) return interaction.update({ content: "❌ 사유 오류", components: [] });

      const modal = new ModalBuilder()
        .setCustomId(`warn_modal_${userId}_${code}_${optFlag}`)
        .setTitle("상세 사유 입력 (생략 가능)");
      const detailInput = new TextInputBuilder()
        .setCustomId("detail_input")
        .setLabel("상세 사유를 자유롭게 적어주세요.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(detailInput));

      await interaction.showModal(modal);
      return;
    }
  },

  // 모달 제출 처리
  async handleModal(interaction) {
    if (!interaction.customId.startsWith("warn_modal_")) return;

    const arr = interaction.customId.split("_");
    const userId = arr[2];
    const tokens = arr.slice(3);
    let optFlag = "N";
    if (tokens.length > 0 && (tokens[tokens.length - 1] === "C" || tokens[tokens.length - 1] === "N")) {
      optFlag = tokens.pop();
    }
    const code = tokens.join("_");
    const detail = interaction.fields.getTextInputValue("detail_input") || "-";

    const selectedReason = categories.flatMap(c => c.reasons).find(r => r.value === code);
    const desc = selectedReason ? selectedReason.label : "";

    const warnings = loadWarnings();
    if (!warnings[userId]) warnings[userId] = [];
    warnings[userId].push({
      code,
      desc,
      detail,
      date: new Date().toISOString(),
      mod: interaction.user.id
    });
    saveWarnings(warnings);

    const count = warnings[userId].length;

    // 카운트만 모드: 처벌/DM 스킵
    if (optFlag === "C") {
      try {
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
          await logChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("🧮 경고 카운트만 기록 로그")
                .setDescription(`<@${userId}> (${userId}) 경고 이력 기록 (처벌/DM 없음)`)
                .addFields(
                  { name: "코드", value: code, inline: true },
                  { name: "설명", value: desc || "-", inline: true },
                  { name: "상세사유", value: detail },
                  { name: "처리자", value: `<@${interaction.user.id}>` },
                  { name: "누적경고", value: `${count}회`, inline: true },
                  { name: "일시", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                  { name: "모드", value: "🧮 카운트만", inline: true }
                )
                .setColor("Grey")
            ]
          });
        }
      } catch (e) {}

      await interaction.reply({
        content: `✅ <@${userId}> 경고 **카운트만** 기록했어. (총 ${count}회)\n사유코드: **${code}**\n상세사유: ${detail}\n처벌/DM 없이 이력만 남겼어.`,
        ephemeral: true
      });
      return;
    }

    // 일반 모드: 경고 횟수에 따른 타임아웃/추방
    const guild = interaction.guild;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      let duration = 0;
      if (count === 1) duration = 1000 * 60 * 60 * 24;
      else if (count === 2) duration = 1000 * 60 * 60 * 24 * 7;
      else if (count >= 3) {
        await member.ban({ reason: `누적 경고 3회 (${code})` });
      }
      if (duration > 0) {
        await member.timeout(duration, `경고 누적 (${code})`);
      }
    }

    // DM 전송
    try {
      const user = await interaction.client.users.fetch(userId);
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🚫 경고 알림")
            .setDescription(
              `[${code}${desc ? `: ${desc}` : ""}] 항목 위반으로 경고가 부여되었습니다.\n\n` +
              "⚠️ 경고 3회 누적 시 삼진아웃(서버 차단) 처리됩니다."
            )
            .addFields(
              { name: "📌 사유", value: detail },
              { name: "📅 일시", value: `<t:${Math.floor(Date.now() / 1000)}:f>` },
              { name: "📎 경고 누적", value: `${count}회` }
            )
            .setColor("Red")
        ]
      });
    } catch (e) {}

    // 관리 채널 로그
    try {
      const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🚫 경고 부여 처리 로그")
              .setDescription(`<@${userId}> (${userId})에게 경고가 부여됨`)
              .addFields(
                { name: "코드", value: code, inline: true },
                { name: "설명", value: desc || "-", inline: true },
                { name: "상세사유", value: detail },
                { name: "처리자", value: `<@${interaction.user.id}>` },
                { name: "누적경고", value: `${count}회`, inline: true },
                { name: "일시", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
                { name: "모드", value: "일반", inline: true }
              )
              .setColor("Red")
          ]
        });
      }
    } catch (e) {}

    await interaction.reply({
      content: `✅ <@${userId}> 유저에게 경고를 부여했어. (총 ${count}회)\n사유코드: **${code}**\n상세사유: ${detail}`,
      ephemeral: true
    });
  }
};
