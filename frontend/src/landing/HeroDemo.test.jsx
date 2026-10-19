import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import HeroDemo from "./HeroDemo";

// The answer streams word by word, one <span> per word, so read the whole
// live region's text rather than matching a single element.
const answerText = () => document.querySelector('[aria-live="polite"]').textContent;

describe("HeroDemo", () => {
  it("answers with a citation for a role that can read the source", () => {
    render(<HeroDemo />);
    expect(answerText()).toMatch(/carry over up to 5 unused annual leave days/);
    expect(screen.getAllByRole("button", { name: "Source 1" }).length).toBeGreaterThan(0);
  });

  it("redacts sources outside the role and refuses", () => {
    render(<HeroDemo />);
    fireEvent.click(screen.getByRole("radio", { name: "What was revenue in Q3 2024?" }));

    expect(answerText()).toBe("I couldn't find this in the documents you can access.");
    expect(screen.getAllByText("Withheld · Finance only")).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/18\.4 million/);
  });

  it("shows the answer once the role has access", () => {
    render(<HeroDemo />);
    fireEvent.click(screen.getByRole("radio", { name: "What was revenue in Q3 2024?" }));
    fireEvent.click(screen.getByRole("radio", { name: "Finance Director" }));

    expect(answerText()).toMatch(/£18\.4 million, up 14%/);
    expect(screen.queryByText("Withheld · Finance only")).not.toBeInTheDocument();
  });
});
