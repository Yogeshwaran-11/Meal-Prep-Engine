from datetime import date

from sqlalchemy.orm import Session

from .models import PantryItem, Recipe, RecipeIngredient, RecipeStep, User
from .security import hash_password

EXPIRY_ALERT_DAYS = 5

DEMO_USERS = [
    {"username": "admin", "display_name": "Kitchen Admin", "password": "Admin@123", "role": "Admin"},
    {"username": "user", "display_name": "Home Cook", "password": "User@123", "role": "User"},
]

SEED_RECIPES = [
    {
        "name": "Vegetable Rice",
        "diet": "vegetarian",
        "cooking_time": 25,
        "difficulty": "Easy",
        "base_servings": 2,
        "description": "A pantry-first rice dish using vegetables that are already at home.",
        "image_url": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Rice", 1, "cup"),
            ("Carrot", 1, "pcs"),
            ("Onion", 1, "pcs"),
            ("Green Peas", 100, "g"),
            ("Oil", 1, "tbsp"),
        ],
        "steps": [
            (1, "Rinse the rice and chop the available vegetables.", None),
            (2, "Cook the rice until tender.", 12),
            (3, "Sauté onion, carrot, and green peas in oil.", 8),
            (4, "Combine vegetables with rice and serve.", None),
        ],
    },
    {
        "name": "Tomato Rice",
        "diet": "vegetarian",
        "cooking_time": 20,
        "difficulty": "Easy",
        "base_servings": 2,
        "description": "Tangy tomato rice that uses pantry staples quickly.",
        "image_url": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Rice", 1, "cup"),
            ("Tomato", 3, "pcs"),
            ("Onion", 1, "pcs"),
            ("Oil", 1, "tbsp"),
        ],
        "steps": [
            (1, "Chop tomatoes and onion.", None),
            (2, "Sauté onion and tomatoes in oil until soft.", 8),
            (3, "Add cooked rice, mix well, and serve.", None),
        ],
    },
    {
        "name": "Egg Rice",
        "diet": "non-vegetarian",
        "cooking_time": 25,
        "difficulty": "Easy",
        "base_servings": 2,
        "description": "Simple egg fried rice using eggs and pantry vegetables.",
        "image_url": "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Rice", 1, "cup"),
            ("Egg", 2, "pcs"),
            ("Onion", 1, "pcs"),
            ("Oil", 1, "tbsp"),
        ],
        "steps": [
            (1, "Beat the eggs and chop the onion.", None),
            (2, "Scramble eggs in oil, then add onion.", 6),
            (3, "Mix in cooked rice and cook until hot.", 5),
        ],
    },
    {
        "name": "Potato Curry",
        "diet": "vegetarian",
        "cooking_time": 35,
        "difficulty": "Medium",
        "base_servings": 2,
        "description": "Comforting potato curry with onion and tomato.",
        "image_url": "https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Potato", 3, "pcs"),
            ("Onion", 1, "pcs"),
            ("Tomato", 2, "pcs"),
            ("Oil", 1, "tbsp"),
        ],
        "steps": [
            (1, "Peel and cube the potatoes.", None),
            (2, "Sauté onion and tomato in oil.", 8),
            (3, "Add potatoes with a little water and simmer until soft.", 20),
        ],
    },
    {
        "name": "Vegetable Stir Fry",
        "diet": "vegetarian",
        "cooking_time": 15,
        "difficulty": "Easy",
        "base_servings": 2,
        "description": "Fast stir fry that helps use vegetables before they expire.",
        "image_url": "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Carrot", 2, "pcs"),
            ("Green Peas", 80, "g"),
            ("Onion", 1, "pcs"),
            ("Oil", 1, "tbsp"),
        ],
        "steps": [
            (1, "Slice carrot and onion.", None),
            (2, "Stir-fry vegetables in oil until tender-crisp.", 10),
            (3, "Season and serve immediately.", None),
        ],
    },
    {
        "name": "Egg Tomato Curry",
        "diet": "non-vegetarian",
        "cooking_time": 40,
        "difficulty": "Medium",
        "base_servings": 2,
        "description": "Eggs simmered in a tomato-onion gravy.",
        "image_url": "https://images.unsplash.com/photo-1565299507177-b0ac66763828?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Egg", 4, "pcs"),
            ("Tomato", 3, "pcs"),
            ("Onion", 1, "pcs"),
            ("Oil", 1, "tbsp"),
        ],
        "steps": [
            (1, "Boil the eggs and peel them.", 10),
            (2, "Make a gravy with onion and tomato.", 12),
            (3, "Add eggs to the gravy and simmer.", 8),
        ],
    },
    {
        "name": "Onion Potato Roast",
        "diet": "vegetarian",
        "cooking_time": 30,
        "difficulty": "Easy",
        "base_servings": 2,
        "description": "Roasted potatoes with onion, useful when potatoes are plentiful.",
        "image_url": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Potato", 4, "pcs"),
            ("Onion", 2, "pcs"),
            ("Oil", 2, "tbsp"),
        ],
        "steps": [
            (1, "Cube potatoes and slice onions.", None),
            (2, "Toss with oil and roast until golden.", 25),
        ],
    },
    {
        "name": "Chicken Tomato Curry",
        "diet": "non-vegetarian",
        "cooking_time": 45,
        "difficulty": "Hard",
        "base_servings": 2,
        "description": "A richer curry that needs chicken plus pantry tomatoes and onion.",
        "image_url": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=80",
        "ingredients": [
            ("Chicken", 300, "g"),
            ("Tomato", 3, "pcs"),
            ("Onion", 2, "pcs"),
            ("Oil", 2, "tbsp"),
        ],
        "steps": [
            (1, "Cut chicken and chop onion and tomato.", None),
            (2, "Brown onion in oil, then add tomato.", 10),
            (3, "Add chicken and simmer until cooked through.", 25),
        ],
    },
]

