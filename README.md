PAYMENT-AGGREGATOR (PAYFLOW) — POSTMAN API GUIDE
================================================

Base URL:
http://localhost:3000

GENERAL HEADERS
---------------
For protected merchant endpoints:
Authorization: Bearer <ACCESS_TOKEN>

For JSON request bodies:
Content-Type: application/json

For endpoints requiring idempotency:
Idempotency-Key: <UNIQUE_REQUEST_KEY>

Replace {id} with the actual ID returned by the relevant API.
Amounts in this project may be stored in the smallest currency unit (paise):
50000 = ₹500, if your implementation uses paise.

------------------------------------------------------------
AUTH
------------------------------------------------------------

1. Merchant Register
POST /merchants/register
Purpose: Creates a merchant account so a business can use PayFlow.
Example body:
{
  "businessName": "Demo Store",
  "email": "merchant@example.com",
  "password": "StrongPassword123!"
}

2. Merchant Login
POST /auth/login
Purpose: Authenticates a registered merchant and returns authentication tokens.
Example body:
{
  "email": "merchant@example.com",
  "password": "StrongPassword123!"
}

3. Rotate Tokens
POST /auth/refresh
Purpose: Uses a valid refresh token to obtain a new access token (and possibly a rotated refresh token).
Example body:
{
  "refreshToken": "<REFRESH_TOKEN>"
}

4. Merchant Logout
POST /auth/logout
Purpose: Ends the refresh-token session so that the supplied refresh token can no longer be used.
Example body:
{
  "refreshToken": "<REFRESH_TOKEN>"
}

------------------------------------------------------------
MERCHANT
------------------------------------------------------------

5. Get Merchant Profile
GET /merchants/profile
Purpose: Returns the profile of the currently authenticated merchant.
Example: Send the request with Authorization: Bearer <ACCESS_TOKEN>; no body is needed.

6. Update Webhook URL
PATCH /merchants/webhook
Purpose: Sets or updates the URL where PayFlow should send this merchant's webhook events.
Example body:
{
  "webhookUrl": "https://example.com/payflow/webhooks"
}

------------------------------------------------------------
ORDERS
------------------------------------------------------------

7. Order Creation
POST /orders
Purpose: Creates an order that a customer can pay for.
Example body:
{
  "amount": 50000,
  "currency": "INR",
  "receipt": "receipt_demo_001"
}

8. Get Order by ID
GET /orders/{id}
Purpose: Retrieves one order using its order ID.
Example: GET /orders/<ORDER_ID>; no body is needed.

9. Get All Orders
GET /orders?page=1&limit=10
Purpose: Returns a paginated list of orders belonging to the authenticated merchant.
Example: Set page=1 and limit=10 in query parameters; no body is needed.

10. Cancel Order
PATCH /orders/{id}/cancel
Purpose: Cancels an order that is still eligible for cancellation.
Example: PATCH /orders/<ORDER_ID>/cancel; no body is needed.

------------------------------------------------------------
PAYMENTS
------------------------------------------------------------

11. Create Payment
POST /payments
Purpose: Starts a payment attempt for an existing order using the configured simulated payment provider.
Example body:
{
  "orderId": "<ORDER_ID>"
}

12. Get Payment by ID
GET /payments/{id}
Purpose: Retrieves the status and details of one payment attempt.
Example: GET /payments/<PAYMENT_ID>; no body is needed.

13. Get All Payments
GET /payments?page=1&limit=10
Purpose: Returns the authenticated merchant's payments in pages.
Example: Set page=1 and limit=10 in query parameters; no body is needed.

14. Get Pending Payment Verifications
GET /admin/payment-verifications?status=PENDING&page=1&limit=10
Purpose: Lists payment-verification submissions awaiting an admin decision.
Example: Use an authorized admin access token and query parameters status=PENDING, page=1, limit=10; no body is needed.
NOTE: This is a manual payment-verification route. If you have removed the manual UPI verification feature and returned to simulated payments, this request should be removed from the collection and the route should no longer be part of the active API.

------------------------------------------------------------
REFUNDS
------------------------------------------------------------

15. Create Refund
POST /refunds
Purpose: Requests a full or partial refund for an eligible successful payment.
Headers:
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
Idempotency-Key: refund_demo_001
Example body:
{
  "paymentId": "<SUCCESSFUL_PAYMENT_ID>",
  "amount": 10000
}
Here, 10000 represents ₹100 if amounts are stored in paise.

16. Get Refunds History
GET /refunds?page=1&limit=10
Purpose: Lists the merchant's refunds with pagination.
Example: Set page=1 and limit=10 in query parameters; no body is needed.

17. Get Refund History by ID
GET /refunds/{id}
Purpose: Retrieves the details and current status of one refund.
Example: GET /refunds/<REFUND_ID>; no body is needed.

------------------------------------------------------------
WEBHOOKS
------------------------------------------------------------

18. Get Webhook History
GET /webhooks
Purpose: Shows webhook delivery attempts and their statuses for the authenticated merchant.
Example: Send the request with the merchant access token; no body is needed.

19. Retry Webhook
POST /webhooks/{id}/retry
Purpose: Queues another delivery attempt for a webhook that previously failed or needs retrying.
Example: POST /webhooks/<WEBHOOK_ID>/retry; no body is needed.

------------------------------------------------------------
SETTLEMENTS
------------------------------------------------------------

