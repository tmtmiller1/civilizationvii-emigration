import assert from "node:assert/strict";

const { civDisplayColor, withAlpha } = await import("/emigration/ui/emigration-civ-colors.js");

function testFallsBackWithoutEngineColorApis() {
  delete globalThis.UI;
  assert.equal(civDisplayColor(1, "#123456"), "#123456");
}

function testPrefersSecondaryWhenPrimaryIsDarkGrey() {
  globalThis.UI = {
    Player: {
      getPrimaryColorValueAsString: () => "#111111",
      getSecondaryColorValueAsString: () => "#ff0000"
    }
  };
  assert.equal(civDisplayColor(7, "#abcdef"), "#ff0000");
}

function testLiftsDarkSaturatedPrimaryToReadableColor() {
  globalThis.UI = {
    Player: {
      getPrimaryColorValueAsString: () => "#0000aa",
      getSecondaryColorValueAsString: () => "#000000"
    }
  };
  const out = civDisplayColor(3, "#abcdef");
  assert.match(out, /^#[0-9a-f]{6}$/i);
  assert.notEqual(out.toLowerCase(), "#0000aa");
}

function testWithAlphaFormatsRgbaAndPassesThroughUnparseable() {
  assert.equal(withAlpha("#112233", 0.4), "rgba(17,34,51,0.4)");
  assert.equal(withAlpha("rgba(7, 8, 9, 0.2)", 0.7), "rgba(7,8,9,0.7)");
  assert.equal(withAlpha("not-a-color", 0.5), "not-a-color");
}

testFallsBackWithoutEngineColorApis();
testPrefersSecondaryWhenPrimaryIsDarkGrey();
testLiftsDarkSaturatedPrimaryToReadableColor();
testWithAlphaFormatsRgbaAndPassesThroughUnparseable();

delete globalThis.UI;
console.log("civ-colors harness passed");
