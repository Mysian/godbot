const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("팀짜기")
    .setDescription("음성채널 인원+옵션으로 팀을 자동으로 랜덤 분배합니다.")
    .addIntegerOption(opt => opt
      .setName("팀수")
      .setDescription("나눌 팀의 개수 (최소 2)")
      .setMinValue(2)
      .setMaxValue(10)
      .setRequired(true))
    .addUserOption(opt => opt
      .setName("예외멤버")
      .setDescription("팀 배정에서 제외할 멤버 (음성채널에 없어도 가능)")
      .setRequired(false))
    .addUserOption(opt => opt
      .setName("고정멤버")
      .setDescription("항상 한 팀에 묶어서 들어갈 멤버")
      .setRequired(false))
    .addStringOption(opt => opt
      .setName("추가멤버")
      .setDescription("음성채널에 없는 추가 인원 닉네임 (','로 구분 입력)")
      .setRequired(false)),

  async execute(interaction) {
    // 1. 음성채널 텍스트채널만 허용 (3개 카테고리)
    const allowedCategoryIds = [
      '1207980297854124032',
      '1273762376889532426',
      '1369008627045765173'
    ];
    if (
      !allowedCategoryIds.includes(interaction.channel.parentId) &&
      !allowedCategoryIds.includes(interaction.channel.id)
    ) {
      return await interaction.reply({ content: "이 명령어는 지정된 음성채널 텍스트채팅에서만 사용 가능합니다.", ephemeral: true });
    }
    // 2. 명령자 본인이 들어있는 음성채널 찾기
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return await interaction.reply({ content: "먼저 음성채널에 접속한 뒤 사용하세요.", ephemeral: true });
    }

    // 3. 기본 참여자
    let members = (await voiceChannel.members.filter(m => !m.user.bot).map(m => m));
    // 4. 예외멤버 제거
    const except = interaction.options.getUser("예외멤버");
    if (except) members = members.filter(m => m.id !== except.id);

    // 5. 고정멤버 묶기
    const fixed = interaction.options.getUser("고정멤버");
    let fixedIds = fixed ? [fixed.id] : [];
    let fixedGroup = members.filter(m => fixedIds.includes(m.id));
    let normalGroup = members.filter(m => !fixedIds.includes(m.id));

    // 6. 추가멤버
    const addStr = interaction.options.getString("추가멤버");
    let addArr = [];
    if (addStr) {
      addArr = addStr.split(",").map(s => s.trim()).filter(Boolean).map(nick => ({ displayName: nick, id: null }));
    }

    // 7. 팀 배정
    let total = [...normalGroup, ...addArr];
    total = total.sort(() => Math.random() - 0.5); // 랜덤 섞기
    const teamCount = interaction.options.getInteger("팀수");
    let teams = Array.from({ length: teamCount }, () => []);
    // 랜덤 분배
    for (let i = 0; i < total.length; i++) {
      teams[i % teamCount].push(total[i]);
    }
    // 고정멤버(있으면 1번팀에 배치)
    if (fixedGroup.length) teams[0].push(...fixedGroup);

    // 8. 출력
    const embed = new EmbedBuilder()
      .setTitle(`🎲 팀 배정 (${voiceChannel.name})`)
      .setDescription(`총 ${members.length + addArr.length}명 / ${teamCount}팀`)
      .setColor(0x3498db);

    for (let i = 0; i < teams.length; i++) {
      let list = teams[i]
        .map(m => m.id ? `<@${m.id}>` : m.displayName)
        .join(", ") || "(없음)";
      embed.addFields({ name: `팀 ${i + 1}`, value: list, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  }
};
