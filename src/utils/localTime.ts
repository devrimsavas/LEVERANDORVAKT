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
