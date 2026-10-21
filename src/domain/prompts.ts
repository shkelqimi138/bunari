// Prompt categories, prompt types, and the built-in prompt library
export type PromptCategoryId =
  'gratitude' | 'reflection' | 'creativity' | 'fitness' | 'mindfulness' | 'fun' | 'year-ahead' | 'love';

export type PromptCategory = {
  description: string;
  icon: 'heart' | 'sun' | 'lightbulb' | 'activity' | 'clock' | 'smile' | 'calendar' | 'sparkles';
  id: PromptCategoryId;
  name: string;
};

export type JournalPrompt = {
  categoryId: PromptCategoryId;
  id: string;
  minutes: number;
  text: string;
};

export const promptCategories: PromptCategory[] = [
  { id: 'gratitude', name: 'Gratitude', description: "Notice what's already good.", icon: 'heart' },
  { id: 'reflection', name: 'Reflection', description: 'Look back to see forward.', icon: 'sun' },
  { id: 'creativity', name: 'Creativity', description: 'Follow an odd thread.', icon: 'lightbulb' },
  { id: 'fitness', name: 'Fitness', description: 'Check in with the body.', icon: 'activity' },
  { id: 'mindfulness', name: 'Mindfulness', description: 'Arrive where you are.', icon: 'clock' },
  { id: 'fun', name: 'Fun', description: "Don't overthink it.", icon: 'smile' },
  { id: 'year-ahead', name: 'The Year Ahead', description: 'Set an intention.', icon: 'calendar' },
  { id: 'love', name: 'Love', description: 'The people who stay.', icon: 'sparkles' },
];

