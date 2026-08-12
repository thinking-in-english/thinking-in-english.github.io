# English Reflex & Shadowing Web App — Requirements

## 1. Overview

Build a complete responsive web application for practicing English speaking reflexes and shadowing.

The application will use a Google Spreadsheet as its content management system. I will continuously add and update lessons and questions directly in Google Sheets. The web application must dynamically load the latest content from the spreadsheet without hardcoding lesson content into the source code.

The application must work well on:
- Desktop
- Laptop
- Tablet
- Mobile phone

Core learning flow:

Vietnamese prompt
→ think
→ speak English from memory
→ reveal target English sentence
→ listen to English pronunciation
→ shadow the sentence
→ optionally record yourself
→ listen to your recording
→ optionally check whether expected words were recognized
→ move to next question

This is primarily a speaking reflex and shadowing application, NOT a reading application.

---

## 2. Google Sheet Structure

The Google Spreadsheet contains multiple sheet tabs.

Each sheet/tab represents one lesson/topic.

Example tabs:
- Lesson 1 - supermarket
- Lesson 2 - coffee shop
- Lesson 3 - clothing store
- Lesson 4 - restaurant
- Lesson 5 - hotel

Each lesson sheet has two columns:

| Vietnamese | English |
|---|---|
| Vietnamese situation/prompt | Target English sentence |

The first row is the header and must NOT be treated as a question.

Do NOT hardcode lesson or question content into the application.

---

## 3. Dynamic Lesson Detection

The application must automatically detect available lesson tabs from the Google Spreadsheet.

If I add a new tab such as:

`Lesson 6 - hotel`

the application should automatically display it after the latest data is loaded.

I should NOT need to modify application source code when adding a lesson.

If a lesson tab is renamed or removed, the application should reflect the latest spreadsheet structure.

---

## 4. Dynamic Question Count — Critical

There is NO fixed number of questions per lesson.

The number of questions in each lesson is determined by the actual number of valid Vietnamese-English question pairs in that lesson's Google Sheet tab.

Examples:

- Lesson 1 has 20 valid questions → 20 questions
- Lesson 2 has 25 valid questions → 25 questions
- Lesson 3 has 17 valid questions → 17 questions
- Lesson 4 has 30 valid questions → 30 questions

The application must automatically calculate these counts.

DO NOT assume every lesson contains 20 questions.

DO NOT limit an individual lesson to 20 questions.

DO NOT select only 20 questions when practicing a single lesson.

A valid question is a row where BOTH Vietnamese and English are present.

Ignore:
- header row
- completely empty rows
- rows where Vietnamese is missing
- rows where English is missing

The displayed question count must equal the number of valid question pairs.

If questions are added or removed from Google Sheets, the application must update the count after fresh data is loaded.

---

## 5. Main Modes

The application has two main modes:

1. Practice by Lesson
2. Review Multiple Lessons

These modes have different behavior.

---

## 6. Home Screen

Create a clean, modern home screen:

**ENGLISH REFLEX**

Speaking & Shadowing Practice

- Practice by Lesson
- Review Multiple Lessons

The UI should be simple and distraction-free.

---

## 7. Practice by Lesson

Display all lessons dynamically.

Example:

- Lesson 1 — Supermarket — 20 questions
- Lesson 2 — Coffee Shop — 25 questions
- Lesson 3 — Clothing Store — 17 questions
- Lesson 4 — Restaurant — 30 questions

When a lesson is selected:

1. Load ALL valid questions from that lesson.
2. Shuffle the complete list randomly.
3. Use every question exactly once.
4. Never show duplicate questions.
5. Do NOT limit the session to 20 questions.

Examples:
- 17 questions → practice 17
- 20 questions → practice 20
- 25 questions → practice 25
- 50 questions → practice 50

---

## 8. Practice Progress

Progress must be dynamic.

For 25 questions:

`Question 1 / 25` ... `Question 25 / 25`

For 17 questions:

