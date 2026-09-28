# Interactive Recipe & Meal-Prep Engine

A pantry-first web application designed to track available home ingredients, send timely expiry warnings, recommend ranked recipes based on ingredients expiring soon, automatically generate missing-ingredient shopping lists, and guide step-by-step cooking with digital timers and portion scaling.

Built strictly in accordance with **[SRS.md](SRS.md)** and **[REQUIREMENTS.md](REQUIREMENTS.md)**.

---

## Key Features (SRS Scope)

1. **User Authentication & Role-Based Access (FR-01)**
   - Role separation between **User** (Home Cook) and **Admin** (Kitchen Admin).
   - Security: Account locks for **15 minutes after 5 consecutive failed login attempts** (NFR-03).
   - Security: Inactive sessions automatically end after **30 minutes of inactivity** (NFR-04).
   - Instant 1-click demo login helpers in the UI.

2. **Pantry Management (FR-02)**
   - Full CRUD: Add, update, view, and delete pantry ingredients with names, quantities, units, and expiration dates.
   - Real-time debounced search by ingredient name.
   - Case-insensitive duplicate ingredient prevention with user feedback.

3. **Expiry Alerts (FR-03)**
   - Visual badges and countdowns for ingredients that are expired or expiring within 5 days.
   - Live badge counter in navigation sidebar.

4. **Pantry-First Recipe Recommendations (FR-04)**
   - Algorithmic scoring that prioritizes recipes utilizing ingredients currently in the pantry.
   - Gives highest weight to recipes consuming soon-to-expire ingredients to reduce food waste.
   - Multi-parameter filtering: Dietary preference (*Vegetarian*, *Non-Vegetarian*), maximum cooking time, and difficulty levels.

5. **Missing Ingredients & Shopping List (FR-05)**
   - Select any catalog recipe to instantly compare required ingredients against current pantry stock.
   - One-click automatic generation of shopping list items with required shortfalls.
   - Manual custom item additions, checkbox strike-through for purchased items, item deletion, and full list clearance.

6. **Recipe & Cooking Management (FR-06)**
   - Interactive portion & serving size scaler (− / +) that dynamically recalculates all ingredient amounts in real time.
   - Step-by-step checklist with progress tracking.
   - Inline step timer buttons (e.g. `⏱ Set Timer (10m)` right inside instructions).
   - Built-in Digital Cooking Timer with Start / Pause / Reset, quick presets (3m, 5m, 10m, 15m, 20m), and Web Audio synthesizer chime on completion.
   - Favorites bookmarking and cooking history log with timestamps and serving counts.

7. **Supporting Screens & Admin Tools**
   - **Kitchen Dashboard**: Metric KPI cards, recent alerts, and recipe recommendations.
   - **Reports & Insights**: Expiry health percentage bar, popular cooked recipes ranking, and Admin system overview.
   - **Admin Recipe Management**: Full CRUD table for creating, modifying, and deleting global recipe templates.

---

## Tech Stack

- **Frontend**: Vanilla HTML5, Vanilla CSS3 (Custom Design System with Google Fonts *Plus Jakarta Sans* & *Outfit*, glassmorphism, responsive drawer layout), Vanilla JavaScript ES6+.
- **Backend**: FastAPI (Python 3.10+ / 3.12+ / 3.14+) with Starlette static mounting and lifespan management.
- **Database**: SQLite with SQLAlchemy 2.0 ORM (`backend/data/mealprep.db`).
- **Testing**: Pytest with HTTPX / Starlette TestClient.

---

## Demo Accounts

| Role | Username | Password | Access Privileges |
| :--- | :--- | :--- | :--- |
| **Home Cook** | `user` | `User@123` | Pantry, Alerts, Recommendations, Shopping List, Cooking, Favorites, History, Reports |
| **Kitchen Admin** | `admin` | `Admin@123` | All User features + Global Recipe CRUD Management + System User Directory & Reports |

---

## Setup & Running Locally

### 1. Prerequisites
- Python 3.10 or later installed on your system.

