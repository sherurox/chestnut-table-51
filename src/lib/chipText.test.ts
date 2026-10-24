import { describe, expect, it } from "vitest";
import { chipStepError } from "../domain/chips.js";
import { MemoryStore } from "../storage/__test__/memoryStore.js";
import { CHIP_MODE_KEY, readChipMode, saveChipMode } from "./chipMode.js";
import { boxCantMakeText, boxLine, chipList, colorDifferenceText, colorHint, suggestionText } from "./chipText.js";

describe("chip mode words", () => {
  it("suggestion card and box line", () => {
    expect(suggestionText("Andhar", [10, 10, 10, 5, 4])).toBe("Give Andhar: 10 white · 10 red · 10 green · 5 blue · 4 black");
    expect(suggestionText("Andhar", [20, 0, 0, 8, 4])).toBe("Give Andhar: 20 white · 8 blue · 4 black");
    expect(chipList([0, 0, 0, 0, 0])).toBe("none");
    expect(boxLine([60, 10, 0, 25, 30])).toBe("Box: 60 white · 10 red · 0 green · 25 blue · 30 black");
    expect(boxCantMakeText(1500, "notEnough")).toBe("The box can't make $1,500 from what's left; hand out what you can and note it");
    expect(boxCantMakeText(9000, "overBox")).toBe("The box can't make $9,000 from what's left; hand out what you can and note it");
  });

  it("per-colour hint lines", () => {
    expect(colorDifferenceText({ color: "black", difference: 2 })).toBe("Black: 2 more counted than handed out");
    expect(colorDifferenceText({ color: "white", difference: -3 })).toBe("White: 3 fewer counted than handed out");
    const hint = colorHint([{ color: "black", difference: 2 }], [{ player: "a", amount: 1500 }], () => "Andhar");
    expect(hint).toEqual({ lines: ["Black: 2 more counted than handed out", "Box couldn't make $1,500 for Andhar"], matches: false });
    expect(colorHint([], [], () => "").matches).toBe(true);
  });

  it("buy-ins must be multiples of $5 (live custom buy-ins, Edit game, presets)", () => {
    expect(chipStepError(1000)).toBeNull();
    expect(chipStepError(1505)).toBeNull();
    expect(chipStepError(1003)).toBe("Use a multiple of $5.");
    expect(chipStepError(1)).toBe("Use a multiple of $5.");
  });

  it("Chip mode is On by default, per device", () => {
    const store = new MemoryStore();
    expect(readChipMode(store)).toBe(true);
    saveChipMode(false, store);
    expect(store.getItem(CHIP_MODE_KEY)).toBe("off");
    expect(readChipMode(store)).toBe(false);
    saveChipMode(true, store);
    expect(readChipMode(store)).toBe(true);
    expect(readChipMode(null)).toBe(true);
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
    };
    expect(readChipMode(blocked)).toBe(true);
  });
});
