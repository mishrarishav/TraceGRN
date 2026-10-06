import { expect, test, type Page } from "@playwright/test";
import { extractLabelUid } from "../src/lib/label-scan";

const labelUid = "LBL-C93801B8A9D44177B7F50B168A922772";
const payload = [
  "GRN Number: 5000599585",
  "Material: MT1A15128",
  "Quantity: 48 PC",
  "GRN Date: 06-10-26",
  "Label Date: 06-10-26, 21-02-50",
  `Label ID: ${labelUid}`,
].join("\n");

async function openIssue(page: Page, rejection?: string) {
  const user = {
    id: "scanner-test-user",
    username: "scanner-test",
    fullName: "Scanner Test Operator",
    role: "Admin",
    roleDisplay: "Admin",
  };
  const lookups: string[] = [];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript((currentUser) => {
    localStorage.setItem("trackgrn-access-token", "offline-scanner-token");
    localStorage.setItem("trackgrn-user", JSON.stringify(currentUser));
  }, user);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: unknown = user;
    let status = 200;
    if (request.method() !== "GET") {
      writes.push({ path: url.pathname, body: request.postDataJSON() });
      body = { ok: true, quantity: 48, remaining: 96, uom: "PC" };
    } else if (url.pathname === "/api/stations") {
      body = [
        { code: "STORE-EXIT-01", name: "Production", type: "Issue Station", status: "Active" },
      ];
    } else if (url.pathname === "/api/transactions") {
      body = [];
    } else if (url.pathname.startsWith("/api/labels/")) {
      lookups.push(`${url.pathname}${url.search}`);
      const code = rejection ?? (url.pathname === `/api/labels/${labelUid}` ? null : "NOT_FOUND");
      if (code) {
        status = code === "NOT_FOUND" ? 404 : 409;
        body = { code, title: "Scan rejected", status };
      } else {
        body = {
          labelUid,
          grnNumber: "5000599585",
          materialNumber: "MT1A15128",
          quantity: 48,
          uom: "PC",
          status: "Inwarded",
        };
      }
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/issue");
  await page.locator('html[data-hydrated="true"]').waitFor();
  return {
    lookups,
    writes,
    scanner: page.getByPlaceholder("Scan full QR payload or enter Label UID"),
  };
}

test("Label ID extraction supports scanner separators and existing UID formats", () => {
  for (const input of [
    payload,
    payload.replaceAll("\n", "\r\n"),
    payload.replaceAll("\n", "\r"),
    payload.replaceAll("\n", "\t"),
    payload.replaceAll("\n", " "),
    `${payload}\nIgnored field: extra`,
    `Label UID: ${labelUid}`,
    `Label: ${labelUid}`,
    `  label id : ${labelUid.toLowerCase()}  `,
    labelUid,
    "c93801b8-a9d4-4177-b7f5-0b168a922772",
    "LBL-c93801b8-a9d4-4177-b7f5-0b168a922772",
  ])
    expect(extractLabelUid(input)).toBe(labelUid);
  expect(extractLabelUid("LBL-00000001")).toBe("LBL-00000001");
  for (const input of [
    "",
    "5000599585",
    "Material: MT1A15128",
    "Label ID:",
    "Label ID: invalid",
    `Material: ${labelUid}`,
  ]) {
    expect(extractLabelUid(input)).toBeNull();
  }
});

for (const [name, input] of [
  ["full pasted QR", payload],
  [
    "flattened QR with extra fields",
    `${payload.replaceAll("\n", " ").replace("48 PC", "999 PC")} Ignored: extra`,
  ],
  ["plain Label UID", labelUid],
]) {
  test(`issue uses only Label ID from ${name}`, async ({ page }) => {
    const { scanner, lookups, writes } = await openIssue(page);
    await scanner.fill(input!);
    await page.getByRole("button", { name: "Scan & Issue", exact: true }).click();
    await expect(page.getByText(`${labelUid} issued to STORE-EXIT-01`)).toBeVisible();
    expect(lookups).toEqual([`/api/labels/${labelUid}?purpose=issue`]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      path: "/api/issues",
      body: {
        labelUid,
        stationCode: "STORE-EXIT-01",
        deviceId: expect.any(String),
      },
    });
    await expect(page.getByRole("status").filter({ hasText: "Remaining stock" })).toContainText(
      "48 PC",
    );
    await expect(scanner).toHaveValue("");
    await expect(scanner).toBeFocused();
  });
}

test("keyboard scanner ignores intermediate lines and issues on the final Enter", async ({
  page,
}) => {
  const { scanner, lookups, writes } = await openIssue(page);
  const lines = payload.split("\n");
  for (const line of lines.slice(0, -1)) {
    await scanner.pressSequentially(line);
    await scanner.press("Enter");
    expect(lookups).toEqual([]);
    expect(writes).toEqual([]);
  }
  await scanner.pressSequentially(lines.at(-1)!);
  expect(writes).toEqual([]);
  await scanner.press("Enter");
  await expect(page.getByText(`${labelUid} issued to STORE-EXIT-01`)).toBeVisible();
  expect(lookups).toEqual([`/api/labels/${labelUid}?purpose=issue`]);
  expect(writes).toHaveLength(1);
});

test("a QR without Label ID makes no lookup or issue request", async ({ page }) => {
  const { scanner, lookups, writes } = await openIssue(page);
  await scanner.fill(payload.split("\n").slice(0, -1).join("\n"));
  await page.getByRole("button", { name: "Scan & Issue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Label ID not found");
  expect(lookups).toEqual([]);
  expect(writes).toEqual([]);
});

for (const [code, message] of [
  ["NOT_FOUND", "Label not found in system"],
  ["ALREADY_ISSUED", "Label already issued to production"],
  ["NOT_INWARDED", "Label must be inwarded before issue"],
  ["BLOCKED", "Label is blocked and cannot be processed"],
  ["CANCELLED", "Label is cancelled and cannot be processed"],
]) {
  test(`Label ID extraction preserves ${code} rejection`, async ({ page }) => {
    const { scanner, lookups, writes } = await openIssue(page, code);
    await scanner.fill(payload);
    await scanner.press("Enter");
    await expect(page.getByRole("alert")).toContainText(message!);
    expect(lookups).toEqual([`/api/labels/${labelUid}?purpose=issue`]);
    expect(writes).toEqual([]);
  });
}
