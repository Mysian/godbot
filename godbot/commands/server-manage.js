const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");

const ALLOW_EVERYONE =
  String(process.env.ALLOW_SERVER_MANAGE_EVERYONE || "").toLowerCase() === "true";

/** 공통: 권한 체크 (관리자 또는 봇 소유자/환경변수 완화) */
function canManage(interaction) {
  if (ALLOW_EVERYONE) return true;
  const ownerId = process.env.OWNER_ID || "285645561582059520";
  if (interaction.user.id === ownerId) return true;
  const member = interaction.member;
  return (
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

/** 색문자 → 정수 */
function parseColor(input) {
  if (!input) return null;
  let s = input.trim();
  if (s.startsWith("#")) s = s.slice(1);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return parseInt(s, 16);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("서버관리")
    .setDescription("서버 설정을 관리합니다.")
    // ── 서버(길드) 설정
    .addSubcommandGroup(g =>
      g
        .setName("서버")
        .setDescription("서버 기본 설정")
        .addSubcommand(s =>
          s
            .setName("서버명")
            .setDescription("서버 이름을 변경합니다.")
            .addStringOption(o =>
              o.setName("이름").setDescription("변경할 서버명").setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("아이콘")
            .setDescription("서버 아이콘을 변경합니다.")
            .addAttachmentOption(o =>
              o
                .setName("이미지")
                .setDescription("PNG/JPG 파일을 첨부해주세요.")
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("시스템채널")
            .setDescription("시스템 메시지를 보낼 채널을 지정합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("텍스트 채널")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("afk채널")
            .setDescription("AFK(자리비움) 채널을 지정합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("보이스 채널")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("afk타임아웃")
            .setDescription("AFK 이동까지 대기 시간(초)을 설정합니다.")
            .addIntegerOption(o =>
              o
                .setName("초")
                .setDescription("60, 300, 900, 1800, 3600 중 택1")
                .addChoices(
                  { name: "60초", value: 60 },
                  { name: "5분(300초)", value: 300 },
                  { name: "15분(900초)", value: 900 },
                  { name: "30분(1800초)", value: 1800 },
                  { name: "60분(3600초)", value: 3600 }
                )
                .setRequired(true)
            )
        )
    )
    // ── 역할 설정
    .addSubcommandGroup(g =>
      g
        .setName("역할")
        .setDescription("역할 관리")
        .addSubcommand(s =>
          s
            .setName("생성")
            .setDescription("역할을 생성합니다.")
            .addStringOption(o =>
              o.setName("이름").setDescription("역할 이름").setRequired(true)
            )
            .addStringOption(o =>
              o.setName("색상").setDescription("#RRGGBB 형식 (선택)")
            )
            .addBooleanOption(o =>
              o.setName("표시고정").setDescription("온라인 멤버 목록에 분리 표시 (선택)")
            )
            .addBooleanOption(o =>
              o.setName("멘션가능").setDescription("역할 멘션 허용 (선택)")
            )
        )
        .addSubcommand(s =>
          s
            .setName("삭제")
            .setDescription("역할을 삭제합니다.")
            .addRoleOption(o =>
              o.setName("역할").setDescription("삭제할 역할").setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("이름변경")
            .setDescription("역할 이름을 변경합니다.")
            .addRoleOption(o =>
              o.setName("역할").setDescription("대상 역할").setRequired(true)
            )
            .addStringOption(o =>
              o.setName("이름").setDescription("새 이름").setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("색상변경")
            .setDescription("역할 색상을 변경합니다.")
            .addRoleOption(o =>
              o.setName("역할").setDescription("대상 역할").setRequired(true)
            )
            .addStringOption(o =>
              o
                .setName("색상")
                .setDescription("#RRGGBB 형식")
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("지급")
            .setDescription("특정 유저에게 역할을 추가합니다.")
            .addRoleOption(o =>
              o.setName("역할").setDescription("지급할 역할").setRequired(true)
            )
            .addUserOption(o =>
              o.setName("유저").setDescription("대상 유저").setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("회수")
            .setDescription("특정 유저에게서 역할을 제거합니다.")
            .addRoleOption(o =>
              o.setName("역할").setDescription("제거할 역할").setRequired(true)
            )
            .addUserOption(o =>
              o.setName("유저").setDescription("대상 유저").setRequired(true)
            )
        )
    )
    // ── 채널 설정
    .addSubcommandGroup(g =>
      g
        .setName("채널")
        .setDescription("채널 관리")
        .addSubcommand(s =>
          s
            .setName("생성")
            .setDescription("채널을 생성합니다.")
            .addStringOption(o =>
              o
                .setName("종류")
                .setDescription("채널 종류")
                .addChoices(
                  { name: "텍스트", value: "text" },
                  { name: "보이스", value: "voice" },
                  { name: "카테고리", value: "category" }
                )
                .setRequired(true)
            )
            .addStringOption(o =>
              o.setName("이름").setDescription("채널 이름").setRequired(true)
            )
            .addChannelOption(o =>
              o
                .setName("상위카테고리")
                .setDescription("소속 카테고리 (선택)")
                .addChannelTypes(ChannelType.GuildCategory)
            )
            .addStringOption(o =>
              o.setName("주제").setDescription("텍스트 채널 주제 (선택)")
            )
            .addBooleanOption(o =>
              o.setName("nsfw").setDescription("NSFW 여부 (텍스트) (선택)")
            )
            .addIntegerOption(o =>
              o
                .setName("비트레이트")
                .setDescription("보이스(kbps) (선택, 서버 한도 내)")
            )
            .addIntegerOption(o =>
              o
                .setName("인원제한")
                .setDescription("보이스 최대 인원 (0=제한없음)")
            )
        )
        .addSubcommand(s =>
          s
            .setName("이름변경")
            .setDescription("채널 이름을 변경합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("대상 채널")
                .setRequired(true)
            )
            .addStringOption(o =>
              o.setName("이름").setDescription("새 이름").setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("삭제")
            .setDescription("채널을 삭제합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("삭제할 채널")
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("이동")
            .setDescription("채널을 카테고리로 이동합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("대상 채널")
                .setRequired(true)
            )
            .addChannelOption(o =>
              o
                .setName("카테고리")
                .setDescription("목표 카테고리")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("주제")
            .setDescription("텍스트 채널 주제를 변경합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("텍스트 채널")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
            .addStringOption(o =>
              o
                .setName("주제")
                .setDescription("새 주제")
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("nsfw")
            .setDescription("텍스트 채널 NSFW 여부를 설정합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("텍스트 채널")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
            .addBooleanOption(o =>
              o.setName("값").setDescription("NSFW 여부").setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("슬로우모드")
            .setDescription("텍스트 채널 슬로우모드를 설정합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("텍스트 채널")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
            .addIntegerOption(o =>
              o
                .setName("초")
                .setDescription("0~21600 (6시간)")
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("보이스설정")
            .setDescription("보이스 채널 비트레이트/인원 제한을 설정합니다.")
            .addChannelOption(o =>
              o
                .setName("채널")
                .setDescription("보이스 채널")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true)
            )
            .addIntegerOption(o =>
              o
                .setName("비트레이트")
                .setDescription("kbps (서버 한도 내) (선택)")
            )
            .addIntegerOption(o =>
              o
                .setName("인원제한")
                .setDescription("0~99 (선택)")
            )
        )
    )
    // ── 이모지
    .addSubcommandGroup(g =>
      g
        .setName("이모지")
        .setDescription("서버 이모지 관리")
        .addSubcommand(s =>
          s
            .setName("추가")
            .setDescription("서버 이모지를 추가합니다.")
            .addStringOption(o =>
              o
                .setName("이름")
                .setDescription("이모지 이름")
                .setRequired(true)
            )
            .addAttachmentOption(o =>
              o
                .setName("이미지")
                .setDescription("PNG/GIF (애니메 이모지는 서버 부스트 필요)")
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s
            .setName("삭제")
            .setDescription("서버 이모지를 삭제합니다.")
            .addStringOption(o =>
              o
                .setName("이모지")
                .setDescription("커스텀 이모지를 입력(\\:이름:)하거나 ID를 입력해주세요.")
                .setRequired(true)
            )
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "서버에서만 사용하실 수 있는 명령어입니다.",
        ephemeral: true,
      });
    }
    if (!canManage(interaction)) {
      return interaction.reply({
        content: "죄송하지만, 이 기능을 사용하시려면 관리자 권한이 필요합니다.",
        ephemeral: true,
      });
    }

    const guild = interaction.guild;
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    try {
      await interaction.deferReply({ ephemeral: true });

      // ───────────────── 서버 설정
      if (group === "서버") {
        if (sub === "서버명") {
          const name = interaction.options.getString("이름", true);
          await guild.setName(name);
          return interaction.editReply(`서버명을 **${name}**(으)로 변경해드렸습니다.`);
        }

        if (sub === "아이콘") {
          const att = interaction.options.getAttachment("이미지", true);
          await guild.setIcon(att.url);
          return interaction.editReply("서버 아이콘을 변경해드렸습니다.");
        }

        if (sub === "시스템채널") {
          const ch = interaction.options.getChannel("채널", true);
          await guild.setSystemChannel(ch.id);
          return interaction.editReply(`시스템 채널을 <#${ch.id}>로 설정해드렸습니다.`);
        }

        if (sub === "afk채널") {
          const voice = interaction.options.getChannel("채널", true);
          await guild.setAFKChannel(voice.id);
          return interaction.editReply(`AFK 채널을 <#${voice.id}>로 설정해드렸습니다.`);
        }

        if (sub === "afk타임아웃") {
          const secs = interaction.options.getInteger("초", true);
          await guild.setAFKTimeout(secs);
          return interaction.editReply(`AFK 타임아웃을 **${secs}초**로 설정해드렸습니다.`);
        }
      }

      // ───────────────── 역할
      if (group === "역할") {
        if (sub === "생성") {
          const name = interaction.options.getString("이름", true);
          const colorStr = interaction.options.getString("색상");
          const hoist = interaction.options.getBoolean("표시고정") ?? false;
          const mentionable = interaction.options.getBoolean("멘션가능") ?? false;
          const color = parseColor(colorStr);

          const role = await guild.roles.create({
            name,
            color: color ?? undefined,
            hoist,
            mentionable,
            reason: `서버관리/역할 생성 by ${interaction.user.tag}`,
          });

          return interaction.editReply(
            `역할 **@${role.name}**(이)가 정상적으로 생성되었습니다. (ID: \`${role.id}\`)`
          );
        }

        if (sub === "삭제") {
          const role = interaction.options.getRole("역할", true);
          await role.delete(`서버관리/역할 삭제 by ${interaction.user.tag}`);
          return interaction.editReply("해당 역할을 삭제해드렸습니다.");
        }

        if (sub === "이름변경") {
          const role = interaction.options.getRole("역할", true);
          const name = interaction.options.getString("이름", true);
          await role.setName(name);
          return interaction.editReply(`역할 이름을 **${name}**(으)로 변경해드렸습니다.`);
        }

        if (sub === "색상변경") {
          const role = interaction.options.getRole("역할", true);
          const colorStr = interaction.options.getString("색상", true);
          const color = parseColor(colorStr);
          if (!color)
            return interaction.editReply("색상 형식이 올바르지 않습니다. **#RRGGBB** 형식으로 입력해주세요.");
          await role.setColor(color);
          return interaction.editReply("역할 색상을 변경해드렸습니다.");
        }

        if (sub === "지급") {
          const role = interaction.options.getRole("역할", true);
          const user = interaction.options.getUser("유저", true);
          const member = await guild.members.fetch(user.id);
          await member.roles.add(role, `서버관리/역할 지급 by ${interaction.user.tag}`);
          return interaction.editReply(`\<@${user.id}\>님께 **@${role.name}** 역할을 지급해드렸습니다.`);
        }

        if (sub === "회수") {
          const role = interaction.options.getRole("역할", true);
          const user = interaction.options.getUser("유저", true);
          const member = await guild.members.fetch(user.id);
          await member.roles.remove(role, `서버관리/역할 회수 by ${interaction.user.tag}`);
          return interaction.editReply(`\<@${user.id}\>님의 **@${role.name}** 역할을 제거해드렸습니다.`);
        }
      }

      // ───────────────── 채널
      if (group === "채널") {
        if (sub === "생성") {
          const kind = interaction.options.getString("종류", true); // text/voice/category
          const name = interaction.options.getString("이름", true);
          const parent = interaction.options.getChannel("상위카테고리");
          const topic = interaction.options.getString("주제");
          const nsfw = interaction.options.getBoolean("nsfw") ?? false;
          const bitrate = interaction.options.getInteger("비트레이트");
          const userLimit = interaction.options.getInteger("인원제한");

          if (kind === "category") {
            const cat = await guild.channels.create({
              name,
              type: ChannelType.GuildCategory,
              reason: `서버관리/카테고리 생성 by ${interaction.user.tag}`,
            });
            return interaction.editReply(`카테고리 **${cat.name}**(이)가 생성되었습니다.`);
          }

          if (kind === "text") {
            const text = await guild.channels.create({
              name,
              type: ChannelType.GuildText,
              parent: parent?.id ?? undefined,
              topic: topic ?? undefined,
              nsfw,
              reason: `서버관리/텍스트 채널 생성 by ${interaction.user.tag}`,
            });
            return interaction.editReply(`텍스트 채널 <#${text.id}>을(를) 생성해드렸습니다.`);
          }

          if (kind === "voice") {
            const voice = await guild.channels.create({
              name,
              type: ChannelType.GuildVoice,
              parent: parent?.id ?? undefined,
              bitrate: bitrate ? bitrate * 1000 : undefined, // discord는 bps
              userLimit: typeof userLimit === "number" ? userLimit : undefined,
              reason: `서버관리/보이스 채널 생성 by ${interaction.user.tag}`,
            });
            return interaction.editReply(`보이스 채널 <#${voice.id}>을(를) 생성해드렸습니다.`);
          }
        }

        if (sub === "이름변경") {
          const ch = interaction.options.getChannel("채널", true);
          const name = interaction.options.getString("이름", true);
          await ch.setName(name);
          return interaction.editReply(`채널 이름을 **${name}**(으)로 변경해드렸습니다.`);
        }

        if (sub === "삭제") {
          const ch = interaction.options.getChannel("채널", true);
          const name = ch.name;
          await ch.delete(`서버관리/채널 삭제 by ${interaction.user.tag}`);
          return interaction.editReply(`채널 **${name}**(을)를 삭제해드렸습니다.`);
        }

        if (sub === "이동") {
          const ch = interaction.options.getChannel("채널", true);
          const cat = interaction.options.getChannel("카테고리", true);
          await ch.setParent(cat.id, { lockPermissions: false });
          return interaction.editReply(`채널 <#${ch.id}>을(를) **${cat.name}** 카테고리로 이동해드렸습니다.`);
        }

        if (sub === "주제") {
          const ch = interaction.options.getChannel("채널", true);
          const t = interaction.options.getString("주제", true);
          await ch.setTopic(t);
          return interaction.editReply(`채널 주제를 변경해드렸습니다.\n- 주제: ${t}`);
        }

        if (sub === "nsfw") {
          const ch = interaction.options.getChannel("채널", true);
          const v = interaction.options.getBoolean("값", true);
          await ch.setNSFW(v);
          return interaction.editReply(`NSFW 설정을 **${v ? "활성화" : "비활성화"}**해드렸습니다.`);
        }

        if (sub === "슬로우모드") {
          const ch = interaction.options.getChannel("채널", true);
          const secs = interaction.options.getInteger("초", true);
          if (secs < 0 || secs > 21600) {
            return interaction.editReply("슬로우모드는 0~21600초(6시간) 사이로 설정하실 수 있습니다.");
          }
          await ch.setRateLimitPerUser(secs);
          return interaction.editReply(`슬로우모드를 **${secs}초**로 설정해드렸습니다.`);
        }

        if (sub === "보이스설정") {
          const ch = interaction.options.getChannel("채널", true);
          const br = interaction.options.getInteger("비트레이트");
          const ul = interaction.options.getInteger("인원제한");
          const patch = {};
          if (typeof br === "number") patch.bitrate = br * 1000; // bps
          if (typeof ul === "number") patch.userLimit = ul;
          await ch.edit(patch);
          return interaction.editReply("보이스 채널 설정을 업데이트해드렸습니다.");
        }
      }

      // ───────────────── 이모지
      if (group === "이모지") {
        if (sub === "추가") {
          const name = interaction.options.getString("이름", true);
          const att = interaction.options.getAttachment("이미지", true);
          const emoji = await guild.emojis.create({
            name,
            attachment: att.url,
            reason: `서버관리/이모지 추가 by ${interaction.user.tag}`,
          });
          return interaction.editReply(`이모지 **:${emoji.name}:**(이)가 추가되었습니다. <${emoji}>`);
        }

        if (sub === "삭제") {
          const raw = interaction.options.getString("이모지", true).trim();
          // 형태: <:name:id> 또는 <a:name:id> 또는 숫자 ID 또는 :name:
          let id = null;
          const match = raw.match(/^<a?:\w+:(\d+)>$/);
          if (match) id = match[1];
          else if (/^\d+$/.test(raw)) id = raw;
          else {
            // :name: 형태 → 이름으로 탐색
            const name = raw.replace(/^:+|:+$/g, "");
            const target = guild.emojis.cache.find(e => e.name === name);
            if (target) id = target.id;
          }
          if (!id) return interaction.editReply("이모지를 인식하지 못했습니다. 커스텀 이모지 또는 ID를 입력해주세요.");

          const target = guild.emojis.cache.get(id) || (await guild.emojis.fetch(id).catch(() => null));
          if (!target) return interaction.editReply("해당 이모지를 찾을 수 없습니다.");

          const name = target.name;
          await target.delete(`서버관리/이모지 삭제 by ${interaction.user.tag}`);
          return interaction.editReply(`이모지 **:${name}:**(을)를 삭제해드렸습니다.`);
        }
      }

      // 미정 처리
      return interaction.editReply("요청하신 작업을 처리하지 못했습니다. 옵션을 다시 확인해주시겠어요?");
    } catch (err) {
      console.error("[서버관리 오류]", err);
      const em = new EmbedBuilder()
        .setColor(0xE53935)
        .setTitle("처리 중 오류가 발생했습니다.")
        .setDescription(
          "권한, 서버 부스트 한도, 파일 형식, 채널/역할 유효성 등으로 인해 실패했을 수 있습니다.\n" +
          "입력하신 옵션을 다시 확인해주시거나, 관리자 권한과 서버 한도를 확인해주시길 바랍니다."
        );
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ embeds: [em] });
      } else {
        return interaction.reply({ embeds: [em], ephemeral: true });
      }
    }
  },
};
