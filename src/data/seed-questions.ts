export type SeedQuestion = {
  id: string;
  text: string;
  order: number;
  imageIds: string[];
};

/** The first set asked people who went to the clubs. Those rows are removed once. */
export const RETIRED_QUESTION_IDS = [
  "q01",
  "q02",
  "q03",
  "q04",
  "q05",
  "q06",
  "q07",
  "q08",
  "q09",
  "q10",
  "q11",
  "q12",
  "q13",
  "q14",
  "q15",
  "q16",
  "q17",
  "q18",
  "q19",
  "q20",
];

/** Questions for musicians who worked the clubs, not for the people in the seats. */
export const SEED_QUESTIONS: SeedQuestion[] = [
  {
    id: "play01",
    order: 1,
    imageIds: [],
    text: "Tell me, in the order they happened, the bands you were in, and who was in each one.",
  },
  {
    id: "play02",
    order: 2,
    imageIds: [],
    text: "How did the gigs come about? Who booked you, and how did a date at a club get fixed?",
  },
  {
    id: "play03",
    order: 3,
    imageIds: [],
    text: "Tell me about the gigs. Pick one you remember, say where it was, and what you played.",
  },
  {
    id: "play04",
    order: 4,
    imageIds: [],
    text: "Tell me about one of the strangest gigs you played. What happened?",
  },
  {
    id: "play05",
    order: 5,
    imageIds: [],
    text: "Tell me about the different line-ups. Who joined, who left, and what changed?",
  },
  {
    id: "play06",
    order: 6,
    imageIds: [],
    text: "Tell me about the stage gear and the equipment. What did you use, and how did it travel?",
  },
  {
    id: "play07",
    order: 7,
    imageIds: [],
    text: "Talk me through arriving at a club: getting the gear in, setting up, and waiting to go on.",
  },
  {
    id: "play08",
    order: 8,
    imageIds: [],
    text: "From the stage, what was the concert room like? Where did you stand, and what could you see?",
  },
  {
    id: "play09",
    order: 9,
    imageIds: [],
    text: "What did a night's work look like, from the first number to packing up?",
  },
  {
    id: "play10",
    order: 10,
    imageIds: [],
    text: "Who else was on with you? Tell me about the other turns, and how the night was shared out.",
  },
  {
    id: "play11",
    order: 11,
    imageIds: [],
    text: "Tell me about a gig that went wrong. What happened, and what did you do?",
  },
  {
    id: "play12",
    order: 12,
    imageIds: [],
    text: "What did the clubs pay, and how was the money split?",
  },
  {
    id: "play13",
    order: 13,
    imageIds: [],
    text: "Which clubs did you play more than once? Name them, and say what each one was like to work.",
  },
  {
    id: "play14",
    order: 14,
    imageIds: [],
    text: "Did you play Jaunty, or another address that has stayed with you? Tell me about working that room.",
  },
  {
    id: "play15",
    order: 15,
    imageIds: [],
    text: "What songs did the rooms expect, and what did the band want to play?",
  },
  {
    id: "play16",
    order: 16,
    imageIds: [],
    text: "Tell me about the people who booked you and ran the night — a concert secretary, a chairman, a steward. What were they like to work for?",
  },
  {
    id: "play17",
    order: 17,
    imageIds: [],
    text: "How did the work change over the years? What faded, and what carried on?",
  },
];
