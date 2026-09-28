"""
Project requirements for the Interactive Recipe & Meal-Prep Engine.

This file restates SRS.md. Version 1 implements only these items.
"""

## Functional requirements

1. User login for Admin and User roles (FR-01).
2. Pantry management: ingredient name, quantity, and expiry date, including add/update/delete and search (FR-02).
3. Expiry alerts when ingredients are approaching expiry (FR-03).
4. Recipe recommendations based on available ingredients, prioritizing items that expire soon (FR-04).
5. Recipe filters, missing-ingredient identification, and automatic shopping-list generation (FR-05).
6. Serving adjustment, step-by-step instructions, cooking timer, favorites, and cooking history (FR-06).

Supporting screens required by the same scope: dashboard overview, expiry/cooking reports, form validation, session authentication, and API connectivity between the browser, FastAPI, and SQLite.

## Non-functional requirements

- Pages and pantry/recipe search respond within 3 seconds under normal conditions (NFR-01, NFR-02).
- Account lock for 15 minutes after 5 consecutive failed logins (NFR-03).
- Inactive sessions end after 30 minutes (NFR-04).
- Confirmation message after valid user actions (NFR-06).

## Out of scope

Features not listed in SRS.md, including Chef AI, grocery ordering, nutrition dashboards, meal calendars, barcode scanning, and community sharing.
