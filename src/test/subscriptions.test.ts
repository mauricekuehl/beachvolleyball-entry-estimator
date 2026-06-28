import { describe, expect, it } from "vitest";
import { parseSubscriptionInput, SubscriptionInputError } from "../lib/subscriptions";

describe("subscription input", () => {
  it("normalizes email and accepted categories", () => {
    expect(
      parseSubscriptionInput({
        email: " Test@Example.COM ",
        categories: ["A+", "B", "Unknown"],
      }),
    ).toEqual({
      email: "test@example.com",
      categories: ["A+", "B"],
    });
  });

  it("rejects invalid email addresses", () => {
    expect(() => parseSubscriptionInput({ email: "nope", categories: ["A"] })).toThrow(SubscriptionInputError);
  });
});
