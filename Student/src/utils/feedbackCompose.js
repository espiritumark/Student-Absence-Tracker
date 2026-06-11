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
      return `The ${lp} can strengthen their progress by building a more regular attendance pattern.`
    case ATTENDANCE_EMPHASIS.limited:
      return `The ${lp} would benefit from improving attendance so they can stay connected to lesson content.`
    case ATTENDANCE_EMPHASIS.significant:
      return `The ${lp} can support their learning by prioritising attendance and catching up promptly after missed days.`
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
            ? 'can build confidence by contributing more often in class'
          : participation === PARTICIPATION_LEVEL.lazy
            ? 'can increase their engagement by taking more active steps in lessons'
            : 'participates at a moderate level'

  const assign =
    assignmentQuality === ASSIGNMENT_QUALITY.excellent
      ? 'produces excellent work'
      : assignmentQuality === ASSIGNMENT_QUALITY.good
        ? 'completes work to a good standard'
        : assignmentQuality === ASSIGNMENT_QUALITY.inconsistent
          ? 'shows they can produce good work and can aim for more consistent effort'
          : assignmentQuality === ASSIGNMENT_QUALITY.poor
            ? 'would benefit from completing and submitting work more thoroughly'
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
