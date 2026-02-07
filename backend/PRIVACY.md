# Privacy – REFLECT backend

This document describes how the REFLECT backend uses personal data for a personalized experience.

## Profile data

When you sign in with Supabase Auth, we store a **profile** for your account so we can personalise the product. Profile data is stored in the `profiles` table and includes:

- **Email** – from your Auth account (used for personalised notifications and emails).
- **Display name** – from Auth (e.g. `user_metadata.full_name`) or set by you in the app (used in messaging and UI).
- **Preferences** – settings you choose (e.g. notification preferences, timezone) for tailoring content and delivery.

Profile data is created or updated when:

- You call **POST /api/user/profile/sync** (e.g. after login), which syncs email and name from Supabase Auth.
- You call **PATCH /api/user/profile** to update your display name or preferences.

## How we use it

- **Personalised notifications** – e.g. “Hi [name], you wanted to revisit a reflection” or reminders at times that suit you.
- **Personalised emails** – if we send emails (e.g. summaries or prompts), we use your name and email to address you and deliver relevant content.
- **In-app experience** – your display name and preferences are used to tailor the interface and content.

We do not sell your profile data. It is used only to run and personalise REFLECT for you.

## Personalization context (for emails only)

To make emails feel personal without using your private words, we keep a separate **personalization context** per user. It contains only **derived, non-invasive summaries** – for example:

- **Recurring themes** – topics that come up often (e.g. "growth", "gratitude"), not your actual thoughts.
- **Recent mood words** – the mood words you chose, without any reflection text or context.
- **Emotional tone summary** – a short, generic line (e.g. "mostly reflective").
- **Activity** – when you last reflected and how often in the last week.
- **Name from email** – a name derived from your email address (e.g. the part before @, with dots/spaces turned into a readable form like "John Doe") so we can address you in emails if you haven’t set a display name.

This table is **never** filled with your raw thoughts, mirror text, or answers. It is updated from patterns we already compute (e.g. from reflection patterns and mood check-ins) and is used only to tailor email wording (e.g. "You've been reflecting on growth lately") without invading your privacy.

## Other data

Reflections, mood check-ins, reminders, and insights are stored per user and used only to provide the reflection and insights features. See the main app or product documentation for a full overview of stored data.
