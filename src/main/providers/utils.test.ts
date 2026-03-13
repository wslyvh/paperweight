import { cleanHtml } from "./utils";

describe("cleanHtml", () => {
  it("returns empty string when input is undefined", () => {
    expect(cleanHtml(undefined)).toBe("");
  });

  it("removes script tags and their content", () => {
    const html = `
      <script>
        alert("Hi");
      </script>
      <div>Content</div>
    `;

    const result = cleanHtml(html);
    expect(result).not.toContain("alert");
    expect(result).toContain("Content");
  });

  it("removes all HTML tags but keeps text content", () => {
    const html = `<div><span>Hello</span> <b>World</b></div>`;
    const result = cleanHtml(html);

    expect(result).toBe("Hello World");
  });

  it("handles complex mixed HTML", () => {
    const html = `
      <style>.x { color: blue; }</style>
      <script>console.log("test")</script>
      <h1>Title</h1>
      <p>Paragraph <strong>text</strong></p>
    `;

    const result = cleanHtml(html);

    expect(result).toContain("Title");
    expect(result).toContain("Paragraph");
    expect(result).toContain("text");

    expect(result).not.toContain("console.log");
    expect(result).not.toContain("color: blue");
  });
});
