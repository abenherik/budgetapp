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
  const { goals, summary } = evaluatePortfolio(
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
  assert.equal(goals[0].shortfall, 6500);
});

test("keeps the original monthly need as the target date approaches", () => {
  const { goals } = evaluatePortfolio(
    {
      bankBalance: 1250,
      goals: [
        {
          id: "goal-1",
          name: "Skiferie",
          targetAmount: 5000,
          targetDate: "2025-06-01",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    },
    new Date("2025-02-01T00:00:00.000Z"),
  );

  assert.equal(goals[0].monthlyNeed, 1000);
  assert.equal(goals[0].allocatedAmount, 1250);
  assert.equal(goals[0].shortfall, 750);
  assert.equal(goals[0].status, "behind");
});

test("keeps excess money as surplus when monthly need is covered", () => {
  const { goals, summary } = evaluatePortfolio(
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

  assert.equal(goals[0].status, "behind");
  assert.equal(goals[0].shortfall, 15000);
  assert.equal(goals[0].paceDelta, 0);
  assert.equal(goals[0].allocatedAmount, 60000);
  assert.equal(summary.remainingReserve, 0);
});

test("redistributes surplus after a goal is fully funded", () => {
  const { goals, summary } = evaluatePortfolio(
    {
      bankBalance: 15000,
      goals: [
        {
          id: "goal-1",
          name: "Lille mål",
          targetAmount: 1,
          targetDate: "2025-04-01",
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

  assert.equal(goals[0].allocatedAmount, 1);
  assert.equal(goals[0].status, "completed");
  assert.equal(Math.round(goals[1].allocatedAmount), 14999);
  assert.equal(Math.round(summary.remainingReserve), 0);
});
