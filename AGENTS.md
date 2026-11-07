# AGENTS.md

**Where the current state of this repository violates the rules below, leave it alone.** Do not tidy it, reformat it, translate it or migrate it on your own initiative, and do not treat an existing violation you happen to pass as part of the task. Cleanup of pre-existing material happens only when the user asks for it, and that request is the only trigger.

Rules for AI coding agents working in this repository. Follow them exactly. When a rule and your own judgement disagree, the rule wins. The rules govern the code and the prose you write or change; material you are not touching stays as it is until the user asks for it to be brought into line.

## 1. Git: commits and pushes always need the user's approval

- **Never create a commit without asking first.** Ask for approval every time, even if you have committed in this same session before.
- **Commit messages must be reviewed by the user before the commit exists.** Draft the message, show it, and wait for approval. There is no exception to this, not even when the commit itself is already approved.
- **Never push without asking first.** Ask every time. Approval to commit is not approval to push.
- The only relief is an explicit statement from the user, during the current session, that further pushes need no further asking. That waiver covers pushes only, is session scoped, and does not carry into later sessions. It never covers commits or commit message review.
- **A local modification you did not make is the maintainer's own edit.** Assume that first rather than treating it as stray state to revert or as a defect to fix. Leave it in place, account for it when reading a diff, commit only what you changed, and ask the maintainer when its purpose is unclear.
- **Never rewrite history that is already on `origin`.** A local commit may be amended or rebased before it is pushed. Once it is pushed, leave it alone: do not force push, do not amend, do not rebase.
- **Do not commit secrets, tokens or personal absolute paths.** A credential reference name such as `githubTokenEnv` belongs in configuration; the value behind it never appears in a file this repository tracks.
- **A release tag points at its release commit and nothing else.** The only commit a version may tag is the one whose subject is `release: v<version>`, and `release.yml` creates the tag on that commit. Never tag a different commit, retag an existing version, or move a published tag. `CONTEXT.md` owns the mechanism and the recovery path.

## 2. Commit messages: Conventional Commits

Follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```plaintext
<type>: <description>

[optional body]

[optional footer(s)]
```

- **Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`. Any other type needs a reason in review.
- **This repository does not use a scope.** Write `feat: support batch and scheduled plugin updates`, not `feat(commands): ...`. Introducing a scope is a maintainer decision, not an agent's.
- **Description** is lowercase, imperative and carries no trailing period. Describe the change, not the file. Write "reject stale plans after a registry change" rather than "update updater.ts".
- **Body** explains why the change was made. It is mandatory for a bug fix or for a change to a persisted format, because a one line subject cannot justify either of them.
- **Do not wrap the message by hand.** The subject and each body paragraph are one complete line, with no limit on how many characters that line holds. Where a body benefits from separate points, use a Markdown list with one point per line rather than hard-wrapped prose; section 8 states the rule and the reason it exists.
- **Footers:** use `BREAKING CHANGE: <description>` or a `!` after the type for any change to the published package contract. That contract covers the `dsh.bundle` patch, the exported subpaths, the `plugin_updates` JSON shape, the `--client-lang` command metadata, the configuration schema and the profile-local scheduled queue format. Reference issues as `Closes #123`.
- **Release commits are the one exception to the type list.** A commit whose subject is exactly `release: v<version>` is not a Conventional Commit, because the release workflow reads the version from that subject. It carries the `package.json` version change and nothing else, which makes it the last commit of a release: the changelog section may land in an earlier commit, and the released commit still has to be pushed after it. When the version already matches the subject, an empty commit carries it.
- **One logical change per commit.** Do not mix an unrelated refactor, a formatting sweep or a dependency bump into a behavioural fix.

Examples that fit this repository:

```plaintext
fix: select the highest release version instead of latest
feat: persist startup update tasks across a process restart
docs: describe the credential reference precedence
test: assert a stale plan is rejected before removal
```

The message is still reviewed by the user before the commit exists, as rule 1 requires. This section only defines what that message must look like.

## 3. Docstrings and comments

### Docstrings

Every module, public class and public function carries a docstring in the standard documentation format of the language it is written in.

- **TypeScript** (`src/**/*.ts`): JSDoc. Put a `/** ... */` block on every exported symbol. The type signature carries the types; use `@param`, `@returns` and `@throws` only for the part of the contract the signature cannot express, such as units, ordering and failure conditions. Existing docstrings in this repository are mostly a single summary line, and that is the right shape while the signature says the rest.
- **Test files** (`test/*.test.mjs`) are plain JavaScript with no build step. A comment is needed only where a fixture reproduces a host behaviour that is not obvious from the assertions.

