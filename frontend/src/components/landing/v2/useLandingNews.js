import { DEMO_NEWS } from './demoData'

/* How many headlines the wire carries. */
export const NEWS_CARDS = DEMO_NEWS.length

/* The news wire, from the sample set.

   This hook used to fetch /api/news, filter it to macro-relevant stories,
   screen both the publisher's headline and the model's one-line read against a
   banned-terms list, and reconcile a build-time bake with a localStorage cache.
   Every part of that was in service of putting the real scored feed on a public
   page. See demoData.js for why it no longer does.

   Dropping it also drops the failure the strict filter kept producing: on a
   quiet session only two stories passed, which left the wire too short to fill
   its own frame. A fixed sample is always four. */
export function useLandingNews() {
  return { articles: DEMO_NEWS, ready: true }
}

export const timeAgo = () => ''
export const stamp = () => ''
