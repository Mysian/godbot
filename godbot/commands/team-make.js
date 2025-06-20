const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ComponentType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀짜기")
    .setDescription("2팀 랜덤 팀짜기 (예외멤버, 팀명, 조장, 규칙 모두 가능)")
    .addUserOption(opt => opt.setName("예외멤버1").setDescription("제외할 멤버1").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버2").setDescription("제외할 멤버2").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버3").setDescription("제외할 멤버3").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버4").setDescription("제외할 멤버4").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버5").setDescription("제외할 멤버5").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버6").setDescription("제외할 멤버6").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버7").setDescription("제외할 멤버7").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버8").setDescription("제외할 멤버8").setRequired(false))
    .addUserOption(opt => opt.setName("예외멤버9").setDescription("제외할 멤버9").setRequired(false)),

  async execute(interaction) {
    // 1. 명령어 사용자의 음성채널 확인
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return await interaction.reply({ content: "먼저 음성채널에 접속한 뒤 사용하세요.", ephemeral: true });
    }

    // 2. 예외멤버 제외
    let members = voiceChannel.members.filter(m => !m.user.bot);
    for (let i = 1; i <= 9; i++) {
      const except = interaction.options.getUser(`예외멤버${i}`);
      if (except) members = members.filter(m => m.id !== except.id);
    }
    if (members.size < 2) {
      return await interaction.reply({ content: "참여 인원이 너무 적습니다.", ephemeral: true });
    }
    let memberArr = [...members.values()];

    // 3. 모달 준비
    const modal = new ModalBuilder()
      .setCustomId("team-modal")
      .setTitle("팀짜기 옵션 입력");

    const team1Input = new TextInputBuilder()
      .setCustomId("team1name")
      .setLabel("팀1 이름(이모지/이름)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(20);

    const team2Input = new TextInputBuilder()
      .setCustomId("team2name")
      .setLabel("팀2 이름(이모지/이름)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(20);

    const leader1Input = new TextInputBuilder()
      .setCustomId("leader1")
      .setLabel("1팀 조장 (닉네임 또는 디코 닉, 미입력시 없음)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(32);

    const leader2Input = new TextInputBuilder()
      .setCustomId("leader2")
      .setLabel("2팀 조장 (닉네임 또는 디코 닉, 미입력시 없음)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(32);

    const ruleInput = new TextInputBuilder()
      .setCustomId("rule")
      .setLabel("규칙 (미입력시: 까리 피플, 파뤼 피플)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(40);

    modal.addComponents(
      new ActionRowBuilder().addComponents(team1Input),
      new ActionRowBuilder().addComponents(team2Input),
      new ActionRowBuilder().addComponents(leader1Input),
      new ActionRowBuilder().addComponents(leader2Input),
      new ActionRowBuilder().addComponents(ruleInput)
    );

    await interaction.showModal(modal);

    // 4. 모달 응답
    const modalSubmit = await interaction.awaitModalSubmit({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000
    }).catch(() => null);
    if (!modalSubmit) return;

    // 5. 입력값 정리
    const team1Name = modalSubmit.fields.getTextInputValue("team1name")?.trim() || "팀1";
    const team2Name = modalSubmit.fields.getTextInputValue("team2name")?.trim() || "팀2";
    const leader1 = modalSubmit.fields.getTextInputValue("leader1")?.trim();
    const leader2 = modalSubmit.fields.getTextInputValue("leader2")?.trim();
    const rule = modalSubmit.fields.getTextInputValue("rule")?.trim() || "까리 피플, 파뤼 피플";

    // 6. 조장 입력값이 있으면, 해당 닉네임(디코 닉/유저)과 정확히 일치하는 사람만 그 팀에 고정
    let team1LeaderMember = leader1
      ? memberArr.find(m => m.displayName === leader1 || m.user.username === leader1)
      : null;
    let team2LeaderMember = leader2
      ? memberArr.find(m => m.displayName === leader2 || m.user.username === leader2)
      : null;

    // 조장 예외 처리 (없거나, 예외멤버에 포함, 중복일 경우 오류)
    if (leader1 && !team1LeaderMember)
      return await modalSubmit.reply({ content: `팀1 조장 닉네임 [${leader1}]과 일치하는 유저가 음성채널에 없습니다.`, ephemeral: true });
    if (leader2 && !team2LeaderMember)
      return await modalSubmit.reply({ content: `팀2 조장 닉네임 [${leader2}]과 일치하는 유저가 음성채널에 없습니다.`, ephemeral: true });
    if (team1LeaderMember && team2LeaderMember && team1LeaderMember.id === team2LeaderMember.id)
      return await modalSubmit.reply({ content: "조장은 서로 다른 사람이어야 합니다.", ephemeral: true });

    // 7. 랜덤 팀 분배(조장 제외)
    let team1 = [], team2 = [];
    let rest = [...memberArr];
    if (team1LeaderMember) {
      team1.push(team1LeaderMember);
      rest = rest.filter(m => m.id !== team1LeaderMember.id);
    }
    if (team2LeaderMember) {
      team2.push(team2LeaderMember);
      rest = rest.filter(m => m.id !== team2LeaderMember.id);
    }
    // 나머지 랜덤 분배
    rest = rest.sort(() => Math.random() - 0.5);
    let mid = Math.ceil(rest.length / 2);
    team1.push(...rest.slice(0, mid));
    team2.push(...rest.slice(mid));

    // 8. 출력
    const pretty = m =>
      m.id ? `<@${m.id}>` : (m.displayName || m.user?.username || "닉네임없음");
    const boldLeader = (leader, arr) =>
      leader
        ? arr.map((m, i) =>
            (m.displayName === leader || m.user?.username === leader)
              ? `👑 ${pretty(m)}`
              : pretty(m)
          )
        : arr.map(pretty);

    const embed = new EmbedBuilder()
      .setTitle("🎲 랜덤 팀 배정 결과")
      .setColor(0x8e44ad)
      .addFields(
        {
          name: `🟦 ${team1Name}`,
          value: boldLeader(leader1, team1).join("\n") || "(없음)",
          inline: true
        },
        {
          name: `🟥 ${team2Name}`,
          value: boldLeader(leader2, team2).join("\n") || "(없음)",
          inline: true
        },
        {
          name: "📜 규칙",
          value: rule,
          inline: false
        }
      );

    await modalSubmit.reply({ embeds: [embed] });
  }
};
