import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, Bm25Ranker } from "../skill-rag.js";

test("tokenize: removes stop words and stems terms", () => {
  const terms = tokenize("Write a unit test for the authentication services");
  assert.ok(!terms.includes("a"));
  assert.ok(!terms.includes("for"));
  assert.ok(!terms.includes("the"));
  assert.ok(terms.includes("unit"));
  assert.ok(terms.includes("test"));
  assert.ok(terms.includes("service")); // stemmed from services
});

test("Bm25Ranker: ranks relevant documents higher", () => {
  const ranker = new Bm25Ranker();
  const docs = [
    { name: "tdd", text: "Test-Driven Development red green refactor vitest jest unit test" },
    { name: "code-review", text: "Senior code review guidelines git diff security correctness" },
    { name: "to-spec", text: "Create technical specification document architecture requirements" },
    { name: "db-migrate", text: "PostgreSQL database migrations alter table schema index" },
  ];

  const results = ranker.rank("vitest unit testing suite", docs, 2);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "tdd");
  assert.ok(results[0].score > 0);
});

test("Bm25Ranker: returns 0 matches on stop-word only greetings", () => {
  const ranker = new Bm25Ranker();
  const docs = [
    { name: "tdd", text: "Test-Driven Development red green refactor vitest jest unit test" },
    { name: "code-review", text: "Senior code review guidelines git diff security correctness" },
  ];

  const results = ranker.rank("hi", docs, 2);
  assert.equal(results.length, 0, "Greetings must yield 0 skill matches to prevent cold-start token bloat");
});

test("Bm25Ranker: multiple skill matching with threshold", () => {
  const ranker = new Bm25Ranker();
  const docs = [
    { name: "tdd", text: "Test-Driven Development unit test mock assert" },
    { name: "code-review", text: "Senior code review test diff inspection" },
    { name: "archify", text: "Architecture diagrams sequence graphs system design" },
  ];

  const results = ranker.rank("code review and unit test", docs, 2);
  assert.ok(results.length >= 1);
  const matchedNames = results.map((r) => r.name);
  assert.ok(matchedNames.includes("code-review") || matchedNames.includes("tdd"));
});
