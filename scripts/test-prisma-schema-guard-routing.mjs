import { assertExpectedSchema } from "../lib/schema-guard.js";

function mockQueryable(actualSchema) {
  const state = { calls: 0 };
  return {
    state,
    async $queryRaw() {
      state.calls += 1;
      return [{ schema: actualSchema }];
    }
  };
}

const transactionClient = mockQueryable("immos_recipe_phase8");
const globalClient = mockQueryable("immos");
await assertExpectedSchema(transactionClient, "immos_recipe_phase8", "recipe");

let mismatchRejected = false;
try {
  await assertExpectedSchema(transactionClient, "invalid_expected_schema_for_test", "recipe");
} catch (error) {
  mismatchRejected = error.message.includes("invalid_expected_schema_for_test");
}

const result = {
  correctSchemaContinues: transactionClient.state.calls >= 1,
  mismatchRejected,
  transactionClientCalls: transactionClient.state.calls,
  globalClientCalls: globalClient.state.calls,
  globalClientUsed: globalClient.state.calls > 0
};
console.log(JSON.stringify(result, null, 2));
if (!result.correctSchemaContinues || !mismatchRejected || result.globalClientUsed) {
  throw new Error("Routage du garde-fou non conforme.");
}
