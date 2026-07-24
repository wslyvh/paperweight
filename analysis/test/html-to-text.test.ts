import { describe, expect, it } from "vitest";
import { htmlToText } from "../src/extract/html-to-text";

describe("htmlToText", () => {
  it("turns block elements and <br> into line breaks", () => {
    const { text } = htmlToText("<p>First</p><p>Second</p><div>Third<br>Fourth</div>");
    expect(text).toBe("First\nSecond\nThird\nFourth");
  });

  it("collapses whitespace within lines", () => {
    const { text } = htmlToText("<p>Hello   \n\t world</p>");
    expect(text).toBe("Hello world");
  });

  it("decodes numeric and common named entities", () => {
    const { text } = htmlToText("<p>Caf&eacute; &amp; bar &#8211; &#x20AC;10&nbsp;euro</p>");
    expect(text).toBe("Café & bar – €10 euro");
  });

  it("drops script, style, head, and comments entirely", () => {
    const { text } = htmlToText(
      "<head><title>t</title><style>p{color:red}</style></head>" +
        "<body><script>var a = 1;</script><!-- note --><p>Visible</p></body>",
    );
    expect(text).toBe("Visible");
  });

  it("separates table cells with spaces and rows with line breaks", () => {
    const { text } = htmlToText(
      "<table><tr><td>Total</td><td>€10</td></tr><tr><td>Shipping</td><td>free</td></tr></table>",
    );
    expect(text).toBe("Total €10\nShipping free");
  });

  it("collects link hrefs with their visible text, keeping the text clean", () => {
    const { text, links } = htmlToText(
      '<p>Click <a href="https://shop.example/u?id=1">here to unsubscribe</a> today</p>',
    );
    expect(text).toBe("Click here to unsubscribe today");
    expect(links).toEqual([
      {
        href: "https://shop.example/u?id=1",
        text: "here to unsubscribe",
        start: 6,
        end: 25,
      },
    ]);
    expect(text.slice(links[0]!.start!, links[0]!.end!)).toBe("here to unsubscribe");
  });

  it("skips links without visible text but still counts them", () => {
    const { links, facts } = htmlToText(
      '<a href="https://x.example"><img src="banner.png"></a><p>Body</p>',
    );
    expect(links).toEqual([]);
    expect(facts.linkCount).toBe(1);
    expect(facts.imageCount).toBe(1);
  });

  it("counts structure facts", () => {
    const { facts } = htmlToText(
      '<table><tr><td><a href="https://a.example">a</a></td></tr></table>' +
        '<img src="x.png"><img src="y.png"><p>Text</p>',
    );
    expect(facts.tableCount).toBe(1);
    expect(facts.linkCount).toBe(1);
    expect(facts.imageCount).toBe(2);
    expect(facts.visibleTextLength).toBeGreaterThan(0);
  });

  it("drops invisible preheader padding characters", () => {
    const { text, facts } = htmlToText(
      "<div>&#847; &shy; &#8203; &zwnj; &#173; &#8204;</div><p>Real content</p>",
    );
    expect(text).toBe("Real content");
    expect(facts.visibleTextLength).toBe("Real content".length);
  });

  it("survives malformed marketing html", () => {
    const { text, links } = htmlToText(
      // unclosed head, unclosed p, '>' inside an attribute value
      '<head><style>a{content:"</"}</style><body><p>Eerste<p>Tweede ' +
        '<a href="https://x.example/a?b=1&c=2" title="1 > 0">link</a>',
    );
    expect(text).toBe("Eerste\nTweede link");
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toBe("https://x.example/a?b=1&c=2");
  });

  it("handles tel and mailto hrefs", () => {
    const { links } = htmlToText(
      '<p>Bel <a href="tel:+31612345678">06 12 34 56 78</a> of mail <a href="mailto:hi@x.example">ons</a></p>',
    );
    expect(links).toEqual([
      {
        href: "tel:+31612345678",
        text: "06 12 34 56 78",
        start: 4,
        end: 18,
      },
      {
        href: "mailto:hi@x.example",
        text: "ons",
        start: 27,
        end: 30,
      },
    ]);
  });
});
