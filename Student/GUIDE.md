# Student Absence Tracker — How to Use

This app helps you record student attendance daily and warns you when a student has an extended absence.

## 1) Run the app

```bash
cd Student
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## 2) Record daily attendance with JSON (recommended)

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
    "date": "05/05/2026",
    "module": "L5C | Network Management",
    "start_time": "9:00 AM",
    "duration": "1 Session"
  },
  "attendance": [
    { "no": 1, "name": "STUDENT NAME", "status": "Present" },
    { "no": 2, "name": "ANOTHER STUDENT", "status": "Absent" }
  ],
  "summary": {
    "total_students": 21,
    "present": 19,
    "absent": 2
  }
}
```

- **class** — parsed into intake, level, qualification, and group
- **date** — `MM/DD/YYYY` (e.g. `05/05/2026`)
- **status** — `Present` or `Absent`
- If the class does not exist yet, it is **created automatically**
- If attendance for that class + date already exists, you get a **confirm overwrite** modal

## 3) Screenshot import (optional)

Use the **Screenshot (OCR)** tab if you only have an image. OCR is less reliable than JSON.

## 4) Manual attendance

Go to **Mark Manually** to edit a class and date by hand, including **Prior notice** for absent students.

## 5) Warnings

The **Warnings** tab flags students for:

- **14+ consecutive absent days** (2+ weeks)
- **30+ consecutive absent days** without prior notice (~1 month)

## 6) Manual absence override

In **Classes**, click **Edit absences** on a student to override totals when needed.

Data is saved automatically in your browser (`localStorage`).
