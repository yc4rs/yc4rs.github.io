/**
 * 首頁瀏覽量統計（Google Sheet 後端）
 *
 * 【設定步驟】
 * 1. Google 試算表 → 擴充功能 → Apps Script
 * 2. 貼上 analytics/pageview-counter.gs 全部內容
 * 3. 選單執行 testSetup → 授權 → 確認試算表出現 PageViews 分頁
 * 4. 部署 → 新增部署作業 → 網路應用程式
 *    執行身分：我｜存取權：任何人
 * 5. 複製 Web App URL，貼到下方 API_URL
 * 6. push 到 GitHub，開啟 yc4rs.github.io 測試
 */
const PAGEVIEW_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxQGQil_6_0KCoDk_6Amrv99qSlPJWOfeoeC6EpQWNDX0OvjYfGDi7DLQjtUNgOeAldWg/exec", // 例：https://script.google.com/macros/s/xxxxx/exec
};

(function () {
  const SESSION_KEY_PREFIX = "yc4rs_pv_";

  function getTodayKey() {
    return SESSION_KEY_PREFIX + formatDate(new Date());
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function formatWeekday(dateStr) {
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    const date = new Date(dateStr + "T00:00:00");
    return weekdays[date.getDay()];
  }

  function formatShortDate(dateStr) {
    const parts = dateStr.split("-");
    return Number(parts[1]) + "/" + Number(parts[2]);
  }

  function createStatsPanel() {
    const panel = document.createElement("div");
    panel.className = "div-pageview-stats";
    panel.tabIndex = 0;
    panel.innerHTML =
      '<div class="pageview-badge" title="瀏覽統計">' +
      '<span class="pageview-badge-label">今日</span>' +
      '<span class="pageview-badge-count" id="pageview-today-count">--</span>' +
      "</div>" +
      '<div class="pageview-popover">' +
      '<div class="pageview-popover-title">近 7 日瀏覽量</div>' +
      '<div class="pageview-week-list" id="pageview-week-list"></div>' +
      "</div>" +
      '<div class="pageview-status" id="pageview-status"></div>';
    document.body.appendChild(panel);
    return panel;
  }

  function setStatus(message, isError) {
    const el = document.getElementById("pageview-status");
    const badge = document.querySelector(".pageview-badge");
    if (!el) return;
    el.textContent = message;
    el.className = "pageview-status" + (isError ? " pageview-status-error" : "");
    if (badge && message) {
      badge.title = message;
    }
  }

  function renderWeekList(week) {
    const container = document.getElementById("pageview-week-list");
    if (!container || !week || !week.length) return;

    const today = formatDate(new Date());

    container.innerHTML = week
      .map(function (item) {
        const isToday = item.date === today;
        return (
          '<div class="pageview-day-row' +
          (isToday ? " pageview-day-today" : "") +
          '">' +
          '<span class="pageview-day-date">' +
          formatWeekday(item.date) +
          " " +
          formatShortDate(item.date) +
          (isToday ? "（今日）" : "") +
          "</span>" +
          '<span class="pageview-day-count">' +
          item.views +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderStats(data) {
    const todayEl = document.getElementById("pageview-today-count");
    if (todayEl) todayEl.textContent = String(data.today);
    renderWeekList(data.week);
    setStatus("");
  }

  function recordVisit() {
    if (!PAGEVIEW_CONFIG.API_URL) return Promise.resolve();

    const sessionKey = getTodayKey();
    if (sessionStorage.getItem(sessionKey)) return Promise.resolve();

    return fetch(PAGEVIEW_CONFIG.API_URL + "?action=hit")
      .then(function () {
        sessionStorage.setItem(sessionKey, "1");
      })
      .catch(function () {
        /* 計數失敗不阻擋頁面 */
      });
  }

  function loadStats() {
    if (!PAGEVIEW_CONFIG.API_URL) {
      setStatus("請設定 API_URL", true);
      return;
    }

    fetch(PAGEVIEW_CONFIG.API_URL + "?action=stats")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        renderStats(data);
      })
      .catch(function () {
        setStatus("無法載入瀏覽統計", true);
      });
  }

  function init() {
    createStatsPanel();

    if (!PAGEVIEW_CONFIG.API_URL) {
      setStatus("請設定 API_URL", true);
      return;
    }

    recordVisit().finally(loadStats);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
