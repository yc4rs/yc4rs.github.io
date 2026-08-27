/**
 * RS工具箱 — 瀏覽量計數後端（Google Apps Script）
 *
 * 【試算表結構】每天一個分頁（yyyy-MM-dd）
 *   visit_ts | timestamp | device_id | device_fp | local_ip | public_ip
 *
 * 【重要】修改程式後：部署 → 管理部署作業 → 編輯 → 新版本 → 部署
 *
 * 【API】
 * GET ?action=hit&visit_ts=&device_id=&device_fp= → 立刻寫入，回傳 stats
 * GET ?action=patch&visit_ts=&public_ip=&local_ip= → 依 visit_ts 補 IP
 * GET ?action=stats
 * GET ?action=debug
 */

const TIMEZONE = 'Asia/Taipei';
const DAY_SHEET_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOG_HEADERS = [
  'visit_ts',
  'timestamp',
  'device_id',
  'device_fp',
  'local_ip',
  'public_ip',
];

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
      patchVisitIps(e);
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

function ensureLogHeaders(sheet) {
  if (sheet.getLastRow() < 1) {
    sheet.appendRow(LOG_HEADERS);
    sheet.setFrozenRows(1);
    return;
  }

  const firstHeader = String(sheet.getRange(1, 1).getValue()).trim();

  if (firstHeader === 'visit_ts') {
    const col3 = String(sheet.getRange(1, 3).getValue()).trim();
    if (col3 === 'local_ip') {
      sheet.insertColumnsBefore(3, 2);
      sheet.getRange(1, 3).setValue('device_id');
      sheet.getRange(1, 4).setValue('device_fp');
    }
    sheet.setFrozenRows(1);
    return;
  }

  if (firstHeader === 'timestamp') {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue('visit_ts');
    sheet.setFrozenRows(1);
  }
}

function getDaySheet(dateStr, createIfMissing) {
  if (!isDaySheetName(dateStr)) {
    throw new Error('invalid date sheet: ' + dateStr);
  }

  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(dateStr);

  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(dateStr);
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
  const data = sheet.getDataRange().getValues();
  const target = String(visitTs);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === target) {
      return i + 1;
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
  ensureLogHeaders(sheet);

  if (findRowByVisitTs(sheet, visitTs) > 0) return;

  sheet.appendRow([
    visitTs,
    formatVisitTs(visitTs),
    sanitizeCell(params.device_id, 48),
    sanitizeCell(params.device_fp, 64),
    sanitizeCell(params.local_ip),
    sanitizeCell(params.public_ip),
  ]);
}

function patchVisitIps(e) {
  const params = (e && e.parameter) || {};
  const visitTs = parseVisitTs(params);
  if (!visitTs) return;

  const localIp = sanitizeCell(params.local_ip);
  const publicIp = sanitizeCell(params.public_ip);
  if (!localIp && !publicIp) return;

  const sheet = getDaySheet(todayStr(), false);
  if (!sheet) return;

  const row = findRowByVisitTs(sheet, visitTs);
  if (row < 0) return;

  if (localIp) sheet.getRange(row, 5).setValue(localIp);
  if (publicIp) sheet.getRange(row, 6).setValue(publicIp);
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

  return {
    today: today,
    todaySheetExists: !!getDaySheet(today, false),
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

function testSetup() {
  getDaySheet(todayStr(), true);
  Logger.log(JSON.stringify(getDebugInfo()));
}
