import test from "node:test";
import assert from "node:assert/strict";
import { buildShareUrl, evaluatePortfolio, getSharedStateFromSearch, sanitizeState } from "../src/lib/savings.ts";

test("buildShareUrl encodes the current app state into the query string", () => {
  const state = sanitizeState({ bankBalance: 250000, goals: [{ id: "goal-1", name: "Ferie", targetAmount: 50000, targetDate: "2030-07-01", createdAt: "2025-01-01T00:00:00.000Z" }] });
  const shareUrl = buildShareUrl(state, "https://example.com/");

  assert.match(shareUrl, /https:\/\/example\.com\/\?sync=/);
  assert.equal(getSharedStateFromSearch(new URL(shareUrl).search)!.bankBalance, 250000);
});

test("calculates cumulative shortfall for the elapsed goal period", () => {
  const { goals } = evaluatePortfolio(
    {
      bankBalance: 1000,
      goals: [
        {
          id: "goal-1",
          name: "Ferie",
          targetAmount: 10000,
          targetDate: "2025-05-01",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    },
    new Date("2025-03-01T00:00:00.000Z"),
  );

  assert.equal(goals[0].allocatedAmount, 1000);
  assert.equal(goals[0].shortfall, 4000);
});

test("shows a goal as ahead when its monthly need is covered", () => {
  const { goals } = evaluatePortfolio(
    {
      bankBalance: 60000,
      goals: [
        {
          id: "goal-1",
          name: "Ferie",
          targetAmount: 100000,
          targetDate: "2025-05-01",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    },
    new Date("2025-03-01T00:00:00.000Z"),
  );

  assert.equal(goals[0].status, "ahead");
  assert.equal(goals[0].shortfall, 0);
  assert.equal(goals[0].paceDelta, 10000);
});

test("redistributes surplus after a goal is fully funded", () => {
  const { goals } = evaluatePortfolio(
    {
      bankBalance: 15000,
      goals: [
        {
          id: "goal-1",
          name: "Lille mål",
          targetAmount: 1000,
          targetDate: "2025-05-01",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "goal-2",
          name: "Stort mål",
          targetAmount: 100000,
          targetDate: "2027-05-01",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    },
    new Date("2025-03-01T00:00:00.000Z"),
  );

  assert.equal(goals[0].allocatedAmount, 1000);
  assert.equal(goals[0].status, "completed");
  assert.equal(goals[1].allocatedAmount, 14000);
});
