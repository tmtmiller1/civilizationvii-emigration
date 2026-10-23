-- emigration-setup.sql (shell database)
--
-- One game-setup option, "AI keep-them-happy strategy", on the game setup screen under the game options. The
-- strategy itself is game data (data/emigration-ai-strategy.sql) compiled into the gameplay database at game
-- creation, which an Options setting can't switch; this parameter is the switch the engine offers. The game
-- action group "emigration-ai-strategy" in emigration.modinfo loads the rows only while the value is
-- EMIG_AI_STRATEGY_ON. On by default; chosen at game creation and fixed for that game.

INSERT OR IGNORE INTO Parameters
    (ParameterID, Name, Description, Domain, Hash, DefaultValue, ConfigurationGroup, ConfigurationKey, GroupId, ChangeableAfterGameStart, SortIndex)
VALUES
    ('EMIG-AiStrategy', 'LOC_EMIG_SETUP_AI_STRATEGY', 'LOC_EMIG_SETUP_AI_STRATEGY_DESC', 'EMIG-AiStrategy', 0, 'EMIG_AI_STRATEGY_ON', 'Game', 'EMIG-AiStrategy', 'GameOptions', 0, 146);

INSERT OR IGNORE INTO DomainValues
    (Domain, Value, Name, Description, SortIndex)
VALUES
    ('EMIG-AiStrategy', 'EMIG_AI_STRATEGY_ON', 'LOC_EMIG_SETUP_AI_STRATEGY_ON', 'LOC_EMIG_SETUP_AI_STRATEGY_ON_DESC', 10),
    ('EMIG-AiStrategy', 'EMIG_AI_STRATEGY_OFF', 'LOC_EMIG_SETUP_AI_STRATEGY_OFF', 'LOC_EMIG_SETUP_AI_STRATEGY_OFF_DESC', 20);