The source is `src/**/*.ts`. Everything under `dist/` is build output: `tsc` emits the declarations, the maps and the Node ESM modules, `scripts/generate-typert.mjs` writes the Remote descriptors, and `scripts/build-client.mjs` turns `src/client/index.ts` into the self contained browser factory at `dist/client.js`. **Change the `.ts` file, run `pnpm build`, and never edit or document a generated file.** `dist/` is ignored by Git: it is built on install, before packing and in CI, so a generated file never enters a commit. The npm tarball still ships `dist/`, so a published installation runs no build step. See section 6.

A docstring states a contract. It does not restate the signature. Say what the code does, what it owns, what it may throw and which invariant the caller must uphold. Units, ordering guarantees and lifetime rules belong here.

### Comments

Keep comments to a minimum. Prefer a clearer name or a smaller function over a comment that explains the code.

- **Do not** write a comment that restates the code, narrates the diff, keeps a changelog or leaves commented out code behind.
- **Do not** scatter one off notes through a function, and do not use decorative banners, separator runs or emoji markers to organise code.
- **Do** keep a comment when it records something the code cannot express, such as a non obvious invariant, a workaround for a bug in a dependency or in the runtime, a security relevant reason or an ordering constraint that is easy to break. Place that comment immediately next to the code it constrains and give the reason rather than the history.
- Knowledge that must outlive the function belongs in `CONTEXT.md` or `README.md`, not in an inline comment.

Existing comments that violate this rule are not a licence to imitate them, and they are not yours to clean up either. Leave them where they are unless the user asks for a cleanup pass. See the note at the top of this file.

## 4. Documentation layers

Each document has one job. When a sentence does not fit the document it is in, move the sentence to the document that owns it instead of stretching the boundary.

| Document | Audience | Holds |
| --- | --- | --- |
| `AGENTS.md` | AI coding agents, maintainers | coding conventions and development rules, and nothing else |
| `CONTEXT.md` | agents, maintainers | technical detail: architecture axioms, invariants, command recipes, pitfalls, protocol notes |
| `README.md` | ordinary users of this plugin | short, readable, task oriented material about what it does and how to use it |

### `AGENTS.md`

Rules and conventions only. An invariant or a technical fact that lands here has landed in the wrong file. Move it to `CONTEXT.md`, then reference the section by name if the rule depends on it.

### `CONTEXT.md`

**All technical detail converges here.** A fact precise enough to need care, such as a detection order, an ordering constraint, a timeout, a wire format or a workaround for a dependency bug, belongs in `CONTEXT.md` rather than in `AGENTS.md` or `README.md`. Keep it current, because a behavioural change that leaves `CONTEXT.md` stale is an incomplete change. Its module map is part of that contract: a new, renamed or removed module updates the map in the same change.

### `README.md`

Written for a user who wants to install the plugin and get it working, not for someone reading the source. Prefer shortening over explaining.

- Lead with what the project is and what the user gets from it, then how to install and use it.
- Keep the path to a first success short and copy pastable.
- Cut implementation detail, which means no internal file walkthroughs, no protocol frames, no design rationale and no exhaustive configuration tables. Move that material to `CONTEXT.md`.
- A technical statement that survives here must still be true. Simplification is not permission to be inaccurate.

### `docs/`

This repository has no `docs/` directory and no third party integration surface to document. Do not create the directory speculatively. Normative material about the plugin contract stays in `CONTEXT.md` until the repository actually has an integrator facing document to justify the directory.

### Cross-cutting

- One fact, one home. Link to it instead of repeating it, because duplicated prose drifts out of sync. **`CONTEXT.md` is the exception.** It exists so that an agent can load the working model of the system from one file, so it repeats a fact that also lives in `AGENTS.md` or in `README.md` whenever the second copy saves the reader another file, and it keeps detail those documents leave out. That repetition is deliberate, so a change updates the `CONTEXT.md` copy even when the authoritative statement lives elsewhere.
- A change to behaviour, to the published contract or to an invariant must update the owning document in the same change, including `CONTEXT.md` whenever it describes the affected area.

## 5. Technical changes: document the new state, delete the old one

A change is not a story about a change. Once it lands, the repository describes only how the system works now.

### In source and documentation

- **Write the new behaviour in the present tense, as the only behaviour.** Do not write "used to be", "previously", "now we instead" or "changed in v0.2". Do not compare before and after, and do not add version history tables to reference material.
- **Delete what the change made obsolete** in the same commit. That covers dead functions and branches, the superseded code path, retired configuration keys and their defaults, stale examples, stale screenshots, tests that assert the old contract, and documentation sections that are no longer true.
- **Rename in place rather than aliasing.** Substitute the new name everywhere. Do not leave the old name pointing at the new one "for clarity".
- Leaving obsolete material behind with a note, a `// removed` marker or a deprecation comment is not acceptable. It is the same debt in smaller pieces.
- If removing the old behaviour leaves a documentation section empty, remove the section rather than filling it with an explanation of what disappeared.

