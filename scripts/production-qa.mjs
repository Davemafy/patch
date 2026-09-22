import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const PATCH_URL = "https://aware-porpoise-430.convex.site";
const repairId = process.env.REPAIR_ID;
const candidateId = process.env.CANDIDATE_ID;
if (!repairId || !candidateId) throw new Error("Missing controlled fixture ids.");

function runConvex(functionName, args) {
  return execFileSync(
    "npx",
    ["convex", "run", functionName, JSON.stringify(args)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function assertNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    throw new Error(`${label} horizontal overflow: ${JSON.stringify(metrics)}`);
  }
  return metrics;
}

const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const consoleErrors = [];
const snapshots = {};

const homeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const homePage = await homeContext.newPage();
homePage.on("pageerror", (error) => pageErrors.push(`desktop-home: ${String(error)}`));
homePage.on("console", (message) => {
  if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(`desktop-home: ${message.text()}`);
});
await homePage.goto(PATCH_URL, { waitUntil: "networkidle" });
await homePage.locator("h1").filter({ hasText: /Something/ }).waitFor({ timeout: 30000 });
snapshots.desktopHome = await assertNoOverflow(homePage, "desktop home");
await homePage.screenshot({ path: "desktop-home.png", fullPage: true });
await homeContext.close();

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await desktop.addInitScript((id) => localStorage.setItem("patch.activeRepairId", id), repairId);
const page = await desktop.newPage();
page.on("pageerror", (error) => pageErrors.push(`desktop: ${String(error)}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(`desktop: ${message.text()}`);
});
await page.goto(PATCH_URL, { waitUntil: "networkidle" });
await page.getByText("Messages sent").waitFor({ timeout: 30000 });
snapshots.desktopWaiting = await assertNoOverflow(page, "desktop waiting");
await page.screenshot({ path: "desktop-waiting.png", fullPage: true });

runConvex("acceptance:deliverWebhookFixture", { repairId, candidateId });

await page.getByText("Replies are in").waitFor({ timeout: 60000 });
await page.getByText("tomorrow afternoon", { exact: false }).first().waitFor({ timeout: 30000 });
await page.getByText("12,000", { exact: false }).first().waitFor({ timeout: 30000 });
await page.getByText("Read original reply").click();
await page.getByText("CONTROLLED ACCEPTANCE TEST", { exact: false }).first().waitFor({ timeout: 30000 });
snapshots.desktopReply = await assertNoOverflow(page, "desktop reply");
await page.screenshot({ path: "desktop-reply.png", fullPage: true });

await page.getByRole("button", { name: /^Choose / }).click();
await page.getByText("Sorted").waitFor({ timeout: 30000 });
snapshots.desktopChosen = await assertNoOverflow(page, "desktop chosen");
await page.screenshot({ path: "desktop-chosen.png", fullPage: true });

await page.reload({ waitUntil: "networkidle" });
await page.getByText("Sorted").waitFor({ timeout: 30000 });
snapshots.desktopReloaded = await assertNoOverflow(page, "desktop reloaded chosen");
await desktop.close();

const mobileHomeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobileHome = await mobileHomeContext.newPage();
mobileHome.on("pageerror", (error) => pageErrors.push(`mobile-home: ${String(error)}`));
await mobileHome.goto(PATCH_URL, { waitUntil: "networkidle" });
await mobileHome.locator("h1").filter({ hasText: /Something/ }).waitFor({ timeout: 30000 });
snapshots.mobileHome = await assertNoOverflow(mobileHome, "mobile home");
await mobileHome.screenshot({ path: "mobile-home.png", fullPage: true });
await mobileHomeContext.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mobile.addInitScript((id) => localStorage.setItem("patch.activeRepairId", id), repairId);
const mobilePage = await mobile.newPage();
mobilePage.on("pageerror", (error) => pageErrors.push(`mobile: ${String(error)}`));
mobilePage.on("console", (message) => {
  if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(`mobile: ${message.text()}`);
});
await mobilePage.goto(PATCH_URL, { waitUntil: "networkidle" });
await mobilePage.getByText("Sorted").waitFor({ timeout: 30000 });
snapshots.mobileChosen = await assertNoOverflow(mobilePage, "mobile chosen");
await mobilePage.screenshot({ path: "mobile-chosen.png", fullPage: true });
await mobile.close();

if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(" | ")}`);
if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join(" | ")}`);

console.log(JSON.stringify({
  liveReplyObserved: true,
  chosenPersistedAfterReload: true,
  snapshots,
}, null, 2));
await browser.close();
