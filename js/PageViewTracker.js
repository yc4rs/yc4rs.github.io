/**
 * 首頁瀏覽量統計（Google Sheet 後端）
 *
 * 【試算表】每天一個分頁（yyyy-MM-dd），每進入一次就寫一列
 *   timestamp | local_ip | public_ip
 * 刪除舊日期分頁即可 drop 歷史資料。stats 不回傳 IP 到網頁。
 *
 * 內網 IP 多數瀏覽器無法取得，可能為空欄，屬正常現象。
 */
const PAGEVIEW_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxQGQil_6_0KCoDk_6Amrv99qSlPJWOfeoeC6EpQWNDX0OvjYfGDi7DLQjtUNgOeAldWg/exec",
};

(function () {
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

  function fetchLocalIp() {
    return new Promise(function (resolve) {
      if (!window.RTCPeerConnection) {
        resolve("");
        return;
      }

      var finished = false;
      var finish = function (ip) {
        if (finished) return;
        finished = true;
        try {
          pc.close();
        } catch (e) {}
        resolve(ip || "");
      };

      var pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      pc.onicecandidate = function (event) {
        if (!event || !event.candidate) return;
        var match = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(event.candidate.candidate);
        if (match) finish(match[1]);
      };
      pc.createOffer()
        .then(function (offer) {
          return pc.setLocalDescription(offer);
        })
        .catch(function () {
          finish("");
        });
      setTimeout(function () {
        finish("");
      }, 2000);
    });
  }

  function collectClientInfo() {
    return Promise.all([fetchPublicIp(), fetchLocalIp()]).then(function (results) {
      return {
        publicIp: results[0],
        localIp: results[1],
      };
    });
  }

  function recordVisit() {
    if (!PAGEVIEW_CONFIG.API_URL) return Promise.resolve();

    return collectClientInfo()
      .then(function (info) {
        const params = new URLSearchParams({
          action: "hit",
          public_ip: info.publicIp,
          local_ip: info.localIp,
        });
        return fetch(PAGEVIEW_CONFIG.API_URL + "?" + params.toString());
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
