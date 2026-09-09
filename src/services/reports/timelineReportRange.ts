export type TimelineReportPeriod = 'daily' | 'weekly' | 'monthly';

// CrewTrack currently has one explicit business/report timezone. India has no
// daylight-saving transitions, so local calendar boundaries can be represented
// unambiguously with this offset on every web/device host.
const REPORT_OFFSET = '+05:30';

function calendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Report date must use YYYY-MM-DD');
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function dateToken(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function timelineReportRange(period: TimelineReportPeriod, value: string) {
  const startDay = calendarDate(value);
  if (period === 'weekly') startDay.setUTCDate(startDay.getUTCDate() - ((startDay.getUTCDay() + 6) % 7));
  if (period === 'monthly') startDay.setUTCDate(1);
  const endDay = new Date(startDay);
  if (period === 'daily') endDay.setUTCDate(endDay.getUTCDate() + 1);
  else if (period === 'weekly') endDay.setUTCDate(endDay.getUTCDate() + 7);
  else endDay.setUTCMonth(endDay.getUTCMonth() + 1);
  const startDate = dateToken(startDay);
  const endDate = dateToken(endDay);
  return {
    start: new Date(`${startDate}T00:00:00${REPORT_OFFSET}`),
    end: new Date(`${endDate}T00:00:00${REPORT_OFFSET}`),
    from: new Date(`${startDate}T00:00:00${REPORT_OFFSET}`).toISOString(),
    to: new Date(`${endDate}T00:00:00${REPORT_OFFSET}`).toISOString(),
  };
}
