# DollDime — Project Overview and Business Rules

*A plain-English guide for anyone new to the project, with the business logic of every feature explained in detail. No technical background needed.*

**How to read this document.** Sections 1–3 explain what the business is. Section 4 onward explains each feature and the exact rules behind it. Section 17 is a one-page table of every number and limit. Section 18 lists what is *not* built yet, so nobody assumes it exists.

---

## Contents

1. [The business in one page](#1-the-business-in-one-page)
2. [Who uses the system](#2-who-uses-the-system)
3. [The big picture: how money and goods flow](#3-the-big-picture-how-money-and-goods-flow)
4. [Customer accounts](#4-customer-accounts)
5. [The product catalogue](#5-the-product-catalogue)
6. [Cart, checkout and stock freezing](#6-cart-checkout-and-stock-freezing)
7. [The wallet](#7-the-wallet)
8. [Chit plans — the savings scheme](#8-chit-plans--the-savings-scheme)
9. [Paying for a chit plan](#9-paying-for-a-chit-plan)
10. [Reminders and messages](#10-reminders-and-messages)
11. [The admin website](#11-the-admin-website)
12. [Orders and delivery](#12-orders-and-delivery)
13. [How money is handled (accuracy and safety)](#13-how-money-is-handled-accuracy-and-safety)
14. [Security and fraud protection](#14-security-and-fraud-protection)
15. [What is never deleted](#15-what-is-never-deleted)
16. [A year in the life: worked examples](#16-a-year-in-the-life-worked-examples)
17. [Every number and limit in one table](#17-every-number-and-limit-in-one-table)
18. [What is not built yet / decisions still open](#18-what-is-not-built-yet--decisions-still-open)
19. [Glossary](#19-glossary)
20. [Where things live in the project](#20-where-things-live-in-the-project)

---

## 1. The business in one page

**DollDime sells festive dolls** for the Dussehra / Navaratri *golu* (doll display) season in India. Families build their display over the years, and a good set is a big expense.

DollDime solves two problems:

1. **Reach.** Customers browse and buy from their phone instead of visiting a shop.
2. **Affordability.** Customers can **save a little every month** towards their dolls through a *chit plan*, a savings habit many Indian families already know. At the end they get their savings back as shopping money **plus a 10% bonus**.

For the business owner this means more sales, money coming in months before the festival, customers who stay committed for a whole year, and automatic reminders instead of phone calls.

The system has three parts:

| Part | What it is | Who uses it |
|---|---|---|
| **Customer app** | A mobile app (Android first) | Customers |
| **Admin website** | A private website on a computer | The shop team |
| **The back office** | The server and database behind both, plus connections to Razorpay (payments), Twilio (SMS and WhatsApp) | Nobody sees it directly |

Everything the shop team does in the admin website shows up immediately in the customer app, and the other way round.

---

## 2. Who uses the system

| Person | What they can do |
|---|---|
| **Customer** | Register with a phone number, browse and buy dolls, pay with the wallet and/or online, top up the wallet, create and pay a chit plan, see order history. |
| **Admin (shop team)** | Sign in to the admin website. Manage products and stock, see and update orders, review chit plans (approve/reject), watch payments and reminders, see customers and wallets, manage suppliers. |
| **The system itself** | Sends reminders automatically on the 4th and 10th of each month, frees up items from abandoned checkouts, confirms payments even if the customer closes the app. |

There is **one kind of admin** today. Every admin can do everything.

---

## 3. The big picture: how money and goods flow

```
Customer pays Razorpay ──► Shop order (goods)            ► delivered to the customer
        │
        ├─► Wallet top-up ─► Wallet (spendable money) ──► used at checkout for shop orders
        │
        └─► Chit payments ─► Wallet "locked" money ─────► (plan completes in August)
                                                              │
                                    savings + 10% bonus ◄─────┘ moved to spendable wallet
```

Three kinds of customer money exist in the wallet:

* **Spendable balance** — can be used to buy dolls right now. Comes from top-ups and from finished chit plans.
* **Locked chit savings** — money paid into a chit plan. **Cannot be spent** until the plan completes.
* **Bonus points** — 1 point = ₹1. Credited as spendable balance when a plan completes.

---

## 4. Customer accounts

### 4.1 Signing up
A customer registers with their **phone number only**. There is no email address anywhere in the system.

1. They enter **first name** (required), **last name** (optional), **phone number** and a **password** (6 to 72 characters).
2. The app sends a **6-digit code by SMS** to the phone.
3. They type the code. If correct, the account is created, they are signed in, and an empty wallet is created for them.

**If the number is already registered**, the system stops at once and says *"This number is already registered. Please sign in, or use Forgot Password."* An account is never overwritten by registering again.

**Phone numbers** are stored in one standard form (for example `+919876543210`). A customer can type it as `9876543210`, `09876543210`, `+91 98765 43210` and so on; it is all treated as the same number. A plain 10-digit number is assumed to be Indian.

### 4.2 The permanent customer id
Every customer gets a permanent id like **`user_191026kQzTb`**:

`user_` + registration date as **ddmmyy** (in Indian time) + **5 random letters** (upper and lower case mixed).

* It is created automatically at registration and never changes for that account.
* Every other record (orders, wallet, chit plans, messages) is linked to it.
* Two customers can never have the same id. In the extremely unlikely case that a random id is already taken, the system silently generates another and tries again.

Besides the id, each customer record holds: a running **index number** (1, 2, 3 … in order of registration, handy for support), first name, last name, phone, address, date of registration, **reseller flag** and **reseller code**. *(Address and reseller details are stored but nothing in the shop uses them yet; see section 18.)*

### 4.3 The one-time code (OTP) rules
* A code is valid for **10 minutes** and works **once**.
* It is for **one purpose**: a sign-up code cannot be used to reset a password, and the other way round.
* **5 wrong guesses** destroy the code (even the correct code is then refused) and the customer must ask for a new one. The app tells them how many tries are left.
* A new code can be requested **once a minute**, and at most **5 codes per hour** per phone number (this stops people running up SMS costs).
* If the SMS provider fails to send, the code is hidden so it can never be used, and the customer can try again immediately.

### 4.4 Signing in
Phone number + password. **5 wrong passwords in a row lock the account for 15 minutes**, even if the correct password is then typed. After the lock ends the count starts again. A successful sign-in clears the count. The error for an unknown number looks exactly like the error for a wrong password, so nobody can use it to find out who is registered.

A signed-in session lasts **30 days**. If the account is deleted or disabled, the session stops working at once. The app signs the customer out automatically when the server says the session is no longer valid. The sign-in token is kept in the phone's secure storage.

### 4.5 Forgot password
1. The customer chooses **Forgot password** and enters their number. (An unregistered number gets *"No account found"*.)
2. A code is sent (purpose: password reset). They enter the code and a new password.
3. The system then:
   * marks the **old account row as deleted** (reason: password reset),
   * creates a **new account row** with the same number and the new password and a **new customer id**,
   * **moves everything the customer owns to the new row**: wallet balance, locked chit money, orders, cart, payment history and chit plans, and keeps their original registration date,
   * signs them in on the new account.
4. The old password and any old sign-in stop working immediately.

Nothing is lost: the old row stays in the database for the record, and the customer sees exactly the same money, orders and plans as before.

### 4.6 Deleting an account
The customer enters their password and confirms. The system **refuses** if any of these is true, and explains which:

* there is money in the wallet (they should use it, or contact support),
* there is savings locked in a chit plan (possible after the plan completes),
* there is an order that has been paid but not delivered yet, or a checkout waiting for payment that already holds wallet money.

Otherwise the account is **closed, not erased**: the row stays (marked deleted, with the date and reason), their orders and payment records stay, and any chit plan that had no payment yet (under review or approved but unpaid) is cancelled. Their phone number becomes free: the same person can register again later, but it is a **brand-new account with a new id**; the old history stays with the old row.

A wrong password on the delete screen counts towards the same 5-attempt lock as sign-in.

---

## 5. The product catalogue

Each product has: name, description, photo, **category** (Traditional, Modern, Miniature, Collector, Children), price, optional original price (for showing a discount), stock, rating, "featured" flag, "listed" flag, tags, serial number and warehouse location.

* **Listed / hidden.** The admin can hide a product without deleting it. Hidden products disappear from the app and cannot be checked out (even if already in someone's cart).
* **Featured.** Highlights the product in the app.
* **What the customer sees as "stock".** Not the number on the shelf, but the number **they can actually buy right now**: shelf stock minus items currently *frozen* by other customers who are in the middle of paying (see section 6). The admin sees all three numbers: on the shelf, frozen, and available.
* **Prices** are entered by the admin in rupees with at most two decimals (for example `499.50`). Anything else (such as `19.999`, text, or a negative number) is rejected with a message rather than being rounded silently.
* **Stock edits.** The admin cannot set stock lower than the number currently frozen by customers who are paying. They get a message to try again in a few minutes. A product also cannot be deleted while customers are paying for it.

---

## 6. Cart, checkout and stock freezing

### 6.1 The cart
* One line per product; adding the same product again adds to the quantity.
* Quantity must be a whole number from **1 to 99**. Setting a quantity of 0 removes the line.
* Only listed products can be added.
* The cart shows, for each item, how many can actually be bought, and exact totals.

### 6.2 What happens when the customer taps "Pay"
The system does these things **in this order**, and stops at the first problem:

1. **Delivery address** is required (up to 250 characters).
2. **Abandoned checkouts are cleaned up** first, so any items and wallet money they held become available again.
3. **Availability check.** For every item in the cart: is it listed, and is `shelf stock − frozen ≥ quantity requested`?
   * If anything is short, the customer is told **before any payment screen appears**, naming the item(s) and how many are left, for example *"Only 1 of Scarce Doll left (you asked for 2)"* or *"Scarce Doll ran out of stock"*. **No order is created, nothing is frozen, no payment link is made.** The cart refreshes so they can adjust.
4. **Wallet decision** (see 6.3).
5. **Freeze.** The items are frozen for this customer in one all-or-nothing step. Even if two customers pass step 3 at the same moment for the last unit, the database lets only one of them freeze it; the other is told it ran out. If one item in a cart can't be frozen, **none** are.
6. **The customer pays** the online part through Razorpay (or, if the wallet covers everything, there is no online payment).

### 6.3 Using the wallet at checkout
The checkout screen offers **"Pay with wallet"** whenever the customer has spendable balance.

* Only the **spendable** balance is used. **Locked chit savings are never touched.**
* The wallet pays first.
  * **Wallet covers the whole order** → the order is confirmed immediately, the wallet is reduced by exactly the order total, stock is taken off the shelf, and the cart is cleared. No online payment.
  * **Wallet covers part** → the wallet part is taken **now and held**, and the customer pays the rest online. The screen shows *"From wallet ₹300 / Pay online ₹700"* before they confirm.
  * **No wallet** → the whole amount is paid online.
* **Minimum online payment is ₹1.** If using the full wallet would leave less than ₹1 to pay online (Razorpay's minimum), the wallet pays slightly less so that exactly ₹1 remains online. Example: wallet ₹999.50, order ₹1,000 → wallet pays ₹999, online ₹1, wallet keeps ₹0.50.
* If the wallet balance changes between the preview and the confirmation (for example the customer used it on another phone), the customer is told *"Your wallet balance changed, please try again"* and nothing is charged.

### 6.4 What happens after payment
* **Payment succeeds** → the frozen items become **sold** (shelf stock reduces), the order is confirmed, the cart is cleared, the payment is recorded, and the customer gets a WhatsApp confirmation.
* **The customer closes the payment screen or the payment fails** → the app immediately cancels the checkout: **items are unfrozen and any wallet money held is returned.**
* **The customer just walks away** → after **30 minutes** the system does the same automatically (the "sweeper", which runs every 5 minutes).
* **The customer paid but the app never reported it** (phone died, app closed) → Razorpay notifies the server directly, and the order is confirmed anyway. If that notice is missed, the sweeper checks Razorpay and confirms the order instead of cancelling it.
* **The customer pays after the 30 minutes were up** (checkout already cancelled) → the money is **refunded to them automatically**, and the wallet money was already returned.
* The same payment arriving twice (the app and Razorpay both reporting it) is recorded only **once**.

### 6.5 Two customers, one last doll
Example: 3 dolls left. Asha freezes 2 and starts paying. Bhavna wants 2 → told "Only 1 left". Bhavna takes 1. Charu wants 1 → told "ran out of stock". Asha pays → the 3 become: 1 sold... then Bhavna gives up → her 1 is unfrozen → Charu can now buy it. Throughout, the shelf count and the frozen count always add up, and a doll is never sold twice. (This was tested with eight customers racing for five units: exactly five succeeded.)

---

## 7. The wallet

Every customer has one wallet with two numbers: **spendable balance** and **locked chit savings**. Neither can ever be negative; the database itself refuses it.

### 7.1 How money gets into the wallet
| Source | Becomes | When |
|---|---|---|
| **Top-up** by the customer through Razorpay | Spendable | Immediately after payment |
| **Chit payments** | Locked | Immediately after each payment |
| **Chit plan completion** (all savings + bonus) | Spendable | The moment the final payment is made |
| **Refund of a cancelled checkout** (held wallet part) | Spendable | When the checkout is cancelled or expires |

### 7.2 How money leaves the wallet
* **Shop checkout** (spendable only), as described in section 6.
* Locked savings leave only by being *released* to spendable when the plan completes. There is **no withdrawal to a bank account** today.

### 7.3 Top-up rules
Minimum **₹1**, maximum **₹50,000** at a time, at most two decimals. The credit is confirmed by Razorpay directly (even if the app is closed) and is applied exactly once.

### 7.4 History
Every movement is written to the customer's payment history, for example *"Order #12 (paid from wallet)"*, *"Chit payment – 4 Chits – ₹2,000/month"*, *"Chit savings unlocked"*, *"Chit bonus points"*, *"Refund – wallet money released for unpaid Order #8"*. The wallet screen shows the last 50 entries and, when applicable, a note: *"₹X saved in your chit plans — locked until your plan completes in August"*.

---

## 8. Chit plans — the savings scheme

This is the feature that makes DollDime different. Read this section carefully.

### 8.1 The idea in one example
> Meena picks **4 chits**. One chit is ₹500, so she pays **₹2,000 a month** for **11 months** (October to August) = **₹22,000**.
> The shop adds **10% bonus = 2,200 points** (1 point = ₹1).
> When she finishes in August, her wallet gets ₹22,000 + ₹2,200 = **₹24,200** to spend on dolls.

### 8.2 The fixed rules
| Rule | Value |
|---|---|
| Value of one chit | **₹500 per month** |
| Number of chits a customer can choose | **1 to 100** (₹500 to ₹50,000 a month) |
| Length of every plan | **11 months, October to August** |
| Bonus | **10% of the total paid**, credited as points when the plan completes |
| 1 bonus point | **₹1** of shopping money |
| Customer chooses | **Only the number of chits.** The duration is fixed. |
| Plans per customer | **One live plan per plan year** |

The customer creates a plan with a **− / +** stepper (or by typing the number). The app shows, live, as the number changes: monthly payment, total over 11 months, bonus points, and the final value received. *(4 chits: ₹2,000 → ₹22,000 → 2,200 points → ₹24,200.)*

### 8.3 The plan year (October to August)
Every year is a new **plan year** that runs **1 October to 31 August**. Month 1 is October, month 11 is August.

* **September is closed.** Between plan years, no new plans can be created; the app says when the next plan year opens.
* The system works out "what month is it" in **Indian time**. At half past midnight on 1 October in India, it is already October.

### 8.4 Joining late: the catch-up rule
A customer should join in October, but may join any month until August. Whoever joins later must **pay for every month since October** to catch up.

> Rohan joins in **January** with 4 chits. October, November, December and January have passed: 4 months × ₹2,000 = **₹8,000 due right after approval**. From February he pays ₹2,000 a month. His total is still ₹22,000 and he earns the **full** 2,200-point bonus.

The create-plan screen shows this clearly in an amber box ("Joining late? Catch up to start") with the months and the amount, *before* he submits.

### 8.5 The approval flow (new)
A plan is **not active until the shop team approves it.**

```
Customer submits ──► UNDER REVIEW ──► Admin Approve ──► APPROVED (can pay) ──► COMPLETED
                           │
                           └────────► Admin Reject (with reason) ──► REJECTED (customer may submit a new plan)
```

**What the customer sees**
* Right after submitting: the plan appears in *My Chits* as **"Under review"** with a message that they'll be told on WhatsApp once it is approved. They cannot pay yet and get no payment reminders.
* **Approved:** a WhatsApp message with the amount to pay now; the plan shows a **Pay** button.
* **Rejected:** a WhatsApp message with the admin's reason (if given); the card shows "Not approved" and the reason, with a button to create a new plan.

**What the admin does** (Chit Approvals page): sees each waiting plan with the customer's name, phone and id, the number of chits, monthly amount, total, bonus, the plan year, **how much the customer will owe the moment it's approved** (important for late joiners), and when it was submitted. Then clicks **Approve**, or **Reject** with an optional reason (up to 300 characters).

**Rules**
* **One plan per customer per plan year** (under review or approved). A rejected or cancelled plan doesn't count, so a rejected customer can submit again. If a customer double-taps, or submits from two phones at the same moment, **exactly one plan is created** and the other attempt is told *"You already have a chit plan for this year… check My Chits"*.
* A plan is **either approved or rejected, never both**, and a decision can't be changed afterwards. If two admins click at the same moment, one succeeds and the other is told it was already reviewed.
* A plan from a **finished plan year cannot be approved** (it can only be rejected).
* A plan the customer cancelled by deleting their account cannot be approved.
* Both decisions record **which admin** decided and **when**.
* **Only approved, running plans appear as "active"** in lists, reminders and statistics.

### 8.6 How much is owed at any moment
The system never keeps a manual "due date". It calculates from the plan year:

* **Months due so far** = months since October up to and including the current month (October = 1 … August = 11; never more than 11).
* **Due so far** = months due × monthly amount (never more than the total).
* **Pending now** = due so far − what the customer has paid.

So the current month counts as due **from the 1st**. Paying early for the next month isn't offered; the pay button covers what is pending now. If a customer is behind, "pending now" includes all the missed months.

### 8.7 Payment status labels (used by the admin and the app)
| Label | Meaning |
|---|---|
| **Paid up** | Nothing pending. |
| **Pending** | Only the current month is unpaid, and today is the 10th or earlier. |
| **Overdue / Late** | Two or more months are unpaid, **or** the current month is still unpaid after the 10th. |
| **Completed** | All 11 months paid. |
| **Part-paid** | Some money was paid but less than what is pending. |
| **Never paid** | An approved plan with no payment at all yet. |

### 8.8 Completion
The moment the **total paid reaches the plan total** (the 11th month), in one atomic step:
1. the plan is marked **completed**,
2. the whole saved amount moves from *locked* to **spendable**,
3. the **bonus points** are added as spendable money,
4. the customer gets a congratulations WhatsApp message.

Before that moment the savings **cannot be spent**. A customer who wants to buy something earlier pays separately.

### 8.9 What does *not* happen (decisions you made)
* **Missed payments have no automatic consequence.** No late fee, no cancellation. They are tracked, reminded, and shown to the admin (section 11.7).
* There is **no early withdrawal**, no cancellation-with-refund and no payout to a bank (yet). See section 18.

---

## 9. Paying for a chit plan

1. The customer taps **Pay Pending** on an approved plan. The app asks the server to create a payment for **exactly the pending amount** (this month, plus any missed months).
2. They pay through Razorpay.
3. The server then asks **Razorpay itself** what was really received. It trusts Razorpay's figure, **not the app's**. It only accepts a payment that is captured, belongs to that payment order, and belongs to a chit plan of the signed-in customer.
4. The received amount is added to the plan and to the locked balance, and recorded in the customer's history.

### 9.1 Part payments
If less than the pending amount arrives:
* the money is **accepted and recorded**,
* the customer is told on screen and by WhatsApp **"Payment not completed in full"** with *received / still pending / total paid so far*,
* the rest stays pending. When they pay the remainder, the system recalculates and confirms it ("Payment received" or, on the last one, "Plan completed").

*(Whether Razorpay itself lets a customer pay less than the order amount is an account setting; the system handles the situation correctly either way. See section 18.)*

### 9.2 Safety
* The same payment reported twice (app and Razorpay) counts **once**.
* Payments can only go to **approved, running** plans. If money somehow arrives for a plan that can't take it (not approved, already complete), it is **not applied**, an alert is logged, and the payment needs a manual refund.
* A payment made while the app is closed is still applied, because Razorpay notifies the server directly.

---

## 10. Reminders and messages

### 10.1 The monthly reminders (WhatsApp)
Both are sent from **10:00 AM Indian time** on the day, and **only for approved, running plans of live accounts** that have a pending amount:

| Day | Who gets it | Message |
|---|---|---|
| **4th of every month** | Everyone with a pending amount | "Your *month* chit payment is due" with this month's amount, and the **total pending** if earlier months are unpaid. Ends with "If you have already paid, please ignore this message." |
| **10th of every month** | Only customers **still** unpaid | "We have not received your *month* chit payment yet", with the amounts. |

Customers who are paid up get nothing. Plans under review, rejected, completed or belonging to closed accounts get nothing.

### 10.2 How reminders are tracked and kept reliable
* **Exactly once.** Each customer gets each reminder once per month. A record is created before sending, so even if several servers run, or a server restarts, nobody is messaged twice.
* **Every reminder is recorded** as *sent* or *failed*, with the amount due, the number of attempts and the error if any.
* **Retries.** A failed reminder is retried at the next hourly check, **up to 3 attempts in total**, then left for the admin to see.
* **Crash recovery.** If the process died halfway through sending, another process takes the job over after 15 minutes. A send that is genuinely in progress is left alone.
* The reminders are checked **every hour**, so a reminder missed because the system was down at 10 AM goes out later the same day.
* In production the reminders run in a **separate worker process**, so adding web servers never causes duplicates.

### 10.3 Every other message the system sends
| Message | Sent when |
|---|---|
| **OTP (SMS)** | Registering or resetting a password |
| **Order confirmed (WhatsApp)** | A shop order is paid/confirmed, listing the items and total |
| **Wallet topped up** | A top-up is received, with the new balance |
| **Chit plan received** | A customer submits a plan (under review) |
| **Chit plan approved** | Admin approves, with the amount to pay now |
| **Chit plan rejected** | Admin rejects, with the reason |
| **Chit payment received** | A payment fully covers what was due, with progress and when the next payment opens |
| **Payment not completed in full** | A payment is less than what was pending |
| **Chit plan completed** | The final payment, with the unlocked savings and bonus |
| **4th / 10th reminders** | As in 10.1 |

**Every one of these is logged** (who, what kind, which channel, sent or failed, the error if it failed). OTP codes themselves are never stored in the log.

---

## 11. The admin website

The admin website is private. Nothing in it works without signing in.

### 11.1 Admin sign-in
* Username and password. **5 wrong passwords lock that admin for 15 minutes**; there is also a limit of 10 attempts per 15 minutes per internet address.
* A session lasts **12 hours**, after which the admin signs in again. Admin sessions and customer sessions cannot be swapped for each other.
* Admin accounts are created by a developer with a command (there is no sign-up screen). A deactivated admin is locked out immediately.

### 11.2 Menu overview
Dashboard · Products · Vendors · Inventory · Orders · Users · **Chit Approvals** (with a red number of waiting plans) · Chit Subscriptions · **Reminders & Tracking** · Wallets.

### 11.3 Dashboard
Total orders, revenue (**only paid orders** count), active products, low-stock warnings (under 5 *available*), total active customers, wallets, pending chit approvals, and recent orders.

### 11.4 Products and Inventory
* Add, edit, delete products; upload photos (JPEG, PNG, WebP, up to 5 MB); set price, original price, category, tags, stock, location, serial number.
* **Hide / List** toggle without deleting.
* **Inventory** page: shelf stock, frozen units (*"3 frozen while customers pay · 5 available"*), location and serial number; the **Adjust** window updates stock and location and shows an explanation if the change is refused because units are frozen.
* The rules in section 5 apply (price format, stock cannot go below frozen units, no delete while customers are paying).

### 11.5 Orders
All orders, filterable by status; expand a row to see items, address, payment status and **how it was paid** ("Paid from wallet", "Paid online", or "Wallet ₹300 + Online ₹700"). The admin moves an order through **pending → confirmed → processing → shipped → delivered** (or cancelled). *(Cancelling here does not refund the customer yet; see section 18.)*

### 11.6 Users and Wallets
* **Users:** running number, **user id**, name, phone, status (Active, Inactive, or **Closed**, with the reason "Deleted by customer" or "Replaced after password reset" and the date), reseller code, date registered. Closed accounts remain visible for the record.
* **Wallets:** each customer's spendable balance and the amount **locked in chit plans**.

### 11.7 Chit Approvals
The review queue described in 8.5. Tabs: **Under review**, **Approved**, **Rejected**, **All**, each with a count. After a decision, a confirmation message confirms the customer was notified. If the decision can't be made (already decided by someone else, plan year over), a clear message explains why.

### 11.8 Chit Subscriptions
All **approved** plans and how each customer is doing: customer, plan, a progress bar (*months paid / 11*), paid vs total, **pending now and for how many months**, a status label (Paid up / Pending / Overdue / Completed), **number of reminders sent (and failed)** and when the last one went out. Searchable by name, phone or user id, and filterable by status by clicking the summary tiles.

### 11.9 Reminders & Tracking (the control room)
One page showing everything the shop team needs to run the savings scheme:

**Headline numbers**
* Reminders sent this month (and failed)
* Notifications sent: last 24 hours / 7 days / 30 days
* Failed notifications (last 30 days)
* **Late payments** and **customers 2+ months behind**
* Plans awaiting approval, and how long the oldest has waited

**Money**
* Collected so far on active plans vs what was due so far
* **Still to collect** and the **percentage of what is due that is paid**
* Expected each month (all active plans together)
* Total in customer wallets and total **locked in chit plans**

**Lists**
* **Who needs to pay**: every approved plan with a pending amount, biggest first, with a switch between *All pending*, *Late*, and *2+ months behind*. Each row shows the customer, plan, amount, months behind, whether it was part-paid, how many reminders were sent and when the last one went.
* **Reminders**: counts for the 4th and 10th, the number of customers who owe money but have *never* been reminded (for example plans approved after the 10th), and a history of the latest reminders with their result, attempts and error.
* **All notifications by type** with counts for 24 hours / 7 days / 30 days / all time and failures; and the **latest failures with the exact error**.
* **Money collected per month**, as a simple bar chart.

**Also**: customer counts (active, new in 30 days, resellers, closed accounts), checkouts currently waiting for payment, the number of units frozen, and a list of items running low.

The page refreshes itself every 30 seconds and has a Refresh button.

---

## 12. Orders and delivery

An order moves through these states:

| State | Meaning |
|---|---|
| **pending** | Checkout started, waiting for the online payment. Items (and any wallet part) are being held. Not shown to the customer as a purchase. |
| **confirmed** | Paid in full (wallet and/or online). Stock has been sold. |
| **processing → shipped → delivered** | Set by the admin as the order progresses. The customer sees these steps in the app. |
| **cancelled** | Checkout abandoned or expired (held items and wallet money returned), or cancelled by the admin. |

The customer's *My Orders* list shows paid orders only, **newest first**. An order records the delivery address, the items with the prices at the moment of purchase, the total, how much came from the wallet and how much was paid online.

---

## 13. How money is handled (accuracy and safety)

* **No rounding errors.** All money arithmetic is done in whole **paise** (hundredths of a rupee) as integers, and amounts are stored as exact decimals. ₹0.10 + ₹0.20 is exactly ₹0.30, and 3 × ₹19.99 is exactly ₹59.97.
* **Amounts come from the payment provider, not the phone.** For payments, the server asks Razorpay what it received and uses that.
* **Once-only recording.** Each Razorpay payment id can be recorded only one time, whichever way it is reported.
* **All-or-nothing steps.** Taking stock, taking wallet money and creating the order happen together or not at all.
* **Floors in the database.** The wallet can never go below zero; stock can never go below zero; frozen units can never exceed stock.
* **Everything is on record.** Every money movement appears in the customer's history.

---

## 14. Security and fraud protection

| Threat | Protection |
|---|---|
| Someone pretends to be another customer | Signed sign-in tokens that cannot be forged; sessions die with the account |
| Stolen database | Passwords are stored as one-way bcrypt hashes |
| Guessing a password | 5 wrong tries → 15-minute lock |
| Guessing the SMS code | 5 wrong tries kill the code; limits on how many codes can be requested |
| Taking over an account by re-registering | Impossible: a registered number is refused |
| Stranger using the admin website | Admin sign-in required for every admin action; separate tokens for admins and customers |
| Free money / fake orders | The old "add funds" and "create order" shortcuts were deleted; money moves only through verified payments |
| Fake payment confirmations | Signature check plus a direct check with Razorpay |
| Overselling | Items are frozen in the database before payment |
| Double-click / two phones | The database allows only one chit plan per customer per year, one registration per live number, and one recording per payment |
| Too many requests | Request limits per internet address |

---

## 15. What is never deleted

To keep an honest record, customer-related records are **never erased**:

* **Customer accounts**: only marked deleted (with date and reason).
* **Chit plans**: cancelled or rejected, never removed.
* **SMS codes** that failed to send: only hidden.
* **Orders, payments and wallet history**: kept.

*Still removable today:* a product or vendor deleted by the admin, and the contents of the cart after a successful checkout. (See section 18.)

---

## 16. A year in the life: worked examples

### 16.1 Meena, on time
* **1 Oct.** Meena registers (`user_011026QmXza`), creates a **4-chit** plan. It is *Under review*. She gets "Chit Plan Received".
* **2 Oct.** The admin approves. Meena gets "Approved — pay ₹2,000 now". She pays; the ₹2,000 goes into *locked*. She gets "Payment received".
* **4 Nov.** Reminder: "Your November chit payment is due: ₹2,000." She pays on the 6th. The 10th reminder is **not** sent to her.
* …each month the same…
* **August.** She makes the 11th payment. The system completes the plan: **₹22,000 + 2,200 points = ₹24,200** becomes spendable. At the festival she buys dolls worth ₹24,200 without paying anything (or, if her cart is more, pays only the difference).

### 16.2 Rohan, late and behind
* **5 Jan.** Rohan creates a 4-chit plan. The app says: after approval you owe **₹8,000** (Oct–Jan).
* Approved on the 6th. He pays ₹5,000 only. He gets "**Payment not completed in full** — ₹3,000 still pending". His plan is *part-paid* and appears in the admin's pending list.
* **10 Feb.** He still hasn't paid February; the system shows him as **Late, 2 months behind**, and he got the 4th and 10th reminders. The admin sees him on the *2+ months behind* list and can phone him.
* He pays ₹5,000 (the full pending amount) later; the status returns to *Paid up*.

### 16.3 A rejected plan
* A customer submits a plan with 100 chits. The admin rejects it: *"Please call us to confirm this amount."* The customer gets this on WhatsApp, can see it in the app, and submits a smaller plan the same day.

### 16.4 Buying with the wallet
* After completing a plan, Meena has ₹24,200 spendable. She fills a cart of ₹25,000 and turns on *Pay with wallet*. The screen shows **From wallet ₹24,200 / Pay online ₹800**. She pays ₹800 through Razorpay. The order is confirmed; her wallet is ₹0.
* If she had an order of ₹10,000, the wallet would pay it all and she would be left with ₹14,200.

### 16.5 Two customers, one doll
Covered in 6.5: the last unit is frozen for whoever reaches the payment step first; the other is told it ran out *before* paying; if the first customer abandons, it's released and the second can buy it.

### 16.6 Forgot password
* A customer forgets her password, asks for a code, sets a new password. She is signed in on a **new account row** with a new id, and sees the same wallet, orders and chit plan as before.

---

## 17. Every number and limit in one table

| Topic | Value |
|---|---|
| One chit | ₹500 / month |
| Chits per plan | 1 – 100 |
| Plan length | 11 months (October – August) |
| Bonus | 10% of total, as points; 1 point = ₹1 |
| Plans per customer per plan year | 1 (under review or approved) |
| Plan year closed to new plans | September |
| Admin reject reason | up to 300 characters |
| Password length | 6 – 72 characters |
| First / last name | 1 – 50 characters (last name optional) |
| OTP validity | 10 minutes, single use |
| OTP wrong guesses | 5, then the code is dead |
| OTP resend / cap | once per minute; 5 per hour per number |
| Login lock | 5 wrong passwords → 15 minutes |
| Customer session | 30 days |
| Admin session | 12 hours |
| Cart quantity per product | 1 – 99 |
| Delivery address | up to 250 characters |
| Wallet top-up | ₹1 – ₹50,000 per top-up |
| Minimum online payment | ₹1 |
| Checkout hold (frozen items, held wallet money) | 30 minutes |
| Abandoned-checkout sweep | every 5 minutes |
| Reminder days | 4th and 10th, from 10:00 AM IST |
| Reminder checks | every hour |
| Reminder attempts | 3 in total |
| Stale reminder claim taken over after | 15 minutes |
| Low-stock warning | fewer than 5 available |
| Image upload | JPEG / PNG / WebP, up to 5 MB |

---

## 18. What is not built yet / decisions still open

Nobody should assume these exist.

**Money and orders**
* **Cancel / refund by the admin.** Cancelling an order in the admin site does not return money or restock. A refund process is planned.
* **No bank withdrawal** of wallet money; **no early exit** from a chit plan.
* **Invoices, GST and shipping charges** are not calculated.
* **Customers cannot cancel a paid order.**

**Chit plans**
* **Missed payments have no penalty or automatic lapse** (a deliberate choice for now; revisit with the refund policy).
* **No handling of an unfinished plan after August.** The business must decide what happens to a customer who has not finished by the end of the plan year.
* **Legal.** Collecting monthly savings and paying a bonus may fall under chit-fund / deposit regulations in India. Get legal advice before launching.

**Accounts**
* Address and reseller fields are stored but unused (no address book, no reseller pricing).
* One kind of admin; no roles and no log of admin actions.
* Sessions last 30 days with no "sign out everywhere".
* Account deletion in the app only (Google Play also expects a web page).

**Messaging and payments**
* Real WhatsApp delivery needs an approved WhatsApp sender and message templates; real SMS needs Indian sender registration.
* The part-payment behaviour with Razorpay depends on an account setting that must be enabled by Razorpay.
* Payment and refund flows have been tested against a simulation of Razorpay; they need a run in Razorpay's test mode.

**Platform**
* Product photos are stored on the server's disk (to be moved to cloud storage).
* The mobile app still has some development/placeholder settings (to be fixed before Play Store).
* Not yet tested on real phones; not yet deployed.

Details and priorities are in [CODE-REVIEW.md](CODE-REVIEW.md).

---

## 19. Glossary

* **Chit plan** — a savings scheme: pay a fixed amount monthly from October to August, then receive your savings plus a bonus.
* **Chit** — one unit of a plan: ₹500 per month.
* **Plan year** — October to August; a new one starts each October.
* **Catch-up** — what a late joiner pays for the months already passed.
* **Under review / Approved / Rejected** — the stages of a submitted chit plan.
* **Pending now** — what a customer owes at this moment on a plan.
* **Late (overdue)** — 2+ months behind, or this month unpaid after the 10th.
* **Locked savings** — chit money that cannot be spent until the plan completes.
* **Spendable balance** — wallet money that can be used at checkout.
* **Bonus points** — 10% extra on completion; 1 point = ₹1.
* **Frozen (reserved) stock** — items held for a customer who is in the middle of paying.
* **Available stock** — shelf stock minus frozen stock: what can be bought now.
* **OTP** — the 6-digit SMS code used to verify a phone number.
* **Soft delete** — marking a record as deleted without erasing it.
* **Webhook** — Razorpay telling our server directly that a payment happened.
* **Migration** — a recorded, versioned change to the database structure.
* **Paise** — one hundredth of a rupee; all money maths is done in paise.
* **Worker** — a separate background program that sends reminders and cleans up abandoned checkouts.

---

## 20. Where things live in the project

| Folder / file | In plain words |
|---|---|
| `artifacts/mobile` | The customer's phone app |
| `artifacts/admin` | The shop team's admin website |
| `artifacts/api-server` | The back office: all rules in this document are enforced here |
| `artifacts/api-server/src/lib/chit-rules.ts` | The chit scheme's numbers and calendar (₹500, 11 months, 10%, Oct–Aug, 4th/10th) |
| `artifacts/api-server/src/lib/order-payments.ts` | Freezing stock, wallet holds, refunds, the 30-minute sweeper |
| `artifacts/api-server/src/lib/chit-payments.ts` | Applying chit payments, locking and releasing savings |
| `artifacts/api-server/src/lib/chit-reminder-scheduler.ts` | The 4th / 10th reminders and their tracking |
| `artifacts/api-server/src/routes/admin-chits.ts` | Approve / reject and the subscriptions list |
| `artifacts/api-server/src/routes/admin-ops.ts` | The Reminders & Tracking dashboard data |
| `artifacts/api-server/src/tests/e2e.ts` | The automated test of all of the above |
| `lib/db` | The structure of the stored information, and its versioned migrations |
| `docs/DATABASE.md` | How to change the database safely, including on a live system |
| `README-LOCAL.md` | How to run everything on a Windows computer |
| `CODE-REVIEW.md` | Quality review, what is fixed, what remains |

**Third-party services:** Razorpay (payments), Twilio (SMS and WhatsApp), PostgreSQL (database).
