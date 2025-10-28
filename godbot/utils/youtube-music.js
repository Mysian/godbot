const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, entersState, demuxProbe } = require('@discordjs/voice');
const { PermissionsBitField, ChannelType } = require('discord.js');
const play = require('play-dl');
const ytdl = require('ytdl-core');

const MUSIC_TEXT_CHANNEL_ID = '1432696771796013097';

if (process.env.YT_COOKIE) {
  try { play.setToken({ youtube: { cookie: process.env.YT_COOKIE } }); } catch {}
}

const queues = new Map();

function getOrInitGuildState(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      connection: null,
      player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } }),
      queue: [],
      index: 0,
      playing: false,
      textChannelId: MUSIC_TEXT_CHANNEL_ID,
      voiceChannelId: null,
      manualStop: false,
      consecutiveFailures: 0,
      volume: 0.4,
      nowMsgId: null
    });
  }
  return queues.get(guildId);
}

function botPermsOk(channel, client) {
  const me = channel.guild?.members?.me;
  const perm = me ? channel.permissionsFor(me) : channel.permissionsFor(client.user.id);
  if (!perm) return false;
  const need = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak];
  return need.every(f => perm.has(f));
}

async function connectTo(message) {
  const state = getOrInitGuildState(message.guild.id);
  const channel = message.member?.voice?.channel;
  if (!channel) throw new Error('VOICE_REQUIRED');
  if (channel.type === ChannelType.GuildStageVoice) throw new Error('STAGE_UNSUPPORTED');
  if (!botPermsOk(channel, message.client)) throw new Error('NO_PERMS');
  state.voiceChannelId = channel.id;

  if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) return state.connection;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false
  });
  state.connection = connection;

  try { await entersState(connection, VoiceConnectionStatus.Ready, 15000); }
  catch (e) { connection.destroy(); state.connection = null; throw new Error('CONNECT_FAIL'); }

  connection.subscribe(state.player);

  state.player.removeAllListeners('stateChange');
  state.player.on('stateChange', (oldS, newS) => {
    if (state.manualStop) return;
    if (oldS.status !== AudioPlayerStatus.Idle && newS.status === AudioPlayerStatus.Idle) {
      next(message.guild.id, message.client).catch(() => {});
    }
  });

  state.player.removeAllListeners('error');
  state.player.on('error', (err) => {
    console.error('[music] player error:', err?.message || err);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    setTimeout(() => {
      if (state.connection) {
        state.connection.destroy();
        state.connection = null;
        state.playing = false;
      }
    }, 800);
  });

  return connection;
}

function normalizeYouTubeUrl(x) {
  if (!x) return null;
  let s = String(x).trim();
  s = s.replace(/[)>\]\s]+$/g, '');
  if (/youtu\.be\/([A-Za-z0-9_-]{6,})/i.test(s)) {
    const id = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i)[1];
    return `https://www.youtube.com/watch?v=${id}`;
  }
  const idm = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
  if (idm) return `https://www.youtube.com/watch?v=${idm[1]}`;
  if (/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i.test(s)) {
    const id = s.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i)[1];
    return `https://www.youtube.com/watch?v=${id}`;
  }
  if (/^https?:\/\/(www\.)?youtube\.com\/watch\?/.test(s)) return s;
  return null;
}

function is429(e) {
  const msg = (e?.message || e?.shortMessage || '').toLowerCase();
  return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate') || e?.statusCode === 429;
}

async function probeAndCreateResource(readable) {
  const { stream, type } = await demuxProbe(readable);
  return createAudioResource(stream, { inputType: type, inlineVolume: true });
}

async function makeResourceFromUrl_inner(u) {
  let lastErr = null;
  for (let i = 0; i < 1; i++) {
    try {
      const s = await play.stream(u, { discordPlayerCompatibility: true, quality: 2 });
      const res = createAudioResource(s.stream, { inputType: s.type, inlineVolume: true });
      return res;
    } catch (e) {
      lastErr = e;
      if (is429(e)) break;
      await new Promise(r => setTimeout(r, 400));
    }
  }
  try {
    const info = await play.video_info(u);
    const s2 = await play.stream_from_info(info, { discordPlayerCompatibility: true, quality: 2 });
    const res = createAudioResource(s2.stream, { inputType: s2.type, inlineVolume: true });
    return res;
  } catch (e2) {
    lastErr = e2;
  }
  try {
    const ytdlOpts = {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
      requestOptions: {}
    };
    if (process.env.YT_COOKIE) {
      ytdlOpts.requestOptions.headers = {
        cookie: process.env.YT_COOKIE,
        'user-agent': 'Mozilla/5.0'
      };
    }
    const readable = ytdl(u, ytdlOpts);
    const res = await probeAndCreateResource(readable);
    return res;
  } catch (e3) {
    lastErr = e3;
  }
  const err = new Error('STREAM_FAIL');
  err.cause = lastErr;
  throw err;
}

