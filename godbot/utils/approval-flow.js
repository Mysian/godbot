// utils/approval-flow.js
const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ComponentType,
} = require("discord.js");

const fs = require('fs');
const path = require('path');
const APPROVAL_SETTINGS_PATH = path.join(__dirname, '../data/approval-settings.json');

function loadApprovalOn() {
  try {
    const j = JSON.parse(fs.readFileSync(APPROVAL_SETTINGS_PATH, 'utf8'));
    return j.enabled !== false; // 파일 없거나 값이 true면 ON
  } catch { return true; } // 기본 ON
}

// 외부 게임 목록 재사용 (사용자가 올린 select-game.js)
let ALL_GAMES = [];
try {
  ({ ALL_GAMES } = require("../select-game.js"));
} catch {
  ALL_GAMES = [
    "소환사의 협곡","칼바람 나락","롤토체스","이벤트 모드[우르프,아레나,돌격전 등]","스팀게임","DJ MAX","FC","GTA","GTFO","TRPG","건파이어 리본","구스구스 덕","데드락","데바데","델타포스","돈스타브","래프트","레인보우식스","레포 REPO","로스트아크","리썰컴퍼니","리스크 오브 레인","마블 라이벌즈","마인크래프트","마피아42","메이플스토리","몬스터 헌터","문명","발로란트","배틀그라운드","배틀필드","백룸","백 포 블러드","비세라 클린업","서든어택","선 헤이븐","스컬","스타듀밸리","스타크래프트","에이펙스","엘소드","오버워치","왁제이맥스","워프레임","원신","원스 휴먼","이터널 리턴","좀보이드","카운터스트라이크","코어 키퍼","콜오브듀티","테라리아","테이블 탑 시뮬레이터","테일즈런너","파스모포비아","파워워시 시뮬레이터","파티 애니멀즈","팰월드","페긴","프래그 펑크","휴먼폴플랫","헬다이버즈","히오스"
  ];
}

// ====== 설정 상수 (길드 고정 리소스) ======
const CH_APPROVAL_QUEUE   = "1276751288117235755"; // 승인 대기 명단
const CH_WELCOME_LOG      = "1240936843122573312"; // 입장 로그
const CH_SERVER_GREETING  = "1202425624061415464"; // 서버 입장 인사
const CH_REJECT_NOTICE    = "1240916343788797983"; // 거절 사유 안내 채널

const ROLE_MEMBER_NORMAL  = "816619403205804042";  // 일반 승인 역할
const ROLE_MEMBER_ALT     = "1208987442234007582"; // 부계정 승인 역할
const ROLE_REJECTED       = "1205052922296016906"; // 거절됨 역할

// 플레이스타일(라벨만 수집) — 역할부여는 입장 절차 이후 별도 시스템과 연계 가능
const PLAY_STYLES = ["빡겜러","즐빡겜러","즐겜러"];

// 상태 저장 (프로세스 메모리)
const state = new Map(); // key: userId, value: { ...progress }

// 채널 네임 포맷
const chanName = uid => `입장-${uid}`;

// 한국 시간 기준 현재 연도
function currentKRYear() {
  return Number(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
}

// 디스코드 계정 생성 경과일
function accountAgeDays(user) {
  const ms = Date.now() - user.createdTimestamp;
  return Math.floor(ms / 86400000);
}

// 닉네임 유효성 검증
function validateNickname(name) {
  if (!name) return "닉네임을 입력해주세요.";
  if (name.length < 1 || name.length > 10) return "닉네임은 1~10글자여야 합니다.";
  if (!/^[\p{L}\p{N}\s]+$/u.test(name)) return "특수문자 없이 한글/영문/숫자만 사용해주세요.";
  return null;
}

// 출생년도 유효성
function validateBirthYear(y) {
  if (!/^\d{4}$/.test(y)) return "출생년도는 4자리 숫자로 입력해주세요. 예) 2005년생";
  const year = Number(y);
  const nowY = currentKRYear();
  const minY = nowY - 100;
  const maxY = nowY - 20; // 만 20세 이상만
  if (year < minY || year > maxY) return `만 20세 이상(출생년도 ${minY}~${maxY})만 입장 가능합니다.`;
  return null;
}

// 페이지 공통 버튼행
function navRow(ids, disabledMap = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ids[0]).setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(!!disabledMap.prev),
    new ButtonBuilder().setCustomId(ids[1]).setLabel("다음").setStyle(ButtonStyle.Primary).setDisabled(!!disabledMap.next)
  );
}

