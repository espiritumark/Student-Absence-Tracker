import { LEARNING_PARTNER } from '../constants/branding'
import {
  ASSIGNMENT_QUALITY,
  ATTENDANCE_EMPHASIS,
  PARTICIPATION_LEVEL,
} from './feedbackTraits'

const lp = LEARNING_PARTNER.singular.toLowerCase()

/** Suggest attendance emphasis from recorded/manual totals. */
export function suggestAttendanceEmphasis({ total = 0, consecutive = 0 }) {
  if (total <= 0 && consecutive <= 0) return ATTENDANCE_EMPHASIS.consistent
  if (consecutive >= 10 || total >= 12) return ATTENDANCE_EMPHASIS.significant
  if (consecutive >= 5 || total >= 5) return ATTENDANCE_EMPHASIS.limited
  return ATTENDANCE_EMPHASIS.mild
}

function resolveAttendanceEmphasis(emphasis, counts) {
  if (emphasis === ATTENDANCE_EMPHASIS.auto) {
    return suggestAttendanceEmphasis(counts)
  }
  return emphasis
}

function shortAttendancePhrase(emphasis) {
  switch (emphasis) {
    case ATTENDANCE_EMPHASIS.consistent:
      return `The ${lp} attends consistently, supporting steady progress.`
    case ATTENDANCE_EMPHASIS.mild:
      return `The ${lp} has some absences; more consistent attendance would help.`
    case ATTENDANCE_EMPHASIS.limited:
      return `The ${lp}'s attendance is limited and affects continuity in learning.`
    case ATTENDANCE_EMPHASIS.significant:
      return `The ${lp}'s absences are a concern and need urgent improvement.`
    default:
      return ''
  }
}

function shortEngagementPhrase(participation, assignmentQuality) {
  const part =
    participation === PARTICIPATION_LEVEL.energetic
      ? 'participates energetically'
      : participation === PARTICIPATION_LEVEL.active
        ? 'participates actively'
        : participation === PARTICIPATION_LEVEL.attentive
          ? 'listens attentively and joins in when invited'
          : participation === PARTICIPATION_LEVEL.passive
            ? 'is often quiet and could contribute more'
            : participation === PARTICIPATION_LEVEL.lazy
              ? 'shows limited engagement in lessons'
              : 'participates at a moderate level'

  const assign =
    assignmentQuality === ASSIGNMENT_QUALITY.excellent
      ? 'produces excellent work'
      : assignmentQuality === ASSIGNMENT_QUALITY.good
        ? 'completes work to a good standard'
        : assignmentQuality === ASSIGNMENT_QUALITY.inconsistent
          ? 'submits work with variable effort'
          : assignmentQuality === ASSIGNMENT_QUALITY.poor
            ? 'often submits incomplete work'
            : 'meets basic assignment expectations'

  return `They ${part} and ${assign}.`
}

/**
 * Build compact feedback (target 30–50 words) from stats, traits, and notes.
 */
export function composeFeedback({
  counts,
  attendanceEmphasis = ATTENDANCE_EMPHASIS.auto,
  participation = PARTICIPATION_LEVEL.active,
  assignmentQuality = ASSIGNMENT_QUALITY.good,
  extraNotes = '',
  includeAttendance = true,
}) {
  const resolved = resolveAttendanceEmphasis(attendanceEmphasis, counts)
  const sentences = []

  if (includeAttendance) {
    const att = shortAttendancePhrase(resolved)
    if (att) sentences.push(att)
  }

  sentences.push(shortEngagementPhrase(participation, assignmentQuality))

  const notes = extraNotes.trim()
  if (notes) {
    sentences.push(notes.endsWith('.') ? notes : `${notes}.`)
  }

  return sentences.join(' ')
}
