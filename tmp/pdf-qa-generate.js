const fs = require('fs');
const { buildTimelineReportPdf } = require('./pdf-qa-js/services/reports/timelineExportBuilders.js');
const meta = { employeeName: 'Gagan Jha', reportType: 'Monthly', dateRange: '1 August 2026 - 31 August 2026', generatedOn: '1 September 2026, 09:00 AM', generatedBy: 'Admin User' };
const rows = Array.from({ length: 120 }, (_, index) => {
  const day = String((index % 30) + 1).padStart(2, '0');
  const hour = String(3 + (index % 12)).padStart(2, '0');
  return { id: index + 1, event_time: `2026-08-${day}T${hour}:30:00.000Z`, created_at: `2026-08-${day}T${hour}:30:00.000Z`, event_type: index % 4 === 3 ? 'check_out' : 'at_site', location_name: index % 4 === 3 ? '' : 'AIHP Millennium', site: index % 4 === 3 ? null : { name: 'AIHP Millennium' }, attendance_id: Math.floor(index / 4) + 1, end_time: index % 4 === 3 ? null : `2026-08-${day}T${String(Number(hour) + 1).padStart(2, '0')}:30:00.000Z` };
});
fs.mkdirSync('tmp/pdfs', { recursive: true });
fs.writeFileSync('tmp/pdfs/timeline-monthly-day-tables-qa.pdf', buildTimelineReportPdf(rows, meta));
fs.writeFileSync('tmp/pdfs/timeline-daily-day-table-qa.pdf', buildTimelineReportPdf(rows.filter((row) => row.event_time.startsWith('2026-08-01')), { ...meta, reportType: 'Daily', dateRange: '1 August 2026 - 1 August 2026' }));
