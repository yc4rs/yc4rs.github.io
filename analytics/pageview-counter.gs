/**
 * RS工具箱 — 瀏覽量計數後端（Google Apps Script）
 *
 * 【部署步驟】
 * 1. 建立新的 Google 試算表
 * 2. 擴充功能 → Apps Script，貼上此檔案全部內容
 * 3. 部署 → 新增部署作業 → 類型：網路應用程式
 *    - 執行身分：我
 *    - 具有存取權的使用者：任何人
 * 4. 複製 Web App URL，貼到 js/PageViewTracker.js 的 API_URL
 *
 * 【API】
 * GET ?action=hit   → 今日瀏覽 +1
 * GET ?action=stats → { today: number, week: [{ date, views }] }
 */

const SHEET_NAME = 'PageViews';
const TIMEZONE = 'Asia/Taipei';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'stats';
  const lock = LockService.getScriptLock();

  if (action === 'hit') {
    lock.waitLock(10000);
    try {
      incrementToday();
      return jsonResponse({ ok: true, today: getTodayCount() });
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'stats') {
    return jsonResponse(getStats());
  }

  return jsonResponse({ error: 'unknown action' });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['date', 'views']);
  }
  return sheet;
}

function todayStr() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

function incrementToday() {
  const sheet = getSheet();
  const today = todayStr();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === today) {
      sheet.getRange(i + 1, 2).setValue(Number(data[i][1]) + 1);
      return;
    }
  }

  sheet.appendRow([today, 1]);
}

function getTodayCount() {
  const sheet = getSheet();
  const today = todayStr();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === today) {
      return Number(data[i][1]);
    }
  }

  return 0;
}

function buildDateMap(data) {
  const map = {};
  for (let i = 1; i < data.length; i++) {
    map[String(data[i][0])] = Number(data[i][1]) || 0;
  }
  return map;
}

function getStats() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const map = buildDateMap(data);
  const today = todayStr();
  const week = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
    week.push({ date: dateStr, views: map[dateStr] || 0 });
  }

  return {
    today: map[today] || 0,
    week: week,
  };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** 首次設定：在 Apps Script 編輯器選此函式執行，完成授權並建立 PageViews 分頁 */
function testSetup() {
  getSheet();
  Logger.log(JSON.stringify(getStats()));
}