`Question 1 / 17` ... `Question 17 / 17`

Do NOT hardcode 20 in Practice by Lesson.

---

## 9. Flashcard Experience

Initially show ONLY the Vietnamese prompt.

Example:

> Question 7 / 25
>
> Bạn muốn hỏi nhân viên xem loại này có phải organic không.
>
> **[ Show Answer ]**

The English answer must remain hidden until the user clicks Show Answer.

After revealing:

> **English:**
>
> Is this one organic?
>
> 🔊 Listen
>
> 🎙️ Record
>
> [ Got it ] [ Need more practice ]
>
> [ Next → ]

The main goal is to make the user produce English from memory before seeing the answer.

---

## 10. Practice Flow

Intended learning flow:

1. Read Vietnamese prompt.
2. Think of the English sentence.
3. Say English from memory.
4. Click Show Answer.
5. Compare with target sentence.
6. Listen to target pronunciation.
7. Shadow the pronunciation.
8. Optionally record yourself.
9. Optionally listen to your recording.
10. Optionally perform basic speech recognition.
11. Move to next question.

Do not force every optional step.

---

## 11. Self-Assessment

After revealing the answer:

- Got it
- Need more practice

This is temporary session state only.

Do NOT modify Google Sheets.

Do NOT implement spaced repetition yet.

Keep architecture extensible for future spaced repetition.

---

## 12. Lesson Completion

At the end:

> Lesson Completed!
>
> 25 / 25 questions completed.
>
> Practice Again
>
> Back to Lessons

Numbers must be dynamic.

---

## 13. Review Multiple Lessons

User selects a lesson range.

Example:

From: Lesson 1  
To: Lesson 5

Collect ALL valid questions from Lessons 1–5 into ONE combined pool.

Example:

- Lesson 1 = 20
- Lesson 2 = 25
- Lesson 3 = 17
- Lesson 4 = 30
- Lesson 5 = 20

Total available = 112 questions.

Calculate this dynamically.

---

## 14. Review Question Count

Unlike Practice by Lesson, Review Multiple Lessons lets the user choose how many questions to practice.

Options:

- 20 questions
- 30 questions
- 50 questions
- 100 questions
- All questions

Default: 20.

IMPORTANT:

20 is ONLY the default for Review Multiple Lessons. It is NOT a limit for individual lessons.

If 112 questions are available:
- choose 20 → random 20
- choose 50 → random 50
- choose 100 → random 100
- choose All → all 112

If only 35 questions are available and user chooses 50:
→ use all 35, never create duplicates.

---

## 15. Review Randomization

For Review Multiple Lessons:

1. Collect all questions from selected lesson range.
2. Combine into ONE pool.
3. Shuffle the entire pool.
4. Select requested number.
5. Never show the same question twice in one session.

Questions from different lessons must be mixed randomly.

Do NOT process lessons separately.

Do NOT force equal numbers from each lesson.

---

## 16. Review UI

Example:

> Review Multiple Lessons
>
> From: [ Lesson 1 ▼ ]
>
> To: [ Lesson 5 ▼ ]
>
> Available questions: 112
>
> Number of questions: [ 20 ▼ ]
>
> **[ Start Review ]**

Available question count must update dynamically when lesson range changes.

---

## 17. Review Progress

Progress reflects selected review size.

20 selected:
`Question 1 / 20`

50 selected:
`Question 1 / 50`

All selected with 112 available:
`Question 1 / 112`

---

## 18. Randomization

Use Fisher-Yates or another correct unbiased shuffle.

Create reusable functions such as:

- `shuffleQuestions()`
- `getAllQuestionsFromLesson()`
- `getRandomQuestions()`
- `getQuestionsFromLessonRange()`

Practice by Lesson:
- all questions
- randomized
- no duplicates

Review:
- combine all
- randomized
- select requested amount
- no duplicates

Every new session should generate a fresh order.

---

## 19. Unique Question IDs

