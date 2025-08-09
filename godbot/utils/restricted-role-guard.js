// utils/restricted-role-guard.js
const TARGET_ROLE_ID = '1403748042666151936';
const VOICE_REDIRECT_CHANNEL_ID = '1202971727915651092';

function hasTargetRole(member) {
  return !!member && member.roles?.cache?.has(TARGET_ROLE_ID);
}

module.exports = function setupRestrictedRoleGuard(client) {
  client.on('messageCreate', async (message) => {
    if (!message?.guild || message.author?.bot) return;
    const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return;
    if (hasTargetRole(member)) {
      if (message.deletable) await message.delete().catch(() => {});
    }
  });

  client.on('messageReactionAdd', async (reaction, user) => {
    if (user?.bot) return;
    const msg = reaction?.message;
    if (!msg?.guild) return;
    const member = await msg.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    if (hasTargetRole(member)) {
      if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
      }
      await reaction.users.remove(user.id).catch(() => {});
    }
  });

  client.on('voiceStateUpdate', async (_oldState, newState) => {
    const member = newState?.member;
    if (!member || !hasTargetRole(member)) return;
    const guild = newState.guild;
    const currentChannelId = newState.channelId;
    if (!currentChannelId) return;
    if (currentChannelId === VOICE_REDIRECT_CHANNEL_ID) return;
    const target =
      guild.channels.cache.get(VOICE_REDIRECT_CHANNEL_ID) ||
      (await guild.channels.fetch(VOICE_REDIRECT_CHANNEL_ID).catch(() => null));
    if (!target || target.type !== 2) return;
    await member.voice.setChannel(VOICE_REDIRECT_CHANNEL_ID).catch(() => {});
  });
};
