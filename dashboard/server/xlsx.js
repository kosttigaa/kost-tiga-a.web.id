import * as fflate from 'fflate';

const escapeXml = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

export const colLetter = (idx) => {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - mod) / 26);
  }
  return s;
};

export const buildXlsx = (sheetName, headers, rows, columnTypes = []) => {
  const safeSheetName = (sheetName || 'Sheet1').slice(0, 31).replace(/[\\/*?:[\]]/g, '_');

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="' + escapeXml(safeSheetName) + '" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>';

  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>' +
    '<fonts count="2">' +
    '<font><name val="Calibri"/><sz val="11"/></font>' +
    '<font><b/><color rgb="FFFFFFFF"/><name val="Calibri"/><sz val="11"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF354C3F"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border>' +
    '<left style="thin"><color rgb="FFD9D9D9"/></left>' +
    '<right style="thin"><color rgb="FFD9D9D9"/></right>' +
    '<top style="thin"><color rgb="FFD9D9D9"/></top>' +
    '<bottom style="thin"><color rgb="FFD9D9D9"/></bottom>' +
    '</border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '</cellXfs>' +
    '</styleSheet>';

  let sheetData = '<row r="1">';
  headers.forEach((h, col) => {
    sheetData += '<c r="' + colLetter(col) + '1" s="1" t="inlineStr"><is><t>' + escapeXml(h) + '</t></is></c>';
  });
  sheetData += '</row>';

  rows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 2;
    sheetData += '<row r="' + rNum + '">';
    row.forEach((cell, col) => {
      const cellRef = colLetter(col) + rNum;
      const type = columnTypes[col];
      if (cell === null || cell === undefined || cell === '') {
        sheetData += '<c r="' + cellRef + '" s="0"/>';
      } else if (type === 'int' && Number.isFinite(Number(cell))) {
        sheetData += '<c r="' + cellRef + '" s="2"><v>' + Number(cell) + '</v></c>';
      } else {
        sheetData += '<c r="' + cellRef + '" s="3" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(String(cell)) + '</t></is></c>';
      }
    });
    sheetData += '</row>';
  });

  const worksheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetData>' + sheetData + '</sheetData>' +
    '</worksheet>';

  const zipObj = {
    '[Content_Types].xml': fflate.strToU8(contentTypes),
    '_rels/.rels': fflate.strToU8(rootRels),
    'xl/_rels/workbook.xml.rels': fflate.strToU8(wbRels),
    'xl/workbook.xml': fflate.strToU8(workbook),
    'xl/styles.xml': fflate.strToU8(styles),
    'xl/worksheets/sheet1.xml': fflate.strToU8(worksheet),
  };

  const zipped = fflate.zipSync(zipObj);
  return Buffer.from(zipped);
};
