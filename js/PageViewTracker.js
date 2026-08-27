/**
 * 首頁瀏覽量統計（Google Sheet 後端）
 *
 * 【試算表】每天分頁 yyyy-MM-dd
 *   visit_ts | timestamp | device_id | device_fp | local_ip | public_ip
 * 進頁立刻 hit（visit_ts + device）；背景 patch 依 visit_ts 補 IP。
 */
const PAGEVIEW_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxQGQil_6_0KCoDk_6Amrv99qSlPJWOfeoeC6EpQWNDX0OvjYfGDi7DLQjtUNgOeAldWg/exec",
  LOCAL_IP_TIMEOUT_MS: 3500,
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
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "dev-" + visitTs + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem(PAGEVIEW_CONFIG.DEVICE_ID_KEY, id);
      return id;
    } catch (e) {
      return "dev-" + visitTs;
    }
  }

  function getDeviceFingerprint() {
    var raw = [
      String(navigator.hardwareConcurrency || ""),
      String(navigator.deviceMemory || ""),
      String(navigator.maxTouchPoints || ""),
    ].join("|");

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

  function isPrivateIp(ip) {
    var parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(function (n) { return isNaN(n); })) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }

  function fetchLocalIp() {
    return new Promise(function (resolve) {
      if (!window.RTCPeerConnection) {
        resolve("");
        return;
      }

      var privateIps = [];
      var otherIps = [];
      var localNames = [];
      var seen = {};
      var finished = false;
      var pc;

      function remember(list, value) {
        if (!value || seen[value]) return;
        seen[value] = true;
        list.push(value);
      }

      function parseCandidate(candidateStr) {
        var tokens = candidateStr.split(" ");
        for (var i = 0; i < tokens.length; i++) {
          var token = tokens[i];
          if (/^[\d.]+$/.test(token) && token.split(".").length === 4) {
            if (token === "127.0.0.1" || token.indexOf("127.") === 0) continue;
            if (isPrivateIp(token)) remember(privateIps, token);
            else remember(otherIps, token);
          } else if (/\.local$/i.test(token)) {
            remember(localNames, token);
          }
        }
      }

      function pickBestLocalIp() {
        if (privateIps.length) return privateIps.join(", ");
        if (localNames.length) return localNames.join(", ");
        if (otherIps.length) return otherIps.join(", ");
        return "";
      }

      function finish() {
        if (finished) return;
        finished = true;
        try {
          if (pc) pc.close();
        } catch (e) {}
        resolve(pickBestLocalIp());
      }

      pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      pc.createDataChannel("");
      pc.onicecandidate = function (event) {
        if (event && event.candidate) {
          parseCandidate(event.candidate.candidate);
          return;
        }
        finish();
      };
      pc.onicegatheringstatechange = function () {
        if (pc.iceGatheringState === "complete") finish();
      };

      pc.createOffer()
        .then(function (offer) {
          return pc.setLocalDescription(offer);
        })
        .catch(function () {
          finish();
        });

      setTimeout(finish, PAGEVIEW_CONFIG.LOCAL_IP_TIMEOUT_MS || 3500);
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

  function tryRenderStats() {
    if (pendingStats) {
      renderStats(pendingStats);
    }
  }

  function buildApiUrl(params) {
    return PAGEVIEW_CONFIG.API_URL + "?" + params.toString();
  }

  function patchIpsInBackground() {
    collectClientInfo().then(function (info) {
      if (!info.publicIp && !info.localIp) return;

      var params = new URLSearchParams({
        action: "patch",
        visit_ts: String(visitTs),
        public_ip: info.publicIp,
        local_ip: info.localIp,
      });
      fetch(buildApiUrl(params), { keepalive: true }).catch(function () {});
    });
  }

  function sendHitImmediately() {
    if (!PAGEVIEW_CONFIG.API_URL || hitSent) return;
    hitSent = true;

    var deviceId = getDeviceId();

    getDeviceFingerprint()
      .then(function (deviceFp) {
        var params = new URLSearchParams({
          action: "hit",
          visit_ts: String(visitTs),
          device_id: deviceId,
          device_fp: deviceFp,
          public_ip: "",
          local_ip: "",
        });
        return fetch(buildApiUrl(params), { keepalive: true });
      })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        pendingStats = data;
        tryRenderStats();
      })
      .catch(function () {
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

    patchIpsInBackground();
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
    sendHitImmediately();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