Every question needs a unique ID.

Examples:

- `lesson-1-001`
- `lesson-1-002`

Use IDs for duplicate prevention.

Do not rely only on array indexes.

Suggested structure:

```json
{
  "lessonId": "lesson-1",
  "lessonName": "Lesson 1 - supermarket",
  "questionCount": 20,
  "questions": [
    {
      "id": "lesson-1-001",
      "vietnamese": "...",
      "english": "..."
    }
  ]
}
```

`questionCount` must equal `questions.length` after invalid rows are removed.

---

## 20. Google Apps Script Backend

Use Google Apps Script as the backend/data layer.

The application should be deployable as a Google Apps Script Web App.

Backend responsibilities:

1. Access configured spreadsheet.
2. Retrieve sheet/tab names.
3. Detect lesson tabs.
4. Read Vietnamese and English values.
5. Ignore invalid rows.
6. Generate question IDs.
7. Calculate question counts.
8. Return lesson metadata and questions as JSON.

Use:

```javascript
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
```

Do not expose private credentials in client-side code.

---

## 21. Data Refresh

Retrieve latest Google Sheet content when app loads/refreshes so that:

- new lessons appear
- new questions appear
- deleted questions disappear
- counts update

Avoid unnecessary requests during a practice session.

Prefer loading required data once and keeping it in frontend memory.

Do not make a Google Sheets request for every question.

---

## 22. Text-to-Speech / Shadowing

Add Text-to-Speech so the user can hear the target English sentence.

Flow:

Vietnamese
→ speak from memory
→ Show Answer
→ Listen
→ Shadow
→ Record yourself
→ Replay

Use browser-native `SpeechSynthesis` initially.

Do NOT integrate paid cloud TTS services yet.

---

## 23. TTS UI

After answer is revealed:

- 🔊 Listen
- 🔁 Replay

Do NOT autoplay.

User must explicitly click Listen.

Allow replay multiple times.

---

## 24. TTS Accent

Default:

English (US)

Also support:

English (UK)

Use:

```javascript
window.speechSynthesis.getVoices()
```

Do not assume a specific voice name exists on every device.

Prefer English (US) when available.

Gracefully fall back to another English voice.

Settings UI:

`Accent: [ English (US) ▼ ]`

Options:
- English (US)
- English (UK)

---

## 25. TTS Speed

Options:

- 0.75x
- 1.0x
- 1.25x

Default: 1.0x.

Use `SpeechSynthesisUtterance.rate`.

Keep selected speed active during current practice session.

0.75x is useful for shadowing.

---

## 26. TTS Behavior

When Listen is clicked:

1. Read complete English sentence.
2. Use selected voice.
3. Use selected speed.

Replay:
- stop current speech
- restart from beginning

Next while speech is playing:
- cancel speech before moving on

Prevent overlapping speech instances.

Leaving session:
- cancel speech

Create reusable functions:

- `speakText(text, options)`
- `stopSpeech()`
- `getAvailableVoices()`
- `getPreferredEnglishVoice()`

Keep TTS separate from flashcard logic.

---

## 27. TTS Fallback

If SpeechSynthesis is unavailable:

> Text-to-speech is not available on this device.

This must not block normal flashcard practice.

---

## 28. Voice Recording

Add optional voice recording for shadowing.

Purpose:

1. Listen to target pronunciation.
2. Speak sentence yourself.
3. Record yourself.
4. Listen to your recording.
5. Compare with target.

Use browser `MediaRecorder` where supported.

Controls:

- 🎙️ Record
- ⏹ Stop
- ▶️ Play My Recording
- 🔄 Record Again

Do not automatically start recording.

Do not automatically play recording.

---

## 29. Recording UI

Before recording:

> 🎙️ Record

During recording:

> 🔴 Recording...
>
> ⏹ Stop

After recording:

> ▶️ Play My Recording
>
> 🔄 Record Again

Only keep the current recording in memory for the current session.

