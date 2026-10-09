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
  assert.equal(goals[0].shortfall, 3000);
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
          targetDate: "2025-05-01",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    },
    new Date("2025-02-01T00:00:00.000Z"),
  );

  assert.equal(goals[0].monthlyNeed, 1000);
  assert.equal(goals[0].allocatedAmount, 1000);
  assert.equal(goals[0].shortfall, 0);
  assert.equal(goals[0].status, "on-track");
});

test("starts counting from the month after a goal is created", () => {
  const goal = {
    id: "goal-1",
    name: "Skiferie",
    targetAmount: 5000,
    targetDate: "2027-01-01",
    createdAt: "2026-09-15T12:00:00.000Z",
  };

  const createdMonth = evaluatePortfolio(
    { bankBalance: 100000, goals: [goal] },
    new Date("2026-09-20T00:00:00.000Z"),
  ).goals[0];
  const followingMonth = evaluatePortfolio(
    { bankBalance: 100000, goals: [goal] },
    new Date("2026-10-01T00:00:00.000Z"),
  ).goals[0];

  assert.equal(createdMonth.allocatedAmount, 0);
  assert.equal(followingMonth.allocatedAmount, 1000);
});

test("does not fund future months early when the bank balance is high", () => {
  const { goals, summary } = evaluatePortfolio(
    {
      bankBalance: 100000,
      goals: [
        {
          id: "goal-1",
          name: "Skiferie",
          targetAmount: 5000,
          targetDate: "2027-01-01",
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
    new Date("2026-10-09T00:00:00.000Z"),
  );

  assert.equal(goals[0].monthlyNeed, 1000);
  assert.equal(goals[0].allocatedAmount, 1000);
  assert.equal(goals[0].shortfall, 0);
  assert.equal(summary.remainingReserve, 99000);
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

  assert.equal(goals[0].status, "on-track");
  assert.equal(goals[0].shortfall, 0);
  assert.equal(goals[0].paceDelta, 0);
  assert.equal(goals[0].allocatedAmount, 40000);
  assert.equal(summary.remainingReserve, 20000);
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
          targetDate: "2025-02-01",
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

  assert.equal(Math.round(goals[0].allocatedAmount * 100) / 100, 1);
  assert.equal(goals[0].status, "completed");
  assert.equal(Math.round(goals[1].allocatedAmount), 6897);
  assert.equal(Math.round(summary.remainingReserve), 8102);
});
