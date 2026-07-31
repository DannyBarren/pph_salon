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

// Bulk pay-period template: many EMPLOYEES across many WEEKS / pay periods in
// one file. `employee_id` (client Employee code OR numeric user id) is the
// routing key — data goes to that employee regardless of `salon_name` (which
// just labels the row). One pay period = two weekly rows per employee.
export const WEEKLY_TEMPLATE = toCsv(
  ["employee_id", "salon_name", "week_start", "scheduled_hrs", "actual_hrs", "actual_haircuts", "actual_colors", "actual_other_value", "notes"],
  [
    ["VG1426", "Burleson, TX", "2026-06-22", "27.25", "26.5", "18", "9", "40", "Period 1 · week 1"],
    ["VG1426", "Burleson, TX", "2026-06-29", "30", "29", "20", "10", "0", "Period 1 · week 2"],
    ["VG1296", "Burleson, TX", "2026-06-22", "16", "15.58", "8", "4", "0", ""],
    ["VG1296", "Burleson, TX", "2026-07-06", "18", "17", "9", "5", "0", "Next pay period"],
    ["18939", "Aria Studio", "2026-06-22", "28", "0", "0", "0", "0", "Numeric user id also works"],
  ],
);

export const USERS_TEMPLATE = toCsv(
  ["email", "name", "role", "salon_id", "salon_name", "manager_id", "manager_email", "title", "phone", "guarantee_rate", "excluded", "password"],
  [
    ["rebeca@aria.com", "Rebeca Diaz", "stylist", "1", "Aria Studio", "", "gm@aria.com", "Senior Stylist", "555-0101", "17", "N", "Welcome123!"],
    ["gm@aria.com", "Jordan Avery", "manager", "1", "Aria Studio", "", "", "General Manager", "555-0100", "", "Y", ""],
  ],
);

// The client's daily "Data provided to App" format (exact column order).
export const DAILY_TEMPLATE = toCsv(
  ["Salon", "EEID", "EE Name", "Excl?", "Date", "Sched Hrs", "Actual Hrs", "Act Svc Rev($)", "Act Cuts Count", "Act Colors Count"],
  [
    // Days with no activity can be left blank (only Date/Sched Hrs) or omitted.
    ["11016-Burleson,TX-SSF", "VG1426", "Holliean Miller", "N", "2026-07-20", "5", "4.03", "56.7", "3", "0"],
    ["11016-Burleson,TX-SSF", "VG1426", "Holliean Miller", "N", "2026-07-21", "0", "", "", "", ""],
    ["11016-Burleson,TX-SSF", "VG1426", "Holliean Miller", "N", "2026-07-22", "5", "6.13", "70", "2", "0"],
  ],
);

export const CLIENT_TEMPLATE = toCsv(
  ["Salon", "Salon Name", "Employee code", "Employee Name", "Position", "Excl?", "Guaranteed Pay-Rate", "Scheduled hours", "Hours worked", "Net service Rev", "Avg Haircut", "Avg Color"],
  [
    ["11016-Burleson,TX-SSF", "Burleson, TX", "VG1116", "Linda Jones", "Manager", "Y", "12", "61", "62.92", "_($* 2418.15_)", "23", "85"],
    ["11016-Burleson,TX-SSF", "Burleson, TX", "VG1296", "Mariah Perez", "Stylist", "N", "9", "16", "15.58", "_($* 359.10_)", "23", "85"],
  ],
);