// 1단계: 유입 경로
function step1Embed(user) {
  return new EmbedBuilder()
    .setColor(0x7b2ff2)
    .setTitle(`환영합니다! ${user.username}님`)
    .setDescription([
      "종합게임서버 **'까리한 디스코드'**입니다.",
      "지금부터 서버 **입장 절차**를 진행하겠습니다.",
      "",
      "다음 중, 어떤 경로로 서버에 오셨나요?"
    ].join("\n"));
}
function step1Buttons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("src_disboard").setLabel("디스보드").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("src_dicoall").setLabel("디코올").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("src_sns").setLabel("SNS").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("src_ref").setLabel("추천인(지인)").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("src_rejoin").setLabel("재입장").setStyle(ButtonStyle.Success),
  );
}
function step1ButtonsAlt() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("src_alt").setLabel("부계정 생성").setStyle(ButtonStyle.Danger),
  );
}
function snsOrRefModal(kind = "SNS") {
  return new ModalBuilder()
    .setCustomId(`modal_${kind}`)
    .setTitle(`${kind} 정보 입력`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("detail")
          .setLabel(kind === "SNS" ? "SNS 종류를 입력하세요 (예: 유튜브/틱톡/인스타)" : "추천인 닉네임을 입력하세요")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}
function altModal() {
  return new ModalBuilder()
    .setCustomId("modal_alt")
    .setTitle("부계정 본계 닉네임 확인")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mainNick")
          .setLabel("본계정의 서버 닉네임을 입력하세요")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

// 2단계: 개인정보(비공개), 닉네임, 성별
function step2Embed(progress) {
  const nowY = currentKRYear();
  const exYear = nowY - 20; // 예시 안내(매년 자동 갱신)
  return new EmbedBuilder()
    .setColor(0x2095ff)
    .setTitle("입장 절차 2단계")
    .setDescription([
      "아래 정보를 입력해주세요. **모든 정보는 절대 공개되지 않습니다.**",
      "",
      `• 출생년도 (예: ${exYear}년생)`,
      "• 서버에서 사용할 닉네임",
      "• 성별 선택",
      "",
      "※ 만 20세 미만이거나 100세 초과로 계산되는 출생년도는 **승인거절** 됩니다."
    ].join("\n"))
    .addFields(
      { name: "유입 경로", value: progress.sourceText || "미입력", inline: true },
      { name: "부계정 여부", value: progress.isAlt ? "부계정" : "일반", inline: true },
      { name: "계정 생성일 경과", value: `${progress.accountAge}일`, inline: true },
    );
}
function birthNickModal() {
  return new ModalBuilder()
    .setCustomId("modal_bio")
    .setTitle("출생년도 & 닉네임 입력")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("birth")
          .setLabel("출생년도 (4자리 숫자, 예: 2005)")
          .setPlaceholder("예: 2005")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("서버에서 사용할 닉네임 (1~10글자, 특수문자 불가)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}
function genderRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gender_m").setLabel("남자").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gender_f").setLabel("여자").setStyle(ButtonStyle.Primary),
  );
}

// 2.5단계: 플레이스타일 & 주 게임 선택
function step25Embed(progress) {
  return new EmbedBuilder()
    .setColor(0xf2b619)
    .setTitle("입장 절차 3단계")
    .setDescription([
      "• **게임 스타일(플레이스타일)** 을 선택해주세요 (1개).",
      "• **주로 하시는 게임** 을 등록해주세요 (최소 1개).",
      "",
      "선택이 끝나면 **다음**을 눌러주세요."
    ].join("\n"))
    .addFields(
      { name: "플레이스타일", value: progress.playStyle || "미선택", inline: true },
      { name: "선택한 게임", value: (progress.gameTags?.length ? progress.gameTags.join(", ") : "0개 선택"), inline: true },
    );
}
function playStyleRow(selected) {
  return new ActionRowBuilder().addComponents(
    ...PLAY_STYLES.map(ps =>
      new ButtonBuilder()
        .setCustomId(`ps_${ps}`)
        .setLabel(selected === ps ? `✓ ${ps}` : ps)
        .setStyle(selected === ps ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );
}
function gamesSelectRow(guild, chosen = []) {
  const roleOptions = ALL_GAMES
    .map(name => guild.roles.cache.find(r => r.name === name))
    .filter(Boolean)
    .slice(0, 25); // 디스코드 셀렉트 최대 25
  const menu = new StringSelectMenuBuilder()
    .setCustomId("games_select")
    .setPlaceholder("주로 하는 게임을 선택하세요 (최소 1개)")
    .setMinValues(Math.min(1, roleOptions.length || 1))
    .setMaxValues(Math.max(1, roleOptions.length || 1))
    .addOptions(
      roleOptions.map(r => ({
        label: r.name.length > 100 ? r.name.slice(0, 97) + "…" : r.name,
        value: r.name,
        default: chosen.includes(r.name),
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

// 3단계: 승인 대기 임베드 (관리진용)
function buildQueueEmbed(guild, member, progress) {
  const hasRejectHistory = progress.rejectHistory ? "있음" : "없음";
  const createdAt = new Date(member.user.createdTimestamp);
  const createdStr = createdAt.toISOString().slice(0, 10);

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("신규 입장 승인 대기")
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "디스코드 계정", value: `<@${member.id}> (${member.user.tag})`, inline: false },
      { name: "변경 닉네임", value: progress.nickname, inline: true },
      { name: "출생년도", value: String(progress.birthYear), inline: true },
      { name: "성별", value: progress.gender === "M" ? "남자" : "여자", inline: true },
      { name: "유입 경로", value: progress.sourceText || "미입력", inline: true },
      { name: "부계정 여부", value: progress.isAlt ? "부계정" : "일반", inline: true },
      { name: "거절 이력", value: hasRejectHistory, inline: true },
      { name: "계정 생성일", value: `${createdStr} (경과 ${progress.accountAge}일)`, inline: true },
      { name: "플레이스타일", value: progress.playStyle || "미선택", inline: true },
      { name: "주 게임", value: progress.gameTags?.length ? progress.gameTags.join(", ") : "미선택", inline: false },
    );
}
function queueButtons(progress) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_${progress.userId}`).setLabel("승인").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`approve_silent_${progress.userId}`).setLabel("조용히 승인").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`reject_${progress.userId}`).setLabel("거절").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ban_${progress.userId}`).setLabel("차단").setStyle(ButtonStyle.Danger),
  );
}

// 환영 메시지 전송(일반 승인만)
async function sendWelcome(guild, userId, gameTags = []) {
  const ch = guild.channels.cache.get(CH_SERVER_GREETING);
  if (!ch) return;
  const tagText = gameTags && gameTags.length ? gameTags.join(",") : "게임태그 미등록";
  await ch.send({
    content: `<@${userId}> 님이 서버에 입장하셨습니다! 까리하게 맞이해주세요!! @here\n> "저는 주로 '${tagText}'을 합니다!"`,
    allowedMentions: { parse: ["roles","everyone","users"] }
  });
}

// 거절 알림
async function sendRejectNotice(guild, userId, reasonText) {
  const ch = guild.channels.cache.get(CH_REJECT_NOTICE);
  if (!ch) return;
  await ch.send({
    content: `<@${userId}> 님, 죄송합니다. 내부 규정에 의거하여 서버 입장이 제한되었습니다.\n사유: ${reasonText || "규정 미충족"}`,
    allowedMentions: { users: [userId] }
  });
}

// 유저 개인 채널 생성
async function createPrivateChannel(guild, member) {
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === chanName(member.id));
  if (existing) return existing;

  const ch = await guild.channels.create({
    name: chanName(member.id),
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });
  return ch;
}

// 단계 시작
async function startFlow(guild, member) {
  const userId = member.id;

  // 30일 미만 즉시 거절
  const ageDays = accountAgeDays(member.user);
  if (ageDays < 30) {
    try {
      const role = guild.roles.cache.get(ROLE_REJECTED);
      if (role) await member.roles.add(role, "계정 생성 30일 미만 자동 거절");
    } catch {}
    await sendRejectNotice(guild, userId, "디스코드 계정 생성 30일 미만");
    return;
  }

  // 채널 생성
  const ch = await createPrivateChannel(guild, member);

  // 상태 초기화
  state.set(userId, {
    userId,
    step: 1,
    accountAge: ageDays,
    isAlt: false,
    sourceText: null,
    birthYear: null,
    nickname: null,
    gender: null,
    playStyle: null,
    gameTags: [],
  });

  // 1단계 메시지
  const msg = await ch.send({
    content: `<@${userId}>`,
    embeds: [step1Embed(member.user)],
    components: [step1Buttons(), step1ButtonsAlt()],
    allowedMentions: { users: [userId] }
  });

  // 콜렉터
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 900_000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== userId) {
      await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
      return;
    }
    const prog = state.get(userId);
    if (!prog) return;

    // 소스 버튼 처리
    if (i.customId.startsWith("src_")) {
      const id = i.customId.slice(4);
      if (id === "sns") {
        await i.showModal(snsOrRefModal("SNS"));
        return;
      }
      if (id === "ref") {
        await i.showModal(snsOrRefModal("추천인"));
        return;
      }
      if (id === "alt") {
        await i.showModal(altModal());
        return;
      }

      prog.sourceText =
        id === "disboard" ? "디스보드" :
        id === "dicoall"  ? "디코올"  :
        id === "rejoin"   ? "재입장"  : "기타";
      prog.isAlt = false;

      prog.step = 2;
      await i.update({
        embeds: [step2Embed(prog)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)
          ),
          genderRow(),
          navRow(["noop_prev","go_step25"], { prev: true, next: !prog.gender })
        ],
      });
      return;
    }

    if (i.customId === "open_bio") {
      await i.showModal(birthNickModal());
      return;
    }

    if (i.customId === "gender_m" || i.customId === "gender_f") {
      prog.gender = i.customId.endsWith("_m") ? "M" : "F";
      await i.update({
        embeds: [step2Embed(prog)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)
          ),
          genderRow().setComponents(
            new ButtonBuilder().setCustomId("gender_m").setLabel(prog.gender==="M"?"✓ 남자":"남자").setStyle(prog.gender==="M"?ButtonStyle.Success:ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("gender_f").setLabel(prog.gender==="F"?"✓ 여자":"여자").setStyle(prog.gender==="F"?ButtonStyle.Success:ButtonStyle.Secondary),
          ),
          navRow(["noop_prev","go_step25"], { prev: true, next: !(prog.birthYear && prog.nickname && prog.gender) })
        ],
      });
      return;
    }

    if (i.customId === "go_step25") {
      if (!(prog.birthYear && prog.nickname && prog.gender)) {
        await i.reply({ content: "출생년도·닉네임·성별을 모두 입력/선택해주세요.", ephemeral: true });
        return;
      }
      prog.step = 25;
      await i.update({
        embeds: [step25Embed(prog)],
        components: [
          playStyleRow(prog.playStyle),
          gamesSelectRow(guild, prog.gameTags),
          navRow(["back_step2","go_queue"], { next: !(prog.playStyle && prog.gameTags.length) })
        ],
      });
      return;
    }

    if (i.customId === "back_step2") {
      prog.step = 2;
      await i.update({
        embeds: [step2Embed(prog)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)
          ),
          genderRow(),
          navRow(["noop_prev","go_step25"], { prev: true, next: !(prog.birthYear && prog.nickname && prog.gender) })
        ],
      });
      return;
    }

    if (i.customId === "go_queue") {
      if (!(prog.playStyle && prog.gameTags.length)) {
        await i.reply({ content: "플레이스타일 1개, 주 게임 최소 1개를 선택해주세요.", ephemeral: true });
        return;
      }

      // 승인 대기 등록
      const qch = guild.channels.cache.get(CH_APPROVAL_QUEUE);
      if (qch) {
        const qmsg = await qch.send({
          embeds: [buildQueueEmbed(guild, member, prog)],
          components: [queueButtons(prog)]
        });
        prog.queueMsgId = qmsg.id;
      }

      await i.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("승인 대기 중")
            .setDescription("관리진 검토 후 처리됩니다. 감사합니다!")
        ],
        components: []
      });

      // 개인 채널은 승인/거절 처리 후 삭제 → 여기서는 유지
      return;
    }
  });

  // 모달 수신
  member.client.on("interactionCreate", async (mi) => {
    if (!mi.isModalSubmit()) return;
    if (!state.has(userId)) return;
    const prog = state.get(userId);
    const chNow = guild.channels.cache.find(c => c.name === chanName(userId));
    if (!chNow || mi.channelId !== chNow.id) return; // 본인 채널만

    // SNS/추천인
    if (mi.customId === "modal_SNS" || mi.customId === "modal_추천인") {
      if (mi.user.id !== userId) {
        await mi.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      const detail = mi.fields.getTextInputValue("detail")?.trim();
      prog.sourceText = mi.customId === "modal_SNS" ? `SNS(${detail})` : `추천인(${detail})`;
      prog.isAlt = false;
      prog.step = 2;

      await mi.reply({
        embeds: [step2Embed(prog)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)
          ),
          genderRow(),
          navRow(["noop_prev","go_step25"], { prev: true, next: !(prog.birthYear && prog.nickname && prog.gender) })
        ]
      });
      return;
    }

    // 부계정
    if (mi.customId === "modal_alt") {
      if (mi.user.id !== userId) {
        await mi.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      const mainNick = mi.fields.getTextInputValue("mainNick")?.trim();
      const matched = guild.members.cache.find(m => (m.displayName || m.user.username) === mainNick);
      if (!matched) {
        await mi.reply({ content: "본계정 닉네임을 찾지 못했습니다. 다시 확인해주세요.", ephemeral: true });
        return;
      }
      prog.sourceText = `부계정(본계: ${mainNick})`;
      prog.isAlt = true;
      prog.step = 2;

      await mi.reply({
        embeds: [step2Embed(prog)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 입력").setStyle(ButtonStyle.Primary)
          ),
          genderRow(),
          navRow(["noop_prev","go_step25"], { prev: true, next: !(prog.birthYear && prog.nickname && prog.gender) })
        ]
      });
      return;
    }

    // 출생년도 & 닉네임
    if (mi.customId === "modal_bio") {
      if (mi.user.id !== userId) {
        await mi.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      const birth = mi.fields.getTextInputValue("birth")?.trim();
      const nick  = mi.fields.getTextInputValue("nickname")?.trim();

      // 출생년도 검증
      const byErr = validateBirthYear(birth);
      if (byErr) {
        // 자동 거절 처리
        try {
          const role = guild.roles.cache.get(ROLE_REJECTED);
          if (role) await member.roles.add(role, "연령 기준 미충족 자동 거절");
        } catch {}
        await sendRejectNotice(guild, userId, byErr);
        // 개인 채널 삭제
        const pch = guild.channels.cache.find(c => c.name === chanName(userId));
        if (pch) { try { await pch.delete("입장 절차 자동 거절"); } catch {} }
        state.delete(userId);
        await mi.reply({ content: "죄송합니다. 연령 기준 미충족으로 입장이 거절되었습니다.", ephemeral: true });
        return;
      }

      // 닉네임 검증
      const nErr = validateNickname(nick);
      if (nErr) {
        await mi.reply({ content: nErr, ephemeral: true });
        return;
      }
      const dup = guild.members.cache.find(m => (m.displayName || m.user.username) === nick && m.id !== userId);
      if (dup) {
        await mi.reply({ content: "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.", ephemeral: true });
        return;
      }

      // 저장
      prog.birthYear = Number(birth);
      prog.nickname  = nick;

      await mi.reply({
        embeds: [step2Embed(prog)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("open_bio").setLabel("출생년도·닉네임 재입력").setStyle(ButtonStyle.Secondary)
          ),
          genderRow().setComponents(
            new ButtonBuilder().setCustomId("gender_m").setLabel(prog.gender==="M"?"✓ 남자":"남자").setStyle(prog.gender==="M"?ButtonStyle.Success:ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("gender_f").setLabel(prog.gender==="F"?"✓ 여자":"여자").setStyle(prog.gender==="F"?ButtonStyle.Success:ButtonStyle.Secondary),
          ),
          navRow(["noop_prev","go_step25"], { prev: true, next: !(prog.birthYear && prog.nickname && prog.gender) })
        ]
      });
      return;
    }
  });

  // 게임 선택 및 플레이스타일 버튼 수신
  const compListener = async (i) => {
    const prog = state.get(userId);
    if (!prog) return;
    const pch = guild.channels.cache.find(c => c.name === chanName(userId));
    if (!pch || i.channelId !== pch.id) return;

    if (i.isStringSelectMenu() && i.customId === "games_select") {
      if (i.user.id !== userId) {
        await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      prog.gameTags = i.values;
      await i.update({
        embeds: [step25Embed(prog)],
        components: [
          playStyleRow(prog.playStyle),
          gamesSelectRow(guild, prog.gameTags),
          navRow(["back_step2","go_queue"], { next: !(prog.playStyle && prog.gameTags.length) })
        ]
      });
    } else if (i.isButton() && i.customId.startsWith("ps_")) {
      if (i.user.id !== userId) {
        await i.reply({ content: "본인 전용 채널에서만 진행 가능해.", ephemeral: true });
        return;
      }
      const ps = i.customId.slice(3);
      if (!PLAY_STYLES.includes(ps)) return;
      prog.playStyle = ps;
      await i.update({
        embeds: [step25Embed(prog)],
        components: [
          playStyleRow(prog.playStyle),
          gamesSelectRow(guild, prog.gameTags),
          navRow(["back_step2","go_queue"], { next: !(prog.playStyle && prog.gameTags.length) })
        ]
      });
    } else if (i.isButton() && ["approve_","approve_silent_","reject_","ban_"].some(p => i.customId.startsWith(p))) {
      // 관리진용 버튼: 승인/거절/차단
      if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await i.reply({ content: "관리 권한이 필요합니다.", ephemeral: true });
        return;
      }
      const targetId = i.customId.split("_").pop();
      const progT = state.get(targetId) || { userId: targetId };
      const target = await guild.members.fetch(targetId).catch(() => null);
      if (!target) {
        await i.reply({ content: "대상 유저를 찾을 수 없습니다.", ephemeral: true });
        return;
      }

      if (i.customId.startsWith("ban_")) {
        await target.ban({ reason: "입장 절차 중 차단 처리" }).catch(()=>{});
        await i.update({ content: `차단 처리 완료: <@${targetId}>`, components: [], embeds: [] });
        // 개인 채널 삭제
        const pch2 = guild.channels.cache.find(c => c.name === chanName(targetId));
        if (pch2) { try { await pch2.delete("승인 절차 종료(차단)"); } catch {} }
        state.delete(targetId);
        return;
      }

      if (i.customId.startsWith("reject_")) {
        try {
          const role = guild.roles.cache.get(ROLE_REJECTED);
          if (role) await target.roles.add(role, "관리자 거절");
        } catch {}
        await sendRejectNotice(guild, targetId, "관리자 거절");
        await i.update({ content: `거절 처리 완료: <@${targetId}>`, components: [], embeds: [] });
        const pch2 = guild.channels.cache.find(c => c.name === chanName(targetId));
        if (pch2) { try { await pch2.delete("승인 절차 종료(거절)"); } catch {} }
        state.delete(targetId);
        return;
      }

      // 승인 or 조용히 승인
      const silent = i.customId.startsWith("approve_silent_");
      // 닉네임 변경(승인 시 적용)
      if (progT.nickname) {
        try { await target.setNickname(progT.nickname, "입장 절차 승인 닉네임 반영"); } catch {}
      }

      // 역할 부여
      try {
        const roleId = progT.isAlt ? ROLE_MEMBER_ALT : ROLE_MEMBER_NORMAL;
        const role = guild.roles.cache.get(roleId);
        if (role) await target.roles.add(role, "입장 승인");
      } catch {}

      // 입장 로그
      const logCh = guild.channels.cache.get(CH_WELCOME_LOG);
      if (logCh) {
        await logCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle("입장 로그")
              .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
              .addFields(
                { name: "유저", value: `<@${targetId}> (${target.user.tag})` },
                { name: "닉네임", value: progT.nickname || (target.displayName || target.user.username), inline: true },
                { name: "출생년도", value: String(progT.birthYear || "-"), inline: true },
                { name: "성별", value: progT.gender === "M" ? "남자" : (progT.gender === "F" ? "여자" : "-"), inline: true },
                { name: "유입 경로", value: progT.sourceText || "-", inline: true },
                { name: "플레이스타일", value: progT.playStyle || "-", inline: true },
                { name: "주 게임", value: progT.gameTags?.length ? progT.gameTags.join(", ") : "-", inline: false }
              )
          ]
        });
      }

      // 환영 메시지 (부계정은 스킵)
      if (!silent && !progT.isAlt) {
        await sendWelcome(guild, targetId, progT.gameTags || []);
      }

      await i.update({ content: `승인 처리 완료: <@${targetId}> ${silent ? "(조용히 승인)" : ""}`, components: [], embeds: [] });

      // 개인 채널 삭제
      const pch2 = guild.channels.cache.find(c => c.name === chanName(targetId));
      if (pch2) { try { await pch2.delete("승인 절차 종료(승인)"); } catch {} }
      state.delete(targetId);
    }
  };
  member.client.on("interactionCreate", compListener);

  collector.on("end", async () => {
    // 타임아웃 시에도 계속 진행 가능하도록(요구사항: 버튼/모달 항시 가능)
    // 여기서는 아무 것도 비활성화하지 않음.
  });
}

