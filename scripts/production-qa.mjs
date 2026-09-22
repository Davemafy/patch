// Production visual acceptance for the content-led consumer Patch UI.
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
homePage.on("pageerror", (error) => pageErrors.push(`desktop-new-repair: ${String(error)}`));
homePage.on("console", (message) => {
  if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(`desktop-new-repair: ${message.text()}`);
});
await homePage.goto(PATCH_URL, { waitUntil: "networkidle" });
await homePage.locator(".new-repair-shell").waitFor({ timeout: 30000 });
snapshots.desktopNewRepair = await assertNoOverflow(homePage, "desktop new repair");
await homePage.screenshot({ path: "desktop-new-repair.png", fullPage: true });
await homeContext.close();

// Reuse a persisted real Firecrawl discovery from the live deployment for visual QA.
let discoveryRepairId = "jh70bz7f75f69vbq2vwe8whts58exnn1";
let discoveryView = JSON.parse(runConvex("repairs:getRepair", { repairId: discoveryRepairId }));
if (!discoveryView?.candidates?.length) {
  discoveryRepairId = JSON.parse(runConvex("repairs:createRepair", {
    description: "My bedroom doorknob is broken. The handle turns but the door won’t open properly.",
    area: "Abuja",
  }));
  runConvex("discovery:findRepairPeople", { repairId: discoveryRepairId });
}

const resultsContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await resultsContext.addInitScript((id) => localStorage.setItem("patch.activeRepairId", id), discoveryRepairId);
const resultsPage = await resultsContext.newPage();
await resultsPage.goto(PATCH_URL, { waitUntil: "networkidle" });
await resultsPage.locator(".results-v2").waitFor({ timeout: 60000 });
snapshots.desktopResults = await assertNoOverflow(resultsPage, "desktop results");
await resultsPage.screenshot({ path: "desktop-results.png", fullPage: true });
await resultsContext.close();

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await desktop.addInitScript((id) => localStorage.setItem("patch.activeRepairId", id), repairId);
const page = await desktop.newPage();
page.on("pageerror", (error) => pageErrors.push(`desktop: ${String(error)}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(`desktop: ${message.text()}`);
});
await page.goto(PATCH_URL, { waitUntil: "networkidle" });
await page.getByText(/^Asked \d+ /).waitFor({ timeout: 30000 });
snapshots.desktopWaiting = await assertNoOverflow(page, "desktop waiting");
await page.screenshot({ path: "desktop-waiting.png", fullPage: true });

runConvex("acceptance:deliverWebhookFixture", { repairId, candidateId });

await page.getByText(/^\d+ repl(?:y|ies)$/).waitFor({ timeout: 60000 });
await page.getByText("tomorrow afternoon", { exact: false }).first().waitFor({ timeout: 30000 });
await page.getByText("12,000", { exact: false }).first().waitFor({ timeout: 30000 });
await page.getByText("Read original reply").click();
await page.getByText("CONTROLLED ACCEPTANCE TEST", { exact: false }).first().waitFor({ timeout: 30000 });
snapshots.desktopReply = await assertNoOverflow(page, "desktop reply");
await page.screenshot({ path: "desktop-reply.png", fullPage: true });

await page.getByRole("button", { name: /^Choose / }).click();
await page.getByText("Chosen").waitFor({ timeout: 30000 });
snapshots.desktopChosen = await assertNoOverflow(page, "desktop chosen");
await page.screenshot({ path: "desktop-chosen.png", fullPage: true });

await page.reload({ waitUntil: "networkidle" });
await page.getByText("Chosen").waitFor({ timeout: 30000 });
snapshots.desktopReloaded = await assertNoOverflow(page, "desktop reloaded chosen");
await desktop.close();

const mobileHomeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobileHome = await mobileHomeContext.newPage();
mobileHome.on("pageerror", (error) => pageErrors.push(`mobile-new-repair: ${String(error)}`));
await mobileHome.goto(PATCH_URL, { waitUntil: "networkidle" });
await mobileHome.locator(".new-repair-shell").waitFor({ timeout: 30000 });
snapshots.mobileNewRepair = await assertNoOverflow(mobileHome, "mobile new repair");
await mobileHome.screenshot({ path: "mobile-new-repair.png", fullPage: true });
await mobileHomeContext.close();

const mobileResultsContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mobileResultsContext.addInitScript((id) => localStorage.setItem("patch.activeRepairId", id), discoveryRepairId);
const mobileResults = await mobileResultsContext.newPage();
await mobileResults.goto(PATCH_URL, { waitUntil: "networkidle" });
await mobileResults.locator(".results-v2").waitFor({ timeout: 30000 });
snapshots.mobileResults = await assertNoOverflow(mobileResults, "mobile results");
await mobileResults.screenshot({ path: "mobile-results.png", fullPage: true });
await mobileResultsContext.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mobile.addInitScript((id) => localStorage.setItem("patch.activeRepairId", id), repairId);
const mobilePage = await mobile.newPage();
mobilePage.on("pageerror", (error) => pageErrors.push(`mobile: ${String(error)}`));
mobilePage.on("console", (message) => {
  if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(`mobile: ${message.text()}`);
});
await mobilePage.goto(PATCH_URL, { waitUntil: "networkidle" });
await mobilePage.getByText("Chosen").waitFor({ timeout: 30000 });
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
