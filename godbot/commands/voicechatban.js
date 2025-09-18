"use strict";

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

// ====== 유틸 ======
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findVoiceChannelByName(guild, name) {
  const channels = await guild.channels.fetch();
  // 정확 일치 우선
  let vch = channels.find(
    (c) => c && c.type === ChannelType.GuildVoice && c.name === name
  );
  if (vch) return vch;
  // 부분 일치 보조
  vch = channels.find(
    (c) =>
      c &&
      c.type === ChannelType.GuildVoice &&
      c.name.toLowerCase().includes(name.toLowerCase())
  );
  return vch || null;
}

/**
 * 핵심: ViewChannel 잠깐 껐다가 → 다시 켜면서 ReadMessageHistory만 거부.
 * 이렇게 하면 "적용 시점 이전" 채팅 로그는 다시 볼 수 없고,
 * 적용 이후 들어오는 메시지부터 보이게 됨.
 */
async function applyHistoryBlock(targetChannel, member) {
  // 1) 잠깐 안 보이게
  await targetChannel.permissionOverwrites.edit(
    member.id,
    { ViewChannel: false },
    { reason: "history reset - step 1/2" }
  );

  await sleep(1200); // 캐시/클라 반영 대기 (짧게 줄여도 되지만 1초 이상 추천)

  // 2) 다시 보이게 + 과거 열람 차단
  await targetChannel.permissionOverwrites.edit(
    member.id,
    { ViewChannel: true, ReadMessageHistory: false },
    { reason: "history reset - step 2/2 (deny read history)" }
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("음성채널채팅이력제거")
    .setDescription(
      "지정 음성채널의 채팅(동일 ID)에서 과거 채팅 열람을 막음. 유저명 생략 시, 해당 채널 접속 중 전원 대상."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles
    )
    .addStringOption((o) =>
      o
        .setName("음성채널명")
        .setDescription("대상 음성채널 이름 (부분일치 가능)")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("유저명")
        .setDescription("대상 닉네임(부분일치). 생략하면 채널 접속 중 전원")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) return interaction.editReply("⛔ 길드 컨텍스트가 없어.");

    const voiceName = interaction.options.getString("음성채널명", true).trim();
    const nickQuery = (interaction.options.getString("유저명") || "").trim();

    // 1) 음성채널 찾기
    const vch = await findVoiceChannelByName(guild, voiceName);
    if (!vch) {
      return interaction.editReply(`🔎 음성채널 "${voiceName}"을(를) 못 찾았어.`);
    }

    // 2) 적용 채널: 음성채널의 채팅(=동일 ID)
    const targetChannel = vch;

    // 3) 대상 멤버 확정
    let targets = [];
    if (nickQuery) {
      const members = await guild.members.fetch();
      const matched = members.filter((m) =>
        (m.nickname || m.displayName || m.user.username)
          .toLowerCase()
          .includes(nickQuery.toLowerCase())
      );

      if (matched.size === 0) {
        return interaction.editReply(`🔎 닉네임 "${nickQuery}"로 멤버를 못 찾았어.`);
      }
      if (matched.size > 1) {
        const list = matched
          .first(10)
          .map((m) => `${m.user.tag}${m.nickname ? ` (닉:${m.nickname})` : ""}`)
          .join("\n");
        return interaction.editReply(
          `⚠️ 여러 명이 매칭돼. 더 구체적으로 입력해줘.\n\n${list}${
            matched.size > 10 ? "\n...외 다수" : ""
          }`
        );
      }
      targets = [matched.first()];
    } else {
      // 음성채널 접속 중 멤버 전원(봇 제외)
      targets = Array.from(vch.members.values()).filter((m) => !m.user.bot);
      if (targets.length === 0) {
        return interaction.editReply(`ℹ️ "${vch.name}"에 접속 중인 멤버가 없어.`);
      }
    }

    // 4) 권한 적용
    let ok = 0;
    let fail = 0;
    for (const m of targets) {
      try {
        await applyHistoryBlock(targetChannel, m);
        ok++;
        // 레이트리밋 완화(대상자가 많을 때 살짝 텀 주기)
        await sleep(300);
      } catch (e) {
        fail++;
      }
    }

    // 5) 결과
    const emb = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("채팅 이력 열람 차단 적용")
      .setDescription(
        [
          `• 음성채널: **${vch.name}**`,
          `• 적용 채널: <#${targetChannel.id}> (음성채널 채팅)`,
          `• 대상: ${nickQuery ? "지정 유저 1명" : "해당 채널 접속 중 전원"}`,
          `• 결과: ✅ ${ok} / ❌ ${fail}`,
          `• 효과: 과거 메시지 열람 불가, 적용 이후 메시지만 보임`,
        ].join("\n")
      )
      .setTimestamp(new Date());

    return interaction.editReply({ embeds: [emb] });
  },
};
