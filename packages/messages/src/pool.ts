import type { ReminderType, Tone } from "@pandy/shared-types";
import type { Intensity, Message } from "./types.js";

/*
 * The whole message pool, local and typed. No I/O, no network, no generation.
 *
 * Tone rules:
 *   low-key  — plain language, no slang, no emoji. The accessible default for
 *              anyone who finds the other two exhausting.
 *   gen-z    — slang and emoji, warm rather than ironic.
 *   chaotic  — unhinged energy, still kind. Never mean, never at the user's expense.
 *
 * Content rules, enforced by pool.test.ts across every entry:
 *   no guilt, no shame, no medical claims, no streak threats, no "you failed".
 *   Pandy is pleased to see you and has no opinion about your last four hours.
 */

let seq = 0;
const m = (
  type: ReminderType,
  tone: Tone,
  intensity: Intensity,
  text: string,
): Message => ({ id: `${type}.${tone}.${seq++}`, type, tone, intensity, text });

export const MESSAGES: readonly Message[] = [
  // ── water ──────────────────────────────────────────────────────────────
  m("water", "low-key", 1, "A sip of water whenever you get a moment."),
  m("water", "low-key", 1, "Water break, if you'd like one."),
  m("water", "low-key", 2, "Time for a glass of water."),
  m("water", "low-key", 2, "Your water is probably within reach."),
  m("water", "low-key", 2, "Good moment for a drink."),
  m("water", "low-key", 3, "Water. Now is a good time."),
  m("water", "low-key", 1, "Pandy is having some water. Join in?"),
  m("water", "low-key", 2, "Refill time."),

  m("water", "gen-z", 1, "Hydration check, bestie 💧"),
  m("water", "gen-z", 2, "Water break. You're not a houseplant but the rule still applies 🌱"),
  m("water", "gen-z", 2, "Sip sip hooray 💧"),
  m("water", "gen-z", 1, "Pandy brought you water. Pandy is very proud of this."),
  m("water", "gen-z", 2, "H2O o'clock ⏰"),
  m("water", "gen-z", 3, "Bestie. Water. It's right there 💧"),
  m("water", "gen-z", 1, "Little sip? Little sip 🐼"),
  m("water", "gen-z", 2, "Staying hydrated is so main character of you"),

  m("water", "chaotic", 2, "WATER. WATER. WATER. (said lovingly) 💧"),
  m("water", "chaotic", 3, "Pandy has consumed 400 gallons today. Pandy is unwell. Please drink normally."),
  m("water", "chaotic", 2, "The bottle is RIGHT THERE. It's been right there. It's waiting."),
  m("water", "chaotic", 1, "psst. water. pass it on 🐼"),
  m("water", "chaotic", 2, "Breaking: local person has water within arm's reach, refuses to acknowledge it"),
  m("water", "chaotic", 3, "I will simply stare at you until you sip 👁️💧👁️"),
  m("water", "chaotic", 1, "Hydrate or diedrate — wait no that's mean. Just hydrate 💧"),
  m("water", "chaotic", 2, "Pandy has entered the chat holding a water bottle aggressively"),

  // ── stand ──────────────────────────────────────────────────────────────
  m("stand", "low-key", 1, "Stretch whenever it suits you."),
  m("stand", "low-key", 2, "Time to stand up for a moment."),
  m("stand", "low-key", 2, "A short stretch might feel good."),
  m("stand", "low-key", 1, "Stand, stretch, sit back down. That's it."),
  m("stand", "low-key", 2, "Your chair will still be here."),
  m("stand", "low-key", 3, "Stand up and move around a little."),
  m("stand", "low-key", 1, "Pandy is stretching. Feel free to join."),
  m("stand", "low-key", 2, "Roll your shoulders back."),

  m("stand", "gen-z", 2, "Stand up bestie, the chair has won long enough 🧍"),
  m("stand", "gen-z", 1, "Stretch break! Pandy is doing it too 🐼"),
  m("stand", "gen-z", 2, "Get up, do a little wiggle, sit back down. That's the whole assignment"),
  m("stand", "gen-z", 1, "Your spine sends its regards"),
  m("stand", "gen-z", 2, "Time to become vertical ✨"),
  m("stand", "gen-z", 3, "STAND. and then immediately sit back down if you want. no pressure 🧍"),
  m("stand", "gen-z", 1, "Little stretch? Little stretch 🙆"),
  m("stand", "gen-z", 2, "Touch your toes. Or your knees. Or just think about it"),

  m("stand", "chaotic", 3, "GET UP. GET UP. GET— ok sorry. But do get up 🧍"),
  m("stand", "chaotic", 2, "You have been absorbed by the chair. Pandy is initiating extraction 🐼"),
  m("stand", "chaotic", 2, "Legs? In THIS economy? Yes. Use them."),
  m("stand", "chaotic", 1, "stretch like a cat who has no thoughts 🐈"),
  m("stand", "chaotic", 3, "Pandy has stood up 47 times today. Pandy is showing off. Your turn."),
  m("stand", "chaotic", 2, "Achieve verticality. Become the tall. Reach for the ceiling 🙌"),
  m("stand", "chaotic", 1, "wiggle. just a little wiggle. for pandy 🐼"),
  m("stand", "chaotic", 2, "The floor is not lava. Stand on it. Live a little."),

  // ── lookAway ───────────────────────────────────────────────────────────
  m("lookAway", "low-key", 1, "Look at something far away for a moment."),
  m("lookAway", "low-key", 2, "Rest your eyes — find something across the room."),
  m("lookAway", "low-key", 2, "Twenty seconds looking out a window."),
  m("lookAway", "low-key", 1, "Glance away from the screen."),
  m("lookAway", "low-key", 2, "Give your eyes a change of scenery."),
  m("lookAway", "low-key", 3, "Time to look away from the screen."),
  m("lookAway", "low-key", 1, "Pandy is looking out the window. It's nice."),
  m("lookAway", "low-key", 2, "Blink a few times. Look at the far wall."),

  m("lookAway", "gen-z", 1, "Eyes up! Look at something that isn't glowing 👀"),
  m("lookAway", "gen-z", 2, "Screen break — go look at a wall. Genuinely."),
  m("lookAway", "gen-z", 2, "Give the eyeballs a little vacation 👀✨"),
  m("lookAway", "gen-z", 1, "Look out the window, be mysterious for 20 seconds"),
  m("lookAway", "gen-z", 2, "Your eyes have been locked in. Let them roam 👀"),
  m("lookAway", "gen-z", 3, "LOOK AWAY. the code will still be there. it always is."),
  m("lookAway", "gen-z", 1, "Distance vision check ✨ pick something far"),
  m("lookAway", "gen-z", 2, "Stare into the middle distance. Very poetic of you"),

  m("lookAway", "chaotic", 2, "LOOK AWAY LOOK AWAY the pixels have had you long enough 👀"),
  m("lookAway", "chaotic", 1, "gaze upon something distant. a tree. a wall. a bird. anything 🐦"),
  m("lookAway", "chaotic", 3, "Your eyes have filed a complaint. Pandy is forwarding it. Look away 👀"),
  m("lookAway", "chaotic", 2, "Become one with the far wall. Commune with it. 20 seconds."),
  m("lookAway", "chaotic", 1, "blink. BLINK. you forgot didn't you 👁️"),
  m("lookAway", "chaotic", 2, "Breaking: screen too close, eyes too locked in, panda too concerned 🐼"),
  m("lookAway", "chaotic", 3, "PUT THE PIXELS DOWN. look at a cloud. any cloud. ☁️"),
  m("lookAway", "chaotic", 2, "Somewhere out there is a horizon. Acknowledge it."),

  // ── touchGrass ─────────────────────────────────────────────────────────
  m("touchGrass", "low-key", 1, "Step outside for a minute if you can."),
  m("touchGrass", "low-key", 2, "A little fresh air might be nice."),
  m("touchGrass", "low-key", 2, "Time for a short break outside."),
  m("touchGrass", "low-key", 1, "Open a window, at least."),
  m("touchGrass", "low-key", 2, "Outside break — even a couple of minutes counts."),
  m("touchGrass", "low-key", 3, "Good time to step outside."),
  m("touchGrass", "low-key", 1, "Pandy is going outside. Coming?"),
  m("touchGrass", "low-key", 2, "Fresh air, then back to it."),

  m("touchGrass", "gen-z", 2, "Touch grass o'clock 🌱 literally, go outside"),
  m("touchGrass", "gen-z", 1, "Outside exists and it misses you 🌿"),
  m("touchGrass", "gen-z", 2, "Go get some sun on your face, main character energy ☀️"),
  m("touchGrass", "gen-z", 1, "Pandy found grass. Pandy is touching it. Join 🐼🌱"),
  m("touchGrass", "gen-z", 2, "Time to log off IRL for five minutes 🌿"),
  m("touchGrass", "gen-z", 3, "GRASS. TOUCH IT. it's free 🌱"),
  m("touchGrass", "gen-z", 1, "Little walk? Little walk ✨"),
  m("touchGrass", "gen-z", 2, "The outdoors is having a moment. Go see it 🌳"),

  m("touchGrass", "chaotic", 3, "GRASS!!! IT'S RIGHT OUTSIDE!!! GO!!! 🌱"),
  m("touchGrass", "chaotic", 2, "There is a whole sky out there and you have not looked at it today 🌤️"),
  m("touchGrass", "chaotic", 1, "outside. it's like inside but with weather 🌿"),
  m("touchGrass", "chaotic", 2, "Pandy has touched grass 11 times today. Pandy has no notes. Just go."),
  m("touchGrass", "chaotic", 3, "THE BIRDS ARE DOING THINGS OUT THERE. GO SEE THE BIRDS 🐦"),
  m("touchGrass", "chaotic", 2, "Step outside. Stand there. Look confused. Come back. Perfect break 🌱"),
  m("touchGrass", "chaotic", 1, "the door is right there and it OPENS 🚪"),
  m("touchGrass", "chaotic", 2, "Sunlight is free and Pandy thinks you should exploit that ☀️"),
];

const byKey = new Map<string, Message[]>();
for (const msg of MESSAGES) {
  const key = `${msg.type}|${msg.tone}`;
  const list = byKey.get(key);
  if (list) list.push(msg);
  else byKey.set(key, [msg]);
}

/** Built-in messages for a category in a given tone. */
export function builtInFor(type: ReminderType, tone: Tone): readonly Message[] {
  return byKey.get(`${type}|${tone}`) ?? [];
}
