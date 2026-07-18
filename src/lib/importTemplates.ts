/**
 * Client-side CSV import templates.
 *
 * These mirror the backend admin template endpoints (`backend/app/api/v1/admin.py`)
 * but are generated in the browser so template downloads NEVER depend on a live
 * backend or a valid session — fixing the "Failed to fetch" that occurred in the
 * credential-free demo. Keep the columns in sync with the backend if they change.
 */

function toCsv(columns: string[], rows: string[][]): string {
  const escape = (cell: string) => {
    const s = String(cell ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
}

export const WEEKLY_TEMPLATE = toCsv(
  ["user_id", "salon_name", "week_start", "guarantee_rate", "scheduled_hrs", "actual_hrs", "actual_haircuts", "actual_colors", "actual_other_value", "notes"],
  [
    ["18939", "Aria Studio", "2026-06-08", "12", "27.25", "26.5", "18", "9", "40", "Back-filled period"],
    ["18939", "Aria Studio", "2026-06-29", "12", "27.25", "26.5", "18", "9", "40", "Great color week"],
    ["11027", "Aria Studio", "2026-06-29", "13", "28", "0", "0", "0", "0", "Full-week call-off (sick)"],
  ],
);

export const USERS_TEMPLATE = toCsv(
  ["email", "name", "role", "salon_id", "salon_name", "manager_id", "manager_email", "title", "phone", "guarantee_rate", "password"],
  [
    ["rebeca@aria.com", "Rebeca Diaz", "stylist", "1", "Aria Studio", "", "gm@aria.com", "Senior Stylist", "555-0101", "17", "Welcome123!"],
    ["gm@aria.com", "Jordan Avery", "manager", "1", "Aria Studio", "", "", "General Manager", "555-0100", "", ""],
  ],
);

export const DAILY_TEMPLATE = toCsv(
  ["user_id", "date", "scheduled_hrs", "actual_hrs", "actual_haircuts", "actual_colors", "actual_other_value"],
  [
    ["18939", "2026-06-08", "8", "7.5", "5", "2", "10"],
    ["18939", "2026-06-30", "8", "7.5", "5", "2", "10"],
    ["18939", "2026-07-01", "8", "8", "6", "3", "0"],
  ],
);

export const CLIENT_TEMPLATE = toCsv(
  ["Salon", "Salon Name", "Employee code", "Employee Name", "Position", "Guaranteed Pay-Rate", "Scheduled hours", "Hours worked", "Net service Rev", "Avg Haircut", "Avg Color"],
  [
    ["11016-Burleson,TX-SSF", "Burleson, TX", "VG1116", "Linda Jones", "Manager", "12", "61", "62.92", "_($* 2418.15_)", "23", "85"],
    ["11016-Burleson,TX-SSF", "Burleson, TX", "VG1296", "Mariah Perez", "Stylist", "9", "16", "15.58", "_($* 359.10_)", "23", "85"],
  ],
);