export const journalPrompts: JournalPrompt[] = [
  {
    id: 'gratitude-enough',
    categoryId: 'gratitude',
    minutes: 2,
    text: "What's one small thing that felt like enough today?",
  },
  {
    id: 'gratitude-noticed',
    categoryId: 'gratitude',
    minutes: 3,
    text: 'What did you notice today that you usually overlook?',
  },
  { id: 'gratitude-person', categoryId: 'gratitude', minutes: 4, text: 'Who made today lighter, and how?' },
  { id: 'gratitude-place', categoryId: 'gratitude', minutes: 3, text: 'Which place made you feel at ease today?' },
  { id: 'gratitude-easy', categoryId: 'gratitude', minutes: 3, text: "What came easily today that you're glad about?" },
  {
    id: 'gratitude-body',
    categoryId: 'gratitude',
    minutes: 3,
    text: 'What is your body quietly doing for you right now?',
  },
  {
    id: 'gratitude-message',
    categoryId: 'gratitude',
    minutes: 3,
    text: 'Which message or call did you enjoy receiving lately?',
  },
  { id: 'gratitude-comfort', categoryId: 'gratitude', minutes: 3, text: 'What small comfort do you return to often?' },
  {
    id: 'gratitude-past-self',
    categoryId: 'gratitude',
    minutes: 4,
    text: 'What did your past self do that helps you today?',
  },
  { id: 'gratitude-free', categoryId: 'gratitude', minutes: 2, text: 'What good thing today cost nothing?' },
  { id: 'reflection-learned', categoryId: 'reflection', minutes: 5, text: 'What did today teach you about yourself?' },
  { id: 'reflection-release', categoryId: 'reflection', minutes: 4, text: 'What are you ready to stop carrying?' },
  { id: 'reflection-choice', categoryId: 'reflection', minutes: 5, text: 'Which recent choice still feels right?' },
  {
    id: 'reflection-repeat',
    categoryId: 'reflection',
    minutes: 3,
    text: 'What would you gladly repeat from this week?',
  },
  { id: 'reflection-surprise', categoryId: 'reflection', minutes: 3, text: 'What surprised you this week?' },
  {
    id: 'reflection-yourself',
    categoryId: 'reflection',
    minutes: 4,
    text: 'When did you feel most like yourself lately?',
  },
  {
    id: 'reflection-change',
    categoryId: 'reflection',
    minutes: 6,
    text: 'What has changed in you over the last year?',
  },
  {
    id: 'reflection-advice',
    categoryId: 'reflection',
    minutes: 5,
    text: 'What advice would you give yourself from a month ago?',
  },
  {
    id: 'reflection-putting-off',
    categoryId: 'reflection',
    minutes: 5,
    text: 'What have you been putting off, and why?',
  },
  { id: 'reflection-proud', categoryId: 'reflection', minutes: 3, text: 'What are you quietly proud of right now?' },
  {
    id: 'creativity-color',
    categoryId: 'creativity',
    minutes: 4,
    text: 'If today had a color, what would it be and why?',
  },
  {
    id: 'creativity-door',
    categoryId: 'creativity',
    minutes: 6,
    text: 'Describe a door that opens somewhere impossible.',
  },
  {
    id: 'creativity-rule',
    categoryId: 'creativity',
    minutes: 5,
    text: 'Invent one rule that would make tomorrow more interesting.',
  },
  {
    id: 'creativity-detail',
    categoryId: 'creativity',
    minutes: 3,
    text: 'Write about an ordinary object as if it were rare.',
  },
  {
    id: 'creativity-window',
    categoryId: 'creativity',
    minutes: 5,
    text: 'Describe the view from a window you remember well.',
  },
  { id: 'creativity-mug', categoryId: 'creativity', minutes: 4, text: 'Write a short letter from your favorite mug.' },
  { id: 'creativity-six-words', categoryId: 'creativity', minutes: 2, text: 'Tell the story of today in six words.' },
  {
    id: 'creativity-map',
    categoryId: 'creativity',
    minutes: 6,
    text: 'Draw a map, in words, of a place only you know.',
  },
  { id: 'creativity-stranger', categoryId: 'creativity', minutes: 5, text: 'Invent a life for someone you saw today.' },
  {
    id: 'creativity-weather',
    categoryId: 'creativity',
    minutes: 3,
    text: 'If your mood were weather, what is the forecast?',
  },
  { id: 'fitness-body', categoryId: 'fitness', minutes: 3, text: 'Where does your body feel strongest today?' },
  { id: 'fitness-energy', categoryId: 'fitness', minutes: 4, text: 'What gave you energy, and what took it away?' },
  { id: 'fitness-progress', categoryId: 'fitness', minutes: 4, text: 'What quiet progress did you make this week?' },
  {
    id: 'fitness-kindness',
    categoryId: 'fitness',
    minutes: 3,
    text: 'What would moving with kindness look like tomorrow?',
  },
  {
    id: 'fitness-sleep',
    categoryId: 'fitness',
    minutes: 3,
    text: 'How did you sleep, and what helped or got in the way?',
  },
  { id: 'fitness-walk', categoryId: 'fitness', minutes: 2, text: 'Where would you like to walk this week?' },
  { id: 'fitness-rest', categoryId: 'fitness', minutes: 4, text: 'What does real rest look like for you?' },
  {
    id: 'fitness-habit',
    categoryId: 'fitness',
    minutes: 3,
    text: 'What is one easy habit your body would thank you for?',
  },
  {
    id: 'fitness-best-moment',
    categoryId: 'fitness',
    minutes: 3,
    text: 'What was the best moment of your last workout?',
  },
  {
    id: 'fitness-goal',
    categoryId: 'fitness',
    minutes: 4,
    text: 'What small goal would feel good to reach this month?',
  },
  {
    id: 'mindfulness-senses',
    categoryId: 'mindfulness',
    minutes: 3,
    text: 'What can you hear, feel, and see right now?',
  },
  {
    id: 'mindfulness-pause',
    categoryId: 'mindfulness',
    minutes: 2,
    text: 'Where could you make one small pause tomorrow?',
  },
  { id: 'mindfulness-present', categoryId: 'mindfulness', minutes: 4, text: 'When did you feel fully present today?' },
  {
    id: 'mindfulness-breath',
    categoryId: 'mindfulness',
    minutes: 2,
    text: 'What changes when you slow your breathing?',
  },
  {
    id: 'mindfulness-let-be',
    categoryId: 'mindfulness',
    minutes: 3,
    text: 'What is one thing you can let be as it is today?',
  },
  { id: 'mindfulness-thought', categoryId: 'mindfulness', minutes: 4, text: 'Which thought kept coming back today?' },
  {
    id: 'mindfulness-slowly',
    categoryId: 'mindfulness',
    minutes: 3,
    text: 'What did you do slowly today, on purpose?',
  },
  {
    id: 'mindfulness-five-things',
    categoryId: 'mindfulness',
    minutes: 2,
    text: 'Name five things around you that you like.',
  },
  {
    id: 'mindfulness-worry',
    categoryId: 'mindfulness',
    minutes: 5,
    text: 'Write down a worry, then one thing you can actually do about it.',
  },
  {
    id: 'mindfulness-leave-behind',
    categoryId: 'mindfulness',
    minutes: 3,
    text: 'What can you leave behind before you sleep tonight?',
  },
  { id: 'fun-laugh', categoryId: 'fun', minutes: 3, text: 'What made you laugh recently?' },
  { id: 'fun-perfect-day', categoryId: 'fun', minutes: 5, text: 'Design a delightfully unproductive day.' },
  { id: 'fun-soundtrack', categoryId: 'fun', minutes: 4, text: 'Which song belongs in today’s closing credits?' },
  { id: 'fun-superpower', categoryId: 'fun', minutes: 4, text: 'Which useless superpower would you choose?' },
  { id: 'fun-food', categoryId: 'fun', minutes: 3, text: 'Describe the best thing you ate recently.' },
  { id: 'fun-trip', categoryId: 'fun', minutes: 5, text: 'Plan an imaginary weekend trip with no budget.' },
  { id: 'fun-childhood-game', categoryId: 'fun', minutes: 4, text: 'What game did you love as a child?' },
  { id: 'fun-award', categoryId: 'fun', minutes: 3, text: 'Give yourself a silly award for this week.' },
  {
    id: 'fun-dinner',
    categoryId: 'fun',
    minutes: 5,
    text: 'Which three people, from any time, would you invite to dinner?',
  },
  { id: 'fun-tiny-joy', categoryId: 'fun', minutes: 2, text: 'What tiny thing made you happy for no reason?' },
  { id: 'year-intention', categoryId: 'year-ahead', minutes: 5, text: 'How do you want the next season to feel?' },
  { id: 'year-courage', categoryId: 'year-ahead', minutes: 6, text: 'What would you try if courage came first?' },
  { id: 'year-space', categoryId: 'year-ahead', minutes: 4, text: 'What deserves more space in your days?' },
  { id: 'year-letter', categoryId: 'year-ahead', minutes: 7, text: 'Write one promise to your future self.' },
  { id: 'year-learn', categoryId: 'year-ahead', minutes: 4, text: 'What would you like to learn this year?' },
  {
    id: 'year-let-go',
    categoryId: 'year-ahead',
    minutes: 5,
    text: 'What would you like to leave behind in the year before?',
  },
  { id: 'year-habit', categoryId: 'year-ahead', minutes: 4, text: 'Which one habit would change the most for you?' },
  { id: 'year-travel', categoryId: 'year-ahead', minutes: 4, text: 'Where would you like to go, near or far?' },
  { id: 'year-people', categoryId: 'year-ahead', minutes: 4, text: 'Who do you want to spend more time with?' },
  {
    id: 'year-word',
    categoryId: 'year-ahead',
    minutes: 5,
    text: 'Choose one word for the months ahead, and explain it.',
  },
  { id: 'love-seen', categoryId: 'love', minutes: 4, text: 'Who makes you feel most seen?' },
  { id: 'love-language', categoryId: 'love', minutes: 5, text: 'How did someone show care without saying it?' },
  { id: 'love-memory', categoryId: 'love', minutes: 5, text: 'Which shared memory still makes you smile?' },
  { id: 'love-give', categoryId: 'love', minutes: 4, text: 'What kind of care would you like to give more freely?' },
  { id: 'love-thank', categoryId: 'love', minutes: 4, text: "Who do you want to thank but haven't yet?" },
  { id: 'love-kind-to-self', categoryId: 'love', minutes: 4, text: 'How could you be kinder to yourself this week?' },
  {
    id: 'love-friendship',
    categoryId: 'love',
    minutes: 4,
    text: 'Which friendship would you like to look after more?',
  },
  { id: 'love-first-meeting', categoryId: 'love', minutes: 6, text: 'Write about a first meeting you still remember.' },
  {
    id: 'love-small-habit',
    categoryId: 'love',
    minutes: 3,
    text: 'What small habit of someone you love makes you smile?',
  },
  { id: 'love-home', categoryId: 'love', minutes: 4, text: 'Who or what feels like home to you?' },
];