Do not upload recordings to Google Sheets.

Do not permanently store recordings on the server in this version.

---

## 30. Recording Cleanup

When moving to another question:

- stop active recording
- release previous audio resources where appropriate
- stop active speech synthesis

When leaving session:
- stop recording
- stop speech
- release temporary audio resources

Avoid memory leaks.

---

## 31. Basic Speech Recognition

Add OPTIONAL basic speech recognition.

IMPORTANT:

This is NOT pronunciation scoring.

It only checks whether the user's spoken words were recognized as expected English words.

Do NOT claim pronunciation is correct because speech recognition recognized a word.

Use labels:

- Speech Match
- Words Recognized

Do NOT use:
- Pronunciation Score
- Pronunciation Correct

---

## 32. Speech Recognition Flow

Provide:

`[ Check My Speech ]`

If browser speech recognition is available:

1. Capture user's speech.
2. Convert speech to text.
3. Normalize target sentence.
4. Normalize recognized sentence.
5. Compare words.
6. Display basic feedback.

Example:

Target:
`Is this one organic?`

Recognized:
`Is this one organic?`

Display:

> ✓ Great!
>
> 4 / 4 expected words recognized.

Another example:

Target:
`Is this one organic?`

Recognized:
`Is this organic?`

Display:

> △ Almost there
>
> 3 / 4 expected words recognized.
>
> Missing word: `one`

---

## 33. Speech Recognition Limitations

Do NOT treat speech recognition as pronunciation evaluation.

If a word is recognized, say:

> The word was recognized.

Do NOT say:

> Your pronunciation is correct.

The result should be described as speech/text matching only.

---

## 34. Browser Support

Detect whether speech recognition is available.

If unavailable:

> Speech recognition is not supported on this browser.

This must not block the rest of the app.

TTS, flashcards, and recording should continue working independently where supported.

---

## 35. Future Speech Extensibility

Keep speech features modular so they can later be improved.

Possible future features:
- better speech recognition
- AI speaking feedback
- pronunciation analysis

Do NOT implement:
- ELSA-like pronunciation scoring
- phoneme-level scoring
- individual sound analysis
- stress scoring
- intonation scoring
- rhythm scoring
- pronunciation grades
- AI pronunciation evaluation
- third-party pronunciation APIs

Current version only needs:
1. TTS
2. Accent selection
3. Speech speed
4. Voice recording
5. Recording playback
6. Basic speech-to-text comparison

---

## 36. Responsive Design

Must work well on:
- Desktop
- Laptop
- Tablet
- Mobile

Mobile is especially important.

Requirements:
- no horizontal scrolling
- large touch-friendly buttons
- readable text
- responsive flashcard
- comfortable spacing
- portrait-friendly
- no hover-only interactions

Vietnamese prompt should be the visual focus.

---

## 37. UI Design

Use a clean, modern, minimal design.

Avoid unnecessary animation and visual clutter.

Suggested structure:
- Home
- Mode selection
- Lesson selection
- Practice

Use:
- cards
- rounded buttons
- clear typography
- strong hierarchy
- responsive layout

Flashcard should occupy most available screen.

---

## 38. Mobile Practice Screen

Before answer:

```text
Question 7 / 25

Bạn muốn hỏi nhân viên xem
loại này có phải organic không.

[ Show Answer ]
```

After answer:

```text
Question 7 / 25

Is this one organic?

🔊 Listen

🎙️ Record

▶️ Play My Recording
🔄 Record Again

[ Got it ]
[ Need more practice ]

[ Next → ]
```

Controls may appear conditionally depending on current state.

Do not make the interface crowded.

---

## 39. Navigation

User should always be able to go back.

Example:

Home
→ Practice by Lesson
→ Lesson 1
→ Question 1
→ Question 2
→ ...
→ Completed

Provide Back where appropriate.

If leaving an active session, confirm:

> Are you sure you want to leave this practice session?

---

## 40. Loading States

