import { AttendanceReportRecord } from '../../types';
import { formatDate, formatTime } from '../../utils/format';

export interface AttendanceReportExportMeta {
  title: string;
  reportType: string;
  dateRange: string;
  generatedBy: string;
  generatedOn: string;
  totalRecords: number;
  totalEmployees: number;
  manualCheckouts: number;
  autoCheckouts: number;
  remoteCheckIns: number;
  employeeName?: string;
}

type AttendanceReportColumn = {
  key: string;
  header: string;
  widthWeight: number;
  getValue: (row: AttendanceReportRecord) => string;
};

function escapeCsv(value: string) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function formatCheckoutType(value: AttendanceReportRecord['checkout_type']) {
  if (value === 'manual_checkout') return 'Manual Checkout';
  if (value === 'auto_checkout') return 'Auto Checkout';
  if (value === 'pending') return 'Pending';
  return value;
}

function formatAttendanceStatus(value: AttendanceReportRecord['attendance_status']) {
  if (value === 'on_site') return 'On Site';
  if (value === 'checked_out') return 'Checked Out';
  if (value === 'remote_work') return 'Remote Work';
  return value;
}

function getAttendanceReportColumns(): AttendanceReportColumn[] {
  return [
    { key: 'employee_name', header: 'Employee Name', widthWeight: 1.45, getValue: (row) => row.employee_name },
    { key: 'employee_code', header: 'Employee ID', widthWeight: 1.05, getValue: (row) => row.employee_code },
    { key: 'site_name', header: 'Site Name', widthWeight: 1.2, getValue: (row) => row.site_name },
    { key: 'check_in_date', header: 'Check In Date', widthWeight: 1.1, getValue: (row) => formatDate(row.check_in_time) },
    { key: 'check_in_time', header: 'Check In Time', widthWeight: 1.0, getValue: (row) => formatTime(row.check_in_time) },
    {
      key: 'check_out_date',
      header: 'Check Out Date',
      widthWeight: 1.1,
      getValue: (row) => (row.check_out_time ? formatDate(row.check_out_time) : 'Pending'),
    },
    {
      key: 'check_out_time',
      header: 'Check Out Time',
      widthWeight: 1.0,
      getValue: (row) => (row.check_out_time ? formatTime(row.check_out_time) : 'Pending'),
    },
    {
      key: 'check_in_location',
      header: 'Check In Location',
      widthWeight: 1.45,
      getValue: (row) => row.check_in_location,
    },
    {
      key: 'check_out_location',
      header: 'Check Out Location',
      widthWeight: 1.45,
      getValue: (row) => row.check_out_location,
    },
    { key: 'full_address', header: 'Full Address', widthWeight: 2.65, getValue: (row) => row.full_address },
    {
      key: 'checkout_type',
      header: 'Checkout Type',
      widthWeight: 1.15,
      getValue: (row) => formatCheckoutType(row.checkout_type),
    },
    {
      key: 'remote_location',
      header: 'Remote Location',
      widthWeight: 1.05,
      getValue: (row) => (row.is_remote_location ? 'Yes' : 'No'),
    },
    {
      key: 'session_duration',
      header: 'Session Duration',
      widthWeight: 1.15,
      getValue: (row) => row.session_duration,
    },
    {
      key: 'attendance_status',
      header: 'Status',
      widthWeight: 1.05,
      getValue: (row) => formatAttendanceStatus(row.attendance_status),
    },
  ];
}

export function buildAttendanceReportCsv(rows: AttendanceReportRecord[]) {
  const columns = getAttendanceReportColumns();
  const header = columns.map((column) => column.header).join(',');

  return [
    header,
    ...rows.map((row) =>
      columns.map((column) => escapeCsv(column.getValue(row))).join(',')
    ),
  ].join('\n');
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function estimateTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.52;
}

function wrapText(text: string, maxWidth: number, fontSize: number) {
  const safeText = String(text ?? '').replace(/\r/g, '');
  if (!safeText) {
    return [''];
  }

  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.52)));
  const paragraphs = safeText.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (estimateTextWidth(word, fontSize) <= maxWidth) {
        current = word;
        continue;
      }

      let start = 0;
      while (start < word.length) {
        lines.push(word.slice(start, start + maxCharsPerLine));
        start += maxCharsPerLine;
      }
      current = '';
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [''];
}

function drawText(text: string, x: number, y: number, fontSize: number, font = 'F1') {
  return `BT /${font} ${fontSize} Tf 0 0 0 rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n`;
}

