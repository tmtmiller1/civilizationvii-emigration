-- emigration-relief.sql: fewer people, less strain (ui/emigration-relief.js).
--
-- Ten hidden buildings for a settlement's center, BUILDING_EMIG_RELIEF_1 to _10, each adding that much Happiness to
-- its settlement through the game's own city yield, under the tooltip line "People who left". The script places the
-- one that matches how many people have left the settlement over unhappiness since it was last that size, and swaps
-- it as the count changes. Free, no population, only in an existing city center, never built or bought: they belong
-- to a trait nobody has. One copy of a building type lands per city, so the count needs a type per tier (probe,
-- docs/emigration-roadmap-and-backlog.md section 67). Every row names only this file's own types and base-game ones.

INSERT INTO Types (Type, Kind) VALUES ('TRAIT_EMIG_RELIEF_NONE', 'KIND_TRAIT');
INSERT INTO Traits (TraitType, InternalOnly) VALUES ('TRAIT_EMIG_RELIEF_NONE', 1);

WITH RECURSIVE tier(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM tier WHERE n < 10)
INSERT INTO Types (Type, Kind) SELECT 'BUILDING_EMIG_RELIEF_' || n, 'KIND_CONSTRUCTIBLE' FROM tier;

INSERT INTO Constructibles (ConstructibleType, Name, Description, Tooltip, ConstructibleClass, Cost, Population,
  ExistingDistrictOnly, CanBeHidden, ImmuneDamage, Repairable, RequiresUnlock)
SELECT Type, 'LOC_BUILDING_EMIG_RELIEF_NAME', 'LOC_BUILDING_EMIG_RELIEF_DESCRIPTION', 'LOC_BUILDING_EMIG_RELIEF_TOOLTIP',
  'BUILDING', 1, 0, 1, 1, 1, 0, 1
FROM Types WHERE Type LIKE 'BUILDING_EMIG_RELIEF_%';

INSERT INTO Buildings (ConstructibleType, Movable, Purchasable, Town, TraitType)
SELECT ConstructibleType, 0, 0, 1, 'TRAIT_EMIG_RELIEF_NONE' FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';
INSERT INTO TypeTags (Type, Tag)
SELECT ConstructibleType, 'IGNORE_DISTRICT_PLACEMENT_CAP' FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';
INSERT INTO Constructible_ValidDistricts (ConstructibleType, DistrictType)
SELECT ConstructibleType, 'DISTRICT_CITY_CENTER' FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';

-- The modifier type: a yield on the building's own city.
INSERT INTO Types (Type, Kind) VALUES ('MODIFIER_EMIG_RELIEF_CITY_YIELD', 'KIND_MODIFIER');
INSERT INTO DynamicModifiers (ModifierType, CollectionType, EffectType)
VALUES ('MODIFIER_EMIG_RELIEF_CITY_YIELD', 'COLLECTION_OWNER', 'EFFECT_CITY_ADJUST_YIELD');

-- Per tier: n Happiness.
INSERT INTO Modifiers (ModifierId, ModifierType)
SELECT 'MOD_EMIG_RELIEF_' || substr(ConstructibleType, 22), 'MODIFIER_EMIG_RELIEF_CITY_YIELD'
FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';
INSERT INTO ModifierArguments (ModifierId, Name, Value)
SELECT 'MOD_EMIG_RELIEF_' || substr(ConstructibleType, 22), 'YieldType', 'YIELD_HAPPINESS'
FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';
INSERT INTO ModifierArguments (ModifierId, Name, Value)
SELECT 'MOD_EMIG_RELIEF_' || substr(ConstructibleType, 22), 'Amount', substr(ConstructibleType, 22)
FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';
INSERT INTO ModifierArguments (ModifierId, Name, Value)
SELECT 'MOD_EMIG_RELIEF_' || substr(ConstructibleType, 22), 'Tooltip', 'LOC_EMIG_RELIEF_LINE'
FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';
INSERT INTO ConstructibleModifiers (ConstructibleType, ModifierId)
SELECT ConstructibleType, 'MOD_EMIG_RELIEF_' || substr(ConstructibleType, 22)
FROM Constructibles WHERE ConstructibleType LIKE 'BUILDING_EMIG_RELIEF_%';
