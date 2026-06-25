# Acme Corp — IT Security Policy

**Version:** 2.4 | **Effective Date:** 1 March 2024 | **Owner:** IT / CISO

## 1. Password Policy

- Minimum length: **14 characters**
- Must contain uppercase, lowercase, digit, and special character
- Passwords must not be reused within the last **12 rotations**
- Maximum password age: **90 days** (standard), **30 days** (privileged accounts)
- MFA is **mandatory** for all accounts — no exceptions
- Company-provided password managers (Bitwarden or 1Password) must be used

## 2. Requesting a New Software License

To request software not on the Approved Software List (ASL):

1. Submit **Software License Request (Form IT-14)** via the IT Service Desk portal at **help.acmecorp.internal**
2. Include business justification, estimated cost, number of users, and vendor security documentation
3. IT Security reviews within **5 working days**
4. Finance approves budget if annual cost exceeds **£500**
5. Legal reviews vendor agreements if software processes personal data
6. Final approval by IT Director

**Typical turnaround: 10–15 working days**

## 3. Data Classification

| Classification | Description | Examples |
|---|---|---|
| Public | Safe for external distribution | Marketing materials |
| Internal | For employees only | Policies, internal reports |
| Confidential | Sensitive business info | Financial data, customer PII |
| Restricted | Highest sensitivity | Trade secrets, legal proceedings |

Confidential and Restricted data must be encrypted at rest (AES-256) and in transit (TLS 1.2+).

## 4. Remote Access

Remote access is permitted only via the approved **Zscaler VPN client**. Employees must never access company resources over public Wi-Fi without VPN active.

## 5. Incident Response

Report all suspected security incidents to **security@acmecorp.com** or extension **2999**.

- Critical (active breach): **15-minute** initial response
- High (confirmed threat): **1-hour** initial response
- Medium (suspected threat): **4-hour** initial response

## 6. Asset Management

All IT assets must be registered in the Asset Management System within **3 working days** of procurement.

## 7. Contact

IT Service Desk: **help.acmecorp.internal** | **extension 2800** | **it@acmecorp.com**
