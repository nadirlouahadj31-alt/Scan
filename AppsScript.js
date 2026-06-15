// ============================================================
// AttendTrack — Apps Script
// Sheet layout: A=Student ID | B=Entry | C=Exit
//
// SETUP:
// 1. Open your Google Sheet
// 2. Create a sheet tab named "Attendance"
// 3. Add headers in row 1: Student ID | Entry | Exit
// 4. Extensions > Apps Script > paste this > Save
// 5. Deploy > New deployment > Web App
//    Execute as: Me | Who has access: Anyone
// 6. Copy the Web App URL into the scanner Settings (⚙)
// ============================================================

const SHEET_NAME = 'Attendance';

function doPost(e) {
  try {
    const data       = JSON.parse(e.postData.contents);
    const studentId  = String(data.studentId || '').trim();
    const date       = String(data.date  || '');   // dd/mm/yyyy
    const time       = String(data.time  || '');   // HH:mm
    const mode       = String(data.mode  || 'entry'); // 'entry' | 'exit'

    if (!studentId) return respond({ status: 'error', message: 'Missing student ID' });

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) return respond({ status: 'error', message: `Sheet "${SHEET_NAME}" not found` });

    const datetime = date + ' - ' + time;  // e.g. "15/06/2026 - 09:00"

    // Find existing row for this student (column A)
    const colA  = sheet.getRange('A:A').getValues().flat();
    let rowIndex = colA.indexOf(studentId); // 0-based

    if (rowIndex === -1) {
      // Student not in sheet yet — add a new row
      const lastRow = sheet.getLastRow() + 1;
      sheet.getRange(lastRow, 1).setValue(studentId);
      rowIndex = lastRow - 1; // convert to 0-based
    }

    const sheetRow = rowIndex + 1; // convert back to 1-based for Sheets

    if (mode === 'entry') {
      // Column B = Entry
      sheet.getRange(sheetRow, 2).setValue(datetime);
    } else {
      // Column C = Exit
      sheet.getRange(sheetRow, 3).setValue(datetime);
    }

    return respond({ status: 'ok', mode, studentId, datetime });

  } catch (err) {
    return respond({ status: 'error', message: err.message });
  }
}

function doGet() {
  return respond({ status: 'ok', message: 'AttendTrack is running' });
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
