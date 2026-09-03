"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTimelineReportCsv = buildTimelineReportCsv;
exports.buildTimelineReportPdf = buildTimelineReportPdf;
const format_1 = require("../../utils/format");
const eventLabel = (value) => value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
const duration = (row) => {
    // An absent final observation is not evidence that a past attendance session
    // is still active. Preserve the underlying null end time as a neutral value.
    if (!row.end_time)
        return '';
    const ms = Math.max(0, new Date(row.end_time).getTime() - new Date(row.event_time).getTime());
    return `${Math.floor(ms / 3600000)}h ${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}m`;
};
const isNonLocationState = (row) => row.event_type === 'travelling' || row.event_type === 'check_out' || row.event_type === 'auto_checkout';
const locationName = (row) => isNonLocationState(row) ? '-' : (row.location_name || 'Unknown Location');
const siteName = (row) => isNonLocationState(row) ? '-' : (row.site?.name || '-');
const value = (row, key) => {
    const values = {
        Date: (0, format_1.formatDate)(row.event_time), 'Start Time': (0, format_1.formatTime)(row.event_time), 'End Time': row.end_time ? (0, format_1.formatTime)(row.end_time) : '-', Duration: duration(row) || '-', Status: eventLabel(row.event_type),
        'Location Name': locationName(row), 'Full Address': row.full_address || row.site?.address || '',
        'Site Name': siteName(row), Accuracy: row.accuracy == null ? '' : String(row.accuracy),
        'Attendance ID': row.attendance_id == null ? '' : String(row.attendance_id),
        'Checkout Type': row.event_type === 'auto_checkout' ? 'Auto Checkout' : row.event_type === 'check_out' ? 'Manual Checkout' : '',
        'Created At': row.created_at || '',
    };
    return values[key] || '';
};
// CSV retains its existing useful non-coordinate detail. The PDF uses the
// focused employee-facing projection below.
const headers = ['Date', 'Start Time', 'End Time', 'Duration', 'Status', 'Location Name', 'Full Address', 'Site Name', 'Accuracy', 'Attendance ID', 'Checkout Type'];
const pdfHeaders = ['Date', 'Start Time', 'End Time', 'Duration', 'Status', 'Location Name', 'Site Name', 'Checkout Type'];
const csvEscape = (text) => `"${text.replace(/"/g, '""')}"`;
function buildTimelineReportCsv(rows) {
    return [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(value(row, header))).join(','))].join('\n');
}
// The hand-built PDF uses Type1 Helvetica and string-length-based xref offsets.
// Keep stream text ASCII so UTF-8 multi-byte characters cannot corrupt offsets.
const pdfEscape = (text) => String(text).replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const text = (value, x, y, size = 8, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf 0 0 0 rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(value)}) Tj ET\n`;
const line = (x1, y1, x2, y2, width = 0.5) => `${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
const rect = (x, y, width, height, fill) => `${fill ? `${fill.join(' ')} rg ` : ''}0 0 0 RG 0.5 w ${x} ${y} ${width} ${height} re ${fill ? 'B' : 'S'}\n`;
const wrap = (input, width, size = 7) => {
    const maxChars = Math.max(1, Math.floor(width / (size * 0.52)));
    const result = [];
    String(input || '').replace(/\r/g, '').split('\n').forEach((paragraph) => {
        let current = '';
        paragraph.split(/\s+/).filter(Boolean).forEach((word) => {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= maxChars)
                current = candidate;
            else {
                if (current)
                    result.push(current);
                if (word.length <= maxChars)
                    current = word;
                else {
                    for (let i = 0; i < word.length; i += maxChars)
                        result.push(word.slice(i, i + maxChars));
                    current = '';
                }
            }
        });
        if (current)
            result.push(current);
    });
    return result.length ? result : [''];
};
function buildTimelineReportPdf(rows, meta) {
    // Attendance IDs remain separate in the data, but each calendar day is one
    // presentation table: main shift and overtime rows stay chronological under
    // the same date and never receive session headings.
    const orderedRows = [...rows].sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
    const columns = pdfHeaders.filter((header) => header !== 'Date');
    const weights = { 'Start Time': 0.9, 'End Time': 0.9, Duration: 0.8, Status: 1.05, 'Location Name': 1.5, 'Site Name': 1.4, 'Checkout Type': 1.15 };
    const pageWidth = 792, pageHeight = 612, margin = 24, footerHeight = 24, fontSize = 7, headerSize = 7.5, lineHeight = 10, padding = 3;
    const usableWidth = pageWidth - margin * 2, totalWeight = columns.reduce((sum, header) => sum + (weights[header] || 1), 0);
    const widths = columns.map((header) => usableWidth * (weights[header] || 1) / totalWeight);
    const headerHeight = Math.max(...columns.map((header, i) => wrap(header, widths[i] - padding * 2, headerSize).length)) * 10 + padding * 2;
    const firstTableTop = 446, continuationTableTop = pageHeight - margin;
    const bottom = margin + footerHeight;
    const layouts = orderedRows.map((row) => {
        const cells = columns.map((header, i) => wrap(value(row, header), widths[i] - padding * 2, fontSize));
        return { cells, lines: Math.max(...cells.map((cell) => cell.length)), shaded: false };
    });
    const daySectionHeight = 18;
    const pages = [[]];
    let pageIndex = 0, cursor = firstTableTop;
    let currentDay = '';
    layouts.forEach((layout, layoutIndex) => {
        const nextDay = (0, format_1.formatDate)(orderedRows[layoutIndex].event_time);
        if (nextDay !== currentDay) {
            // A date begins one logical table. Reserve its heading, table header,
            // and a data line so the heading is never stranded at a page bottom.
            if (cursor - daySectionHeight - headerHeight - lineHeight - padding * 2 < bottom) {
                pages.push([]);
                pageIndex++;
                cursor = continuationTableTop;
            }
            pages[pageIndex].push({ kind: 'day', label: nextDay });
            cursor -= daySectionHeight + headerHeight;
            currentDay = nextDay;
        }
        let start = 0;
        while (start < layout.lines) {
            const available = Math.floor((cursor - bottom - padding * 2) / lineHeight);
            if (available < 1) {
                pages.push([]);
                pageIndex++;
                cursor = continuationTableTop - headerHeight;
                continue;
            }
            const count = Math.min(layout.lines - start, available);
            pages[pageIndex].push({ kind: 'row', layout: layoutIndex, start, count });
            cursor -= count * lineHeight + padding * 2;
            start += count;
            if (start < layout.lines) {
                pages.push([]);
                pageIndex++;
                cursor = continuationTableTop - headerHeight;
            }
        }
    });
    const streams = pages.map((segments, index) => {
        const isFirstPage = index === 0;
        let out = '';
        if (isFirstPage) {
            out += rect(margin, 528, usableWidth, 48, [0.89, 0.93, 0.97]);
            out += text('AIHP CREWTRACK', margin + 8, 582, 16, true);
            out += text('Employee Location Timeline', margin + 8, 556, 14, true);
            out += text(`Employee: ${meta.employeeName}`, margin, 516, 9);
            out += text(`Report Type: ${meta.reportType}`, margin, 502, 9);
            out += text(`Date Range: ${meta.dateRange}`, margin, 488, 9);
            out += text(`Generated On: ${meta.generatedOn}    Generated By: ${meta.generatedBy}`, margin, 474, 8);
            out += text(`Summary: ${orderedRows.length} timeline row${orderedRows.length === 1 ? '' : 's'} in the selected period`, margin, 460, 8);
            out += line(margin, 452, pageWidth - margin, 452, 1);
        }
        let y = (isFirstPage ? firstTableTop : continuationTableTop);
        let x = margin;
        let hasTableHeader = false;
        const drawColumnHeader = () => {
            out += rect(margin, y - headerHeight, usableWidth, headerHeight, [0.89, 0.93, 0.97]);
            x = margin;
            columns.forEach((header, i) => { let ly = y - padding - headerSize; wrap(header, widths[i] - padding * 2, headerSize).forEach((part) => { out += text(part, x + padding, ly, headerSize, true); ly -= 10; }); x += widths[i]; });
            y -= headerHeight;
            hasTableHeader = true;
        };
        segments.forEach((segment) => {
            if (segment.kind === 'day') {
                out += rect(margin, y - daySectionHeight, usableWidth, daySectionHeight, [0.94, 0.96, 0.98]);
                out += text(segment.label, margin + padding, y - 12, 8, true);
                y -= daySectionHeight;
                drawColumnHeader();
                return;
            }
            // When a day table flows to another page, repeat only its columns.
            if (!hasTableHeader)
                drawColumnHeader();
            const layout = layouts[segment.layout], height = segment.count * lineHeight + padding * 2;
            x = margin;
            out += rect(margin, y - height, usableWidth, height, segment.layout % 2 === 0 ? [0.988, 0.992, 0.996] : undefined);
            layout.cells.forEach((cell, columnIndex) => { let ly = y - padding - fontSize; cell.slice(segment.start, segment.start + segment.count).forEach((part) => { out += text(part, x + padding, ly, fontSize); ly -= lineHeight; }); out += line(x, y, x, y - height); x += widths[columnIndex]; });
            out += line(margin + usableWidth, y, margin + usableWidth, y - height) + line(margin, y - height, margin + usableWidth, y - height);
            y -= height;
        });
        return out + text(`Page ${index + 1} of ${pages.length}`, pageWidth - margin - 72, margin - 2, 9);
    });
    const objects = ['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj', `2 0 obj << /Type /Pages /Kids [${streams.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${streams.length} >> endobj`];
    streams.forEach((stream, index) => { const pageObject = 3 + index * 2, streamObject = pageObject + 1, font1 = 3 + streams.length * 2, font2 = font1 + 1; objects.push(`${pageObject} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${streamObject} 0 R >> endobj`); objects.push(`${streamObject} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`); });
    objects.push(`${3 + streams.length * 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`, `${4 + streams.length * 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`);
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object) => { offsets.push(pdf.length); pdf += object + '\n'; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    return pdf + `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}
