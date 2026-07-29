// Sender-domain registries for the type classifier. Real platform domains,
// deliberately: this is public infrastructure knowledge, not user data.
// Growth paths: real-mailbox mining and community contributions — a missing
// platform is a safe miss (its mail falls back to promotion/update via list
// headers), a wrong entry is a false positive.

// Social networks whose notification mail classifies as type "social".
// Matched against the from domain INCLUDING subdomains (platforms mail from
// e.linkedin.com, mail.goodreads.com, ...).
export const SOCIAL_DOMAINS: string[] = [
  "linkedin.com",
  "facebookmail.com",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "twitter.com",
  "x.com",
  "redditmail.com",
  "reddit.com",
  "discord.com",
  "meetup.com",
  "strava.com",
  "pinterest.com",
  "tiktok.com",
  "snapchat.com",
  "nextdoor.com",
  "nextdoor.nl",
  "mastodon.social",
  "bsky.app",
  "youtube.com",
  "twitch.tv",
  "tumblr.com",
  "quora.com",
  "goodreads.com",
  "couchsurfing.org",
  "couchsurfing.com",
  "foursquare.com",
  "xing.com",
  "telegram.org",
  "whatsapp.com",
  "tinder.com",
  "bumble.com",
  "hyves.nl", // defunct, but historic mail still gets classified
];

// Consumer mail providers: a sender at one of these domains is a human, not
// an organization (organizations send from their own domain). Matched
// EXACTLY against the from domain — lookalikes (9gagmail.com) and provider
// infrastructure mail (accounts.google.com) must not hit.
//
// Defined in contracts.ts because consumers need the same list, and re-exported
// here so the classifier reads both sender registries from one place.
export { PERSONAL_DOMAINS } from "../contracts";
