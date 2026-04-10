/**
 * Utility function to convert date to local ISO string format
 * This handles local timezone conversion automatically
 */
export function toLocalISOString(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return (
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate()) + "T" +
    pad(date.getHours()) + ":" +
    pad(date.getMinutes()) + ":" +
    pad(date.getSeconds()) + "." +
    String(date.getMilliseconds()).padStart(3, '0')
  );
}

export function getCurrentDate(){
    return new Date(toLocalISOString());
}

/**
 * Shifted Day Utilities for Business Day Calculation
 * Business day starts at 04:00 AM Dhaka time (UTC+6)
 * which is 22:00 (10 PM) previous day UTC
 */

export const DHAKA_TIMEZONE = 'Asia/Dhaka';

/**
 * Get date parts (year, month, day) using Dhaka timezone
 */
export function getDateParts(d: Date) {
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: DHAKA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const formattedParts = dateFormatter.formatToParts(d);
    const year = formattedParts.find(x => x.type === 'year')?.value || '1970';
    const month = formattedParts.find(x => x.type === 'month')?.value || '01';
    const day = formattedParts.find(x => x.type === 'day')?.value || '01';

    return {
        year: Number(year),
        month: Number(month),
        day: Number(day)
    };
}

/**
 * Format date as YYYY-MM-DD key (ISO format)
 */
export function formatDateToKey(y: number, m: number, d: number): string {
    return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

/**
 * Get UTC start of business day
 * Business day starts at 04:00 AM Dhaka time = 22:00 (10 PM) previous day UTC
 */
export function getDayStartUtc(y: number, m: number, d: number): Date {
    return new Date(Date.UTC(y, m - 1, d, -2, 0, 0, 0));
}

/**
 * Get the next calendar day parts (handles month/year boundaries)
 */
export function getNextDayParts(y: number, m: number, d: number) {
    const base = new Date(Date.UTC(y, m - 1, d));
    const next = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    const parts = getDateParts(next);
    return { y: parts.year, m: parts.month, d: parts.day };
}

/**
 * Build list of days between two dates in Dhaka timezone
 * Returns array of day objects with key and date parts
 */
export function buildDayList(startDate: Date, endDate: Date): Array<{ key: string; y: number; m: number; d: number }> {
    const startDateParts = getDateParts(startDate);
    const endDateParts = getDateParts(endDate);
    const endKey = formatDateToKey(endDateParts.year, endDateParts.month, endDateParts.day);

    const days: Array<{ key: string; y: number; m: number; d: number }> = [];
    let currentYear = startDateParts.year,
        currentMonth = startDateParts.month,
        currentDay = startDateParts.day;

    while (true) {
        const currentKey = formatDateToKey(currentYear, currentMonth, currentDay);
        days.push({ key: currentKey, y: currentYear, m: currentMonth, d: currentDay });
        if (currentKey === endKey) break;
        const nextDay = getNextDayParts(currentYear, currentMonth, currentDay);
        currentYear = nextDay.y;
        currentMonth = nextDay.m;
        currentDay = nextDay.d;
    }

    return days;
}

/**
 * Get the UTC time range for a specific business day
 * @param y Year
 * @param m Month (1-12)
 * @param d Day
 * @returns Object with start (inclusive) and end (exclusive) UTC times
 */
export function getBusinessDayRangeUtc(y: number, m: number, d: number) {
    const start = getDayStartUtc(y, m, d);
    const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, endExclusive };
}

/**
 * Calculate the segment intersection between a query range and a business day
 * @param queryStart Query start date (inclusive)
 * @param queryEnd Query end date (inclusive, will be converted to exclusive)
 * @param dayY Business day year
 * @param dayM Business day month
 * @param dayD Business day day
 * @returns Object with segmentStart and segmentEndExclusive, or null if no intersection
 */
export function getSegmentIntersection(
    queryStart: Date,
    queryEnd: Date,
    dayY: number,
    dayM: number,
    dayD: number
) {
    const { start: dayStart, endExclusive: dayEndExclusive } = getBusinessDayRangeUtc(dayY, dayM, dayD);
    const overallEndExclusive = new Date(queryEnd.getTime() + 1);

    const segmentStart = new Date(Math.max(queryStart.getTime(), dayStart.getTime()));
    const segmentEndExclusive = new Date(Math.min(overallEndExclusive.getTime(), dayEndExclusive.getTime()));

    if (segmentEndExclusive <= segmentStart) {
        return null;
    }

    return { segmentStart, segmentEndExclusive };
}

/**
 * Adjust date to business day boundaries
 * Converts a calendar date to the business day start/end times
 */
export function adjustDateToBusinessDay(date: Date, type: 'start' | 'end') {
    const parts = getDateParts(date);
    if (type === 'start') {
        return getDayStartUtc(parts.year, parts.month, parts.day);
    } else {
        // For end date, we want the end of the business day (exclusive)
        const dayStart = getDayStartUtc(parts.year, parts.month, parts.day);
        return new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    }
}
