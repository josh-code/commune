export type CsvRow = {
  name: string;
  email: string;
  phone: string;
  teams: string[];
};

export type CsvParseResult = {
  rows: CsvRow[];
  errors: Array<{ line: number; message: string }>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsv(text: string): CsvParseResult {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ line: 0, message: "File is empty or missing data rows" }],
    };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx  = headers.indexOf("name");
  const emailIdx = headers.indexOf("email");
  const phoneIdx = headers.indexOf("phone");
  const teamsIdx = headers.indexOf("teams");

  if (nameIdx === -1 || emailIdx === -1) {
    return {
      rows: [],
      errors: [
        { line: 1, message: "Missing required columns: name, email" },
      ],
    };
  }

  const rows: CsvRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(",").map((c) => c.trim());
    const name  = cols[nameIdx]  ?? "";
    const email = cols[emailIdx] ?? "";
    const phone = phoneIdx >= 0 ? (cols[phoneIdx] ?? "") : "";
    const teamsStr = teamsIdx >= 0 ? (cols[teamsIdx] ?? "") : "";
    const teams = teamsStr
      ? teamsStr.split("|").map((t) => t.trim()).filter(Boolean)
      : [];

    if (!name) {
      errors.push({ line: i + 1, message: "Missing name" });
      continue;
    }
    if (!email || !EMAIL_RE.test(email)) {
      errors.push({ line: i + 1, message: "Invalid or missing email" });
      continue;
    }

    rows.push({ name, email, phone, teams });
  }

  return { rows, errors };
}
