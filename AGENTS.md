<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Guidance

- The site is German-first. User-facing UI text, metadata, emails, and API error messages should be German unless there is a technical identifier that must remain unchanged.
- Do not use Figma-specific skills or workflows for this project unless the user explicitly provides a Figma design. This app is designed directly in code.
- Treat frontend changes as product UI work, not a styling afterthought. Preserve the existing quiet tool-like interface, avoid marketing-page patterns, and verify desktop and mobile states visually when changing layout.
- For responsive tables, make mobile views readable without requiring horizontal scrolling unless there is no practical alternative.
- Keep tournament estimation logic separate from display labels. Internal values such as `sourceBucket`, `automatic`, `waitlist`, and `unresolved` may remain English when they are code-level domain states.
- The canonical share route is `/tournament?id=<tournamentId>`. Preserve deep linking and copy/share behavior when changing the estimator flow.
