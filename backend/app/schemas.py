from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=120)

    @field_validator("username", "password")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required.")
        return value


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: str

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    token: str
    user: UserOut
    message: str


class PantryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0, le=10000)
    unit: str = Field(default="", max_length=40)
    expiry_date: date

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Ingredient name is required.")
        return value

    @field_validator("unit")
    @classmethod
    def strip_unit(cls, value: str) -> str:
        return value.strip()


class PantryUpdate(PantryCreate):
    pass


class PantryOut(BaseModel):
    id: int
    name: str
    quantity: float
    unit: str
    expiry_date: date
    days_remaining: int
    status: str

    model_config = {"from_attributes": True}


class IngredientIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0, le=10000)
    unit: str = Field(default="", max_length=40)


class StepIn(BaseModel):
    step_number: int = Field(ge=1, le=50)
    instruction: str = Field(min_length=1, max_length=2000)
    timer_minutes: int | None = Field(default=None, ge=1, le=180)


class RecipeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    diet: str
    cooking_time: int = Field(ge=1, le=300)
    difficulty: str
    base_servings: int = Field(default=2, ge=1, le=20)
    description: str = Field(default="", max_length=500)
    image_url: str = Field(default="", max_length=500)
    ingredients: list[IngredientIn] = Field(min_length=1)
    steps: list[StepIn] = Field(min_length=1)

    @field_validator("diet")
    @classmethod
    def diet_ok(cls, value: str) -> str:
        allowed = {"vegetarian", "non-vegetarian"}
        value = value.strip().lower()
        if value not in allowed:
            raise ValueError("Diet must be vegetarian or non-vegetarian.")
        return value

    @field_validator("difficulty")
    @classmethod
    def difficulty_ok(cls, value: str) -> str:
        allowed = {"Easy", "Medium", "Hard"}
        value = value.strip().title()
        if value not in allowed:
            raise ValueError("Difficulty must be Easy, Medium, or Hard.")
        return value


class RecipeIngredientOut(BaseModel):
    name: str
    quantity: float
    unit: str


class RecipeStepOut(BaseModel):
    step_number: int
    instruction: str
    timer_minutes: int | None


class RecipeOut(BaseModel):
    id: int
    name: str
    diet: str
    cooking_time: int
    difficulty: str
    base_servings: int
    description: str
    image_url: str
    ingredients: list[RecipeIngredientOut]
    steps: list[RecipeStepOut]
    match_count: int = 0
    missing_count: int = 0
    missing_ingredients: list[str] = []
    expiring_used: list[str] = []
    score: float = 0
    favorite: bool = False

    model_config = {"from_attributes": True}


class ShoppingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(default=1, gt=0, le=10000)
    unit: str = Field(default="", max_length=40)
    recipe_name: str = Field(default="", max_length=160)


class ShoppingGenerate(BaseModel):
    recipe_id: int
    servings: int = Field(default=2, ge=1, le=20)


class ShoppingUpdate(BaseModel):
    quantity: float | None = Field(default=None, gt=0, le=10000)
    purchased: bool | None = None


class ShoppingOut(BaseModel):
    id: int
    name: str
    quantity: float
    unit: str
    recipe_name: str
    purchased: bool

    model_config = {"from_attributes": True}


class HistoryCreate(BaseModel):
    recipe_id: int
    servings: int = Field(default=2, ge=1, le=20)


class HistoryOut(BaseModel):
    id: int
    recipe_id: int
    recipe_name: str
    cooked_at: datetime
    servings: int


class MessageOut(BaseModel):
    message: str
