/** Shared vision prompt for local Ollama and cloud screenshot scan (browser + Vercel API). */

export const ATTENDANCE_VISION_PROMPT = `You extract attendance data from a learning-partner portal screenshot.

Return ONLY a single JSON object (no markdown fences, no explanation) matching this exact shape:
{
  "session_details": {
    "class": "INTAKE 20 LEVEL 2 INTERNATIONAL CERTIFICATE IN INFORMATION TECHNOLOGY GROUP 2",
    "date": "02/06/2026",
    "module": "L2IT | USING IT TO SUPPORT INFORMATION AND COMMUNICATION IN ORGANISATIONS",
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
- session_details.date is REQUIRED when shown (DD/MM/YYYY)
- Use empty string only for module, start_time, or duration when those fields are not visible on screen
- Do not skip any attendance rows`
