-- emigration-relief.sql: the old People who left buildings, kept for saves (ui/emigration-relief.js).
--
-- The first 4.0.0 build of 2026-10-27 gave a settlement that lost people over unhappiness the game's own Happiness
-- through these ten hidden city-center buildings, BUILDING_EMIG_RELIEF_1 to _10. The City Details panel lists every
-- constructible, and other rules count buildings, so the relief moved into the mod's own reading of Happiness
-- (roadmap section 72). Nothing places these any more; they stay defined so a save holding one still loads, and the
-- relief pass takes down any still standing. Every row names only this file's own types and base-game ones.

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
