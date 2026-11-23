import { ChefHat, Hammer, Star, Sun, Shapes, type LucideIcon } from 'lucide-react';

/**
 * How to play, for the Reddit game, in one place. The dialog renders it; the README's "How to play" is kept in step by hand.
 * Short lines, one idea each. Every symbol named here means one thing everywhere in the game.
 */
export type HelpSection = { id: string; title: string; Icon: LucideIcon; lines: string[] };

export const ONE_LINE = 'Run the pass of a rooftop restaurant: cook the orders, earn up to three stars, come back for tomorrow’s headline.';

export const HELP: HelpSection[] = [
  { id: 'day', title: 'Your day', Icon: Sun, lines: [
    'Every day has a headline that changes the night: rain, a critic, payday and more.',
    'Set up your restaurant, then tap Open to run one short service: Lunch (1 minute) or Dinner (2½ minutes).',
    'You can play again. Only your best result of the day counts.',
  ] },
  { id: 'night', title: 'The night: five jobs at the pass', Icon: ChefHat, lines: [
    'Seat: a party waits at the door. Tap a table. A ✦ table has decor nearby and tips more.',
    'Order: take their order.',
    'Cook: tap Cook. Tap Flip, Stir or Toss when the marker is in the box, then Plate it in the green.',
    'Serve: carry the dish out.',
    'Clear: wipe the table so the next party can sit.',
    'Your team does any job you leave, a few seconds later. Quick moves build your ⚡ Combo, which raises tips.',
    'Rush moves an order to the front. Free meal keeps a guest who is about to walk out (two a night).',
  ] },
  { id: 'stars', title: 'Three stars a night', Icon: Star, lines: [
    '★ 1: tonight’s goal, shown at the top of the screen.',
    '★ 2: two of the three daily challenges (dinner).',
    '★ 3: a better night than your last one.',
    'Lunch has its own three: serve 5 in profit, a rating of 4.0, a ×4 combo.',
    'A star a day grows your 🔥 streak. Every 7 days you earn a freeze that covers one missed day.',
  ] },
  { id: 'between', title: 'Between nights', Icon: Hammer, lines: [
    'Build: tables, decor and kitchen equipment. New equipment opens new dishes.',
    'Menu: switch dishes on and set prices. Far above the fair price, guests walk away.',
    'Team: hire and train chefs and servers.',
    'Garden: grow ingredients on real timers. Dishes made from them cost nothing and tip more.',
    'Wages and rent are paid at closing. Night after night at a loss, the bank takes a few pieces into storage. It never takes the restaurant.',
  ] },
  { id: 'symbols', title: 'What the symbols mean', Icon: Shapes, lines: [
    '★ Stars: the night’s score, up to three.',
    '👍 Reputation, out of 5: how often guests come.',
    '🔥 Streak: days in a row with at least one star.',
    '⚡ Combo: quick moves in a row. It raises tips.',
    '👑 VIP: an important guest. Some challenges count them.',
    '✦ Cosy table: decor within two tiles. It tips more.',
    'The bar over a guest is their patience: teal is fine, gold is getting impatient, red is about to leave.',
  ] },
];
