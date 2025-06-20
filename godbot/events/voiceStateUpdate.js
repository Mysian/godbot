// godbot/events/voiceStateUpdate.js
const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 음성채널ID: 텍스트채널ID 형태로 매핑
const voiceChannelToTextChannel = {
  '1222085152600096778': '텍스트채널ID1',
  '음성채널ID2': '텍스트채널ID2',
  // ... 추가
};

const dataPath = path.join(__dirname, '../data/voice-notify.json');
function loadVoiceNotify() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, '{}');
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guildId = (oldState.guild || newState.guild)?.id;
    const notifyData = loadVoiceNotify();

    // 알림 꺼져있으면 아무것도 안함
    if (!notifyData[guildId]) return;

    // 입장 or 퇴장한 음성채널
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // 유저 객체
    const member = newState.member;

    // 음성채널 입장
    if (!oldChannel && newChannel) {
      const textChannelId = voiceChannelToTextChannel[newChannel.id];
      if (textChannelId) {
        const textChannel = newState.guild.channels.cache.get(textChannelId);
        if (textChannel) {
          textChannel.send(`✅ **${member.displayName}** 님이 입장했습니다.`);
        }
      }
    }
    // 음성채널 퇴장
    else if (oldChannel && !newChannel) {
      const textChannelId = voiceChannelToTextChannel[oldChannel.id];
      if (textChannelId) {
        const textChannel = oldState.guild.channels.cache.get(textChannelId);
        if (textChannel) {
          textChannel.send(`❌ **${member.displayName}** 님이 퇴장했습니다.`);
        }
      }
    }
    // 채널 이동(입장/퇴장 모두 알림)
    else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      // 퇴장
      const textChannelIdLeave = voiceChannelToTextChannel[oldChannel.id];
      if (textChannelIdLeave) {
        const textChannel = oldState.guild.channels.cache.get(textChannelIdLeave);
        if (textChannel) {
          textChannel.send(`❌ **${member.displayName}** 님이 퇴장했습니다.`);
        }
      }
      // 입장
      const textChannelIdJoin = voiceChannelToTextChannel[newChannel.id];
      if (textChannelIdJoin) {
        const textChannel = newState.guild.channels.cache.get(textChannelIdJoin);
        if (textChannel) {
          textChannel.send(`✅ **${member.displayName}** 님이 입장했습니다.`);
        }
      }
    }
  }
};