function drawLine(x1: number, y1: number, x2: number, y2: number, width = 1) {
  return `${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function drawRect(x: number, y: number, width: number, height: number, fillRgb?: [number, number, number]) {
  const fill = fillRgb
    ? `${fillRgb.map((value) => value.toFixed(3)).join(' ')} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f\n`
    : '';
  return `${fill}0 0 0 RG 0.5 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S\n`;
}

function buildReportHeaderLines(meta: AttendanceReportExportMeta, pageWidth: number, isFirstPage: boolean) {
  if (!isFirstPage) {
    return [];
  }

  const availableWidth = pageWidth - 48;
  const lines: Array<{ text: string; font: string; size: number; gapAfter: number }> = [
    { text: 'AIHP CrewTrack', font: 'F2', size: 16, gapAfter: 4 },
    { text: 'Attendance Management System', font: 'F1', size: 9, gapAfter: 12 },
  ];

  wrapText(meta.title, availableWidth, 14).forEach((text, index) => {
    lines.push({ text, font: 'F2', size: 14, gapAfter: index === 0 ? 8 : 4 });
  });

  if (meta.employeeName) {
    lines.push({ text: `Employee: ${meta.employeeName}`, font: 'F1', size: 10, gapAfter: 4 });
    lines.push({ text: `Period: ${meta.dateRange}`, font: 'F1', size: 10, gapAfter: 8 });
  }

  lines.push({ text: `Report Type: ${meta.reportType}`, font: 'F1', size: 10, gapAfter: 4 });
  lines.push({ text: `Date Range: ${meta.dateRange}`, font: 'F1', size: 10, gapAfter: 4 });
  lines.push({ text: `Generated Date & Time: ${meta.generatedOn}`, font: 'F1', size: 10, gapAfter: 4 });
  lines.push({ text: `Total Records: ${meta.totalRecords}`, font: 'F1', size: 10, gapAfter: 10 });
  lines.push({
    text: `Total Employees: ${meta.totalEmployees}    Total Attendance Records: ${meta.totalRecords}`,
    font: 'F1',
    size: 10,
    gapAfter: 4,
  });
  lines.push({
    text: `Manual Checkouts: ${meta.manualCheckouts}    Auto Checkouts: ${meta.autoCheckouts}`,
    font: 'F1',
    size: 10,
    gapAfter: 4,
  });
  lines.push({
    text: `Remote Check-ins: ${meta.remoteCheckIns}    Generated By: ${meta.generatedBy}`,
    font: 'F1',
    size: 10,
    gapAfter: 4,
  });
  lines.push({
    text: `Generated On: ${meta.generatedOn}`,
    font: 'F1',
    size: 10,
    gapAfter: 8,
  });

  return lines;
}

function measureHeaderHeight(meta: AttendanceReportExportMeta, pageWidth: number, isFirstPage: boolean) {
  const lines = buildReportHeaderLines(meta, pageWidth, isFirstPage);
  const textHeight = lines.reduce((total, line) => total + line.size + line.gapAfter, 0);
  return textHeight + 12;
}

function renderPageHeader(
  meta: AttendanceReportExportMeta,
  pageWidth: number,
  pageHeight: number,
  isFirstPage: boolean
) {
  const lines = buildReportHeaderLines(meta, pageWidth, isFirstPage);
  const margin = 24;
  let currentY = pageHeight - margin;
  let commands = '';

  if (isFirstPage) {
    commands += drawRect(margin, pageHeight - margin - 44, pageWidth - margin * 2, 36, [0.89, 0.93, 0.97]);
  }

  lines.forEach((line) => {
    commands += drawText(line.text, margin, currentY, line.size, line.font);
    currentY -= line.size + line.gapAfter;
  });

  commands += drawLine(margin, currentY, pageWidth - margin, currentY, 1);
  return {
    commands,
    tableStartY: currentY - 12,
  };
}

type RowLayout = {
  rowIndex: number;
  fill: [number, number, number] | undefined;
  cells: string[][];
  maxLines: number;
};

type PageLayout = {
  rowSegments: Array<{ rowIndex: number; startLine: number; lineCount: number }>;
};

export function buildAttendanceReportPdf(rows: AttendanceReportRecord[], meta: AttendanceReportExportMeta) {
  const columns = getAttendanceReportColumns();
  const orientation = columns.length > 10 ? 'landscape' : 'portrait';
  const pageWidth = orientation === 'landscape' ? 792 : 612;
  const pageHeight = orientation === 'landscape' ? 612 : 792;
  const margin = 24;
  const footerHeight = 20;
  const tableFontSize = orientation === 'landscape' ? 7 : 8;
  const headerFontSize = tableFontSize + 0.5;
  const lineHeight = tableFontSize + 3;
  const cellPadding = 3;
  const usableWidth = pageWidth - margin * 2;
  const totalWeight = columns.reduce((sum, column) => sum + column.widthWeight, 0);
  const columnWidths = columns.map((column) => (column.widthWeight / totalWeight) * usableWidth);
  const headerHeight =
    Math.max(
      ...columns.map((column, columnIndex) =>
        wrapText(column.header, Math.max(18, columnWidths[columnIndex] - cellPadding * 2), headerFontSize).length
      ),
      1
    ) * (headerFontSize + 2) + cellPadding * 2;
  const firstPageTop = measureHeaderHeight(meta, pageWidth, true);
  const nextPageTop = measureHeaderHeight(meta, pageWidth, false);
  const firstPageTableStart = pageHeight - margin - firstPageTop;
  const nextPageTableStart = pageHeight - margin - nextPageTop;
  const tableBottom = margin + footerHeight;

  const rowLayouts: RowLayout[] = rows.map((row, rowIndex) => {
    const cells = columns.map((column, columnIndex) =>
      wrapText(column.getValue(row), Math.max(18, columnWidths[columnIndex] - cellPadding * 2), tableFontSize)
    );
    return {
      rowIndex,
      fill: rowIndex % 2 === 0 ? ([0.988, 0.992, 0.996] as [number, number, number]) : undefined,
      cells,
      maxLines: Math.max(...cells.map((cell) => cell.length), 1),
    };
  });

  const pages: PageLayout[] = [];
  let currentPage: PageLayout = { rowSegments: [] };
  let currentY = firstPageTableStart - headerHeight;

  const startNewPage = () => {
    pages.push(currentPage);
    currentPage = { rowSegments: [] };
    currentY = nextPageTableStart - headerHeight;
  };

  rowLayouts.forEach((rowLayout) => {
    let startLine = 0;

    while (startLine < rowLayout.maxLines) {
      const remainingLines = rowLayout.maxLines - startLine;
      const availableHeight = currentY - tableBottom;
      const maxLinesThatFit = Math.floor((availableHeight - cellPadding * 2) / lineHeight);

      if (maxLinesThatFit < 1) {
        startNewPage();
        continue;
      }

      const lineCount = Math.max(1, Math.min(remainingLines, maxLinesThatFit));
      currentPage.rowSegments.push({ rowIndex: rowLayout.rowIndex, startLine, lineCount });
      currentY -= lineCount * lineHeight + cellPadding * 2;
      startLine += lineCount;

      if (startLine < rowLayout.maxLines) {
        startNewPage();
      }
    }
  });

  pages.push(currentPage);

  const pageStreams = pages.map((page, pageIndex) => {
    const isFirstPage = pageIndex === 0;
    const { commands: headerCommands, tableStartY } = renderPageHeader(meta, pageWidth, pageHeight, isFirstPage);
    let commands = headerCommands;
    let currentTableY = tableStartY;
    let currentX = margin;

    commands += drawRect(margin, currentTableY - headerHeight, usableWidth, headerHeight, [0.89, 0.93, 0.97]);
    columns.forEach((column, columnIndex) => {
      const width = columnWidths[columnIndex];
      const headerLines = wrapText(column.header, Math.max(18, width - cellPadding * 2), headerFontSize);
      let lineY = currentTableY - cellPadding - headerFontSize;
      headerLines.forEach((line) => {
        commands += drawText(line, currentX + cellPadding, lineY, headerFontSize, 'F2');
        lineY -= headerFontSize + 2;
      });
      currentX += width;
    });

    currentTableY -= headerHeight;

    page.rowSegments.forEach((segment) => {
      const rowLayout = rowLayouts[segment.rowIndex];
      const rowHeight = segment.lineCount * lineHeight + cellPadding * 2;
      let cellX = margin;
      commands += drawRect(margin, currentTableY - rowHeight, usableWidth, rowHeight, rowLayout.fill);

      rowLayout.cells.forEach((cellLines, columnIndex) => {
        const cellWidth = columnWidths[columnIndex];
        const lines = cellLines.slice(segment.startLine, segment.startLine + segment.lineCount);
        let lineY = currentTableY - cellPadding - tableFontSize;
        lines.forEach((line) => {
          commands += drawText(line, cellX + cellPadding, lineY, tableFontSize);
          lineY -= lineHeight;
        });
        commands += drawLine(cellX, currentTableY, cellX, currentTableY - rowHeight, 0.5);
        cellX += cellWidth;
      });

      commands += drawLine(margin + usableWidth, currentTableY, margin + usableWidth, currentTableY - rowHeight, 0.5);
      commands += drawLine(margin, currentTableY - rowHeight, margin + usableWidth, currentTableY - rowHeight, 0.5);
      currentTableY -= rowHeight;
    });

    commands += drawText(
      `Page ${pageIndex + 1} of ${pages.length}`,
      pageWidth - margin - 70,
      margin - 2,
      9,
      'F1'
    );

    return commands;
  });

  const objects: string[] = [];

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push(`2 0 obj << /Type /Pages /Kids [${pageStreams.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageStreams.length} >> endobj`);

  pageStreams.forEach((stream, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = 4 + index * 2;
    objects.push(
      `${pageObjectNumber} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${3 + pageStreams.length * 2} 0 R /F2 ${4 + pageStreams.length * 2} 0 R >> >> /Contents ${contentObjectNumber} 0 R >> endobj`
    );
    objects.push(`${contentObjectNumber} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);
  });

  objects.push(`${3 + pageStreams.length * 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`);
  objects.push(`${4 + pageStreams.length * 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
}
