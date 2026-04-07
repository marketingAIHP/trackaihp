import { AttendanceReportRecord } from '../../types';
import { formatDate, formatTime } from '../../utils/format';

function escapeCsv(value: string) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildAttendanceReportCsv(rows: AttendanceReportRecord[]) {
  const header = [
    'Employee Name',
    'Date',
    'Check-in Time',
    'Check-out Time',
    'Check-in Location',
    'Check-out Location',
    'Checkout Type',
    'Site Name',
    'Attendance Status',
  ].join(',');

  return [
    header,
    ...rows.map((row) =>
      [
        escapeCsv(row.employee_name),
        escapeCsv(formatDate(row.date)),
        escapeCsv(formatTime(row.check_in_time)),
        escapeCsv(row.check_out_time ? formatTime(row.check_out_time) : 'Pending'),
        escapeCsv(row.check_in_location),
        escapeCsv(row.check_out_location),
        escapeCsv(row.checkout_type),
        escapeCsv(row.site_name),
        escapeCsv(row.attendance_status),
      ].join(',')
    ),
  ].join('\n');
}

export function buildAttendanceReportPdf(rows: AttendanceReportRecord[]) {
  const lines = rows.slice(0, 40).map(
    (row) =>
      `${row.employee_name} | ${formatDate(row.date)} | ${formatTime(row.check_in_time)} | ${row.site_name} | ${row.checkout_type}`
  );
  const text = ['Attendance Report', ...lines].join('\n').replace(/[()\\]/g, ' ');
  const stream = `BT /F1 10 Tf 40 780 Td (${text.slice(0, 3000)}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

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
