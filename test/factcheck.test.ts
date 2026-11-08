import { test } from "node:test";
import assert from "node:assert/strict";
import { groundingProblems } from "../src/lib/factcheck.ts";

const tracking = { carrier: "USPS", number: "9400111202555842761234", status: "DELIVERED", delivered_at: "2026-10-24T15:12:00Z" };
const order = { id: "DEMO-ORDER-1", amount: "149.00", buyer_email: "maya.buyer@example.com" };
const dispute = { dispute_id: "PP-D-DEMO-0001", amount: { value: "149.00", currency_code: "USD" } };
const data = [dispute, order, tracking];

const base = {
  verdict: "fight" as const,
  confidence: 90,
  summary: "USPS tracking 9400111202555842761234 shows delivery on 2026-10-24.",
  facts: [{ source: "get_shipment_tracking", fact: "status DELIVERED" }],
  evidence: [{ type: "PROOF_OF_FULFILLMENT" as const, description: "Delivered", carrier: "USPS", tracking_number: "9400111202555842761234" }],
  risks: [],
  message_to_buyer: "Your $149.00 order was delivered by USPS.",
};

test("grounded recommendation passes", () => {
  assert.deepEqual(groundingProblems(base, 149, data), []);
});

test("invented tracking number is caught", () => {
  const rec = { ...base, evidence: [{ ...base.evidence[0], tracking_number: "9400999999999999999999" }] };
  assert.match(groundingProblems(rec, 149, data).join(), /does not match get_shipment_tracking/);
});

test("invented identifier in prose is caught", () => {
  const rec = { ...base, message_to_buyer: "Your refund reference is RF-2026-778812." };
  assert.match(groundingProblems(rec, 149, data).join(), /RF-2026-778812/);
});

test("invented dollar amount is caught", () => {
  const rec = { ...base, message_to_buyer: "We will add a $20.00 store credit." };
  assert.match(groundingProblems(rec, 149, data).join(), /\$20\.00/);
});

test("fight without evidence is rejected", () => {
  assert.match(groundingProblems({ ...base, evidence: [] }, 149, data).join(), /needs at least one evidence/);
});

test("proof of fulfillment without tracking is rejected", () => {
  const rec = { ...base, evidence: [{ type: "PROOF_OF_FULFILLMENT" as const, description: "Shipped" }] };
  assert.match(groundingProblems(rec, 149, [dispute, order]).join(), /no tracking is on file/);
});

test("refund must not carry evidence", () => {
  assert.match(groundingProblems({ ...base, verdict: "refund" }, 149, data).join(), /evidence must be \[\]/);
});

test("offer amount must be below the disputed amount", () => {
  const rec = { ...base, verdict: "offer" as const, evidence: [], offer_amount: "200", message_to_buyer: "We offer $200.00." };
  assert.match(groundingProblems(rec, 149, data).join(), /offer_amount must be between/);
});

test("valid partial offer passes", () => {
  const rec = { ...base, verdict: "offer" as const, evidence: [], summary: "Partial refund.", offer_amount: "40.00", message_to_buyer: "We can refund $40.00 of your $149.00 order." };
  assert.deepEqual(groundingProblems(rec, 149, data), []);
});
