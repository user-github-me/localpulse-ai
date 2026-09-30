# Community quick actions

Quick actions are prompts saved as JSON. Import them in LocalPulse under
**Settings → Quick actions → Import from a file**. Importing only adds prompts; a quick action
can't run code.

## Format

```json
{
  "label": "Pros and cons",
  "prompt": "List the main pros and cons as two short bullet lists.",
  "input": "page",
  "mode": "reduce"
}
```

- `label`: the button text, up to 40 characters.
- `prompt`: what the AI should do. `{{language}}` becomes the user's answer language.
- `input`: `page` (the page, or the selection if there is one) or `selection` (only the selected text).
- `mode`: how long pages are handled. `reduce` reads them in parts and answers once, `transform`
  processes each part and joins the results (for rewriting or translating), `qa` uses only the
  parts that match the prompt.

A file can hold one quick action or a list of them.

## Adding one

Add a `.json` file to this folder and open a pull request. Keep prompts short and specific, and
say in the pull request what kind of page you tested it on.
