/** Shared vision prompt for local Ollama and cloud screenshot scan (browser + Vercel API). */

export const ATTENDANCE_VISION_PROMPT = `You extract attendance data from a learning-partner portal screenshot.

Return ONLY a single JSON object (no markdown fences, no explanation) matching this exact shape:
{
  "session_details": {
    "class": "INTAKE 19 LEVEL 5 HND IN COMPUTING (PT) GROUP 1",
    "date": "06/04/2026",
    "module": "L5CPT | SECURITY",
    "start_time": "8:15 AM",
    "duration": "2 Sessions"
  },
  "attendance": [
    { "no": 1, "name": "FULL NAME AS SHOWN", "status": "Present" },
    { "no": 2, "name": "ANOTHER NAME AS SHOWN", "status": "Absent" }
  ],
  "summary": {
    "total_students": 2,
    "present": 1,
    "absent": 1
  }
}

Rules:
- Include every visible learning-partner row in list order
- status must be exactly "Present" or "Absent" from checkbox state (checked/filled = Present, empty/unchecked = Absent)
- Keep names exactly as uppercase text shown on screen (including @, hyphens, etc.)
- summary counts must match the attendance array
- session_details.class is REQUIRED: copy the full class header from the top of the page (must include INTAKE, LEVEL, programme name, and GROUP). Never leave class empty if any part of that header is visible
- When the programme name shows part-time as "(PT)" in the class header, include "(PT)" exactly in session_details.class and in the programme portion — e.g. "HND IN COMPUTING (PT)". Never add or infer "(PT)" from module codes (e.g. L5CPT, L4CPT)
- session_details.date is REQUIRED when shown (MM/DD/YYYY, e.g. 06/04/2026)
- session_details.module is REQUIRED when shown: copy the full module/subject line (e.g. "L5CPT | SECURITY" — code, pipe, and title). It is usually below the class header and above the attendance table
- Use empty string only for module, start_time, or duration when those fields are genuinely not visible on screen
- Do not skip any attendance rows`