SEED_PANTRY = [
    ("Rice", 2, "kg", date(2026, 9, 20)),
    ("Tomato", 6, "pcs", date(2026, 9, 12)),
    ("Carrot", 4, "pcs", date(2026, 9, 11)),
    ("Potato", 1, "kg", date(2026, 9, 22)),
    ("Onion", 1, "kg", date(2026, 9, 25)),
    ("Egg", 6, "pcs", date(2026, 9, 14)),
    ("Green Peas", 500, "g", date(2026, 9, 16)),
    ("Oil", 1, "L", date(2026, 10, 2)),
]


def seed_if_empty(db: Session) -> None:
    if db.query(User).count() == 0:
        for item in DEMO_USERS:
            db.add(
                User(
                    username=item["username"],
                    display_name=item["display_name"],
                    password_hash=hash_password(item["password"]),
                    role=item["role"],
                )
            )
        db.flush()

    if db.query(Recipe).count() == 0:
        for data in SEED_RECIPES:
            recipe = Recipe(
                name=data["name"],
                diet=data["diet"],
                cooking_time=data["cooking_time"],
                difficulty=data["difficulty"],
                base_servings=data["base_servings"],
                description=data["description"],
                image_url=data["image_url"],
            )
            db.add(recipe)
            db.flush()
            for name, qty, unit in data["ingredients"]:
                db.add(RecipeIngredient(recipe_id=recipe.id, name=name, quantity=qty, unit=unit))
            for number, instruction, timer in data["steps"]:
                db.add(
                    RecipeStep(
                        recipe_id=recipe.id,
                        step_number=number,
                        instruction=instruction,
                        timer_minutes=timer,
                    )
                )

    user = db.query(User).filter(User.username == "user").first()
    if user and db.query(PantryItem).filter(PantryItem.user_id == user.id).count() == 0:
        for name, qty, unit, expiry in SEED_PANTRY:
            db.add(
                PantryItem(
                    user_id=user.id,
                    name=name,
                    quantity=qty,
                    unit=unit,
                    expiry_date=expiry,
                )
            )
    db.commit()