// ====== 외부 진입점 ======
module.exports = (client) => {
  // 새로 들어온 유저
  client.on("guildMemberAdd", async (member) => {
  if (!loadApprovalOn()) return;  
  try { await member.guild.roles.fetch(); } catch {}
  await startFlow(member.guild, member).catch(()=>{});
});

  // 재입장 유저(이미 떠났다가 들어오는 경우도 guildMemberAdd로 수신됨) → 동일 처리

  // 중도 퇴장 시 개인 채널 즉시 삭제
  client.on("guildMemberRemove", async (member) => {
    const guild = member.guild;
    const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === chanName(member.id));
    if (ch) { try { await ch.delete("유저 퇴장으로 인한 입장 절차 채널 정리"); } catch {} }
    state.delete(member.id);
  });

  // 안전장치: 봇 재시작 시 남아있는 개인 채널 정리(선택적 — 관리자 권한 필요)
  client.once("ready", async () => {
    try {
      for (const g of client.guilds.cache.values()) {
        await g.channels.fetch();
        const dangling = g.channels.cache.filter(c => c.type === ChannelType.GuildText && /^입장-\d+$/.test(c.name));
        for (const ch of dangling.values()) {
          const uid = ch.name.split("-")[1];
          const stillHere = g.members.cache.has(uid);
          if (!stillHere) {
            try { await ch.delete("고아 입장 절차 채널 정리"); } catch {}
          }
        }
      }
    } catch {}
  });
};
