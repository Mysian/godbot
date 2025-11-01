// commands/alarm-dm.js
const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

/** 알림 항목 매핑 */
const MAP = {
  "경매":        { key: "auction",  type: "role",    roleId: "1255580504745574552" },
  "내전":        { key: "scrim",    type: "role",    roleId: "1255580383559422033" },
  "공지사항":    { key: "notice",   type: "role",    roleId: "1255583755670917221" },
  "이벤트":      { key: "event",    type: "role",    roleId: "1255580760371626086" },
  "정수 퀴즈":   { key: "intQuiz",  type: "role",    roleId: "1255580906199191644" },
  "BUMP":       { key: "bump",     type: "role",    roleId: "1314483547142098984" },
  "모집방":      { key: "recruit",  type: "channel", channelId: "1209147973255036959" },
  "재난문자":    { key: "disaster", type: "channel", channelId: "1419724916055347211" },
  "게임뉴스":    { key: "gamenews", type: "channel", channelId: "1425432550351831200" },
};

const DATA_PATH = path.join(__dirname, "../data/notify-settings.json");
function loadStore() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, "{}");
  try { return JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); } catch { return {}; }
}
function saveStore(obj) { fs.writeFileSync(DATA_PATH, JSON.stringify(obj, null, 2)); }

async function ensureRole(member, roleId) {
  if (!roleId) return;
  const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId).catch(()=>null);
  if (!role) return;
  if (!member.roles.cache.has(role.id)) await member.roles.add(role.id, "알림 옵션 ON에 따른 역할 부여").catch(()=>{});
}
async function removeRole(member, roleId) {
  if (!roleId) return;
  if (member.roles.cache.has(roleId)) await member.roles.remove(roleId, "알림 옵션 OFF에 따른 역할 해제").catch(()=>{});
}

async function dmUser(user, payload) {
  try {
    await user.send({ ...payload, allowedMentions: { parse: [] } });
    return true;
  } catch { return false; }
}

function baseEmbed(title, description, url, color=0x7b2ff2) {
  const eb = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || "내용이 없습니다.")
    .setFooter({ text: "까리한 디스코드 • 갓봇 알림" })
    .setTimestamp();
  if (url) eb.setURL(url);
  return eb;
}

function buildJumpRow(url) {
  if (!url) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("원문으로 이동").setURL(url)
  );
}

/** 오토임베드 지연 대응: 잠시 대기 후 강제 refetch */
async function refetchWithEmbeds(originalMessage, delayMs = 1500) {
  await new Promise(r => setTimeout(r, delayMs));
  try {
    const fresh = await originalMessage.channel.messages.fetch(originalMessage.id, { force: true });
    return fresh;
  } catch { return originalMessage; }
}

/** 길이 제한 헬퍼 */
function clip(str, max) { return (str ?? "").toString().slice(0, max); }

/** 원문 임베드 → EmbedBuilder 완전 복제 (가능한 속성 전부) */
function cloneEmbedsPreservingRich(srcEmbeds, limit = 10) {
  const out = [];
  for (let i = 0; i < srcEmbeds.length && out.length < limit; i++) {
    const e = srcEmbeds[i];
    const b = new EmbedBuilder();

    // 색상
    if (typeof e.color === "number") b.setColor(e.color);
    else b.setColor(0x95a5a6);

    // 기본
    if (e.title)       b.setTitle(clip(e.title, 256));
    if (e.url)         b.setURL(e.url);
    if (e.description) b.setDescription(clip(e.description, 4096));

    // Author
    if (e.author?.name || e.author?.icon_url || e.author?.url) {
      b.setAuthor({
        name:  clip(e.author?.name ?? "", 256),
        iconURL: e.author?.icon_url || e.author?.iconURL || null,
        url:   e.author?.url || null,
      });
    }

    // Thumbnail/Image
    const thumb = e.thumbnail?.url || e.thumbnail?.proxy_url;
    if (thumb) b.setThumbnail(thumb);
    const img = e.image?.url || e.image?.proxy_url;
    if (img) b.setImage(img);

    // Fields
    if (Array.isArray(e.fields)) {
      const fields = e.fields.slice(0, 25).map(f => ({
        name:  clip(f.name ?? "\u200b", 256),
        value: clip(f.value ?? "\u200b", 1024),
        inline: !!f.inline
      }));
      if (fields.length) b.addFields(fields);
    }

    // Footer
    if (e.footer?.text || e.footer?.icon_url) {
      b.setFooter({
        text: clip(e.footer?.text ?? "", 2048),
        iconURL: e.footer?.icon_url || e.footer?.iconURL || null
      });
    }

    // Timestamp
    if (e.timestamp) b.setTimestamp(new Date(e.timestamp));

    out.push(b);
  }
  return out;
}

