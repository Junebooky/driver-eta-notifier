# HQ interface: Flat 2.0 standard (2026-11-04)

Source of truth: reference screenshot in the product conversation, initially applied to \`HqSharedReportLink\`. The goal is a quiet, modern Apple/Toss-inspired interface without visual noise.

- Surfaces: white \`#FFFFFF\`; secondary blocks \`#F3F6FC\` / \`#F2F4F6\`. Use a thin 1px cool-gray border (\`#E4EAF3\`) and barely visible cool-gray elevation (e.g. \`0 10px 36px rgba(54,78,115,.06)\`).
- Curves: spacious 16px action controls, 18-20px nested panels, 24px major cards; no square sharp corners.
- Typography: deep slate/navy rather than black; large semibold title 21-24px, supportive labels 13-15px, generous line-height.
- Accent: cobalt \`#1E60F3\` for exactly the primary action, the link icon, and small high-value interactive text. Do NOT repeat gradients, status rainbow colors or bright saturated secondary buttons.
- Controls: hierarchy primary solid blue > secondary pale-gray outlined > tertiary icon refresh. Visible focus and disabled states.
- Copy: compact, helpful Korean, e.g. "링크를 복사했어요."; a one-time token should be clearly labeled as one-time, without exposing it in logs or persistent state.
- Feedback: neutral gray toast row with a small blue check. Avoid large colorful success/error banners. No green or black as design accents.
- Layout: mobile-first; primary button full width on narrow phones, other actions wrap rather than overflow; long URLs stay inside a width-constrained readonly field with direct copy control.
- Security/behavior: preserve existing permissioned HQ endpoints, short-lived one-time reveal of new shared URL, and revoke/rotate confirmations. Redesign must not relax auth or make private data public.

When expanding this to other HQ modules, keep the same hierarchy but avoid reusing the exact link card markup as a generic default; design each screen around its actual task.
