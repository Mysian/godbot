const { exec } = require("child_process");

// 0:일, 1:월, 2:화, 3:수, 4:목, 5:금, 6:토
const ALLOWED_DAYS = [2, 4, 6]; // 화, 목, 토

function schedulePm2Restart() {
  function getNextTarget6am() {
    const now = new Date();
    let next = new Date(now);
    next.setHours(6, 0, 0, 0);
    // 오늘이 알맞은 요일 && 6시 이전이면 오늘 6시
    if (ALLOWED_DAYS.includes(next.getDay()) && now < next) return next - now;
    // 다음 타겟 요일 찾기
    for (let i = 1; i <= 7; i++) {
      const candidate = new Date(next);
      candidate.setDate(candidate.getDate() + i);
      if (ALLOWED_DAYS.includes(candidate.getDay())) {
        candidate.setHours(6, 0, 0, 0);
        return candidate - now;
      }
    }
    // 혹시라도 못 찾으면(불가능) 24시간 후
    return 24 * 60 * 60 * 1000;
  }

  function loop() {
    const wait = getNextTarget6am();
    setTimeout(() => {
      exec("pm2 restart index.js", () => {});
      setTimeout(() => process.exit(0), 25000);
      // 재시작 이후엔 다음 스케줄이 새 프로세스에서 동작
    }, wait);
  }

  loop();
}

module.exports = schedulePm2Restart;
