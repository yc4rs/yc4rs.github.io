/**
 * RS工具箱 — 瀏覽量計數後端（Google Apps Script）
 *
 * 【試算表結構】每天一個分頁（yyyy-MM-dd）
 *   visit_ts | timestamp | device_id | device_fp | public_ip
 *
 * 【重要】修改程式後：部署 → 管理部署作業 → 編輯 → 新版本 → 部署
 * 若欄位錯位：執行 repairTodaySheet，刪除今日分頁錯誤資料列後重新測試
 */

const TIMEZONE = 'Asia/Taipei';
const DAY_SHEET_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOG_HEADERS = [
  'visit_ts',
  'timestamp',
  'device_id',
  'device_fp',
  'public_ip',
];
const LOG_COL_COUNT = LOG_HEADERS.length;

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'stats';
  const lock = LockService.getScriptLock();

  if (action === 'hit') {
    lock.waitLock(10000);
    try {
      recordVisit(e);
      return jsonResponse(Object.assign({ ok: true }, getStats()));
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'patch') {
    lock.waitLock(10000);
    try {
      patchVisitPublicIp(e);
      return jsonResponse({ ok: true });
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

function headersMatch(sheet) {
  if (sheet.getLastRow() < 1) return false;

  for (let i = 0; i < LOG_COL_COUNT; i++) {
    const current = String(sheet.getRange(1, i + 1).getValue()).trim();
    if (current !== LOG_HEADERS[i]) return false;
  }

  return true;
}

function applySheetFormats(sheet) {
  sheet.getRange(1, 1, sheet.getMaxRows(), LOG_COL_COUNT).setNumberFormat('@');
}

function ensureLogHeaders(sheet) {
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, LOG_COL_COUNT).setValues([LOG_HEADERS]);
  } else if (!headersMatch(sheet)) {
    sheet.getRange(1, 1, 1, LOG_COL_COUNT).setValues([LOG_HEADERS]);
  }

  sheet.setFrozenRows(1);
  applySheetFormats(sheet);
}

function getDaySheet(dateStr, createIfMissing) {
  if (!isDaySheetName(dateStr)) {
    throw new Error('invalid date sheet: ' + dateStr);
  }

  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(dateStr);

  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(dateStr);
  }

  if (sheet) {
    ensureLogHeaders(sheet);
  }

  return sheet;
}

function todayStr() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function dateStrOffset(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function parseVisitTs(params) {
  const visitTs = Number(params && params.visit_ts);
  if (!visitTs || isNaN(visitTs)) return null;
  return visitTs;
}

function normalizeVisitTsValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!isNaN(num) && num > 0) return String(Math.floor(num));
  return String(value).trim();
}

function formatVisitTs(visitTs) {
  const d = new Date(Number(visitTs));
  const base = Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const ms = Number(visitTs) % 1000;
  const msText = ms < 10 ? '00' + ms : ms < 100 ? '0' + ms : String(ms);
  return base + '.' + msText;
}

function sanitizeCell(value, maxLen) {
  const limit = maxLen || 64;
  const str = String(value || '').trim().slice(0, limit);
  if (!str) return '';
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function findRowByVisitTs(sheet, visitTs) {
  const target = normalizeVisitTsValue(visitTs);
  if (!target) return -1;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeVisitTsValue(values[i][0]) === target) {
      return i + 2;
    }
  }

  return -1;
}

function countVisitsForDate(dateStr) {
  const sheet = getDaySheet(dateStr, false);
  if (!sheet) return 0;
  return Math.max(sheet.getLastRow() - 1, 0);
}

function recordVisit(e) {
  const params = (e && e.parameter) || {};
  const visitTs = parseVisitTs(params);
  if (!visitTs) return;

  const sheet = getDaySheet(todayStr(), true);
  if (findRowByVisitTs(sheet, visitTs) > 0) return;

  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, LOG_COL_COUNT).setValues([
    [
      normalizeVisitTsValue(visitTs),
      formatVisitTs(visitTs),
      sanitizeCell(params.device_id, 48),
      sanitizeCell(params.device_fp, 64),
      sanitizeCell(params.public_ip),
    ],
  ]);
}

function patchVisitPublicIp(e) {
  const params = (e && e.parameter) || {};
  const visitTs = parseVisitTs(params);
  if (!visitTs) return;

  const publicIp = sanitizeCell(params.public_ip);
  if (!publicIp) return;

  const sheet = getDaySheet(todayStr(), false);
  if (!sheet) return;

  const row = findRowByVisitTs(sheet, visitTs);
  if (row < 0) return;

  sheet.getRange(row, 5).setValue(publicIp);
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
  const sheet = getDaySheet(today, false);

  return {
    today: today,
    todaySheetExists: !!sheet,
    headersOk: sheet ? headersMatch(sheet) : false,
    todayViews: countVisitsForDate(today),
    daySheetCount: listDaySheets().length,
    stats: getStats(),
  };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function testSetup() {
  getDaySheet(todayStr(), true);
  Logger.log(JSON.stringify(getDebugInfo()));
}

/** 修正今日分頁表頭與欄位格式（不刪資料列，錯列請手動刪除） */
function repairTodaySheet() {
  const sheet = getDaySheet(todayStr(), true);
  ensureLogHeaders(sheet);
  Logger.log(JSON.stringify(getDebugInfo()));
}
