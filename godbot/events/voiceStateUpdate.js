// godbot/events/voiceStateUpdate.js
const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 음성채널ID: 텍스트채널ID 형태로 매핑
const voiceChannelToTextChannel = {
  // 101호
  '1222085152600096778': '1222085152600096778',
  // 102호
  '1222085194706587730': '1222085194706587730',
  // 201호
  '1230536383941050368': '1230536383941050368',
  // 202호
  '1230536435526926356': '1230536435526926356',
  // 301호
  '1207990601002389564': '1207990601002389564',
  // 302호
  '1209157046432170015': '1209157046432170015',
  // 401호
  '1209157237977911336': '1209157237977911336',
  // 402호
  '1209157289555140658': '1209157289555140658',
  // 501호
  '1209157326469210172': '1209157326469210172',
  // 502호
  '1209157352771682304': '1209157352771682304',
  // 601호
  '1209157451895672883': '1209157451895672883',
  // 602호
  '1209157492207255572': '1209157492207255572',
  // 701호
  '1209157524243091466': '1209157524243091466',
  // 702호
  '1209157622662561813': '1209157622662561813',
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
