# Learning Partner Hub — How to Use

This app helps you record learning partner attendance daily, draft report feedback, and warns you when absences need follow-up.

## 1) Run the app

```bash
cd Student
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## 2) Generate report feedback

Open the **Feedback** tab, choose a class and learning partner. The app uses **total absence days** and **streak** from your records (including manual overrides from Classes & Rosters). Pick participation and assignment quality, add optional notes, then **Generate feedback**. Edit the text, **Copy**, or use **Refine with AI** if Ollama or a cloud LLM is configured (`VITE_FEEDBACK_LLM_MODEL` in `.env.example`).

## 3) Record daily attendance with JSON (recommended)

1. Go to **Record Attendance**
2. Select the **JSON** tab
3. Paste JSON from your attendance platform (or upload a `.json` file)
4. Click **Parse JSON**
5. Review class, date, module, and each student’s present/absent status
6. Click **Save daily attendance**

### Expected JSON format

```json
{
  "session_details": {
    "class": "INTAKE 17 LEVEL 5 HND IN COMPUTING GROUP 1",
    "date": "02/06/2026",
    "module": "L5C | Network Management",
    "start_time": "9:00 AM",
    "duration": "1 Session"
  },
  "attendance": [
    { "no": 1, "name": "STUDENT NAME", "status": "Present" },
    { "no": 2, "name": "ANOTHER STUDENT", "status": "Absent" }
  ],
  "summary": {
    "total_students": 2,
    "present": 1,
    "absent": 1
  }
}
```

- **class** — parsed into intake, level, qualification, and group
- **date** — `DD/MM/YYYY` (e.g. `02/06/2026` = 2 June 2026)
- **status** — `Present` or `Absent`
- If the class does not exist yet, it is **created automatically**
- If attendance for that class + date already exists, you get a **confirm overwrite** modal

## 4) Screenshot import (vision AI)

1. Go to **Record Attendance** → **Screenshot** tab
2. Configure vision AI in `.env` (see `.env.example`) — free local option: Ollama + `qwen2.5vl:7b`
3. Paste or upload your portal screenshot
4. Click **Scan screenshot**
5. Review the extracted JSON and student table, then **Save daily attendance**

Screenshot import uses vision AI only (no OCR). Output matches the same JSON format as manual paste.

## 5) Manual attendance

Go to **Mark Manually** to edit a class and date by hand, including **Prior notice** for absent students.

## 5) Warnings

The **Warnings** tab flags students for:

- **14+ consecutive absent days** (2+ weeks)
- **30+ consecutive absent days** without prior notice (~1 month)

## 7) Manual absence override

In **Classes**, click **Edit absences** on a student to override totals when needed.

Data is saved automatically in your browser (`localStorage`).