/** 메시지 → DM 페이로드 구성 (메인 임베드 + 원문 임베드 복제) */
async function buildDMPayloadFromMessage(message, titleText, color) {
  const text = clip(message.cleanContent || "", 1900);
  const main = baseEmbed(`🔔 ${titleText}`, text || "내용이 없습니다.", message.url, color);

  // 첨부(링크 안내 + 첫 이미지 노출)
  const att = [...(message.attachments?.values?.() ?? [])];
  const attLines = [];
  for (const a of att) {
    const ct = (a.contentType || "").toLowerCase();
    if (ct.startsWith("image/")) attLines.push(`• 이미지: ${a.url}`);
    else if (ct.startsWith("video/")) attLines.push(`• 동영상: ${a.url}`);
    else attLines.push(`• 파일: ${a.name || "첨부"} — ${a.url}`);
  }
  if (attLines.length > 0) {
    main.addFields({ name: "첨부", value: clip(attLines.join("\n"), 1024) });
    const firstImg = att.find(x => (x.contentType || "").toLowerCase().startsWith("image/"));
    if (firstImg) main.setImage(firstImg.url);
  }

  // 스티커
  const stickerLines = [];
  for (const st of (message.stickers?.values?.() ?? [])) {
    const name = st?.name || "스티커";
    const url = st?.url || null;
    stickerLines.push(url ? `• ${name}: ${url}` : `• ${name}`);
  }
  if (stickerLines.length > 0) {
    main.addFields({ name: "스티커", value: clip(stickerLines.join("\n"), 1024) });
  }

  // 원문 임베드 "그대로" 복제 (최대 9개, 메인 포함하면 10개 제한)
  const clones = cloneEmbedsPreservingRich(message.embeds || [], 9);

  const components = [];
  const jump = buildJumpRow(message.url);
  if (jump) components.push(jump);

  return { embeds: [main, ...clones], components, allowedMentions: { parse: [] } };
}

/** 중복 릴레이 방지 */
function getRelayCache() { if (!global.__notifyRelaySent) global.__notifyRelaySent = new Set(); return global.__notifyRelaySent; }
function markRelayed(id) { getRelayCache().add(id); }
function wasRelayed(id) { return getRelayCache().has(id); }

async function relayByRoleMention(message, roleId, titleText) {
  if (!message.guild || message.author?.bot) return;
  if (!message.mentions?.roles?.has(roleId)) return;
  if (wasRelayed(message.id)) return;

  const fresh = await refetchWithEmbeds(message);
  const store = loadStore();
  const targets = Object.entries(store)
    .filter(([, s]) => {
      const ent = Object.entries(MAP).find(([, v]) => v.roleId === roleId);
      if (!ent) return false;
      return !!s[ent[1].key];
    })
    .map(([uid]) => uid);

  if (targets.length === 0) return;

  const payload = await buildDMPayloadFromMessage(fresh, `${titleText} 새 알림`, 0x00b894);
  for (const uid of targets) {
    const user = await message.client.users.fetch(uid).catch(()=>null);
    if (!user) continue;
    await dmUser(user, payload);
  }
  markRelayed(message.id);
}

async function relayByChannel(message, channelId, titleText) {
  if (!message.guild || message.author?.bot) return;
  if (message.channelId !== channelId) return;
  if (wasRelayed(message.id)) return;

  const fresh = await refetchWithEmbeds(message);
  const store = loadStore();
  const ent = Object.entries(MAP).find(([, v]) => v.channelId === channelId);
  if (!ent) return;
  const key = ent[1].key;

  const targets = Object.entries(store).filter(([, s]) => !!s[key]).map(([uid]) => uid);
  if (targets.length === 0) return;

  const payload = await buildDMPayloadFromMessage(fresh, titleText, 0x0984e3);
  for (const uid of targets) {
    const user = await message.client.users.fetch(uid).catch(()=>null);
    if (!user) continue;
    await dmUser(user, payload);
  }
  markRelayed(message.id);
}

