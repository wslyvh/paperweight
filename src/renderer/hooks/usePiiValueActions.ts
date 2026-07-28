import { useCallback, useRef, useState } from "react";
import type { PiiRevealedValue, PiiValue } from "@shared/types";

const LOAD_ERROR =
  "Could not load what was found in your emails. Reload the page and try again.";
const REVEAL_ERROR =
  "Could not show the full values. Reload the page and try again.";
const ACTION_ERRORS = {
  confirm:
    "Could not add that value to your profile. Reload the page and try again.",
  suppress: "Could not update that value. Reload the page and try again.",
};

type PiiAction = keyof typeof ACTION_ERRORS;

interface UsePiiValueActionsOptions {
  loadValues: () => Promise<void>;
  revealValues: () => Promise<PiiRevealedValue[]>;
}

export function usePiiValueActions({
  loadValues,
  revealValues,
}: UsePiiValueActionsOptions) {
  const [revealed, setRevealed] = useState<Map<number, string>>();
  const [showValues, setShowValues] = useState(false);
  const showValuesRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const loadRevealed = useCallback(async () => {
    const rows = await revealValues();
    setRevealed(new Map(rows.map((row) => [row.ref, row.value])));
  }, [revealValues]);

  const refreshValues = useCallback(async () => {
    await loadValues();
    if (!showValuesRef.current) return;
    try {
      await loadRevealed();
    } catch (revealError) {
      // The refreshed rows carry new opaque refs. If their full values cannot
      // be fetched, close the reveal state rather than leave an open eye over
      // masked rows.
      showValuesRef.current = false;
      setShowValues(false);
      setRevealed(undefined);
      throw revealError;
    }
  }, [loadRevealed, loadValues]);

  const load = useCallback(async () => {
    const wasShowingValues = showValuesRef.current;
    try {
      await refreshValues();
      setError(undefined);
    } catch (loadError) {
      console.error(loadError);
      setError(
        wasShowingValues
          ? REVEAL_ERROR
          : LOAD_ERROR,
      );
    }
  }, [refreshValues]);

  // A correction or analysis pass can replace opaque refs. When values are
  // visible, rebuild the reveal map with the list instead of treating the old
  // map as the source of truth for whether the toggle is on.
  const reload = refreshValues;

  const toggleReveal = useCallback(async () => {
    setError(undefined);
    if (showValuesRef.current) {
      showValuesRef.current = false;
      setShowValues(false);
      setRevealed(undefined);
      return;
    }
    setBusy(true);
    try {
      await loadRevealed();
      showValuesRef.current = true;
      setShowValues(true);
    } catch (revealError) {
      console.error(revealError);
      setError(REVEAL_ERROR);
    } finally {
      setBusy(false);
    }
  }, [loadRevealed]);

  const runAction = useCallback(
    async (targets: PiiValue[], action: PiiAction) => {
      setBusy(true);
      setError(undefined);
      try {
        for (const value of targets) {
          if (action === "confirm") {
            await window.api.confirmPiiFinding(value.ref);
          } else {
            await window.api.suppressPiiFinding(value.ref);
          }
        }
        await reload();
      } catch (actionError) {
        console.error(actionError);
        setError(ACTION_ERRORS[action]);
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const confirmValues = useCallback(
    (targets: PiiValue[]) => runAction(targets, "confirm"),
    [runAction],
  );
  const suppressValues = useCallback(
    (targets: PiiValue[]) => runAction(targets, "suppress"),
    [runAction],
  );

  const reset = useCallback(() => {
    showValuesRef.current = false;
    setShowValues(false);
    setRevealed(undefined);
    setError(undefined);
  }, []);

  return {
    busy,
    error,
    revealed,
    confirmValues,
    load,
    reset,
    showValues,
    suppressValues,
    toggleReveal,
  };
}
