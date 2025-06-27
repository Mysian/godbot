const AFK_CHANNEL_ID = "1202971727915651092";
const ALLOWED_CATEGORY_IDS = [
  "1207980297854124032",
  "1273762376889532426",
  "1369008627045765173",
];

const soloTimers = new Map();

module.exports = function setupAutoAfkMove(client) {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    // 추적 대상 채널만 필터
    function isAllowed(channel) {
      return !!channel && ALLOWED_CATEGORY_IDS.includes(channel.parentId);
    }

    // 새로 입장/이동
    if (!oldState.channel && newState.channel && !newState.member.user.bot && isAllowed(newState.channel)) {
      watchSolo(newState);
    }
    // 채널이 바뀌거나 퇴장
    if (oldState.channel && (!newState.channel || oldState.channel.id !== newState.channel.id)) {
      // 타이머 해제
      clearTimers(oldState.id);
      // 이동한 새 채널이 적용대상인 경우 새로 체크
      if (newState.channel && !newState.member.user.bot && isAllowed(newState.channel)) {
        watchSolo(newState);
      }
    }
  });

  function clearTimers(userId) {
    if (soloTimers.has(userId)) {
      const timers = soloTimers.get(userId);
      if (timers.warn) clearTimeout(timers.warn);
      if (timers.move) clearTimeout(timers.move);
      soloTimers.delete(userId);
    }
  }

  async function watchSolo(voiceState) {
    const channel = voiceState.channel;
    if (!channel) return;
    if (channel.members.filter(m => !m.user.bot).size !== 1) return;

    // 유저 닉네임 확보 (서버 닉 우선)
    let nickname = voiceState.member.nickname || voiceState.member.user.username;

    // 55분 뒤 알림, 60분 뒤 이동
    const warnTimer = setTimeout(async () => {
      if (
        channel.members.filter(m => !m.user.bot).size === 1 &&
        channel.members.find(m => m.id === voiceState.id)
      ) {
        try {
          await channel.send(`'${nickname}'님은 공용 음성채널에 혼자 55분째 계십니다. 5분 뒤 잠수방으로 자동 이동됩니다.`);
        } catch {}
      }
    }, 55 * 60 * 1000);

    const moveTimer = setTimeout(async () => {
  if (
    channel.members.filter(m => !m.user.bot).size === 1 &&
    channel.members.find(m => m.id === voiceState.id)
  ) {
    // === 여기서 한 번 더 체크 ===
    if (channel.id === AFK_CHANNEL_ID) {
      clearTimers(voiceState.id);
      return; // 잠수방에 있으면 이동·안내 안 함
    }
    try {
      await voiceState.setChannel(AFK_CHANNEL_ID, "1시간 혼자 있어서 잠수방 이동");
      // (이하 동일)
      const afkChannel = await client.channels.fetch(AFK_CHANNEL_ID).catch(()=>null);
      if (afkChannel && afkChannel.isVoiceBased()) {
        const textChannel = findLinkedTextChannel(afkChannel, client);
        if (textChannel) {
          await textChannel.send(`'${nickname}'님은 1시간 동안 혼자 있어서 잠수방으로 이동되었습니다.`);
        }
      }
    } catch {}
  }
  clearTimers(voiceState.id);
}, 60 * 60 * 1000);

    clearTimers(voiceState.id);
    soloTimers.set(voiceState.id, { warn: warnTimer, move: moveTimer });
  }

  // (선택) 음성채널과 연동된 텍스트 채널 찾기 (없으면 무시)
  function findLinkedTextChannel(voiceChannel, client) {
    // 같은 카테고리에서 '일반' 또는 '채팅' 등이 포함된 텍스트채널 우선 반환 (필요에 따라 수정)
    if (!voiceChannel.parentId) return null;
    const guild = client.guilds.cache.get(voiceChannel.guild.id);
    if (!guild) return null;
    return guild.channels.cache.find(
      c => c.parentId === voiceChannel.parentId && c.type === 0
    );
  }
};
