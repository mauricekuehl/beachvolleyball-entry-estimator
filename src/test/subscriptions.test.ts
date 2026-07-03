import { describe, expect, it } from "vitest";
import { parseSubscriptionInput, SubscriptionInputError } from "../lib/subscriptions";

describe("subscription input", () => {
  it("normalizes email and accepted categories", () => {
    expect(
      parseSubscriptionInput({
        email: " Test@Example.COM ",
        categories: ["A+", "B", "Unknown"],
        gender: "female",
      }),
    ).toEqual({
      email: "test@example.com",
      categories: ["A+", "B"],
      gender: "female",
    });
  });

  it("rejects invalid email addresses", () => {
    expect(() => parseSubscriptionInput({ email: "nope", categories: ["A"], gender: "male" })).toThrow(
      SubscriptionInputError,
    );
  });

  it("requires a single accepted gender", () => {
    expect(() => parseSubscriptionInput({ email: "test@example.com", categories: ["A"], gender: ["male"] })).toThrow(
      SubscriptionInputError,
    );
  });
});