### 2. Activate Virtual Environment & Install Dependencies
Open PowerShell in the project root directory:

```powershell
# Navigate to project root
cd "D:\NON FORMAL MAIN"

# Create virtual environment (if not already created)
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install required dependencies
pip install -r backend\requirements.txt
```

### 3. Start the Application Server
Run the FastAPI development server:

```powershell
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4. Access the Application
- **Web App**: Open your browser at [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Alternative ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

*Note: On initial startup, SQLite tables are automatically created and seeded with demo accounts, sample recipes, and initial pantry ingredients.*

---

## Running Automated Tests

To execute the automated Pytest suite verifying all functional and non-functional requirements:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests\test_api.py -v
```

All 9 comprehensive integration tests will run and pass:
- `test_health`: API status verification
- `test_login_and_dashboard`: Authentication, role assignment, and dashboard metrics
- `test_bad_login`: 401 handling for invalid credentials
- `test_pantry_crud_and_search`: Pantry item creation, debounced search, update, duplicate protection, and deletion
- `test_recommendations_and_filters`: Expiry-prioritized recommendation scoring and dietary/time filters
- `test_shopping_favorites_history_reports`: Recipe shortfall calculation, shopping list generation, favorites, and history logging
- `test_admin_recipe_crud`: Admin recipe creation, modification, deletion, and 403 Forbidden check for standard users
- `test_session_timeout`: 30-minute inactivity session expiration (NFR-04)
- `test_account_lockout`: 15-minute lockout triggered after 5 consecutive failed login attempts (NFR-03)

---

## API Reference

### Authentication (`/api/auth`)
- `POST /api/auth/login` — Sign in (returns Bearer token; locks for 15m on 5 failed attempts)
- `GET /api/auth/me` — Current authenticated user profile
- `POST /api/auth/logout` — Terminate active session

### Pantry (`/api/pantry`)
- `GET /api/pantry?search={query}` — List pantry items filtered by optional search query
- `GET /api/pantry/alerts` — Get list of items that are expired or expiring within 5 days
- `POST /api/pantry` — Add new ingredient (with duplicate check)
- `PUT /api/pantry/{id}` — Update ingredient quantity, unit, or expiry date
- `DELETE /api/pantry/{id}` — Remove ingredient from pantry

### Recipes & Recommendations (`/api/recipes`)
- `GET /api/recipes` — List all system recipes with pantry match and missing ingredient calculations
- `GET /api/recipes/recommendations` — List recipes sorted by pantry match score and soonest-expiring items
- `GET /api/recipes/{id}?servings={n}` — Get specific recipe with ingredient amounts scaled to servings
- `POST /api/recipes` — *Admin only*: Create new recipe template
- `PUT /api/recipes/{id}` — *Admin only*: Update existing recipe template
- `DELETE /api/recipes/{id}` — *Admin only*: Remove recipe template

### Shopping List (`/api/shopping`)
- `GET /api/shopping` — Get user's shopping list
- `POST /api/shopping` — Add manual item to shopping list
- `POST /api/shopping/generate` — Generate shopping list from missing recipe ingredients scaled by servings
- `PUT /api/shopping/{id}` — Update item quantity or toggle purchased status
- `DELETE /api/shopping/{id}` — Remove item from shopping list
- `DELETE /api/shopping` — Clear entire shopping list

### Cooking Management (`/api/cooking`)
- `GET /api/cooking/favorites` — Get user's saved favorite recipes
- `POST /api/cooking/favorites/{id}` — Save recipe to favorites
- `DELETE /api/cooking/favorites/{id}` — Remove recipe from favorites
- `GET /api/cooking/history` — View cooking history log
- `POST /api/cooking/history` — Record cooking session with servings count

### Dashboard & Reports (`/api`)
- `GET /api/dashboard` — Overview counts, priority alerts, and top recipe recommendations
- `GET /api/reports` — Expiry distribution summary, most cooked recipes, and Admin platform statistics
