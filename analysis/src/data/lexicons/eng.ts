import type { Lexicon } from "./lexicon";

// Single common words ("order") never match alone — phrases only, so prose
// like "in order to" cannot fire.
export const eng: Lexicon = {
  purchaseConfirmation: [
    /\border confirmation\b/, /\bpurchase confirmation\b/, /\bshipping confirmation\b/,
    /\byour order\b/, /\breceipt for\b/, /\bhas shipped\b/,
    /\bpayment (?:receipt|confirmation|processed|successful|received)\b/,
    /\byour refund\b/, /\brefund (?:processed|issued|confirmed|approved|received)\b/,
    /\b(?:appointment|booking|reservation) (?:confirmation|confirmed)\b/,
  ],
  purchaseVocab: [
    /\binvoice\b/, /\btrack(?:ing)? (?:number|code|your)\b/, /\bout for delivery\b/,
  ],
  updateVocab: [
    /\bwelcome to\b/, /\bthanks for (?:signing up|joining|registering)\b/,
    /\bverify your (?:email|account)\b/, /\bconfirm your (?:email|account)\b/,
    /\bactivate your account\b/, /\b(?:reset|forgot|change) (?:your )?password\b/,
    /\bpassword reset\b/, /\b(?:verification|security|login|authentication|one-time) code\b/,
    /\b2fa code\b/, /\breminder\b/, /\brenewal\b/, /\bticket #?\d+\b/,
    /\bsecurity alert\b/, /\bsecure your account\b/, /\baccount activity\b/, /\bnew sign-?in\b/,
  ],
  unsubscribeLinkText: [
    /\bunsubscribe\b/i,
    /\bopt[\s-]?out\b/i,
    /\bmanage\s*(?:your\s*)?(?:email\s*)?(?:preferences|subscriptions)\b/i,
    /\bupdate\s*(?:your\s*)?(?:email\s*)?preferences\b/i,
    /\bno\s*longer\s*wish\s*to\s*receive\b/i,
    /\bstop\s*(?:receiving|these)\s*(?:emails|messages)\b/i,
    /\bleave (?:this )?mailing list\b/i,
  ],
  unsubscribeUrl: [/unsubscribe/i, /opt-?out/i],
  footerCue: [
    /\byou(?:'re| are)? receiving this\b/i,
    /\bthis (?:e-?mail|message) was sent to\b/i,
    /\ball rights reserved\b/i,
    /\bregistered (?:office|in england)\b/i,
    /\bcompany (?:number|registration)\b/i,
    /\bprivacy policy\b/i,
    /\bterms (?:of use|of service|and conditions)\b/i,
    /\bvat (?:no|number|registration)\b/i,
  ],
  referenceCodeStem: [/order/, /booking/, /invoice/, /reservation/, /transaction/],
  referenceCodeLabel: [/number/, /code/, /reference/, /no\.?/, /id/],
};