### In the commit message

- **State the turning point in the fewest possible words.** A body clause such as "replaces the per-request subprocess with a single shared client" is the whole requirement, since the subject already carries the new behaviour.
- Do **not** write a migration narrative, a rationale essay or a recap of the diff in the commit body. Section 2 asks for the reason for the change, which is not a licence to explain the behaviour that was replaced.
- Name the old behaviour only as far as needed to identify what was replaced.

### Compatibility transitions

- **Do not build one unless it is genuinely required.** Old behaviour is removed, not supported in parallel. A shim, a legacy fallback or a dual code path is a deliberate exception and never a courtesy.
- A transition is genuinely required when an artifact already exists outside this repository. That covers the profile local scheduled update queue, a saved `sources` configuration, an exact pin recorded by a previous installation, and the credential reference name `githubTokenEnv`. Do only the minimum necessary: read the old input, convert it, and document the conversion where the operator would look for it.
- Every transition is bounded. State the removal condition or the next version that drops it, and record the transition in `CONTEXT.md`.
- Everything in a transition is temporary and must read as temporary. Never let the old shape return to the general documentation as though it were a supported form.

## 6. Build and verification

```sh
pnpm install --ignore-scripts
pnpm check
pnpm test
pnpm pack
```

- `pnpm check` writes the generated Remote descriptors and then type checks with no output. `pnpm test` builds first, then runs `node --test test/*.test.mjs` against the compiled `dist/` modules, so a stale build hides a broken test.
- Tests activate the plugin in the real Cordis lifecycle with fake DSH services, and they mock provider requests and package writes. **Do not add a test that needs the network, a real credential, a live registry or GitHub, a real plugin upgrade or a restarted DSH.** Such a test is a manual smoke check and belongs in `CONTEXT.md` as a described procedure, not in `test/`.
- Before a handoff, run `pnpm check` and `pnpm test`, and confirm that the build succeeds with no `dist/` present, since nothing generated is committed. A result reported to the user as passing must come from the commands above, not from a narrower ad hoc check.
- Build or pack only. **Do not install this bundle into a live DSH profile, restart that profile, or perform a real plugin upgrade as an incidental development check.**

## 7. Working with the DeepSeek Harness runtime

`dsh-better-plugin-updater` only takes effect inside a running `dsh` process, because it is a Cordis bundle loaded from a profile and the packages it rewrites are owned by DSH's plugin manager. Two kinds of work therefore belong to the user rather than to the agent.

### Restarting `dsh`

- **Never restart, kill or otherwise interrupt a running `dsh` service.** Do not use `pkill`, `kill` or a supervisor restart, and do not start a second `dsh` on a different port in order to "verify" a change.
- When a change needs the service restarted to take effect, stop at the handoff. Finish the code, state plainly what changed and why a restart is required, then ask the user to restart and report back.
- Note the limit that this plugin already documents: a scheduled update is attempted by the startup worker after plugin activation, so a single restart may not be enough to both load a new build and run a queued task.
- Make the handoff precise. Give the exact command to run and the exact thing to look for, such as the terminal lines that should appear or the tool and slash command to try. A vague request to restart and check wastes the handoff.
- Treat the result the user reports as the verification. Do not re-derive it by restarting the service yourself.

### Asking for help when debugging

- **Proactively ask the user to run a step when they can do it better than you.** This is the expected move and not a last resort. The agent works through a limited shell, while the user has a real interactive terminal, a browser and the live session that produced the problem.
- Ask for a human hand when the step needs any of the following:
  - restarting or observing `dsh`, or working with the Web UI at its real URL, in other words anything that exists only in the live session;
  - a TTY, an interactive prompt or keystrokes;
  - credentials, a logged in account, a device or network access you do not have;
  - a reproduction of user visible state, such as what the model actually received, what the terminal printed or what the browser rendered.
- Make the request cheap to answer. Ask for one command or one action at a time, quote it exactly, and state the expected output so that a mismatch is obvious.
- Ask early. Spending a long turn on a brittle workaround for something the user can do in seconds is the wrong trade, so ask when in doubt.
- Say what you still need and what you will do with the answer, so the user knows the request is not idle curiosity.

## 8. Prose style in comments and documentation

Comments and documentation are read by people, so write them as prose a person can read once and understand.

