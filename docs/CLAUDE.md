# Reflect Landing Page — Claude Code Instructions

## Project Context
Landing page for Reflect (ireflect.app), an AI-powered self-reflection app.
Stack: Pure HTML/CSS/JS, Supabase (waitlist), PostHog (analytics), deployed on Vercel.
Status: Pre-launch, collecting waitlist signups.

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or changes touching multiple files)
- If something goes sideways, STOP and re-plan — don't keep pushing
- Write detailed specs upfront before touching any code
- Use plan mode for verification steps, not just building

### 2. Subagent Strategy
- Use subagents to keep the main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake from recurring
- Review `tasks/lessons.md` at the start of each session

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Ask yourself: "Would a staff engineer approve this?"
- Check that the page still renders correctly after every change
- Verify mobile responsiveness after any layout change

### 5. Demand Elegance
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky, implement the elegant solution instead
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it, no hand-holding needed
- Point at logs, errors, or broken behavior — then resolve them
- Zero context switching required from the user

## Task Management
1. **Plan First** — Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan** — Check in before starting implementation
3. **Track Progress** — Mark items complete as you go
4. **Explain Changes** — High-level summary at each step
5. **Document Results** — Add review section to `tasks/todo.md`
6. **Capture Lessons** — Update `tasks/lessons.md` after any correction

## Core Principles
- **Simplicity First** — Make every change as simple as possible. Impact minimal code.
- **No Laziness** — Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact** — Changes should only touch what's necessary. Avoid introducing bugs.

## Project-Specific Rules
- Do NOT change Supabase project URL or anon key
- Do NOT introduce new fonts or colors without flagging it first
- Do NOT change core copy or value proposition without asking
- Pricing CTAs open the waitlist modal — this is intentional, not a bug
- Tone of all copy must stay: calm, honest, introspective — never hype-y
- Always preserve existing PostHog event names if modifying tracking code

## File Structure
- `index.html` — entire page lives here (inline styles + scripts)
- `tasks/todo.md` — current task plan and progress
- `tasks/lessons.md` — running log of mistakes and fixes
- `SUGGESTIONS.md` — full audit report from initial review