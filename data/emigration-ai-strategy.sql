-- emigration-ai-strategy.sql
--
-- One extra city strategy for the AI: "keep them happy", a gentler and earlier copy of the game's own
-- CITY_STRATEGY_STAY_HAPPY. The base strategy switches on only once a city's net happiness is below zero and
-- then biases the city toward Happiness at weight 100. Under Emigration a city starts losing people while its
-- happiness is still positive, so the AI's own defence comes too late. This one switches on while the city's
-- net happiness is still a little above zero (HasHappinessLessThan 5) and pushes at 40, so an AI city that is
-- merely getting unhappy starts a happiness building sooner, while a city in real trouble still gets the base
-- strategy's full push. Every row selects through its parent table, so a renamed parent skips the row instead
-- of failing game creation (the repo's any-DLC rule).

INSERT OR IGNORE INTO AiListTypes (ListType)
  VALUES ('EmigKeepThemHappyBias');

INSERT OR IGNORE INTO AiLists (ListType, System)
  SELECT 'EmigKeepThemHappyBias', 'YieldBiases'
  FROM AiListTypes WHERE ListType = 'EmigKeepThemHappyBias';

INSERT OR IGNORE INTO AiFavoredItems (ListType, Item, Favored, Value)
  SELECT 'EmigKeepThemHappyBias', 'YIELD_HAPPINESS', 1, 40
  FROM AiListTypes WHERE ListType = 'EmigKeepThemHappyBias';

INSERT OR IGNORE INTO Strategies (StrategyType, CityStrategy, MaxNumConditionsNeeded, MinConditionPercentage, MinNumConditionsNeeded)
  VALUES ('CITY_STRATEGY_EMIG_KEEP_THEM_HAPPY', 1, 1, 25, 1);

INSERT OR IGNORE INTO StrategyConditions (ConditionFunction, Exclusive, StrategyType, Disqualifier, Forbidden, ThresholdValue)
  SELECT 'HasHappinessLessThan', 0, StrategyType, 0, 0, 5
  FROM Strategies WHERE StrategyType = 'CITY_STRATEGY_EMIG_KEEP_THEM_HAPPY';

INSERT OR IGNORE INTO Strategy_Priorities (ListType, StrategyType)
  SELECT l.ListType, s.StrategyType
  FROM AiListTypes l, Strategies s
  WHERE l.ListType = 'EmigKeepThemHappyBias' AND s.StrategyType = 'CITY_STRATEGY_EMIG_KEEP_THEM_HAPPY';

-- "Hold your people": a city strategy for an established settlement whose Food has stalled, the game's nearest
-- condition to a settlement losing people. It biases Production and Happiness, the yields the Anti-Immigration
-- Stance and the happiness buildings carry, so the planner values keeping people more while a city shrinks. The
-- AI data has no condition that reads population loss itself (2026-10-25: HasFoodLessThan, HasHappinessLessThan,
-- HasRuralPopGreaterThan and YieldIncome are the city-shaped ones). HasFoodLessThan reads gross Food: the game's
-- own Early Food strategy uses it at 10 and 15, and the first threshold here (2) never fired in 138 turns
-- (2026-10-26, Logs/AI_CityStrategy.csv). The 2026-10-26 Exploration read: AI towns stuck at 8 or 9 population for
-- a hundred turns read 13 to 20 Food while growing settlements read 30 to 89, and brand-new towns of 2 or 3
-- population read 7 to 13 while growing. So: Food under 16 AND rural population over 4 (both conditions
-- needed), which takes the stalled towns and leaves the new ones alone.

INSERT OR IGNORE INTO AiListTypes (ListType)
  VALUES ('EmigHoldPeopleBias');

INSERT OR IGNORE INTO AiLists (ListType, System)
  SELECT 'EmigHoldPeopleBias', 'YieldBiases'
  FROM AiListTypes WHERE ListType = 'EmigHoldPeopleBias';

INSERT OR IGNORE INTO AiFavoredItems (ListType, Item, Favored, Value)
  SELECT 'EmigHoldPeopleBias', 'YIELD_PRODUCTION', 1, 25
  FROM AiListTypes WHERE ListType = 'EmigHoldPeopleBias';

INSERT OR IGNORE INTO AiFavoredItems (ListType, Item, Favored, Value)
  SELECT 'EmigHoldPeopleBias', 'YIELD_HAPPINESS', 1, 25
  FROM AiListTypes WHERE ListType = 'EmigHoldPeopleBias';

INSERT OR IGNORE INTO Strategies (StrategyType, CityStrategy, MaxNumConditionsNeeded, MinConditionPercentage, MinNumConditionsNeeded)
  VALUES ('CITY_STRATEGY_EMIG_HOLD_PEOPLE', 1, 2, 25, 2);

INSERT OR IGNORE INTO StrategyConditions (ConditionFunction, Exclusive, StrategyType, Disqualifier, Forbidden, ThresholdValue)
  SELECT 'HasFoodLessThan', 0, StrategyType, 0, 0, 16
  FROM Strategies WHERE StrategyType = 'CITY_STRATEGY_EMIG_HOLD_PEOPLE';

INSERT OR IGNORE INTO StrategyConditions (ConditionFunction, Exclusive, StrategyType, Disqualifier, Forbidden, ThresholdValue)
  SELECT 'HasRuralPopGreaterThan', 0, StrategyType, 0, 0, 4
  FROM Strategies WHERE StrategyType = 'CITY_STRATEGY_EMIG_HOLD_PEOPLE';

INSERT OR IGNORE INTO Strategy_Priorities (ListType, StrategyType)
  SELECT l.ListType, s.StrategyType
  FROM AiListTypes l, Strategies s
  WHERE l.ListType = 'EmigHoldPeopleBias' AND s.StrategyType = 'CITY_STRATEGY_EMIG_HOLD_PEOPLE';

