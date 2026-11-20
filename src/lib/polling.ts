// How often an open page asks the server for fresh data. Shared with the load test so both always agree.
//
// Employees: the data only changes when they act (which refreshes it straight away) or when HR corrects a record,
// so a quarter of a minute is plenty. At every 2 seconds, 600 open pages asked for 600 requests a second and the
// server fell behind; at this rate the same 600 pages need about 80.
export const EMPLOYEE_POLL_MS = 15_000;

// HR watching the attendance board: a few people, and they want to see arrivals as they happen.
export const HR_POLL_MS = 5_000;

// The signed-in person's name and roles almost never change.
export const ME_POLL_MS = 30_000;