/** 리스너 1회 등록 */
function registerRelaysOnce() {
  if (global.__notifyRelayRegistered) return;
  global.__notifyRelayRegistered = true;
  const client = global.client;
  if (!client) return;

  client.on("messageCreate", async (msg) => {
    try {
      await relayByRoleMention(msg, MAP["경매"].roleId, "경매 역할 멘션");
      await relayByRoleMention(msg, MAP["내전"].roleId, "내전 역할 멘션");
      await relayByRoleMention(msg, MAP["공지사항"].roleId, "공지사항 역할 멘션");
      await relayByRoleMention(msg, MAP["이벤트"].roleId, "이벤트 역할 멘션");
      await relayByRoleMention(msg, MAP["정수 퀴즈"].roleId, "정수 퀴즈 역할 멘션");
      await relayByRoleMention(msg, MAP["BUMP"].roleId, "BUMP 역할 멘션");

      await relayByChannel(msg, MAP["모집방"].channelId, "📬 모집방 새 글");
      await relayByChannel(msg, MAP["재난문자"].channelId, "📢 재난 문자");
      await relayByChannel(msg, MAP["게임뉴스"].channelId, "📰 게임뉴스 새 글");
    } catch {}
  });

  client.on("messageUpdate", async (_old, msg) => {
    try {
      const m = await refetchWithEmbeds(msg, 300);

      await relayByRoleMention(m, MAP["경매"].roleId, "경매 역할 멘션");
      await relayByRoleMention(m, MAP["내전"].roleId, "내전 역할 멘션");
      await relayByRoleMention(m, MAP["공지사항"].roleId, "공지사항 역할 멘션");
      await relayByRoleMention(m, MAP["이벤트"].roleId, "이벤트 역할 멘션");
      await relayByRoleMention(m, MAP["정수 퀴즈"].roleId, "정수 퀴즈 역할 멘션");
      await relayByRoleMention(m, MAP["BUMP"].roleId, "BUMP 역할 멘션");

      await relayByChannel(m, MAP["모집방"].channelId, "📬 모집방 새 글");
      await relayByChannel(m, MAP["재난문자"].channelId, "📢 재난 문자");
      await relayByChannel(m, MAP["게임뉴스"].channelId, "📰 게임뉴스 새 글");
    } catch {}
  });
}
registerRelaysOnce();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("알림")
    .setDescription("개인 DM으로 특정 항목의 알림을 받으실 수 있습니다. (토글)")
    .addStringOption(opt =>
      opt.setName("옵션")
        .setDescription("토글할 항목을 선택해 주세요.")
        .setRequired(true)
        .addChoices(
          { name: "경매", value: "경매" },
          { name: "내전", value: "내전" },
          { name: "공지사항", value: "공지사항" },
          { name: "이벤트", value: "이벤트" },
          { name: "정수 퀴즈", value: "정수 퀴즈" },
          { name: "BUMP", value: "BUMP" },
          { name: "모집방", value: "모집방" },
          { name: "재난문자", value: "재난문자" },
          { name: "게임뉴스", value: "게임뉴스" },
        )
    ),
  async execute(interaction) {
    const choice = interaction.options.getString("옵션");
    const meta = MAP[choice];
    if (!meta) return interaction.reply({ content: "잘못된 옵션입니다.", ephemeral: true });
    if (!interaction.guild) return interaction.reply({ content: "서버 안에서만 사용하실 수 있습니다.", ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
    if (!member) return interaction.reply({ content: "멤버 정보를 찾지 못했습니다.", ephemeral: true });

    const store = loadStore();
    const uid = interaction.user.id;
    if (!store[uid]) store[uid] = {};

    const nowOn = !store[uid][meta.key];
    store[uid][meta.key] = nowOn;
    saveStore(store);

    if (meta.type === "role") {
      if (nowOn) await ensureRole(member, meta.roleId);
      else await removeRole(member, meta.roleId);
    }

    const status = nowOn ? "ON" : "OFF";
    const tip = nowOn
      ? "이제부터 해당 알림이 DM으로 전송됩니다."
      : "해당 알림 DM 전송이 중지되었습니다.";

    const embed = new EmbedBuilder()
      .setColor(nowOn ? 0x2ecc71 : 0xe74c3c)
      .setTitle(`알림 옵션: ${choice} → ${status}`)
      .setDescription(tip)
      .setFooter({ text: "까리한 디스코드 • 갓봇 알림" })
      .setTimestamp();

    try { await interaction.reply({ embeds: [embed], ephemeral: true }); } catch {}

    if (nowOn) {
      const test = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`테스트 알림: ${choice}`)
        .setDescription("실제 알림은 관련 글이 올라오거나 역할 멘션 시 도착합니다.")
        .setFooter({ text: "DM 수신이 차단되어 있을 경우 도착하지 않습니다." })
        .setTimestamp();
      const ok = await dmUser(interaction.user, { embeds: [test] });
      if (!ok) {
        try {
          await interaction.followUp({ content: "DM 전송에 실패했습니다. 서버 ‘개인 메시지 허용’ 설정을 확인해 주세요.", ephemeral: true });
        } catch {}
      }
    }
  }
};
