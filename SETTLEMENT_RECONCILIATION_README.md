# PayFlow Settlement & Reconciliation patch

This ZIP is an overlay for the existing PayFlow project. Extract it at the project root,
allowing files under `src/` to merge/replace the matching files.

## Included

- Ledger-derived merchant settlement balance.
- Idempotent settlement creation and per-merchant serialization.
- Pending/processing settlement reservation to prevent double payouts.
- Deterministic simulated payout provider (no real bank transfer).
- Settlement ledger journal: debit MERCHANT_PAYABLE, credit PAYMENT_CLEARING.
- Transactional `settlement.processed` outbox event and webhook dispatch support.
- External payout statement import and matching.
- Reconciliation discrepancy detection: unmatched external record, amount/currency mismatch,
  and successful settlement missing from the uploaded statement.
- Merchant-scoped APIs, validation DTOs, pagination.

## API

All endpoints below require `Authorization: Bearer <access-token>`.

### Settlements

- `GET /settlements/balance`
- `POST /settlements` with `Idempotency-Key: <unique-key>`
  - Full available balance: `{}`
  - Partial settlement: `{"amount":"50000"}` (amount is paise; ₹500 = 50000)
- `GET /settlements?page=1&limit=10`
- `GET /settlements/:id`

A settlement is processed synchronously by the deterministic simulated provider. The service
reserves the amount while processing and posts the ledger journal only after simulated payout
success. A failed payout releases the reservation.

### Reconciliation

- `POST /reconciliation/import`
- `GET /reconciliation/runs?page=1&limit=10`
- `GET /reconciliation/runs/:id`
- `PATCH /reconciliation/discrepancies/:id/resolve`

Example import body (amounts are paise):

```json
{
  "periodStart": "2026-11-01T00:00:00.000Z",
  "periodEnd": "2026-11-30T23:59:59.999Z",
  "records": [
    {
      "externalReference": "PAYFLOW_SIM_PAYOUT_REPLACE_WITH_REFERENCE",
      "amount": "50000",
      "currency": "INR",
      "transactionDate": "2026-11-18T12:00:00.000Z"
    }
  ]
}
```

The external reference must equal the `payoutReference` returned by a successful settlement.
External references are unique per merchant and cannot be imported a second time.

## Database

The project currently configures TypeORM `synchronize: true`, so the new tables, enum types,
indexes, and nullable webhook `paymentId` change will be synchronized on application startup.
Do not use `synchronize: true` in production; generate and review migrations instead.

## Important scope

This is a simulated educational payment aggregator. The payout provider does not contact a bank.
The reconciliation endpoint imports merchant-provided external payout records; it does not connect
to a bank or independently verify bank statements.

The settlement ledger entry uses the existing INR system accounts:
- Debit `MERCHANT_PAYABLE`
- Credit `PAYMENT_CLEARING`

The implementation intentionally includes both original and reversal journal entries in the
payable balance calculation. Their net effect is zero, avoiding incorrect balances when a
journal has been reversed.
