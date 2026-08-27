/**
 * 首頁瀏覽量統計（Google Sheet 後端）
 *
 * 【試算表】每天分頁 yyyy-MM-dd
 *   visit_ts | timestamp | device_id | device_fp | public_ip
 * 進頁立刻 stats（樂觀 +1 先畫）+ hit（寫入後回傳正式筆數）；背景 patch 補 device_fp、public_ip。
 */
const PAGEVIEW_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxQGQil_6_0KCoDk_6Amrv99qSlPJWOfeoeC6EpQWNDX0OvjYfGDi7DLQjtUNgOeAldWg/exec",
  DEVICE_ID_KEY: "yc4rs_device_id",
};

(function () {
  var visitTs = Date.now();
  var pendingStats = null;
  var hitSent = false;
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

  function getDeviceId() {
    try {
      var stored = localStorage.getItem(PAGEVIEW_CONFIG.DEVICE_ID_KEY);
      if (stored) return stored;

      var id =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "dev-" + visitTs + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem(PAGEVIEW_CONFIG.DEVICE_ID_KEY, id);
      return id;
    } catch (e) {
      return "dev-" + visitTs;
    }
  }

  function getDeviceFingerprint() {
    var raw = [String(navigator.hardwareConcurrency || ""), String(navigator.deviceMemory || ""), String(navigator.maxTouchPoints || "")].join("|");

    if (!window.crypto || !crypto.subtle || !window.TextEncoder) {
      return Promise.resolve("");
    }

    return crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(raw))
      .then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) {
            return b.toString(16).padStart(2, "0");
          })
          .join("");
      })
      .catch(function () {
        return "";
      });
  }

  function fetchPublicIp() {
    return fetch("https://api.ipify.org?format=json")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        return data.ip || "";
      })
      .catch(function () {
        return "";
      });
  }

  function tryRenderStats() {
    if (pendingStats) {
      renderStats(pendingStats);
    }
  }

  function buildApiUrl(params) {
    return PAGEVIEW_CONFIG.API_URL + "?" + params.toString();
  }

  function bumpTodayInWeek(week, todayViews) {
    if (!week || !week.length) return week;
    var today = formatDate(new Date());
    return week.map(function (item) {
      if (item.date === today) {
        return { date: item.date, views: todayViews };
      }
      return item;
    });
  }

  function loadStatsOptimistic() {
    if (!PAGEVIEW_CONFIG.API_URL) return;

    fetch(buildApiUrl(new URLSearchParams({ action: "stats" })), { keepalive: true })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (pendingStats && pendingStats.ok) return;

        pendingStats = {
          today: Number(data.today) + 1,
          week: bumpTodayInWeek(data.week, Number(data.today) + 1),
        };
        tryRenderStats();
      })
      .catch(function () {});
  }

  function patchVisitDetailsInBackground() {
    Promise.all([getDeviceFingerprint(), fetchPublicIp()]).then(function (results) {
      var deviceFp = results[0];
      var publicIp = results[1];
      if (!deviceFp && !publicIp) return;

      var params = new URLSearchParams({
        action: "patch",
        visit_ts: String(visitTs),
      });
      if (deviceFp) params.set("device_fp", deviceFp);
      if (publicIp) params.set("public_ip", publicIp);

      fetch(buildApiUrl(params), { keepalive: true }).catch(function () {});
    });
  }

  function sendHitImmediately() {
    if (!PAGEVIEW_CONFIG.API_URL || hitSent) return;
    hitSent = true;

    var deviceId = getDeviceId();
    var params = new URLSearchParams({
      action: "hit",
      visit_ts: String(visitTs),
      device_id: deviceId,
      device_fp: "",
      public_ip: "",
    });

    fetch(buildApiUrl(params), { keepalive: true })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data && data.ok !== false && typeof data.today === "number") {
          pendingStats = data;
          tryRenderStats();
        }
      })
      .catch(function () {
        if (pendingStats) return;

        fetch(buildApiUrl(new URLSearchParams({ action: "stats" })), {
          keepalive: true,
        })
          .then(function (res) {
            return res.json();
          })
          .then(function (data) {
            pendingStats = data;
            tryRenderStats();
          })
          .catch(function () {
            setStatus("無法載入瀏覽統計", true);
          });
      });

    patchVisitDetailsInBackground();
  }

  function recordVisitAndShowStats() {
    sendHitImmediately();
  }

  function init() {
    createStatsPanel();

    if (!PAGEVIEW_CONFIG.API_URL) {
      setStatus("請設定 API_URL", true);
      return;
    }

    tryRenderStats();
    recordVisitAndShowStats();
  }

  if (PAGEVIEW_CONFIG.API_URL) {
    loadStatsOptimistic();
    sendHitImmediately();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
