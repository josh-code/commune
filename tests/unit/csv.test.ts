import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses a valid CSV with all columns", () => {
    const csv = `name,email,phone,teams
Joshua Fernandes,josh@church.com,+61412345678,Worship|Sound
Sarah Mitchell,sarah@church.com,,Kids`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "Joshua Fernandes",
      email: "josh@church.com",
      phone: "+61412345678",
      teams: ["Worship", "Sound"],
    });
    expect(rows[1]).toEqual({
      name: "Sarah Mitchell",
      email: "sarah@church.com",
      phone: "",
      teams: ["Kids"],
    });
  });

  it("returns error for missing name", () => {
    const csv = `name,email\n,bad@church.com`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toBe("Missing name");
  });

  it("returns error for invalid email", () => {
    const csv = `name,email\nJohn,notanemail`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toBe("Invalid or missing email");
  });

  it("returns error for missing required headers", () => {
    const csv = `name\nJohn`;
    const { rows, errors } = parseCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toContain("Missing required columns");
  });

  it("handles missing optional columns gracefully", () => {
    const csv = `name,email\nJohn,john@church.com`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].phone).toBe("");
    expect(rows[0].teams).toHaveLength(0);
  });

  it("is case-insensitive for column headers", () => {
    const csv = `Name,Email,Phone\nJohn,john@church.com,+1234`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].name).toBe("John");
    expect(rows[0].phone).toBe("+1234");
  });

  it("skips blank lines", () => {
    const csv = `name,email\nJohn,john@church.com\n\nJane,jane@church.com`;
    const { rows, errors } = parseCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });
});