export function getPrompt(promptId: string | undefined) {
  return journalPrompts.find((prompt) => prompt.id === promptId);
}

export function getPromptCategory(categoryId: string | undefined) {
  return promptCategories.find((category) => category.id === categoryId);
}

export function promptsForCategory(categoryId: PromptCategoryId) {
  return journalPrompts.filter((prompt) => prompt.categoryId === categoryId);
}

export function dailyPromptFor(date: Date) {
  const dayKey = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return journalPrompts[Math.abs(dayKey) % journalPrompts.length] ?? journalPrompts[0]!;
}

// Day number in the phone's local calendar, so prompts change at local midnight.
function localDayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

// A small seeded random number generator (mulberry32): the same day always gives the same order.
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function textSeed(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function shuffled<T>(items: T[], seed: number) {
  const random = seededRandom(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

// A category's prompts in an order that changes every day and stays the same all day.
export function promptsForCategoryOn(categoryId: PromptCategoryId, date: Date) {
  return shuffled(promptsForCategory(categoryId), localDayNumber(date) ^ textSeed(categoryId));
}

// Today's picks: a few prompts from different categories, new every day.
export function dailyPicks(date: Date, count = 3) {
  const day = localDayNumber(date);
  return shuffled(promptCategories, day ^ textSeed('daily-picks'))
    .slice(0, count)
    .map((category) => promptsForCategoryOn(category.id, date)[0]!);
}
