// godbot/events/voiceStateUpdate.js
const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

const voiceChannelToTextChannel = {
  '1222085152600096778': '1222085152600096778',
  '1222085194706587730': '1222085194706587730',
  '1230536383941050368': '1230536383941050368',
  '1230536435526926356': '1230536435526926356',
  '1207990601002389564': '1207990601002389564',
  '1209157046432170015': '1209157046432170015',
  '1209157237977911336': '1209157237977911336',
  '1209157289555140658': '1209157289555140658',
  '1209157326469210172': '1209157326469210172',
  '1209157352771682304': '1209157352771682304',
  '1209157451895672883': '1209157451895672883',
  '1209157492207255572': '1209157492207255572',
  '1209157524243091466': '1209157524243091466',
  '1209157622662561813': '1209157622662561813',
};

const dataPath = path.join(__dirname, '../data/voice-notify.json');
function loadVoiceNotify() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, '{}');
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

// 단체이동 플래그 파일
const groupFile = path.join(__dirname, '../data/group-moves.json');
function loadGroupMoves() {
  if (!fs.existsSync(groupFile)) fs.writeFileSync(groupFile, '{}');
  try { return JSON.parse(fs.readFileSync(groupFile, 'utf8')); } catch { return {}; }
}

// 집계 버퍼(메모리)
const batchMap = new Map(); // key: `${guildId}:${from}:${to}`, value: { firstName, count, timer }

const DONOR_ROLE_ID = '1397076919127900171';
const BOOSTER_ROLE_ID = '1207437971037356142';
const BIRD_EMOJI_ROLE_IDS = [
  '1295701019430227988',
  '1294560033274855425',
  '1294560128376246272',
  '1294560174610055198',
];

function pushBatch(guild, fromCh, toCh, memberName, joinEmoji, leaveEmoji) {
  const key = `${guild.id}:${fromCh.id}:${toCh.id}`;
  let buf = batchMap.get(key);
  if (!buf) {
    buf = { firstName: memberName, count: 0, timer: null, joinEmoji, leaveEmoji };
    batchMap.set(key, buf);
  }
  buf.count += 1;

  // 1.2초 후 일괄 전송
  if (!buf.timer) {
    buf.timer = setTimeout(async () => {
      try {
        const leaveTextId = voiceChannelToTextChannel[fromCh.id];
        const joinTextId = voiceChannelToTextChannel[toCh.id];
        const rest = buf.count - 1;
        const baseName = buf.firstName;

        // 떠난 채널 공지
        if (leaveTextId) {
          const tc = guild.channels.cache.get(leaveTextId);
          if (tc) {
            if (rest > 0) {
              await tc.send(`-# [${buf.leaveEmoji} **${baseName}** 외 ${rest}명이 ${toCh.name}로 떠났어요.]`);
            } else {
              await tc.send(`-# [${buf.leaveEmoji} **${baseName}** 님이 ${toCh.name}로 떠났어요.]`);
            }
          }
        }
        // 도착 채널 공지
        if (joinTextId) {
          const tc = guild.channels.cache.get(joinTextId);
          if (tc) {
            if (rest > 0) {
              await tc.send(`-# [${buf.joinEmoji} **${baseName}** 외 ${rest}명이 ${fromCh.name}에서 왔어요.]`);
            } else {
              await tc.send(`-# [${buf.joinEmoji} **${baseName}** 님이 ${fromCh.name}에서 왔어요.]`);
            }
          }
        }
      } finally {
        clearTimeout(buf.timer);
        batchMap.delete(key);
      }
    }, 1200);
  }
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guild = (oldState.guild || newState.guild);
    const guildId = guild?.id;
    const notifyData = loadVoiceNotify();
    if (!notifyData[guildId]) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const member = newState.member || oldState.member;
    if (!member) return;

    const roles = member.roles?.cache;
    const hasDonor = roles?.has(DONOR_ROLE_ID);
    const hasBooster = roles?.has(BOOSTER_ROLE_ID);
    const hasBirdRole = BIRD_EMOJI_ROLE_IDS.some(id => roles?.has(id));

    const joinEmoji = hasDonor ? '💜' : hasBooster ? '💚' : hasBirdRole ? '🐤' : '🟢';
    const leaveEmoji = hasDonor ? '💔' : '🔴';

    // 일반 '입장'
    if (!oldChannel && newChannel) {
      const textChannelId = voiceChannelToTextChannel[newChannel.id];
      if (textChannelId) {
        const textChannel = guild.channels.cache.get(textChannelId);
        if (textChannel) {
          await textChannel.send(`-# [${joinEmoji} **${member.displayName}** 님이 입장했어요.]`);
        }
      }
      return;
    }

    // 일반 '퇴장'
    if (oldChannel && !newChannel) {
      const textChannelId = voiceChannelToTextChannel[oldChannel.id];
      if (textChannelId) {
        const textChannel = guild.channels.cache.get(textChannelId);
        if (textChannel) {
          await textChannel.send(`-# [${leaveEmoji} **${member.displayName}** 님이 퇴장했어요.]`);
        }
      }
      return;
    }

    // 채널 이동
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      const gm = loadGroupMoves()[guildId];
      const now = Date.now();
      const isGroup =
        gm &&
        gm.expiresAt > now &&
        gm.from === oldChannel.id &&
        gm.to === newChannel.id &&
        Array.isArray(gm.users) &&
        gm.users.includes(member.id);

      if (isGroup) {
        // ★ 단체이동: 집계해서 "유저명 외 n명" 형태로 한 번만 공지
        pushBatch(guild, oldChannel, newChannel, member.displayName, joinEmoji, leaveEmoji);
        return;
      }

      // 일반 이동(개인)
      const textChannelIdLeave = voiceChannelToTextChannel[oldChannel.id];
      if (textChannelIdLeave) {
        const textChannel = guild.channels.cache.get(textChannelIdLeave);
        if (textChannel) {
          await textChannel.send(`-# [${leaveEmoji} **${member.displayName}** 님이 '${newChannel.name}'로 떠났어요.]`);
        }
      }
      const textChannelIdJoin = voiceChannelToTextChannel[newChannel.id];
      if (textChannelIdJoin) {
        const textChannel = guild.channels.cache.get(textChannelIdJoin);
        if (textChannel) {
          await textChannel.send(`-# [${joinEmoji} **${member.displayName}** 님이 '${oldChannel.name}'에서 왔어요.]`);
        }
      }
    }
  }
};