Implement clear loading states.

Example:

> Loading lessons...

Do not show an empty lesson list while loading.

---

## 41. Error Handling

If Google Sheets cannot be accessed:

> Unable to load lessons.

Provide Retry.

If a lesson has zero valid questions:

> This lesson doesn't contain any practice questions.

Do not allow starting an empty lesson.

TTS, recording, and speech recognition failures should be non-blocking warnings.

Core flashcard practice must continue.

---

## 42. Code Architecture

Create a clean, maintainable project structure.

Separate:
- Google Apps Script backend
- Google Sheet data loading
- lesson metadata
- question validation
- question counting
- randomization
- session management
- flashcard UI
- TTS
- voice recording
- speech recognition
- navigation
- styling

Do NOT put everything into one huge JavaScript file.

Use reusable functions/modules/components.

Use clear names and comments around important logic.

---

## 43. Suggested Data Flow

```text
Google Spreadsheet
        ↓
Google Apps Script Backend
        ↓
JSON lesson/question data
        ↓
Frontend Application
        ↓
Lesson Selection
        ↓
Practice Session
        ↓
Flashcard
        ↓
TTS / Recording / Speech Recognition
```

Frontend must not expose private spreadsheet credentials.

---

## 44. Performance

Avoid unnecessary Google Sheets requests.

Load data efficiently.

Prefer loading required data once and keeping it in frontend memory during the session.

Do not request Google Sheets data for every question.

On application reload, retrieve fresh data.

---

## 45. Future Extensibility

Design for future additions:
- spaced repetition
- track "Need more practice"
- difficult-question practice
- statistics
- practice history
- search
- topic filters
- audio history
- better speech recognition
- AI conversation practice

Do NOT implement these now.

---

## 46. Critical Distinction Between Modes

PRACTICE BY LESSON:

- Practice ALL questions in selected lesson.
- Count is based entirely on actual valid questions.
- NO 20-question limit.
- 17 → 17
- 20 → 20
- 25 → 25
- 50 → 50

REVIEW MULTIPLE LESSONS:

- Combine all questions from selected range.
- User chooses number.
- Default = 20.
- Options = 20, 30, 50, 100, All.
- Random selection from entire combined pool.
- No duplicate question within session.
- If requested amount exceeds available questions, use all available.

DO NOT mix these behaviors.

---

## 47. Core User Experience

The intended experience is:

Vietnamese prompt
        ↓
Think
        ↓
Speak English from memory
        ↓
Show Answer
        ↓
Compare
        ↓
🔊 Listen to target pronunciation
        ↓
Shadow
        ↓
🎙️ Record yourself
        ↓
▶️ Listen to yourself
        ↓
Optional basic speech check
        ↓
Next question

The English answer must NEVER be visible before Show Answer.

The user should be able to repeat the target sentence as many times as needed.

---

## 48. Deliverables

Before writing code:

1. Explain proposed architecture.
2. Explain Google Sheet → Apps Script → frontend data flow.
3. Explain dynamic lesson detection.
4. Explain valid question detection.
5. Explain dynamic question counting.
6. Explain Practice by Lesson vs Review Multiple Lessons.
7. Explain TTS implementation.
8. Explain recording implementation.
9. Explain basic speech recognition.
10. Show complete project/file structure.

Then implement the complete application.

After implementation, explain:

1. How to configure Spreadsheet ID.
2. How to prepare Google Sheet.
3. How to deploy Google Apps Script Web App.
4. How to configure permissions.
5. How to open/use the web app.
6. How to add a new lesson.
7. How to add questions.
8. How new lessons/questions are detected.
9. How counts update.
10. Browser limitations for TTS, recording, and speech recognition.

The final result must be a functional, maintainable English speaking reflex and shadowing practice application.

Do not hardcode lesson content.

Do not hardcode the number of questions per lesson.

Do not assume every lesson has 20 questions.

Do not implement advanced pronunciation scoring.
