import { DEMO_BIASES, DEMO_ALSO_SCORING } from './demoData'

/* How many biases get a card in the hero.

   Two, not three. At the hero's panel width (~520px) three cards land at 160px
   each — too narrow to read the reasoning, which is the thing that separates a
   bias from a signal. Two land at ~243px, the width the dashboard uses. */
export const CARDS = 2

/* The hero's compass, from the sample set rather than the engine.

   This hook used to fetch /api/macro-compass, cache it, reconcile it against a
   build-time bake and diff it for changed pairs. All of that existed to put the
   real current biases on a public page — which is exactly what a visitor was
   then getting for free, invalidation levels included. See demoData.js.

   What is left is deliberately synchronous and dependency-free: no request, no
   localStorage, no skeleton, no failure mode. The panel renders the same rows
   on the server and in the browser, which also means the prerendered HTML and
   the first client paint cannot disagree. */
export function useCompassData() {
  return {
    rows: DEMO_BIASES,
    alsoScoring: DEMO_ALSO_SCORING,
    ready: true,
    hasBias: DEMO_BIASES.length > 0,
    changedPairs: [],
  }
}
