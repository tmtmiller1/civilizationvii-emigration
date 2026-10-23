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
