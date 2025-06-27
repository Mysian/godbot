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
      clearTimers(oldState.id);
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

    let nickname = voiceState.member.nickname || voiceState.member.user.username;

    // 110분 뒤 알림, 120분 뒤 이동 (2시간)
    const warnTimer = setTimeout(async () => {
      if (
        channel.members.filter(m => !m.user.bot).size === 1 &&
        channel.members.find(m => m.id === voiceState.id)
      ) {
        try {
          await channel.send(`-# '${nickname}'님, 공용 음성채널에 현재 110분째 계십니다. 10분 뒤 잠수방으로 자동 이동됩니다.`);
        } catch {}
      }
    }, 110 * 60 * 1000);

    const moveTimer = setTimeout(async () => {
      if (
        channel.members.filter(m => !m.user.bot).size === 1 &&
        channel.members.find(m => m.id === voiceState.id)
      ) {
        if (channel.id === AFK_CHANNEL_ID) {
          clearTimers(voiceState.id);
          return;
        }
        try {
          await voiceState.setChannel(AFK_CHANNEL_ID, "2시간 혼자 있어서 잠수방 이동");
          const afkChannel = await client.channels.fetch(AFK_CHANNEL_ID).catch(()=>null);
          if (afkChannel && afkChannel.isVoiceBased()) {
            const textChannel = findLinkedTextChannel(afkChannel, client);
            if (textChannel) {
              await textChannel.send(`-# '${nickname}'님, 120분간 공용 음성채널에 혼자 계셔서 잠수방으로 이동되었습니다.`);
            }
          }
        } catch {}
      }
      clearTimers(voiceState.id);
    }, 120 * 60 * 1000);

    clearTimers(voiceState.id);
    soloTimers.set(voiceState.id, { warn: warnTimer, move: moveTimer });
  }

  function findLinkedTextChannel(voiceChannel, client) {
    if (!voiceChannel.parentId) return null;
    const guild = client.guilds.cache.get(voiceChannel.guild.id);
    if (!guild) return null;
    return guild.channels.cache.find(
      c => c.parentId === voiceChannel.parentId && c.type === 0
    );
  }
};