async function makeResourceFromUrl(url, timeoutMs = 15000) {
  const u = normalizeYouTubeUrl(url);
  if (!u) {
    const err = new Error('INVALID_YT_URL');
    err.hint = 'normalize';
    throw err;
  }
  let to;
  const timeout = new Promise((_, rej) => { to = setTimeout(() => rej(new Error('STREAM_TIMEOUT')), timeoutMs); });
  try {
    const res = await Promise.race([makeResourceFromUrl_inner(u), timeout]);
    return res;
  } finally {
    clearTimeout(to);
  }
}

async function playIndex(guildId, client) {
  const state = getOrInitGuildState(guildId);
  if (!state.queue.length) { state.playing = false; return; }
  if (state.index < 0 || state.index >= state.queue.length) state.index = 0;
  const item = state.queue[state.index];

  const ch = await client.channels.fetch(state.textChannelId).catch(() => null);
  let nowMsg = null;
  if (ch && ch.send) {
    try { nowMsg = await ch.send(`⏳ 스트림 준비 중: **${item.title}**`); } catch {}
  }

  try {
    const resource = await makeResourceFromUrl(item.url, 20000);
    state.player.play(resource);
    state.playing = true;
    state.consecutiveFailures = 0;
    if (resource.volume) resource.volume.setVolume(state.volume);
    if (nowMsg?.edit) {
      try { await nowMsg.edit(`▶️ 재생: **${item.title}** (볼륨: ${(state.volume*100)|0}%)`); } catch {}
    } else if (ch && ch.send) {
      try { await ch.send(`▶️ 재생: **${item.title}** (볼륨: ${(state.volume*100)|0}%)`); } catch {}
    }
  } catch (e) {
    state.consecutiveFailures += 1;
    const cause = e?.cause?.message || e?.shortMessage || e?.message || '알 수 없음';
    if (nowMsg?.edit) {
      try { await nowMsg.edit(`⚠️ 재생 실패: ${item.title}\n사유: ${String(cause).slice(0, 180)}`); } catch {}
    } else if (ch && ch.send) {
      try { await ch.send(`⚠️ 재생 실패: ${item.title}\n사유: ${String(cause).slice(0, 180)}`); } catch {}
    }
    if (state.consecutiveFailures >= Math.min(state.queue.length, 5)) {
      if (ch && ch.send) try { await ch.send('⛔ 연속 실패가 발생하여 재생을 중단합니다.'); } catch {}
      await stopAll(guildId, client);
      return;
    }
    await next(guildId, client);
  }
}

async function resolveQuery(q) {
  const maybe = normalizeYouTubeUrl(q);
  if (maybe) {
    try {
      const info = await play.video_basic_info(maybe).catch(() => null);
      const title = info?.video_details?.title || maybe;
      return { url: maybe, title };
    } catch { return { url: maybe, title: maybe }; }
  }
  let results = [];
  for (let trial = 0; trial < 2 && results.length === 0; trial++) {
    results = await play.search(q, { limit: 3, source: { youtube: 'video' } }).catch(() => []);
    if (!results || !results.length) await new Promise(r => setTimeout(r, 300));
  }
  if (!results || !results.length) throw new Error('NO_RESULTS');
  const r = results.find(v => normalizeYouTubeUrl(v?.url)) || results[0];
  const url = normalizeYouTubeUrl(r.url);
  if (!url) throw new Error('NO_RESULTS');
  return { url, title: r.title || q };
}

async function enqueue(message, urlOrTitle) {
  const state = getOrInitGuildState(message.guild.id);
  let picked;
  try {
    picked = await resolveQuery(urlOrTitle);
  } catch (e) {
    const reason = e?.message === 'NO_RESULTS' ? '검색 결과가 없어요.' : '검색 중 오류가 발생했어요.';
    return void message.channel.send(`❌ ${reason}`);
  }
  state.queue.push({ url: picked.url, title: picked.title, requestedBy: message.author.id });
  const ch = message.channel;
  await ch.send(`➕ 큐 추가: **${picked.title}**`);
  if (!state.playing) {
    try { await connectTo(message); }
    catch (e) {
      if (e.message === 'VOICE_REQUIRED') return ch.send('먼저 음성 채널에 들어가세요.');
      if (e.message === 'STAGE_UNSUPPORTED') return ch.send('스테이지 채널에서는 재생할 수 없어요. 일반 음성 채널을 이용해 주세요.');
      if (e.message === 'NO_PERMS') return ch.send('봇에 음성 채널 권한(보기/연결/말하기)이 없어요. 권한을 확인해 주세요.');
      return ch.send('음성 채널 연결 실패.');
    }
    state.index = state.queue.length - 1;
    await playIndex(message.guild.id, message.client);
  }
}

