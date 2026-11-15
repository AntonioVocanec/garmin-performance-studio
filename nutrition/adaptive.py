"""User-authored sports adjustments, deliberately independent of calorie expenditure."""
from decimal import Decimal
from .models import SportsRule
from .repository import DomainError
from .engine import text
from pydantic import Field


class SportsAdjustment(SportsRule):
    expectedVersion: int = Field(ge=0)


def preview(targets,data):
    if targets.get('calories') is None or targets.get('carbs') is None:
        raise DomainError('Najprije postavi osnovni kalorijski i ugljikohidratni cilj.',422)
    return {'calories':text(Decimal(str(targets['calories']))+data.extraCalories),'carbs':text(Decimal(str(targets['carbs']))+data.extraCarbs),
            'basis':'Korisnički zadani dodaci; bez procjene iz Garmin potrošnje.', 'trainingLabel':data.trainingLabel,'durationMinutes':data.durationMinutes}
