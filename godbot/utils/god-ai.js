// utils.js
const { PermissionFlagsBits } = require('discord.js');

const DEFAULT_ROLE_ID = '1404486995564167218';
const DEFAULT_TRIGGER = '갓봇!';

const VOICE_ROOMS = {
  '101호': '1222085152600096778',
  '102호': '1222085194706587730',
  '201호': '1230536383941050368',
  '202호': '1230536435526926356',
  '301호': '1207990601002389564',
  '302호': '1209157046432170015',
  '401호': '1209157237977911336',
  '402호': '1209157289555140658',
  '501호': '1209157326469210172',
  '502호': '1209157352771682304',
  '601호': '1209157451895672883',
  '602호': '1209157492207255572',
};

const lexicon = {
  trigger: DEFAULT_TRIGGER,
  roleId: DEFAULT_ROLE_ID,
  verbs: {
    move: ['옮겨', '이동', '보내', '이사가', '옮겨줘', '이동시켜', '보내줘'],
  },
  pronouns: {
    me: ['나', '나를', '저', '저를', '본인'],
    hereGroup: ['여기 있는 사람들', '여기 사람들', '여기 사람', '여기 모두', '여기 전원', '여기있는사람들'],
  },
  postpositions: ['로', '으로', '쪽으로', '방으로'],
};

const intentRegistry = new Map();

function configureLexicon(partial = {}) {
  deepMerge(lexicon, partial);
}

function registerIntent(def) {
  if (!def || !def.id || typeof def.match !== 'function' || typeof def.run !== 'function') {
    throw new Error('Invalid intent definition');
  }
  intentRegistry.set(def.id, def);
}

function init(client, options = {}) {
  if (!client) throw new Error('client is required');
  if (options.lexicon) configureLexicon(options.lexicon);
  if (options.voiceRooms) Object.assign(VOICE_ROOMS, options.voiceRooms);
  if (options.roleId) lexicon.roleId = String(options.roleId);
  if (options.trigger) lexicon.trigger = String(options.trigger);

  if (intentRegistry.size === 0) {
    registerIntent(moveSelfIntent());
    registerIntent(moveHereMembersIntent());
  }

  client.on('messageCreate', async (message) => {
    try {
      if (!message.inGuild()) return;
      if (message.author.bot) return;

      const trigger = lexicon.trigger;
      const prefixMatch = matchTrigger(message.content, trigger);
      if (!prefixMatch) return;

      const hasRole = message.member?.roles?.cache?.has(lexicon.roleId);
      if (!hasRole) return;

      const content = prefixMatch.after.trim();
      const ctx = {
        client,
        message,
        member: message.member,
        guild: message.guild,
        content,
      };

      for (const intent of intentRegistry.values()) {
        const match = intent.match(content, ctx);
        if (match) {
          await intent.run(ctx, match);
          return;
        }
      }

      await reply(message, '무슨 뜻인지 모르겠어. 예) `갓봇! 나를 602호로 옮겨줘`, `갓봇! 여기 있는 사람들을 302호로 옮겨줘`');
    } catch (e) {
      console.error('natural utils error:', e);
      try { await reply(message, '처리 중 오류가 났어. 권한/채널 ID/문구 확인해줘.'); } catch {}
    }
  });
}

/* ---------- Built-in Intents ---------- */

