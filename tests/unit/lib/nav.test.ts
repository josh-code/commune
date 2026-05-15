import { describe, it, expect } from "vitest";
import { matchesGate, visibleNavItems, bottomBarItems, NAV_ITEMS, type NavUser, type Role, type TeamSlug } from "@/lib/nav";

const make = (overrides: Partial<NavUser> = {}): NavUser => ({
  roles: ["member"] as Role[],
  teams: [] as TeamSlug[],
  ...overrides,
});

describe("matchesGate", () => {
  it("returns true when gate is empty (universal item)", () => {
    expect(matchesGate({}, make({}))).toBe(true);
  });
  it("admin always sees team-gated items", () => {
    expect(matchesGate({ teams: ["media"] }, make({ roles: ["admin"], teams: [] }))).toBe(true);
  });
  it("member without matching role/team is denied", () => {
    expect(matchesGate({ roles: ["admin"] }, make({}))).toBe(false);
  });
  it("librarian sees librarian-gated items", () => {
    expect(matchesGate({ roles: ["admin", "librarian"] }, make({ roles: ["librarian"] }))).toBe(true);
  });
  it("media-team member sees Brief", () => {
    expect(matchesGate({ roles: ["admin"], teams: ["media", "preaching"] }, make({ teams: ["media"] }))).toBe(true);
  });
});

describe("visibleNavItems", () => {
  it("member sees Dashboard, Schedule, Inventory, Library (no admin items)", () => {
    const hrefs = visibleNavItems(make({})).map(i => i.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/schedule");
    expect(hrefs).toContain("/inventory");
    expect(hrefs).toContain("/library");
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/people");
    expect(hrefs).not.toContain("/brief");
    expect(hrefs).not.toContain("/hospitality");
    expect(hrefs).not.toContain("/worship/songs");
  });
  it("worship-team member sees Song bank", () => {
    const hrefs = visibleNavItems(make({ teams: ["worship"] })).map(i => i.href);
    expect(hrefs).toContain("/worship/songs");
  });
  it("multi-role librarian+logistics sees both Manage pages", () => {
    const hrefs = visibleNavItems(make({ roles: ["member", "librarian", "logistics"] })).map(i => i.href);
    expect(hrefs).toContain("/library/manage");
    expect(hrefs).toContain("/inventory/manage");
  });
  it("admin sees every item", () => {
    const hrefs = visibleNavItems(make({ roles: ["admin"] })).map(i => i.href);
    expect(hrefs.length).toBe(NAV_ITEMS.length);
  });
});

describe("bottomBarItems", () => {
  it("member: Home + Schedule + Library", () => {
    expect(bottomBarItems(make({})).map(i => i.href)).toEqual(["/dashboard", "/schedule", "/library"]);
  });
  it("admin: Home + Schedule + Roster", () => {
    expect(bottomBarItems(make({ roles: ["admin"] })).map(i => i.href)).toEqual(["/dashboard", "/schedule", "/roster"]);
  });
  it("multi-role librarian+logistics uses precedence: logistics > librarian", () => {
    expect(bottomBarItems(make({ roles: ["member", "librarian", "logistics"] })).map(i => i.href))
      .toEqual(["/dashboard", "/schedule", "/inventory/manage"]);
  });
  it("roster_maker: Home + Schedule + Roster grid", () => {
    expect(bottomBarItems(make({ roles: ["roster_maker"] })).map(i => i.href))
      .toEqual(["/dashboard", "/schedule", "/roster/grid"]);
  });
});
