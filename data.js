/* =============================================================================
 * PRAYER PLAN CONTENT  —  THIS IS THE ONLY FILE YOU NEED TO EDIT.
 * =============================================================================
 *
 * The app builds each day's plan by drawing from the "banks" below. It shuffles
 * each bank and works through it WITHOUT repeating an item until the whole bank
 * has been used, then reshuffles. Your draw is locked for the day, so reopening
 * the app shows the same plan; a new day draws the next items in the rotation.
 *
 * HOW TO EDIT
 * -----------
 * - Add as many items to each bank as you like — bigger banks = more variety.
 * - Keep text wrapped in "double quotes" and keep the trailing commas.
 * - If a verse contains a " write it as \" (curly quotes “ ” are fine as-is).
 *
 * SHAPES
 * ------
 *   banks.adoration / banks.confession : list of { term, definition, scripture }
 *   banks.thanksgiving                 : list of { title, scriptures: [ {ref,text} ] }
 *   supplication.subjects              : list of { name, requests: [ "...", ... ] }
 *   A scripture is always { ref: "Book 1:1", text: "the verse..." }.
 *
 * HOW MANY PER DAY
 * ----------------
 * dailyCounts controls how many items are drawn from each bank each day.
 * Supplication always shows every subject with one rotating request.
 * ============================================================================= */

