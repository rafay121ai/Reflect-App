# REFLECT — Product Requirements Document (PRD)

**Version:** 1.0  
**Last updated:** February 2026  
**Status:** Current as of implemented features

---

## 1. Product Overview

### 1.1 Vision

REFLECT is a **private reflection companion**. It helps users sit with their thoughts, notice patterns gently, and return to themselves — without judgment, gamification, or social comparison.

### 1.2 Product Identity (Locked)

| Principle | Description |
|-----------|-------------|
| **Private** | No public feeds. All data private per user. |
| **No pressure** | No productivity pressure, streaks, or scores. |
| **No diagnosis** | No "AI explains who you are." Observational only. |
| **Gentle** | Calm, second-person language. No advice, no fixing. |

### 1.3 Target Users

- People who want a quiet space to reflect
- Users who value privacy and low-pressure engagement
- Anyone seeking language for internal states (mood as metaphor) rather than labels

---

## 2. Customer Journey (Start to End)

### 2.1 First Experience & Onboarding

| Feature | Description | Status |
|---------|-------------|--------|
| **User accounts** | Secure auth (Supabase). All data private per user. | Implemented |
| **Onboarding** | First-time flow before main reflection experience. | Implemented |
| **7-day free trial** | Full access; no artificial limitations. | Concept (subscription not enforced in current build) |

### 2.2 Core Reflection Flow

| Step | Feature | Description | Status |
|------|---------|-------------|--------|
| 1 | **Guided reflection writing** | Single thought/reflection. Clean, distraction-free surface. No word limits. | Implemented |
| 2 | **Journey cards** | Structured reflection sections (What This Feels Like, Where You're Stuck, What You Believe, Why This Matters). | Implemented |
| 3 | **Adaptive questions** | Type-aware questions (Practical / Emotional / Social / Mixed). 2–3 questions. | Implemented |
| 4 | **Mirror response** | Calm, second-person reflection. No advice, no fixing. Short, grounded. | Implemented |
| 5 | **Revisit choice** | "Read now" / "Come back later" / "Remind me in X days." | Implemented |
| 6 | **Mood check-in** | Mood as metaphor (e.g. foggy morning, low battery). Optional. | Implemented |
| 7 | **Closing** | Named truth + open thread ("Between now and next time —"). Under 80 words. | Implemented |

### 2.3 Reflection History & Revisit

| Feature | Description | Status |
|---------|-------------|--------|
| **Reflection history** | Every reflection saved per user. Chronological view. | Implemented |
| **Keep / save** | Mark reflections to keep close ("Keep this" / "Hold onto this"). | Implemented (open-later / waiting) |
| **Revisit reminders** | Gentle reminder to return. Optional local notifications. | Implemented |

### 2.4 Ongoing Engagement

| Feature | Description | Status |
|---------|-------------|--------|
| **Daily reminder** | User-chosen time. Optional. No guilt language. | Implemented (settings) |
| **Warm check-ins** | Optional nudges ("A quiet moment, if you want."). | Implemented |
| **Pause reminders** | Full control; silence respected. | Implemented |
| **Weekly insight letter** | Short written insight: themes, what felt heavier/lighter. 100–150 words. 5-day cycle. | Implemented |
| **"What's showing up lately"** | Soft thematic insights from reflection + mood. Observational only. | Implemented (insights panel) |
| **Mood awareness** | Mood never auto-explained. No "you improved/declined." | Implemented |

---

## 3. Separate Features (Standalone)

| Feature | Description | Status |
|---------|-------------|--------|
| **Reflection modes** | Gentle / Direct / Quiet. Same logic, different tone. | Implemented |
| **Reflection frequency** | Simple chart (per day/week). No streak pressure. | Implemented |
| **Mood over time** | One calm, minimal graph. No scores. | Implemented |
| **Export / share** | Export text or image of reflection/mirror. Private by default. | Implemented (save as image, share) |
| **Account & subscription** | Paid subscription concept (unlimited, history, insights, modes, export). | Not enforced |

---

## 4. Explicitly Out of Scope

- Reading other people's reflections  
- Social feeds or community  
- Streak gamification  
- Scores, grades, or "improvement" metrics  
- Diagnostic labels or mental-health claims  
- AI explaining "what's wrong with you"  

---

## 5. Success Criteria (Product)

- Users complete full flow: thought → journey → questions → mirror → mood → closing.  
- Reflections and history persist and are private.  
- Tone is consistently gentle, second-person, non-advice.  
- Weekly insight and mood insights feel observational, not analytical.  
- Revisit and reminders work without guilt or pressure.

---

## 6. Open Items / TODO

- Insight letter notification when new letter is ready (e.g. "A letter is waiting for you").  
- Optional "Does this still feel true?" resurfacing of older reflections.  
- Enforce subscription / paywall for premium features if monetizing.
