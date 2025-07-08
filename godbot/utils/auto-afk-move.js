const AFK_CHANNEL_ID = "1202971727915651092";
const ANNOUNCE_TEXT_CHANNEL_ID = "1202971727915651092";
const ALLOWED_CATEGORY_IDS = [
  "1207980297854124032",
  "1273762376889532426",
  "1369008627045765173",
];
const EXCEPT_CHANNEL_ID = "1202971727915651092";

const timers = new Map(); // userId: {solo, soloWarn, mute, muteWarn, warnState}
const lastActivity = new Map();

module.exports = function setupAutoAfkMove(client) {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    function isAllowed(channel) {
      return !!channel && ALLOWED_CATEGORY_IDS.includes(channel.parentId);
    }

    // 채널 입장/이동 시 타이머 세팅
    if (!oldState.channel && newState.channel && !newState.member.user.bot && isAllowed(newState.channel)) {
      setAllTimers(newState);
    }
    // 채널 이동 또는 나감
    if (oldState.channel && (!newState.channel || oldState.channel.id !== newState.channel.id)) {
      clearAllTimers(oldState.id);
      if (newState.channel && !newState.member.user.bot && isAllowed(newState.channel)) {
        setAllTimers(newState);
      }
    }
  });

  // 텍스트/인터랙션/리액션 활동 기록
  client.on("messageCreate", activityHandler);
  client.on("interactionCreate", activityHandler);
  client.on("messageReactionAdd", (reaction, user) => {
    if (!user.bot) lastActivity.set(user.id, Date.now());
  });

  function activityHandler(msgOrInt) {
    let userId = null;
    if (msgOrInt.user && !msgOrInt.user.bot) userId = msgOrInt.user.id;
    else if (msgOrInt.author && !msgOrInt.author.bot) userId = msgOrInt.author.id;
    if (userId) lastActivity.set(userId, Date.now());
  }

  function clearAllTimers(userId) {
    if (timers.has(userId)) {
      const t = timers.get(userId);
      ["solo", "soloWarn", "mute", "muteWarn", "warnState"].forEach(k => t[k] && clearTimeout(t[k]));
      timers.delete(userId);
    }
  }

  function isMuted(state) {
    return state.mute || state.selfMute || state.deaf || state.selfDeaf;
  }
  function isAlone(state) {
    if (!state.channel) return false;
    return state.channel.members.filter(m => !m.user.bot).size === 1;
  }
  function isStateEmpty(channel) {
    if (!channel || !("topic" in channel)) return true;
    return !channel.topic || channel.topic.trim().length === 0;
  }

  function setAllTimers(voiceState) {
    clearAllTimers(voiceState.id);
    const channel = voiceState.channel;
    if (!channel) return;
    if (channel.id === EXCEPT_CHANNEL_ID) return;

    const member = voiceState.member;
    const userId = member.id;
    const nickname = member.nickname || member.user.username;
    const timerSet = {};

    // 2. 혼자 110분 경고, 120분 이동 (최우선)
    if (isAlone(voiceState)) {
      timerSet.soloWarn = setTimeout(async () => {
        const last = lastActivity.get(userId) || 0;
        const now = Date.now();
        if (isAlone(voiceState) && (now - last >= 110 * 60 * 1000)) {
          try {
            const textChannel = await client.channels.fetch(channel.id).catch(() => null);
            if (textChannel) await textChannel.send(`-# '${nickname}'님, 비활동 상태로 확인됩니다. 추가 활동이 없는 경우 10분 뒤 잠수방으로 이동됩니다.`);
          } catch {}
        }
      }, 110 * 60 * 1000);

      timerSet.solo = setTimeout(async () => {
        const last = lastActivity.get(userId) || 0;
        const now = Date.now();
        if (isAlone(voiceState) && (now - last >= 120 * 60 * 1000)) {
          if (channel.id === AFK_CHANNEL_ID) { clearAllTimers(userId); return; }
          try {
            await member.voice.setChannel(AFK_CHANNEL_ID, "혼자 120분 무활동");
            const ann = await client.channels.fetch(ANNOUNCE_TEXT_CHANNEL_ID).catch(() => null);
            if (ann) await ann.send(`-# '${nickname}'님, 음성채널에서 혼자 2시간 동안 비활동하여 잠수방으로 이동되었습니다.`);
          } catch {}
          clearAllTimers(userId);
        }
      }, 120 * 60 * 1000);
    } else if (isMuted(voiceState)) {
      // 1. (혼자가 아닌 상태에서) 음소거 110분 경고, 120분 이동
      timerSet.muteWarn = setTimeout(async () => {
        const last = lastActivity.get(userId) || 0;
        const now = Date.now();
        if (isMuted(voiceState) && (now - last >= 110 * 60 * 1000)) {
          try {
            const textChannel = await client.channels.fetch(channel.id).catch(() => null);
            if (textChannel) await textChannel.send(`-# '${nickname}'님, 비활동 상태로 확인됩니다. 추가 활동이 없는 경우 10분 뒤 잠수방으로 이동됩니다.`);
          } catch {}
        }
      }, 110 * 60 * 1000);

      timerSet.mute = setTimeout(async () => {
        const last = lastActivity.get(userId) || 0;
        const now = Date.now();
        // 이동 전 혼자 조건이 우선인지 한 번 더 체크!
        if (isAlone(voiceState)) {
          clearAllTimers(userId);
          return;
        }
        if (isMuted(voiceState) && (now - last >= 120 * 60 * 1000)) {
          if (channel.id === AFK_CHANNEL_ID) { clearAllTimers(userId); return; }
          try {
            await member.voice.setChannel(AFK_CHANNEL_ID, "음소거 120분 무활동");
            const ann = await client.channels.fetch(ANNOUNCE_TEXT_CHANNEL_ID).catch(() => null);
            if (ann) await ann.send(`-# '${nickname}'님, 음성채널에서 2시간 동안 비활동하여 잠수방으로 이동되었습니다`);
          } catch {}
          clearAllTimers(userId);
        }
      }, 120 * 60 * 1000);
    }

    // 3. 상태명(topic) 공란 → 30분마다 경고 메시지 (잠수방 이동 없음)
    if (isStateEmpty(channel)) {
      timerSet.warnState = setInterval(async () => {
        if (!isStateEmpty(channel) || !channel.members.has(userId)) {
          clearAllTimers(userId);
          return;
        }
        try {
          const textChannel = await client.channels.fetch(channel.id).catch(() => null);
          if (textChannel) await textChannel.send(`-# 🫠 음성채널 상태명이 비어있습니다. 채널 상태명을 입력해주세요!`);
        } catch {}
      }, 30 * 60 * 1000);
    }

    timers.set(userId, timerSet);
  }
};
