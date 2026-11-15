// Times in the time zone the daily summaries follow (EMAIL_TIME_ZONE,
// Europe/Oslo by default), so "every morning at 7" means 7 in Norway all
// year, summer time included

export function emailTimeZone(): string {
  return process.env.EMAIL_TIME_ZONE || "Europe/Oslo";
}

function parts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return values as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

// The date in the time zone, e.g. 2026-11-16
export function localDate(date: Date, timeZone = emailTimeZone()): string {
  const local = parts(date, timeZone);
  return `${local.year}-${pad(local.month)}-${pad(local.day)}`;
}

// The date and time in the time zone, e.g. 2026-11-16 07:30
export function localDateTime(date: Date, timeZone = emailTimeZone()): string {
  const local = parts(date, timeZone);
  return `${localDate(date, timeZone)} ${pad(local.hour)}:${pad(local.minute)}`;
}

// The date and time in the time zone as a Date whose UTC fields hold it.
// Spreadsheets have no time zones: they show a date's UTC fields as they
// are, so this is how 08:30 in Oslo is shown as 08:30.
export function wallClock(date: Date, timeZone = emailTimeZone()): Date {
  const local = parts(date, timeZone);
  return new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute),
  );
}

// The hour (0 to 23) in the time zone
export function localHour(date: Date, timeZone = emailTimeZone()): number {
  return parts(date, timeZone).hour;
}

// The moment the day of `date` started in the time zone
export function startOfLocalDay(date: Date, timeZone = emailTimeZone()): Date {
  const local = parts(date, timeZone);
  // How far the time zone is ahead of UTC at that moment
  const offset =
    Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    ) -
    Math.floor(date.getTime() / 1000) * 1000;
  return new Date(Date.UTC(local.year, local.month - 1, local.day) - offset);
}
