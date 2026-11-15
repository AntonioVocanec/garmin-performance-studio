from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Number = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=3, allow_inf_nan=False)]
Positive = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3, allow_inf_nan=False)]
Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=4, allow_inf_nan=False)]
Meal = Literal['breakfast', 'lunch', 'dinner', 'snack']
Location = Literal['pantry', 'fridge', 'freezer']


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Nutrients(Input):
    kcal: Number | None = None
    protein: Number | None = None
    carbs: Number | None = None
    fat: Number | None = None
    fiber: Number | None = None


class NutrientObservation(Input):
    nutrientId: str = Field(min_length=1, max_length=100)
    value: Annotated[Decimal, Field(ge=0, max_digits=20, decimal_places=9, allow_inf_nan=False)] | None
    unit: str = Field(max_length=30)
    name: str = Field(default='', max_length=200)


class NutritionData(Input):
    schemaVersion: Literal[1] = 1
    basis: Literal['100g'] = '100g'
    carbDefinition: Literal['eu_available', 'total_including_fiber', 'unknown'] = 'unknown'
    energyMethod: Literal['declared', 'usda_1008', 'atwater_general', 'atwater_specific', 'unknown'] = 'unknown'
    originalValues: list[NutrientObservation] = Field(default_factory=list, max_length=500)


class SportsRule(Input):
    trainingLabel: str = Field(min_length=1,max_length=150)
    durationMinutes: int = Field(ge=1,le=1440)
    extraCalories: Number
    extraCarbs: Number


class Profile(Input):
    calories: Positive | None = None
    protein: Positive | None = None
    carbs: Positive | None = None
    fat: Positive | None = None
    restrictions: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=30)
    allergens: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=30)
    excludedFoods: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=30)
    methods: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=20)
    preferFrozen: bool = False
    mealsPerDay: int | None = Field(None, ge=1, le=12)
    prepPortions: int | None = Field(None, ge=1, le=100)
    prepDays: Literal[3, 5, 7] | None = None
    effectiveDate: date
    expectedVersion: int = Field(0, ge=0)
    aiDailyRequests: int = Field(0, ge=0, le=100)
    aiDailyTokens: int = Field(0, ge=0, le=1000000)
    sportsRules: list[SportsRule] = Field(default_factory=list,max_length=30)


class Food(Input):
    name: str = Field(min_length=1, max_length=150)
    state: Literal['raw', 'cooked', 'dry', 'label'] = 'label'
    unit: Literal['g', 'ml', 'piece'] = 'g'
    gramsPerUnit: Positive | None = None
    minimumQuantity: Number = Decimal(0)
    allergens: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=30)
    allergensKnown: bool = False
    dietaryTags: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=30)
    micronutrients: dict[Annotated[str, Field(min_length=1,max_length=80)], 'Micronutrient'] = Field(default_factory=dict,max_length=50)
    nutrients: Nutrients = Field(default_factory=Nutrients)
    source: str = Field(min_length=1, max_length=300)
    sourceId: str | None = Field(None, max_length=150)
    expectedVersion: int = Field(1, ge=1)
    nutritionData: NutritionData | None = None


class Receipt(Input):
    foodId: str
    quantity: Positive
    location: Location
    expiresOn: date | None = None
    cost: Money | None = None
    receivedOn: date | None = None


class LotChange(Input):
    lotId: str
    quantity: Number
    expectedVersion: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=300)
    location: Location | None = None


class Ingredient(Input):
    foodId: str
    quantity: Positive
    optional: bool = False


class Recipe(Input):
    name: str = Field(min_length=1, max_length=150)
    portions: Positive
    minutes: int = Field(ge=0, le=2880)
    method: Literal['instant_pot', 'one_pot', 'oven', 'air_fryer', 'other'] = 'other'
    category: Meal = 'lunch'
    ingredients: list[Ingredient] = Field(min_length=1, max_length=100)
    steps: list[Annotated[str, Field(min_length=1, max_length=2000)]] = Field(min_length=1, max_length=100)
    tags: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=30)
    expectedVersion: int = Field(1, ge=1)


class Scale(Input):
    portions: Positive | None = None
    byInventory: bool = False
    asOf: date


class Cook(Input):
    recipeVersionId: str
    portions: Positive
    cookedMass: Positive | None = None
    location: Location
    expiresOn: date
    asOf: date
    scheduleId: str | None = None
    optionalIngredientPositions: list[Annotated[int, Field(strict=True, ge=0, le=99)]] | None = Field(None, max_length=100)
    previewToken: str | None = Field(None, pattern=r'^[a-f0-9]{64}$')


class PrepSchedule(Input):
    plannedDate: date
    recipeVersionId: str
    portions: Positive


