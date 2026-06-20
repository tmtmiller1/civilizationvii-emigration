// Ambient declarations for the Civ7 GameFace engine globals the mod reads
// without importing. The engine boundary is untyped, so each is `any`; the
// JSDoc + defensive guards in the code are the real contract. checkJs needs
// these declared so `Game`, `Players`, etc. resolve under strict mode.

declare const Game: any;
declare const GameContext: any;
declare const Players: any;
declare const Configuration: any;
declare const Locale: any;
declare const YieldTypes: any;
declare const Controls: any;
declare const ComponentID: any;
declare const MapConstructibles: any;
declare const Constructibles: any;
declare const Districts: any;
declare const Database: any;
declare const Modding: any;
declare const UI: any;
declare const GameplayMap: any;
declare const GameInfo: any;
declare const DiplomacyPlayerRelationships: any;
declare const Cities: any;
declare const WorldUI: any;
declare const InputActionStatuses: any;

// The engine event bus (engine.on / engine.off / engine.whenReady).
declare const engine: any;

// The mod's own debug handle, attached to globalThis in emigration-main.js.
declare var emigration: any;