function moveSelfIntent() {
  return {
    id: 'move-self',
    match(text) {
      if (!includesAny(text, lexicon.verbs.move)) return null;
      if (!includesAny(text, lexicon.pronouns.me)) return null;
      const room = extractRoom(text);
      if (!room) return null;
      return { room };
    },
    async run(ctx, { room }) {
      const { message, member } = ctx;
      const targetId = VOICE_ROOMS[room.label];
      if (!targetId) {
        await reply(message, `\`${room.label}\` 채널을 못 찾았어.\n가능한 채널: ${Object.keys(VOICE_ROOMS).join(', ')}`);
        return;
      }
      const target = message.guild.channels.cache.get(targetId);
      if (!target || !isVoice(target)) {
        await reply(message, '대상 음성채널을 찾지 못했어.');
        return;
      }
      const cur = member.voice?.channel;
      if (!cur) {
        await reply(message, '먼저 아무 음성채널에 들어와줘. 그 다음에 옮겨줄게.');
        return;
      }
      if (!canMoveBot(message, target)) {
        await reply(message, '내가 그 채널로 이동시킬 권한이 없어. (Move Members/Connect 확인)');
        return;
      }
      await member.voice.setChannel(target).catch(() => null);
      await reply(message, `너를 \`${room.label}\`로 옮겼어.`);
    },
  };
}

function moveHereMembersIntent() {
  return {
    id: 'move-here-members',
    match(text, ctx) {
      if (!includesAny(text, lexicon.verbs.move)) return null;
      if (!includesAny(text, lexicon.pronouns.hereGroup)) return null;
      const room = extractRoom(text);
      if (!room) return null;
      return { room };
    },
    async run(ctx, { room }) {
      const { message, member } = ctx;
      const fromCh = member.voice?.channel;
      if (!fromCh) {
        await reply(message, '먼저 옮길 대상이 있는 음성채널(여기)에 들어와줘.');
        return;
      }
      const targetId = VOICE_ROOMS[room.label];
      if (!targetId) {
        await reply(message, `\`${room.label}\` 채널을 못 찾았어.\n가능한 채널: ${Object.keys(VOICE_ROOMS).join(', ')}`);
        return;
      }
      const toCh = message.guild.channels.cache.get(targetId);
      if (!toCh || !isVoice(toCh)) {
        await reply(message, '대상 음성채널을 찾지 못했어.');
        return;
      }
      if (!canMoveBot(message, toCh)) {
        await reply(message, '내가 그 채널로 이동시킬 권한이 없어. (Move Members/Connect 확인)');
        return;
      }

      let moved = 0, skipped = 0, failed = 0;
      const members = Array.from(fromCh.members.values());

      for (const m of members) {
        if (m.user.bot) { skipped++; continue; }
        if (!m.voice?.channelId) { skipped++; continue; }
        try {
          await m.voice.setChannel(toCh);
          moved++;
          await wait(350);
        } catch {
          failed++;
        }
      }

      await reply(
        message,
        `여기(${fromCh.name}) → \`${room.label}\` 이동 완료\n이동: ${moved}명, 건너뜀: ${skipped}명, 실패: ${failed}명`
      );
    },
  };
}

/* ---------- Helpers ---------- */

function matchTrigger(text, trigger) {
  const esc = escapeRegExp(trigger);
  const re = new RegExp(`^\\s*${esc}\\s*`, 'i');
  const m = text.match(re);
  if (!m) return null;
  return { after: text.slice(m[0].length) };
}

function includesAny(text, arr) {
  text = normalize(text);
  return arr.some((kw) => text.includes(normalize(kw)));
}

function extractRoom(text) {
  const re = /(\d{3})\s*호/;
  const m = text.match(re);
  if (!m) return null;
  const label = `${m[1]}호`;
  return { label };
}

function canMoveBot(message, targetChannel) {
  const me = message.guild.members.me;
  if (!me) return false;
  const perms = targetChannel.permissionsFor(me);
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.Connect) && perms.has(PermissionFlagsBits.MoveMembers);
}

function isVoice(ch) {
  return ['2', '13'].includes(String(ch.type)); // 2: GuildVoice, 13: GuildStageVoice
}

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function normalize(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (isPlainObject(src[k])) {
      if (!isPlainObject(target[k])) target[k] = {};
      deepMerge(target[k], src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}
function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/* ---------- Public API ---------- */

module.exports = {
  init,
  registerIntent,
  configureLexicon,
  VOICE_ROOMS,
};
