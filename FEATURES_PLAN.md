PRODUCT IDENTITY (LOCKED)

REFLECT is a private reflection companion.
It helps users sit with their thoughts, notice patterns gently, and return to themselves — without judgment, gamification, or social comparison.

No public feeds.
No productivity pressure.
No “AI explains who you are.”

Everything below serves this.

1. Core Reflection Experience (Foundation)
✍️ Guided Reflection Writing

Users write a single thought or reflection.

Clean, distraction-free writing surface.

No word limits.

🪞 Mirror Response (AI)

Calm, second-person reflection (“you” language).

No advice, no fixing, no motivation.

Short, grounded responses.

Structured reflection sections (as you already designed).

This is the heart of the app.

2. Mood Tracking (Minimal, Non-Judgmental)
😊 Mood Check-In (Optional)

Mood as Metaphor

This is very on-brand for REFLECT.

Prompt

“If this moment were a scene, what would it be?”

Options like:

foggy morning

paused traffic

open window

low battery

deep water

Use later

Weekly insight:

“Your metaphors this week leaned toward waiting and pause.”
🔍 Mood Awareness (Not Interpretation)

Mood is never auto-explained

No “you improved” or “you declined” language

Used only for:

gentle trends

personal awareness

3. Reflection History & Revisit
📚 Reflection History

Every reflection saved per user.

Chronological view.

Clean, readable layout.

⭐ Keep / Save Important Reflections

Users can mark reflections they want to keep close.

Language avoids “favorites” — framed as:

“Keep this”

“Hold onto this”

🔁 Revisit Later

When viewing a mirror, users can choose:

“Read now”

“Come back later”

“Remind me in X days reminder”

⏰ Revisit Reminders

Gentle reminder to return to a reflection they chose.

Example tone:

“You wanted to come back to this.”

4. Gentle Reminders & Check-Ins
🔔 Daily Reflection Reminder (Optional)

User-chosen time.

Local notifications first (non-push).

No guilt language.

🫶 Warm Check-Ins

Optional, occasional nudges like:

“A quiet moment, if you want.”

“If something stayed with you today…”

🛑 Full Control

Pause reminders anytime.

Silence is respected.

5. Personal Insights (Paid Feature Core)
🧠 Weekly Personal Insight Letter

Once a week, users receive a short written insight:

What themes showed up

What felt heavier or lighter

What stayed unresolved

No charts. No labels. No diagnosis.

This is one of the highest perceived-value features.

🔍 “What’s Showing Up Lately”

Soft thematic insights, such as:

“Work came up often.”

“You wrote more about rest this week.”

Based on reflection content + mood trends.

Language is observational, never analytical.

6. Light Visual Insights (Carefully Limited)
📈 Reflection Frequency

Simple chart:

reflections per day/week

No streak pressure.

🙂 Mood Over Time

One calm, minimal graph.

No arrows, no scores, no judgments.

Charts exist to notice, not to optimize.

7. Reflection Modes (Premium Control)

Users can choose how REFLECT responds:

Gentle – softer language, more space

Direct – clearer mirroring, fewer words

Quiet – minimal response, mostly silence

Same core logic, different tone.

This makes the app feel personal, not generic.

8. Resurfacing & Continuity (High-Value, Subtle)
🔁 “Does This Still Feel True?”

Occasionally resurfacing older reflections:

“You wrote this two weeks ago. Does it still fit?”

Optional.

Can be turned off.

This encourages reflection without forcing progress.

9. Export & Sharing (Private by Default)
📤 Export Reflections

Export text or image of:

a reflection

a mirror

For personal keeping or sharing with someone trusted.

🚫 What is NOT included

No public sharing

No browsing others’ reflections

No social feed

Privacy is part of the value.

10. Account, Trial & Subscription
🔐 User Accounts

Secure auth.

All data private per user.

🆓 7-Day Free Trial

Full access to all features.

No artificial limitations.

💳 Paid Subscription

Unlocks:

unlimited reflections

full history

weekly insight letters

mood trends

revisit reminders

reflection modes

export

11. Explicitly NOT Part of the Product (Locked Out)

These ideas are intentionally excluded:

❌ Reading other people’s reflections
❌ Social feeds or community browsing
❌ Streak gamification
❌ Scores, grades, or “improvement” metrics
❌ Diagnostic labels or mental-health claims
❌ AI explaining “what’s wrong with you”

These would harm trust and intimacy.

---

12. TODO / Implementation Notes

📬 Insight Letter Notification (TODO)
- Send a notification when a new insight letter is generated (every 5 days)
- Gentle tone: "A letter is waiting for you" or similar
- User should be able to disable this notification

🤖 LLM Prompt Tuning (TODO)
- When changing the LLM provider (e.g., from Ollama to OpenAI, Claude, etc.), review and adjust prompts
- Current prompts are tuned for local Ollama models which may need different phrasing
- Key prompts to review:
  - `get_insight_letter()` in ollama_client.py — strict 100-150 word limit, no salutation
  - `convert_moods_to_feelings()` — mood metaphor to feeling synonym conversion
  - Mirror response prompts
  - Pattern extraction prompts

📝 5-Day Letter Cycle (IMPLEMENTED)
- Letters generate every 5 days based on fixed periods (Jan 1-5, Jan 6-10, etc.)
- If user accesses Insights before completing their first 5-day period:
  - Show warm "Your letter is on its way" message
  - Display days remaining until first letter
  - Encourage them to keep reflecting
- Letter content adapts to reflection count:
  - 0 reflections: Gentle acknowledgment, asking how they've been
  - 1-2 reflections: Uses those as context
  - 3+ reflections: Full personal letter with themes and observations
- Letter is 100-150 words, no salutation, observational tone only