async function next(guildId, client) {
  const state = getOrInitGuildState(guildId);
  if (!state.queue.length) { state.playing = false; return; }
  state.index = (state.index + 1) % state.queue.length;
  await playIndex(guildId, client);
}

async function prev(guildId, client) {
  const state = getOrInitGuildState(guildId);
  if (!state.queue.length) { state.playing = false; return; }
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  await playIndex(guildId, client);
}

async function stopAll(guildId, client) {
  const state = getOrInitGuildState(guildId);
  state.manualStop = true;
  try { state.player.stop(true); } catch {}
  if (state.connection) { try { state.connection.destroy(); } catch {} state.connection = null; }
  state.queue = [];
  state.index = 0;
  state.playing = false;
  state.consecutiveFailures = 0;
  setTimeout(() => { state.manualStop = false; }, 300);
  const ch = await client.channels.fetch(state.textChannelId).catch(() => null);
  if (ch && ch.send) ch.send('⏹️ 중단 및 큐 초기화');
}

function extractFirstYoutubeUrl(text) {
  const r = /(https?:\/\/(?:www\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+))/i;
  const m = text.match(r);
  return m ? normalizeYouTubeUrl(m[1]) : null;
}
function userInAnyVoice(message) { return !!message.member?.voice?.channel; }
function sameTextChannel(message) { return message.channel.id === MUSIC_TEXT_CHANNEL_ID; }

function onMessageCreate(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (sameTextChannel(message)) {
      const raw = message.content.trim();
      if (!raw) return;
      const url = extractFirstYoutubeUrl(raw);
      try {
        if (!userInAnyVoice(message)) return message.reply('먼저 음성 채널에 들어가세요.');
        await enqueue(message, url ? url : raw);
      } catch (e) {
        console.error('[music] enqueue fail:', e?.message || e);
        message.channel.send('큐 추가에 실패했습니다.');
      }
      return;
    }

    const content = message.content.trim();
    if (!content.startsWith('!')) return;
    const [cmdRaw, ...rest] = content.slice(1).split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const args = rest.join(' ');

    if (!['재생','중단','다음곡','이전곡','볼륨','일시정지','재개','상태'].includes(cmd)) return;

    if (cmd === '중단') { await stopAll(message.guild.id, message.client); return; }

    if (!sameTextChannel(message)) return;
    if (!userInAnyVoice(message)) return void message.reply('먼저 음성 채널에 들어가세요.');

    const state = getOrInitGuildState(message.guild.id);

    try {
      if (cmd === '재생') return void enqueue(message, args || '');
      if (cmd === '다음곡') return void next(message.guild.id, message.client);
      if (cmd === '이전곡') return void prev(message.guild.id, message.client);
      if (cmd === '일시정지') { state.player.pause(true); return void message.reply('⏸️ 일시정지'); }
      if (cmd === '재개') { state.player.unpause(); return void message.reply('▶️ 재개'); }
      if (cmd === '볼륨') {
        const n = Math.max(1, Math.min(100, parseInt(args, 10) || 40));
        state.volume = n / 100;
        const res = state.player.state?.resource;
        if (res?.volume) res.volume.setVolume(state.volume);
        return void message.reply(`🔊 볼륨: ${n}%`);
      }
      if (cmd === '상태') {
        const cur = state.queue[state.index];
        const qlen = state.queue.length;
        const msg = [
          `재생여부: ${state.playing ? '재생중' : '대기중'}`,
          `현재인덱스: ${state.index}/${qlen ? qlen - 1 : 0}`,
          `볼륨: ${(state.volume*100)|0}%`,
          `연속실패: ${state.consecutiveFailures}`,
          `현재곡: ${cur ? cur.title : '없음'}`
        ].join(' | ');
        return void message.reply(msg);
      }
    } catch (e) {
      console.error('[music] cmd fail:', e?.message || e);
      message.channel.send('요청 처리 중 오류가 발생했어요.');
    }
  });
}

function onVoiceCleanup(client) {
  client.on('voiceStateUpdate', (oldS, newS) => {
    const guildId = (oldS.guild || newS.guild)?.id;
    if (!guildId) return;
    const state = queues.get(guildId);
    if (!state) return;
    const channelId = state.voiceChannelId;
    if (!channelId) return;
    const channel = newS.guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (humans.size === 0) stopAll(guildId, client).catch(()=>{});
  });
}

function registerYouTubeMusic(client) {
  onMessageCreate(client);
  onVoiceCleanup(client);
}

module.exports = { registerYouTubeMusic };
