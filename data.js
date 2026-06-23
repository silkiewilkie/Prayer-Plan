/* =============================================================================
 * DEFAULT PRAYER PLAN TEMPLATE
 * =============================================================================
 *
 * This is the BLANK starting point new users see — no personal content.
 * The banks and Supplication list are intentionally empty; each person builds
 * their own from the bank tabs (or imports a plan from Settings → Import).
 *
 * The Attributes of God reference below is general (not personal) and is kept
 * as a helpful shared default.
 *
 * On first run the app copies this into an editable, per-user store; after that
 * the user owns and edits their own copy.
 * ============================================================================= */

const PRAYER_PLAN = {

  // How many items to draw from each bank per day.
  dailyCounts: {
    adoration: 1,
    confession: 2,
    thanksgiving: 1
  },

  // Empty by default — build these in the Adoration / Confession / Thanksgiving tabs.
  banks: {
    adoration: [],
    confession: [],
    thanksgiving: []
  },

  // Empty by default — add the people/areas you pray for in the Supplication tab.
  supplication: {
    subjects: []
  },

  /* ===========================================================================
   * ATTRIBUTES OF GOD — general reference shown under the "Attributes" tab.
   * ========================================================================= */
  attributes: [
    { name: "Attentive", definition: "God hears and responds to the needs of his children." },
    { name: "Compassionate", definition: "God cares for his children and acts on their behalf." },
    { name: "Creator", definition: "God made everything. He is uncreated." },
    { name: "Deliverer", definition: "God rescues and saves his children." },
    { name: "Eternal", definition: "God is not limited by and exists outside of time." },
    { name: "Faithful", definition: "God always keeps his promises." },
    { name: "Generous", definition: "God gives what is best and beyond what is deserved." },
    { name: "Glorious", definition: "God displays his greatness and worth." },
    { name: "Good", definition: "God is what is best and gives what is best." },
    { name: "Holy", definition: "God is perfect, pure, and without sin." },
    { name: "Immutable/Unchanging", definition: "God never changes. He is the same yesterday, today, and tomorrow." },
    { name: "Incomprehensible", definition: "God is beyond our understanding. We can comprehend him in part but not in whole." },
    { name: "Infinite", definition: "God has no limits in his person or on his power." },
    { name: "Jealous", definition: "God will not share his glory with another. All glory rightfully belongs to him." },
    { name: "Just", definition: "God is fair in all his actions and judgments. He cannot overpunish or underpunish." },
    { name: "Loving", definition: "God feels and displays infinite, unconditional affection toward his children. His love for them does not depend on their worth, their response, or their merit." },
    { name: "Merciful", definition: "God does not give his children the punishment they deserve." },
    { name: "Omnipotent/Almighty", definition: "God holds all power. Nothing is too hard for God. What he wills he can accomplish." },
    { name: "Omnipresent", definition: "God is fully present everywhere." },
    { name: "Omniscient", definition: "God knows everything past, present, and future, all potential and real outcomes, all things micro and macro." },
    { name: "Patient/Long-Suffering", definition: "God is untiring and bears with his children." },
    { name: "Provider", definition: "God meets the needs of his children." },
    { name: "Refuge", definition: "God is a place of safety and protection for his children." },
    { name: "Righteous", definition: "God is always good and right." },
    { name: "Self-Existent", definition: "God depends on nothing and no one to give him life or existence." },
    { name: "Sovereign", definition: "God does everything according to his plan and pleasure. He controls all things." },
    { name: "Transcendent", definition: "God is not like humans. He is infinitely higher in being and action." },
    { name: "Truthful", definition: "Whatever God speaks or does is truth and reality." },
    { name: "Wise", definition: "God knows what is best and acts accordingly. He cannot choose wrongly." },
    { name: "Worthy", definition: "God deserves all glory and honor and praise." },
    { name: "Wrathful", definition: "God hates all unrighteousness." }
  ]
};
