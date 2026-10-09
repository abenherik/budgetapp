import test from "node:test";
import assert from "node:assert/strict";
import { parseBankBalanceInput } from "../src/lib/savings.ts";

test("parseBankBalanceInput returns 0 for an empty value", () => {
  assert.equal(parseBankBalanceInput(""), 0);
});

test("parseBankBalanceInput clamps negative numbers to 0", () => {
  assert.equal(parseBankBalanceInput("-20"), 0);
});

test("parseBankBalanceInput preserves valid numbers", () => {
  assert.equal(parseBankBalanceInput("250000"), 250000);
});
