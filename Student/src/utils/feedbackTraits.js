/** Options teachers pick when composing feedback (templates map values → prose). */

export const ATTENDANCE_EMPHASIS = {
  auto: 'auto',
  consistent: 'consistent',
  mild: 'mild',
  limited: 'limited',
  significant: 'significant',
}

export const PARTICIPATION_LEVEL = {
  energetic: 'energetic',
  active: 'active',
  attentive: 'attentive',
  passive: 'passive',
  lazy: 'lazy',
}

export const ASSIGNMENT_QUALITY = {
  excellent: 'excellent',
  good: 'good',
  inconsistent: 'inconsistent',
  poor: 'poor',
}

export const participationOptions = [
  { value: PARTICIPATION_LEVEL.energetic, label: 'Energetic — leads and engages actively' },
  { value: PARTICIPATION_LEVEL.active, label: 'Active — participates willingly in lessons' },
  { value: PARTICIPATION_LEVEL.attentive, label: 'Attentive — listens, joins when prompted' },
  { value: PARTICIPATION_LEVEL.passive, label: 'Passive — minimal participation' },
  { value: PARTICIPATION_LEVEL.lazy, label: 'Lazy / disengaged — little effort in class' },
]

export const assignmentOptions = [
  { value: ASSIGNMENT_QUALITY.excellent, label: 'Excellent — thorough, high-quality work' },
  { value: ASSIGNMENT_QUALITY.good, label: 'Good — completes tasks diligently' },
  { value: ASSIGNMENT_QUALITY.inconsistent, label: 'Inconsistent — variable effort or quality' },
  { value: ASSIGNMENT_QUALITY.poor, label: 'Poor — incomplete or low-quality work' },
]

export const attendanceEmphasisOptions = [
  { value: ATTENDANCE_EMPHASIS.auto, label: 'From Absence Totals & Streak' },
  { value: ATTENDANCE_EMPHASIS.consistent, label: 'Consistent Attendance' },
  { value: ATTENDANCE_EMPHASIS.mild, label: 'Some absences — encourage consistency' },
  { value: ATTENDANCE_EMPHASIS.limited, label: 'Limited attendance / engagement records' },
  { value: ATTENDANCE_EMPHASIS.significant, label: 'Significant absences — strong concern' },
]
