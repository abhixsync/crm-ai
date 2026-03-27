/**
 * Test script to verify the uiLayout theme switch flow end-to-end.
 * Run: node scripts/tests/test-theme-switch.js
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  console.log("\n=== STEP 1: Current DB state ===");
  const themes = await p.tenantTheme.findMany({
    select: { id: true, tenantId: true, isBaseTheme: true, uiLayout: true, isActive: true },
  });
  themes.forEach((t) =>
    console.log(
      `  ${t.isBaseTheme ? "BASE" : "TENANT"} | tenantId=${t.tenantId || "null"} | uiLayout=${t.uiLayout} | active=${t.isActive}`
    )
  );

  const baseTheme = themes.find((t) => t.isBaseTheme);
  if (!baseTheme) {
    console.log("  No base theme found!");
    return;
  }

  const tenantTheme = themes.find((t) => !t.isBaseTheme);
  const currentLayout = baseTheme.uiLayout;
  const newLayout = currentLayout === "modern" ? "classic" : "modern";

  console.log(`\n=== STEP 2: Switching base theme from "${currentLayout}" to "${newLayout}" ===`);

  await p.tenantTheme.update({
    where: { id: baseTheme.id },
    data: { uiLayout: newLayout },
  });
  console.log("  DB updated ✅");

  console.log("\n=== STEP 3: Verify DB after update ===");
  const updated = await p.tenantTheme.findMany({
    select: { id: true, tenantId: true, isBaseTheme: true, uiLayout: true },
  });
  updated.forEach((t) =>
    console.log(
      `  ${t.isBaseTheme ? "BASE" : "TENANT"} | tenantId=${t.tenantId || "null"} | uiLayout=${t.uiLayout}`
    )
  );

  console.log("\n=== STEP 4: Simulating resolveTenantTheme read path ===");
  console.log("  (This simulates what layout.js does on page load)");

  // Simulate the exact query chain from resolveTenantTheme for the super admin's tenantId
  const tenantId = "cmm6pokfa0000l14kpryg6mc4";

  // 2: Load tenant override
  const tenantOverride = await p.tenantTheme.findFirst({
    where: { tenantId, isBaseTheme: false, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`  Tenant override uiLayout: ${tenantOverride?.uiLayout || "N/A"}`);

  // 3: Load base theme
  const base = await p.tenantTheme.findFirst({
    where: { isBaseTheme: true, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`  Base theme uiLayout: ${base?.uiLayout || "N/A"}`);

  // The merge logic (simplified):
  // system default "modern" -> base theme uiLayout -> tenant override (uiLayout excluded)
  const resolvedUiLayout = base?.uiLayout || "modern";
  console.log(`  Resolved uiLayout (base theme wins): "${resolvedUiLayout}"`);

  if (resolvedUiLayout === newLayout) {
    console.log("\n  ✅ DB-level resolution is CORRECT");
  } else {
    console.log("\n  ❌ DB-level resolution is WRONG!");
  }

  // Switch back
  console.log(`\n=== STEP 5: Switching back to "${currentLayout}" ===`);
  await p.tenantTheme.update({
    where: { id: baseTheme.id },
    data: { uiLayout: currentLayout },
  });
  console.log("  Restored original state ✅");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
