// Asserts the role/route table in src/lib/auth/routes.ts (npm run check:routes).
// Needs Node 22.18+ / 23.6+ (type stripping on by default) or Node 22.6+ with --experimental-strip-types.
import assert from "node:assert/strict";
import { NAV, ROLE_HOME, canAccess, homeFor, isAppPath, safeNext } from "../src/lib/auth/routes.ts";

const roles = ["ops", "warehouse", "distributor", "data"];
const spec = {
  ops: ["/ops/watchtower", "/ops/incidents/812", "/ops/ask", "/ops/history", "/ops/network"],
  warehouse: ["/warehouse/overview", "/warehouse/inventory", "/warehouse/incidents", "/warehouse/ask"],
  distributor: ["/my/overview", "/my/orders", "/my/orders/55123", "/my/stock", "/my/ask"],
  data: ["/observability", "/observability/models", "/observability/pipeline", "/observability/agent"],
};

for (const role of roles) {
  assert.ok(canAccess(ROLE_HOME[role], role), `${role} can open its home`);
  for (const item of NAV[role]) assert.ok(canAccess(item.href, role), `${role} nav ${item.href} is allowed`);
  for (const [other, paths] of Object.entries(spec)) {
    for (const path of paths) {
      assert.ok(isAppPath(path), `${path} is protected`);
      assert.equal(canAccess(path, role), other === role, `${role} ${other === role ? "can" : "cannot"} open ${path}`);
    }
  }
}

// Prefixes match whole segments only.
assert.equal(canAccess("/myself", "distributor"), false);
assert.equal(isAppPath("/"), false);
assert.equal(isAppPath("/login"), false);

// View as: ops sees exactly the target's screens until it exits.
const brazil = { kind: "distributor", id: 7, name: "Brazil Consumer" };
const latam = { kind: "warehouse", id: 3, name: "LATAM Logistics Center" };
assert.equal(homeFor("ops", brazil), "/my/overview");
assert.equal(canAccess("/my/orders", "ops", brazil), true);
assert.equal(canAccess("/ops/watchtower", "ops", brazil), false);
assert.equal(canAccess("/warehouse/inventory", "ops", latam), true);
assert.equal(canAccess("/my/overview", "ops", latam), false);
// View as is ignored for non-ops roles.
assert.equal(canAccess("/warehouse/overview", "distributor", latam), false);

// next= is only honoured for local paths the role may open.
assert.equal(safeNext("/ops/incidents/812?tab=log", "ops"), "/ops/incidents/812?tab=log");
assert.equal(safeNext("/ops/watchtower", "distributor"), "/my/overview");
assert.equal(safeNext("//evil.example", "ops"), "/ops/watchtower");
assert.equal(safeNext("https://evil.example", "ops"), "/ops/watchtower");
assert.equal(safeNext(null, "data"), "/observability");

console.log("check:routes ok");