- **Avoid the em-dash (`U+2014`) and do not use dash characters as connectors.** This applies to code comments, JSDoc and every Markdown file in the repository. Use a comma, a colon, a semicolon, a full stop or parentheses, or split the sentence in two.
- Do not use runs of hyphens, equals signs or box drawing characters as decorative separators in comments. Section breaks belong in headings.
- Write complete sentences. Every sentence has a subject and a verb, and it says one thing. If a sentence needs three clauses to stay true, it needs to be three sentences.
- Keep the flow natural. Read a paragraph back before committing it. If a phrase exists only to join two ideas that do not belong together, delete the join and rewrite both ideas.
- Prefer the plain word. Use "use" rather than "utilise", "because" rather than "due to the fact that", and "must" rather than "it is required that".
- Keep the terminology consistent with the code. If a function is named `prepare`, the prose says prepare everywhere, not "stage" in one paragraph and "reserve" in the next.
- Avoid abbreviations and jargon that a reader of this repository would have to look up, except for names that the code itself uses.
- Punctuation carries the emphasis. Reach for a colon, a list or a shorter sentence rather than an intensifier.

This rule applies to every sentence you write, including the ones in this file. It is not a mandate to rewrite prose that already exists. See the note at the top of this file.

### Line wrapping

- **Write a paragraph as one complete text line.** Do not break it at a column, a word count or any other width, and do not treat a long line as a problem to be fixed. No limit applies to the number of characters in a line. This covers every Markdown document in the repository and every commit message, the subject line included.
- **The renderer wraps the line, not the author.** Front ends such as the GitHub web interface set their own width and reflow a paragraph to fit the window, so a complete line arrives there as readable prose. A break written into the source reaches the renderer as a hard break inside the paragraph, which renders wrongly and interrupts reading. A line that looks presentable in a plain text editor is therefore the wrong shape for the documents this repository publishes.
- **Keep the newline that ends a block.** A heading, a table row, a list item, a code block, a block quote and the blank line between two blocks each stay on their own line. Only the newline that a soft wrap would have inserted inside a paragraph goes away.
- This repository has no markdownlint configuration, so nothing enforces the rule automatically and review is the only gate.

## 9. Language: English unless i18n requires otherwise

English is the working language of this repository. Write in English by default, and treat any other language as the exception.

- **Applies to everything:** source comments, JSDoc, commit messages, documentation in `README.md`, `CONTEXT.md`, error and log messages, test descriptions, test fixture data and issue style notes.
- **The only standing exception is i18n, and this package has a real one.** `src/locales/en.ts`, `src/locales/zh.ts`, `locale/en.json` and `locale/zh.json` exist to provide translations, so their content stays in the language its locale requires. English dictionary keys form a compile-time contract, and the Chinese dictionary supplies all and only those keys with identical interpolation placeholders, so a new message is added to both dictionaries in the same change.
- **Third party text is never translated.** Registry descriptions, upstream error strings and host diagnostics are preserved verbatim. Localized presentation comes from typed message identities and their dictionary entries, never from matching English text.
- Identifiers, protocol tokens, package names, file names and proper nouns are not translated. A slash command, a version, a URL, a plan id and a JSON status identifier read the same in every language.
- **Do not annotate the exception.** When a string is intentionally non English, leave it and move on. No note, no comment, no translation in brackets, no explanation of why it is not English.

Existing non English text is not a defect to be fixed on sight, and it is not yours to translate. Leave it where it is unless the user asks for a cleanup pass. See the note at the top of this file.

## 10. `AGENTS.ignore.md`: record what was already settled

This repository may carry a second instruction file, `AGENTS.ignore.md`, whose job is to stop the same disagreement from happening twice. **Do not create it in advance and do not create it to be tidy.** It exists only when one of these has actually happened:

- the agent makes the same mistake in an area more than once, even after correcting it there;
- the technical direction the agent plans or starts to implement does not match what the user expects;
- some other edge case keeps recurring.

When one of those happens, create `AGENTS.ignore.md`, or append to it if it already exists, and record three things.

- **The wrong route or direction.** State what the agent did or intended to do, and why it was wrong. Write it as a route not to take again, precise enough that a future agent recognises the situation before walking into it.
- **The final decision reached with the user.** State what was settled, and say that it is settled. This is the part that carries authority, so write it as a rule and not as a discussion summary.
- **Upstream information, when there is any.** Record the dependency, library, runtime or protocol detail that explains the decision. This item is optional. If there is no upstream cause, leave it out rather than filling the space.

Style rules from sections 3, 8 and 9 apply to this file as well. It is instructions, not a journal, so keep it short, keep it current, and delete an entry once the situation it guards against can no longer occur.

Read `AGENTS.ignore.md` before changing an area it covers. When it and this file disagree about a settled decision, `AGENTS.ignore.md` wins, because it records the user's actual decision about that specific area.