class Log(Input):
    date: date
    meal: Meal
    kind: Literal['food', 'recipe', 'portion']
    sourceId: str
    quantity: Positive
    consumeInventory: bool = False


class Day(Input):
    complete: bool


class Plan(Input):
    date: date
    meal: Meal
    recipeVersionId: str
    portions: Positive
    expectedVersion: int = Field(1, ge=1)
    status: Literal['planned','prepared','consumed','skipped'] = 'planned'


class ShoppingBuild(Input):
    start: date
    end: date
    name: str = Field('Tjedna kupovina', min_length=1, max_length=100)


class ShoppingEdit(Input):
    quantity: Number
    packageSize: Positive | None = None
    checked: bool = False
    expectedVersion: int = Field(ge=1)


class ShoppingManual(Input):
    foodId: str
    quantity: Positive
    packageSize: Positive | None = None


class Purchase(Input):
    itemId: str
    quantity: Positive
    location: Location
    expiresOn: date | None = None
    cost: Money | None = None
    expectedVersion: int = Field(ge=1)
    receivedOn: date | None = None


class AIPreview(Input):
    lotIds: list[str] = Field(min_length=1, max_length=20)


class FoodImport(Input):
    sourceId: int = Field(gt=0)
    state: Literal['raw','cooked','dry','label']
    confirmed: Literal[True]


class AIGenerate(Input):
    previewId: str
    confirmation: Literal[True]


class AIIngredient(Input):
    name: str = Field(min_length=1, max_length=150)
    quantity: Positive


class AIStep(Input):
    action: Literal['chop', 'mix', 'blend', 'heat', 'cook', 'bake', 'cool', 'serve']
    # One-based positions in this proposal's ingredient list, never database IDs.
    ingredientRefs: list[Annotated[int, Field(strict=True, ge=1, le=20)]] = Field(min_length=1, max_length=20)


class AIProposal(Input):
    portions: Positive
    minutes: int = Field(ge=0, le=2880)
    ingredients: list[AIIngredient] = Field(min_length=1, max_length=20)
    steps: list[AIStep] = Field(min_length=1, max_length=15)

    @model_validator(mode='after')
    def check_step_references(self):
        declared = set(range(1, len(self.ingredients) + 1))
        referenced = {ref for step in self.steps for ref in step.ingredientRefs}
        if referenced != declared:
            raise ValueError('Koraci moraju upućivati na sve i samo navedene sastojke.')
        return self


class AIOutput(Input):
    recipes: list[AIProposal] = Field(min_length=2, max_length=3)


class FoodResponse(BaseModel):
    id: str
    name: str
    state: str
    unit: str
    version: int
    gramsPerUnit: Decimal | None
    minimumQuantity: Decimal
    allergens: list[str]
    allergensKnown: bool
    dietaryTags: list[str]
    nutrients: Nutrients
    source: str | None
    sourceId: str | None
    nutritionVersionId: str | None
    retrievedAt: str | None = None
    micronutrients: dict[str, 'Micronutrient'] = Field(default_factory=dict)
    nutritionData: dict
    comparableNutrients: 'CalculatedNutrients'
    carbComparison: str


class CalculatedNutrients(BaseModel):
    kcal: Decimal | None = None
    protein: Decimal | None = None
    carbs: Decimal | None = None
    fat: Decimal | None = None
    fiber: Decimal | None = None


class IngredientSource(BaseModel):
    foodId: str
    foodVersion: int
    nutritionVersionId: str | None
    source: str | None
    sourceId: str | None
    state: str
    nutritionData: dict = Field(default_factory=dict)


class RecipeResponse(BaseModel):
    id: str
    versionId: str
    version: int
    name: str
    portions: Decimal
    minutes: int
    method: str
    category: str
    ingredients: list[Ingredient]
    steps: list[str]
    tags: list[str]
    nutrients: CalculatedNutrients
    perPortion: CalculatedNutrients
    cost: Decimal | None
    costPerPortion: Decimal | None
    nutritionComplete: bool
    priceSources: list[dict[str,str]] = Field(default_factory=list)
    ingredientSources: list[IngredientSource] = Field(default_factory=list)
    comparableNutrients: CalculatedNutrients
    perPortionComparable: CalculatedNutrients
    carbComparison: str


class LotResponse(BaseModel):
    id: str
    food_id: str | None
    batch_id: str | None
    name: str
    quantity: Decimal
    unit: str
    location: str
    expires_on: str | None
    version: int
    cost: Decimal | None
    receivedOn: str | None = None
    availableQuantity: Decimal = Decimal(0)
    expiredQuantity: Decimal = Decimal(0)
    dateKnown: bool = False


class Micronutrient(Input):
    value: Number
    unit: Literal['mg','ug','g','IU']


Food.model_rebuild()
FoodResponse.model_rebuild()
