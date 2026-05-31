# Banking System — Complete Audit & Modernization Plan

## Executive Summary

After scanning every file in both `backend/` and `frontend/`, I've identified **critical security vulnerabilities**, architectural weaknesses, missing features, and a dated frontend. Below is a full audit followed by a phased implementation plan to transform this into a realistic, modern banking application.

---

## 🔴 CRITICAL Security Vulnerabilities Found

> [!CAUTION]
> These issues could lead to data breach, financial fraud, or full system compromise if deployed.

### 1. Hardcoded JWT Secret (CRITICAL)
- **Files**: [auth.js (middleware)](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/middleware/auth.js#L2), [auth.js (services)](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/services/auth.js#L2)
- Secret is `"SecureOnlyPassword"` hardcoded in two separate files
- Anyone who reads your source code can forge ANY JWT token

### 2. Admin Routes Have ZERO Authentication (CRITICAL)
- **File**: [Manager.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/Manager.js)
- ALL admin routes (`/admin/*`) are **completely unprotected** — no `verifyToken` middleware
- Anyone can: approve loans, deposit money, verify accounts, search customers, update customer data
- The admin login endpoint referenced in [Adminlogin.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/components/Adminlogin.js#L15) (`POST /admin/login`) **doesn't exist on the backend**

### 3. Database Credentials Exposed (CRITICAL)
- **File**: [.env](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/.env)
- Password `root@MySQL4admin` is committed to Git with no `.gitignore` entry for `.env`

### 4. No Rate Limiting on Authentication
- Login route has no brute-force protection — attackers can try unlimited passwords

### 5. Sensitive Data in JWT Payload
- **File**: [auth.js (services)](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/services/auth.js#L4-L14)
- JWT contains: account number, name, phone, email, address, city
- All of this is visible to anyone who decodes the Base64 JWT (no encryption)

### 6. No Input Sanitization / SQL Injection Potential
- While parameterized queries are used (good), there's zero validation on email format, phone format, account number format, or transfer amounts on the backend

### 7. Frontend Auth is Token-Existence-Only
- **File**: [App.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/App.js#L10-L14)
- `isAuthenticated()` just checks if `localStorage.getItem("jwtToken")` exists — doesn't verify expiry or validity
- Admin page has **no authentication guard at all** (line 40: `<Route path="/admin" element={<Admin />} />`)

---

## 🟠 Backend Architecture Weaknesses

| Issue | File | Details |
|-------|------|---------|
| Duplicate `express.json()` | [index.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/index.js#L8-L12) | Called twice on lines 8 and 12 |
| CORS hardcoded to localhost:3000 | [index.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/index.js#L17) | Won't work in production |
| No admin login route exists | [Manager.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/Manager.js) | Frontend references it but it doesn't exist |
| `verifyCustomerAccount` mixes callback + promise | [Manager.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/Manager.js#L374) | Uses `db.query(query, [accountNumber], (err, results) =>` callback style — inconsistent and buggy with mysql2/promise |
| `/reports` returns only FIRST unverified customer | [Manager.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/Manager.js#L397-L422) | Queries all but returns only `[0]` |
| WithdrawAmount/AfterBalance are INT not DECIMAL | [bank.sql](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/dataBase/bank.sql#L48-L55) | Can't handle decimal currency properly |
| TransferAmount is INT not DECIMAL | [bank.sql](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/dataBase/bank.sql#L66) | Same issue |
| No deposit logging in TransactionHistory | [Manager.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/Manager.js#L283-L340) | Deposits are not recorded in TransactionHistory or BalanceLog |
| Connection leak on verifyAccount | [Manager.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/Manager.js#L342-L361) | Connection is obtained but never released |
| Unnecessary transaction for read-only query | [User.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/User.js#L434-L463) | `/history` starts a transaction for a SELECT query |
| Dead JSX outside return in Navbar | [Navbar.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/components/Navbar.js#L86-L92) | `<button>` JSX placed outside the return statement (lines 86-92) — dead code |
| No HTTPS/TLS configuration | [index.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/index.js) | Runs plain HTTP |
| No error/logging framework | Backend-wide | Just `console.error` everywhere |

---

## 🟡 Frontend Issues

| Issue | Details |
|-------|---------|
| **Uses Bootstrap classes but Bootstrap isn't imported** | Classes like `container`, `card`, `row`, `col-md-4`, `btn`, `alert`, `form-control` are used but no Bootstrap CSS/JS is included in package.json |
| **No responsive design** | Fixed widths, no mobile optimization |
| **CSS is chaotic** | [App.css](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/App.css) has 708 lines of duplicate rules, conflicting styles (`.modal` defined twice, `.verify-btn` defined 4 times) |
| **Hardcoded API URLs** | Every component has `http://localhost:8081` hardcoded |
| **No loading states / skeletons** | Raw "Loading..." text |
| **No proper error handling UI** | Uses `alert()` for errors |
| **Console.log statements everywhere** | Debug logs left in production code |
| **Unused Adminlogin.js component** | AdminLogin component exists but is never used in routing |
| **No token expiry handling** | Expired tokens cause silent failures |
| **No confirmation dialogs** | Withdraw/Transfer/Deposit happen with one click |

---

## Proposed Changes

### Phase 1 — Critical Security Fixes (Backend)

#### [MODIFY] [.env](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/.env)
- Add `JWT_SECRET` variable (random 64-character hex string)
- Add `CORS_ORIGIN` variable
- Add `PORT` variable

#### [MODIFY] [.gitignore](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/.gitignore)
- Ensure `.env` is listed

#### [MODIFY] [auth.js (services)](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/services/auth.js)
- Use `process.env.JWT_SECRET` instead of hardcoded secret
- Remove sensitive PII from JWT payload (keep only `accountNumber`, `role`)
- Add refresh token support

#### [MODIFY] [auth.js (middleware)](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/middleware/auth.js)
- Use `process.env.JWT_SECRET`
- Add role-based access control (admin vs user middleware)
- Add token expiry error handling with proper status codes

#### [NEW] adminAuth.js (middleware)
- Create admin authentication middleware
- Add admin role verification

#### [MODIFY] [Manager.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/Manager.js)
- Add `verifyToken` + `verifyAdmin` middleware to ALL admin routes
- Add admin login route with bcrypt password verification
- Fix `verifyCustomerAccount` to use promise-based query (not callback)
- Fix `/reports` to return ALL unverified customers
- Fix connection leak in `verifyAccount`
- Add deposit logging to TransactionHistory and BalanceLog
- Add input validation on all routes

#### [MODIFY] [index.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/index.js)
- Remove duplicate `express.json()`
- Use environment variables for CORS and PORT
- Add rate limiting with `express-rate-limit`
- Add `helmet` for security headers
- Add global error handler
- Add request logging with `morgan`

#### [MODIFY] [User.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/routes/User.js)
- Remove unnecessary transaction from `/history`
- Add input validation (email regex, phone regex, password strength)
- Add transaction limits (daily transfer limit, minimum balance)
- Add transfer confirmation step (OTP-like via a PIN)
- Remove PII from JWT payload

---

### Phase 2 — Database Schema Improvements

#### [MODIFY] [bank.sql](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/backend/dataBase/bank.sql)
- Change `WithdrawAmount`, `AfterBalance` from INT to DECIMAL(20,2)
- Change `TransferAmount` from INT to DECIMAL(20,2)
- Change `ChangeAmount`, `OldBalance`, `NewBalance` in BalanceLog from INT to DECIMAL(20,2)
- Change `TransactionAmount` in TransactionHistory from INT to DECIMAL(20,2)
- Add `Admin` table for admin users with bcrypt passwords
- Add `TransactionPin` table for secure transfer PINs
- Add `LoginAttempts` table for brute-force tracking
- Add `DepositHistory` table for tracking deposits
- Add `Beneficiary` table for saved transfer recipients
- Add `Notification` table for in-app notifications

---

### Phase 3 — New Backend Features

#### [NEW] routes/Admin.js
- Separate admin routes with proper structure
- Admin login/logout with JWT
- Dashboard statistics (total users, total balance, total loans, recent transactions)
- Customer detail view with full history
- Approved/denied loan history view

#### [NEW] middleware/rateLimiter.js
- Rate limiting for login (5 attempts per 15 minutes)
- Rate limiting for transfers (10 per hour)
- Rate limiting for general API (100 per 15 minutes)

#### [NEW] middleware/validator.js
- Input validation middleware using regex patterns
- Email validation, phone validation, amount validation
- Account number format validation

#### [NEW] services/notification.js
- In-app notification system for:
  - Account verified
  - Loan approved/denied
  - Transfer received
  - Large withdrawal alert

#### New API Endpoints:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /admin/login` | POST | Admin authentication |
| `GET /admin/dashboard` | GET | Dashboard statistics |
| `GET /admin/customers` | GET | All customers with pagination |
| `GET /customer/profile` | GET | Full user profile |
| `PUT /customer/profile` | PUT | Update own profile |
| `PUT /customer/changePassword` | PUT | Change password |
| `POST /customer/setTransactionPin` | POST | Set/change 4-digit PIN |
| `POST /customer/verifyTransferPin` | POST | Verify PIN before transfer |
| `GET /customer/beneficiaries` | GET | Saved beneficiaries |
| `POST /customer/beneficiaries` | POST | Add a beneficiary |
| `DELETE /customer/beneficiaries/:id` | DELETE | Remove beneficiary |
| `GET /customer/notifications` | GET | User notifications |
| `GET /customer/loanStatus` | GET | User's loan applications |

---

### Phase 4 — Complete Frontend Modernization

The current frontend will be completely redesigned with a modern, premium banking UI.

#### Design System
- **Color Palette**: Deep navy (#0a1628), electric blue (#2563eb), teal accents (#06b6d4), soft grays
- **Typography**: Inter font (modern, banking-grade)
- **Dark Mode**: Full dark mode with glassmorphism cards
- **Micro-animations**: Smooth transitions on all interactions
- **Responsive**: Mobile-first design

#### [MODIFY] [App.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/App.js)
- Proper JWT verification (check expiry)
- Admin route protection with role-based guards
- New routing structure with sidebar layout

#### [MODIFY] [App.css](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/App.css)
- Complete rewrite with modern design system
- CSS custom properties for theming
- Remove all duplicate rules
- Add smooth animations and transitions

#### [NEW] components/Dashboard.js
- Modern dashboard with glassmorphism cards
- Account balance with animated counter
- Recent transactions preview
- Quick actions (Transfer, Pay Bills, etc.)
- Account health indicator

#### [MODIFY] [login.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/components/login.js)
- Modern split-screen login with gradient background
- Animated form with validation feedback
- Remember me functionality
- Forgot password link

#### [MODIFY] [signup.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/components/signup.js)
- Multi-step registration wizard
- Real-time validation
- Password strength meter
- Terms & conditions checkbox

#### [MODIFY] [Home.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/components/Home.js)
- Transform into full dashboard layout
- Sidebar navigation
- Account overview with charts
- Quick transfer with saved beneficiaries
- Transaction history with filters and search

#### [MODIFY] [Navbar.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/components/Navbar.js)
- Modern sidebar/top navigation with user avatar
- Notification bell with badge
- Remove dead JSX code
- Profile dropdown with settings

#### [MODIFY] [Admin.js](file:///c:/Users/Admin/Desktop/Banking%20app/banking-system/frontend/src/components/Admin.js)
- Full admin dashboard with statistics cards
- Data tables with sorting, filtering, pagination
- Charts for transaction trends
- Modern tab interface
- Confirmation dialogs for sensitive actions

#### [NEW] components/TransferMoney.js
- Step-by-step transfer flow
- Account verification with name display
- Amount input with formatted display
- PIN verification step
- Transfer confirmation screen
- Success animation

#### [NEW] components/TransactionHistory.js
- Full-page transaction history
- Filter by type (withdraw, transfer, loan, deposit)
- Date range picker
- Search by description
- Export to CSV

#### [NEW] components/LoanCenter.js
- Loan application with EMI calculator
- Loan status tracker with progress steps
- Active loans overview
- Repayment schedule

#### [NEW] components/Profile.js
- User profile view and edit
- Change password form
- Set/change transaction PIN
- Account verification status
- Saved beneficiaries management

#### [NEW] components/Notifications.js
- Notification center with read/unread states
- Categorized notifications
- Mark as read / clear all

#### [NEW] utils/api.js
- Centralized API configuration with axios instance
- Base URL from environment variable
- Automatic token attachment via interceptor
- Token expiry handling (auto-logout)
- Error response formatting

---

## New Feature List

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Transaction PIN** | 4-digit PIN required for all outgoing transactions |
| 2 | **Beneficiary Management** | Save, edit, delete frequently used transfer recipients |
| 3 | **EMI Loan Calculator** | Calculate EMIs before applying for a loan |
| 4 | **Notification System** | In-app notifications for all account activities |
| 5 | **Admin Dashboard Analytics** | Charts and metrics for admin overview |
| 6 | **Transaction Filters & Search** | Search and filter transaction history |
| 7 | **Daily Transfer Limits** | Configurable daily transfer limits per account type |
| 8 | **Password Change** | Self-service password change |
| 9 | **Multi-step Transfer** | Account verification → amount → PIN → confirm flow |
| 10 | **PDF Report with Date Range** | Already exists but improved with better UI |
| 11 | **Admin Login System** | Proper admin authentication (currently missing) |
| 12 | **Account Statements** | Monthly/quarterly statement generation |
| 13 | **Session Management** | Auto-logout on token expiry with warning |
| 14 | **Mobile Responsive Design** | Full mobile experience |
| 15 | **Dark Mode** | Toggle dark/light theme |

---

## Verification Plan

### Automated Tests
- Test all API endpoints with valid/invalid inputs
- Test authentication flows (login, token expiry, unauthorized access)
- Test admin route protection (should reject unauthenticated requests)
- Test transfer flow (insufficient balance, same-account, invalid recipient)
- Test rate limiting behavior

### Manual Verification
- Verify frontend renders correctly on desktop and mobile viewports
- Test complete user flow: signup → login → dashboard → transfer → history → PDF
- Test admin flow: login → view loans → approve/deny → deposit → verify account
- Verify dark mode toggle works
- Verify notification system fires on relevant events
- Confirm all console.log statements are removed from production

---

## Open Questions

> [!IMPORTANT]
> **Scope Priority**: This is a very large overhaul. Would you like me to:
> - **Option A**: Implement everything in one go (will take a very long time)
> - **Option B**: Start with Phase 1 (Security) + Phase 4 (Frontend redesign) first, then add features incrementally
> - **Option C**: Focus purely on frontend modernization first (most visible change)

> [!IMPORTANT]
> **Admin Credentials**: For the new admin login system, should I:
> - Seed a default admin in the database (e.g., `admin` / `Admin@123`) that must be changed on first login?
> - Or create an admin registration flow?

> [!IMPORTANT]
> **Database Migration**: The schema changes (INT → DECIMAL, new tables) will require running migration SQL. Do you have an existing database with data that needs to be preserved, or can we start fresh?
