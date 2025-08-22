const AFK_CHANNEL_ID = "1202971727915651092";
const ANNOUNCE_TEXT_CHANNEL_ID = "1202971727915651092";
const ALLOWED_CATEGORY_IDS = [
  "1207980297854124032",
  "1273762376889532426",
  "1369008627045765173",
];

const EXCEPT_CHANNEL_ID = "1202971727915651092";

const soloTimers = new Map();
const lastActivity = new Map();

module.exports = function setupAutoAfkMove(client) {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    function isAllowed(channel) {
      return !!channel && ALLOWED_CATEGORY_IDS.includes(channel.parentId);
    }

    if (!oldState.channel && newState.channel && !newState.member.user.bot && isAllowed(newState.channel)) {
      watchSolo(newState);
    }
    if (oldState.channel && (!newState.channel || oldState.channel.id !== newState.channel.id)) {
      clearTimers(oldState.id);
      if (newState.channel && !newState.member.user.bot && isAllowed(newState.channel)) {
        watchSolo(newState);
      }
    }
  });

  client.on("messageCreate", activityHandler);
  client.on("interactionCreate", activityHandler);
  client.on("messageReactionAdd", (reaction, user) => {
    if (!user.bot) lastActivity.set(user.id, Date.now());
  });

  async function activityHandler(msgOrInt) {
    let userId = null;
    if (msgOrInt.user && !msgOrInt.user.bot) userId = msgOrInt.user.id;
    else if (msgOrInt.author && !msgOrInt.author.bot) userId = msgOrInt.author.id;
    if (userId) lastActivity.set(userId, Date.now());
  }

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
    if (channel.id === EXCEPT_CHANNEL_ID) return;
    if (channel.members.filter(m => !m.user.bot).size !== 1) return;

    let nickname = voiceState.member.nickname || voiceState.member.user.username;

    // 330분 뒤 경고 메시지 (음성채널ID = 텍스트채널ID)
    const warnTimer = setTimeout(async () => {
      if (
        channel.members.filter(m => !m.user.bot).size === 1 &&
        channel.members.find(m => m.id === voiceState.id)
      ) {
        const last = lastActivity.get(voiceState.id) || 0;
        const now = Date.now();
        if (now - last >= 330 * 60 * 1000) {
          try {
            const textChannel = await client.channels.fetch(channel.id).catch(() => null);
            if (textChannel) {
              await textChannel.send(`-# '${nickname}'님, 공용 음성채널에 현재 330분째 아무런 활동 없이 계십니다. 30분 뒤 잠수방으로 자동 이동됩니다.`);
            }
          } catch {}
        }
      }
    }, 330 * 60 * 1000);

    // 360분 뒤 이동 + 이동 메시지 (ANNOUNCE_TEXT_CHANNEL_ID 고정)
    const moveTimer = setTimeout(async () => {
      if (
        channel.members.filter(m => !m.user.bot).size === 1 &&
        channel.members.find(m => m.id === voiceState.id)
      ) {
        const last = lastActivity.get(voiceState.id) || 0;
        const now = Date.now();
        if (now - last >= 360 * 60 * 1000) {
          if (channel.id === AFK_CHANNEL_ID) {
            clearTimers(voiceState.id);
            return;
          }
          try {
            await voiceState.setChannel(AFK_CHANNEL_ID, "6시간 혼자 있어서 잠수방 이동");
            const announceChannel = await client.channels.fetch(ANNOUNCE_TEXT_CHANNEL_ID).catch(() => null);
            if (announceChannel) {
              await announceChannel.send(`-# '${nickname}'님, 6시간동안 공용 음성채널에 비활동 상태로 혼자 계셔서 잠수방으로 이동되었습니다.`);
            }
          } catch {}
        }
      }
      clearTimers(voiceState.id);
    }, 360 * 60 * 1000);

    clearTimers(voiceState.id);
    soloTimers.set(voiceState.id, { warn: warnTimer, move: moveTimer });
  }
};
