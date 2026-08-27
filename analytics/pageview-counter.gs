/**
 * RS工具箱 — 瀏覽量計數後端（Google Apps Script）
 *
 * 【試算表結構】每天一個分頁，分頁名稱 = yyyy-MM-dd
 *   欄位：timestamp | local_ip | public_ip
 *   瀏覽次數 = 該分頁資料列數（不含表頭）
 *   刪除舊分頁即可清除該日資料
 *
 * 【重要】修改程式後：部署 → 管理部署作業 → 編輯 → 新版本 → 部署
 *
 * 【API】
 * GET ?action=hit&public_ip=&local_ip= → 寫入今日分頁
 * GET ?action=stats                     → { today, week }（不含 IP）
 * GET ?action=debug                     → 除錯用
 */

const TIMEZONE = 'Asia/Taipei';
const DAY_SHEET_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOG_HEADERS = ['timestamp', 'local_ip', 'public_ip'];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'stats';
  const lock = LockService.getScriptLock();

  if (action === 'hit') {
    lock.waitLock(10000);
    try {
      recordVisit(e);
      return jsonResponse({ ok: true, today: getTodayCount() });
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'stats') {
    return jsonResponse(getStats());
  }

  if (action === 'debug') {
    return jsonResponse(getDebugInfo());
  }

  return jsonResponse({ error: 'unknown action' });
}

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function isDaySheetName(name) {
  return DAY_SHEET_PATTERN.test(String(name));
}

function getDaySheet(dateStr, createIfMissing) {
  if (!isDaySheetName(dateStr)) {
    throw new Error('invalid date sheet: ' + dateStr);
  }

  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(dateStr);

  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(dateStr);
    sheet.appendRow(LOG_HEADERS);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function todayStr() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function nowStr() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function dateStrOffset(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function sanitizeCell(value) {
  const str = String(value || '').trim().slice(0, 64);
  if (!str) return '';
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function countVisitsForDate(dateStr) {
  const sheet = getDaySheet(dateStr, false);
  if (!sheet) return 0;
  return Math.max(sheet.getLastRow() - 1, 0);
}

function recordVisit(e) {
  const params = (e && e.parameter) || {};
  const sheet = getDaySheet(todayStr(), true);

  sheet.appendRow([
    nowStr(),
    sanitizeCell(params.local_ip),
    sanitizeCell(params.public_ip),
  ]);
}

function getTodayCount() {
  return countVisitsForDate(todayStr());
}

function getStats() {
  const today = todayStr();
  const week = [];

  for (let i = 6; i >= 0; i--) {
    const dateStr = dateStrOffset(i);
    week.push({ date: dateStr, views: countVisitsForDate(dateStr) });
  }

  return {
    today: countVisitsForDate(today),
    week: week,
  };
}

function listDaySheets() {
  return getSpreadsheet()
    .getSheets()
    .map(function (sheet) {
      return sheet.getName();
    })
    .filter(isDaySheetName)
    .sort();
}

function getDebugInfo() {
  const today = todayStr();
  const todaySheet = getDaySheet(today, false);

  return {
    today: today,
    todaySheetExists: !!todaySheet,
    todayViews: countVisitsForDate(today),
    daySheetCount: listDaySheets().length,
    daySheets: listDaySheets().slice(-7),
    stats: getStats(),
  };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** 首次設定：建立今日分頁並確認授權 */
function testSetup() {
  getDaySheet(todayStr(), true);
  Logger.log(JSON.stringify(getDebugInfo()));
}