const PRAYER_PLAN = {

  // How many items to draw from each bank per day. Tweak freely.
  dailyCounts: {
    adoration: 1,
    confession: 2,
    thanksgiving: 1
  },

  banks: {

    /* ------------------------------------------------------------- ADORATION */
    adoration: [
      { term: "Holy", definition: "exalted or worthy of complete devotion as one perfect in goodness and righteousness; set apart",
        scripture: { ref: "Isaiah 6:3", text: "“Holy, holy, holy is the LORD of hosts; the whole earth is full of His glory!”" } },
      { term: "Wise", definition: "having the power of discerning and judging properly as to what is true or right",
        scripture: { ref: "Job 12:13", text: "With Him are wisdom and might; To Him belong counsel and understanding" } },
      { term: "Sovereign", definition: "possessing supreme or ultimate power",
        scripture: { ref: "Psalm 115:3", text: "Our God is in the heavens; He does all that he pleases." } },
      { term: "Glory", definition: "the splendor, holiness and majesty of God",
        scripture: { ref: "Isaiah 42:8", text: "I am the LORD; that is My name; My glory I give to no other, nor My praise to carved idols." } },
      { term: "Grace", definition: "the free and unmerited favor of God",
        scripture: { ref: "Hebrews 4:16", text: "Let us then with confidence draw near to the throne of grace, that we may receive mercy and find grace to help in time of need." } },
      { term: "Mercy", definition: "compassion or forgiveness shown toward someone whom it is within one's power to punish or harm",
        scripture: { ref: "Lamentations 3:22-23", text: "The steadfast love of the LORD never ceases; his mercies never come to an end; they are new every morning; great is Your faithfulness." } },
      { term: "Justice", definition: "the quality of being fair and reasonable",
        scripture: { ref: "Isaiah 30:18", text: "Therefore the LORD waits to be gracious to you, and therefore He exalts Himself to show mercy to you. For the LORD is a God of justice; blessed are all those who wait for Him." } },
      { term: "Wrath", definition: "extreme anger",
        scripture: { ref: "Romans 1:18", text: "For the wrath of God is revealed from heaven against all ungodliness and unrighteousness of men, who by their unrighteousness suppress the truth." } },
      { term: "Faithful", definition: "remaining loyal and steadfast",
        scripture: { ref: "1 Thessalonians 5:24", text: "He who calls you is faithful; He will surely do it." } }
    ],

    /* ------------------------------------------------------------ CONFESSION */
    confession: [
      { term: "Comfort", definition: "I am not content unless I have free access to a particular pleasure in my life",
        scripture: { ref: "James 1:22", text: "But be doers of the word, and not hearers only, deceiving yourselves." } },
      { term: "Laziness", definition: "characterized by lack of effort or activity",
        scripture: { ref: "Ezra 10:4", text: "Arise, for it is your task, and we are with you: be strong and do it." } },
      { term: "Approval of Man", definition: "a longing to be accepted or desired",
        scripture: { ref: "Proverbs 29:25", text: "The fear of man lays a snare, but whoever trusts in the LORD is safe." } },
      { term: "Fear", definition: "anticipation of the possibility that something unpleasant will occur",
        scripture: { ref: "Psalm 118:6", text: "The LORD is on my side; I will not fear. What can man do to me?" } },
      { term: "Pride", definition: "the quality of having an excessively high opinion of oneself or one's importance",
        scripture: { ref: "Proverbs 26:12", text: "Do you see a man who is wise in his own eyes? There is more hope for a fool than for him." } },
      { term: "Selfish", definition: "lacking consideration for others; concerned chiefly with one's own personal profit or pleasure",
        scripture: { ref: "Philippians 2:3-4", text: "Do nothing from rivalry or conceit, but in humility count others more significant than yourselves. Let each of you look not only to his own interests, but also to the interests of others." } },
      { term: "Worldliness", definition: "concern with material values or ordinary life rather than a spiritual existence",
        scripture: { ref: "Colossians 3:2", text: "Set your minds on things that are above, not on things that are on earth." } },
      { term: "Idolatry", definition: "the worship of someone or something other than God as though it were God",
        scripture: { ref: "Psalm 16:4", text: "The sorrows of those who run after another god shall multiply; their drink offerings of blood I will not pour out or take their names on my lips." } },
      { term: "Impatient", definition: "having or showing a tendency to be quickly irritated or provoked",
        scripture: { ref: "Ephesians 4:2-3", text: "With all humility and gentleness, with patience, bearing with one another in love, eager to maintain the unity of the Spirit in the bond of peace." } },
      { term: "Irritable", definition: "having or showing a tendency to be easily annoyed or made angry",
        scripture: { ref: "James 1:20", text: "For the anger of man does not produce the righteousness of God." } },
      { term: "Lack of Self-Control", definition: "the ability to control oneself, in particular one's emotions and desires or the expression of them in one's behavior, especially in difficult situations",
        scripture: { ref: "Proverbs 25:28", text: "A man without self-control is like a city broken into and left without walls." } },
      { term: "Discontentment", definition: "lack of contentment; dissatisfaction with one's circumstances",
        scripture: { ref: "Hebrews 13:5", text: "Keep your life free from love of money, and be content with what you have, for He has said, “I will never leave you nor forsake you.”" } },
      { term: "Ungrateful", definition: "not feeling or showing gratitude",
        scripture: { ref: "1 Thessalonians 5:16-18", text: "Rejoice always, pray without ceasing, give thanks in all circumstances; for this is the will of God in Christ Jesus for you." } }
    ],

    /* ----------------------------------------------------------- THANKSGIVING */
    thanksgiving: [
      { title: "Salvation", scriptures: [
        { ref: "2 Timothy 1:9", text: "He has saved us and called us to a holy life—not because of anything we have done but because of His own purpose and grace. This grace was given us in Christ Jesus before the beginning of time. (NIV)" },
        { ref: "Titus 3:5", text: "He saved us, not because of works done by us in righteousness, but according to His own mercy, by the washing of regeneration and renewal of the Holy Spirit" }
      ] },
      { title: "Sanctification", scriptures: [
        { ref: "Philippians 1:6", text: "And I am sure of this, that He who began a good work in you will bring it to completion at the day of Jesus Christ." },
        { ref: "1 Peter 1:15", text: "but as He who called you is holy, you also be holy in all your conduct" }
      ] },
      { title: "Provision", scriptures: [
        { ref: "2 Corinthians 9:8", text: "And God is able to make all grace abound to you, so that having all sufficiency in all things at all times, you may abound in every good work." }
      ] },
      { title: "Community", scriptures: [
        { ref: "Hebrews 10:24-25", text: "And let us consider how to stir up one another to love and good works, not neglecting to meet together, as is the habit of some, but encouraging one another, and all the more as you see the Day drawing near." }
      ] },
      { title: "Eternity in Heaven", scriptures: [
        { ref: "Revelation 21:4", text: "He will wipe away every tear from their eyes, and death shall be no more, neither shall there be mourning, nor crying, nor pain anymore, for the former things have passed away." }
      ] },
      { title: "Church", scriptures: [
        { ref: "Ephesians 2:20-22", text: "Built on the foundation of the apostles and prophets, Christ Jesus Himself being the cornerstone, in whom the whole structure, being joined together, grows into a holy temple in the Lord. In Him you also are being built together into a dwelling place for God by the Spirit." }
      ] }
    ]
  },

  /* ----------------------------------------------------------- SUPPLICATION */
  /* Every subject appears each day; one request is drawn from each list,
     rotating through that subject's requests without repeats until exhausted. */
  supplication: {
    subjects: [
      { name: "Taylor", requests: [
        "Lead & Engage Well",
        "Body Image Health",
        "Freedom from Anxiety",
        "Part-time Job She Loves",
        "Spiritual Hunger & Growth",
        "Deep Peace in Midst of Secondary Infertility",
        "Grow in Grace, Mercy, & Forgiveness"
      ] },
      { name: "Willow", requests: [
        "Present & Attentive Father",
        "Salvation; to Know You at a Young Age",
        "Wisdom & Discernment on Discipline & Correcting Bad Behavior",
        "Loving & Forgiving",
        "Life that Honors You"
      ] },
      { name: "KCP", requests: [
        "Session",
        "Deacons",
        "Battle Group",
        "Leadership Groups",
        "Growth & Multiplication"
      ] },
      { name: "Family", requests: [
        "More Children; Healthy Pregnancy & Healthy Baby",
        "Parents: Mom, Dad, & Tracy",
        "Parents: Chip & Rhonda",
        "Siblings: Brothers",
        "Siblings: Sisters"
      ] },
      { name: "Myself", requests: [
        "Die to Self",
        "Spiritual Growth",
        "Humility",
        "Godliness/Freedom from Distraction & Obsession",
        "Patience/Joy",
        "Self-Discipline",
        "Contentment/Gratefulness"
      ] }
    ]
  },

  /* ===========================================================================
   * ATTRIBUTES OF GOD  —  the reference list shown under the "Attributes" tab.
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
