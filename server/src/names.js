// Username rules: 3-16 letters, numbers or _, not reserved, not offensive.
const RESERVED = new Set(["admin", "administrator", "clack", "clackschool", "clackteam", "moderator", "mod", "mods",
  "support", "staff", "official", "system", "root", "null", "undefined", "anonymous", "everyone", "bralash", "owner"]);
// Matched anywhere in the name (after undoing leetspeak). Only unambiguous words go here.
const ANYWHERE = ["fuck", "shit", "cunt", "bitch", "nigg", "faggot", "retard", "whore", "slut", "rape", "nazi",
  "hitler", "kike", "chink", "twat", "pussy", "penis", "vagina", "porn", "dildo", "jizz", "tranny", "wetback",
  "beaner", "asshole", "bastard", "bollock", "killyourself", "molest", "pedo", "incest", "blowjob", "handjob"];
// Short words that hide inside innocent ones (canal, document, raccoon, cockpit...): whole-name match only.
const WHOLE = ["fag", "fags", "cum", "anal", "sex", "coon", "spic", "dick", "cock", "prick", "wank", "kys", "gook",
  "paki", "tits", "boobs", "anus", "nig"];

const unleet = (s, one) => s.replace(/_/g, "").replace(/0/g, "o").replace(/1/g, one).replace(/3/g, "e")
  .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/9/g, "g").replace(/\$/g, "s");

/** Returns null when the name is fine, otherwise a short reason for the player. */
export function nameProblem(raw) {
  const name = String(raw ?? "").trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return "use 3–16 letters, numbers or _";
  const low = name.toLowerCase();
  if (RESERVED.has(low.replace(/_/g, ""))) return "that name is reserved";
  for (const flat of [unleet(low, "i"), unleet(low, "l")]) {
    if (ANYWHERE.some(w => flat.includes(w)) || WHOLE.includes(flat) || WHOLE.some(w => flat === w + "s"))
      return "please pick a different name";
  }
  return null;
}
