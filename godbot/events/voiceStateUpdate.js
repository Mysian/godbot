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

const DONOR_ROLE_ID = '1397076919127900171';
const BOOSTER_ROLE_ID = '1207437971037356142';
const BIRD_EMOJI_ROLE_IDS = [
  '1295701019430227988',
  '1294560033274855425',
  '1294560128376246272',
  '1294560174610055198',
];

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const guildId = (oldState.guild || newState.guild)?.id;
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

    if (!oldChannel && newChannel) {
      const textChannelId = voiceChannelToTextChannel[newChannel.id];
      if (textChannelId) {
        const textChannel = newState.guild.channels.cache.get(textChannelId);
        if (textChannel) {
          await textChannel.send(`-# [${joinEmoji} **${member.displayName}** 님이 입장했습니다.]`);
        }
      }
    } else if (oldChannel && !newChannel) {
      const textChannelId = voiceChannelToTextChannel[oldChannel.id];
      if (textChannelId) {
        const textChannel = oldState.guild.channels.cache.get(textChannelId);
        if (textChannel) {
          await textChannel.send(`-# [${leaveEmoji} **${member.displayName}** 님이 퇴장했습니다.]`);
        }
      }
    } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      const textChannelIdLeave = voiceChannelToTextChannel[oldChannel.id];
      if (textChannelIdLeave) {
        const textChannel = oldState.guild.channels.cache.get(textChannelIdLeave);
        if (textChannel) {
          await textChannel.send(`-# [${leaveEmoji} **${member.displayName}** 님이 '${newChannel.name}'으로 떠나셨습니다.]`);
        }
      }
      const textChannelIdJoin = voiceChannelToTextChannel[newChannel.id];
      if (textChannelIdJoin) {
        const textChannel = newState.guild.channels.cache.get(textChannelIdJoin);
        if (textChannel) {
          await textChannel.send(`-# [${joinEmoji} **${member.displayName}** 님이 '${oldChannel.name}'에서 오셨습니다.]`);
        }
      }
    }
  }
};