20. Check Available Settlement Balance
GET /settlements/balance
Purpose: Returns the amount currently available for settlement according to the platform's ledger and settlement rules.
Example: Send the authenticated GET request; no body is needed.

21. Create a Settlement
POST /settlements
Purpose: Requests settlement of the merchant's currently eligible balance.
Headers:
Authorization: Bearer <ACCESS_TOKEN>
Idempotency-Key: settlement_demo_001
Example body:
{}
NOTE: The empty body is based on your collection; the backend is expected to calculate the eligible amount rather than accept an amount from the request.

22. Get Settlement History
GET /settlements?page=1&limit=10
Purpose: Lists the merchant's settlement requests and their statuses.
Example: Set page=1 and limit=10 in query parameters; no body is needed.

23. Get Specific Settlement
GET /settlements/{id}
Purpose: Retrieves the details and status of one settlement.
Example: GET /settlements/<SETTLEMENT_ID>; no body is needed.

------------------------------------------------------------
LEDGER
------------------------------------------------------------

24. Get Ledger Journals
GET /ledger/journals
Purpose: Lists accounting journal entries created by financial operations such as payments, refunds, and settlements.
Example: Send the authenticated GET request; no body is needed.

25. Get Ledger Accounts
GET /ledger/accounts
Purpose: Lists the ledger accounts used to track balances and financial movements.
Example: Send the authenticated GET request; no body is needed.

26. Get Ledger Account Statement
GET /ledger/accounts/{id}/statement
Purpose: Returns the debit and credit entries affecting a particular ledger account.
Example: GET /ledger/accounts/<ACCOUNT_ID>/statement; no body is needed.

27. Get Ledger Journal by ID
GET /ledger/journals/{id}
Purpose: Retrieves one journal and its associated accounting entries.
Example: GET /ledger/journals/<JOURNAL_ID>; no body is needed.

28. Create Ledger Account
POST /ledger/accounts
Purpose: Creates a ledger account for tracking a specific category of funds or financial activity.
Example body:
{
  "name": "Demo Merchant Payable",
  "code": "MERCHANT_PAYABLE_DEMO",
  "type": "LIABILITY",
  "currency": "INR"
}
NOTE: Use only account type values accepted by your Ledger DTO/enum; LIABILITY is an illustrative example.

29. Update Ledger Account Status
PATCH /ledger/accounts/{id}/status
Purpose: Changes whether a ledger account is active or in another supported status.
Example body:
{
  "status": "ACTIVE"
}
NOTE: Use only status values accepted by your implementation.

30. Deactivate Ledger Account
DELETE /ledger/accounts/{id}
Purpose: Deactivates or removes a ledger account according to the backend's deletion rules.
Example: DELETE /ledger/accounts/<ACCOUNT_ID>; no body is needed.

------------------------------------------------------------
RECONCILIATION
------------------------------------------------------------

31. Import External Payout Records
POST /reconciliation/import
Purpose: Imports external provider payout/settlement records so PayFlow can compare them with its internal financial records.
Example body:
{
  "periodStart": "2026-11-01T00:00:00.000Z",
  "periodEnd": "2026-11-30T23:59:59.999Z",
  "records": [
    {
      "externalReference": "PAYFLOW_SIM_PAYOUT_demo-001",
      "amount": "50000",
      "currency": "INR",
      "transactionDate": "2026-11-18T12:00:00.000Z"
    }
  ]
}
NOTE: The externalReference must match the reference format/value expected by your reconciliation logic. The example reference is illustrative, not a real payout reference.

32. Get Reconciliation History
GET /reconciliation/runs?page=1&limit=10
Purpose: Lists previous reconciliation runs with pagination.
Example: Set page=1 and limit=10 in query parameters; no body is needed.

33. Get Reconciliation Details
GET /reconciliation/runs/{id}
Purpose: Retrieves the imported records, matching results, and discrepancies for one reconciliation run.
Example: GET /reconciliation/runs/<RUN_ID>; no body is needed.

34. Resolve a Discrepancy
PATCH /reconciliation/discrepancies/{id}/resolve
Purpose: Marks a reconciliation discrepancy as resolved according to the backend's resolution logic.
Example: PATCH /reconciliation/discrepancies/<DISCREPANCY_ID>/resolve; no body is needed.

------------------------------------------------------------
SUGGESTED END-TO-END TEST ORDER
------------------------------------------------------------

1. Register a merchant.
2. Log in and save the access token and refresh token.
3. Get the merchant profile.
4. Create an order.
5. Retrieve the order and confirm its details.
6. Create a payment using the order ID.
7. Retrieve the payment and check whether the simulator marked it SUCCESS or FAILED.
8. Check webhook history and verify delivery attempts.
9. Inspect ledger journals, accounts, and statements.
10. If the payment succeeded, create a partial or full refund and retrieve its status.
11. Check settlement balance.
12. Create a settlement and inspect settlement history/details.
13. Import external payout records and inspect the reconciliation run.
14. Resolve any discrepancy if the API reports one.
15. Test logout and refresh-token rotation.

IMPORTANT
---------
This guide documents the 34 routes and body keys supplied in your Postman collection. Example values are illustrative. The exact accepted enum values, validation rules, authentication roles, response shapes, and whether a body is optional must be confirmed against the current NestJS controllers and DTOs.
