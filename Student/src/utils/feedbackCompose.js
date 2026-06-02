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

function attendanceParagraph(emphasis) {
  switch (emphasis) {
    case ATTENDANCE_EMPHASIS.consistent:
      return `The ${lp} maintains consistent attendance, which supports continuity in learning and classroom participation.`
    case ATTENDANCE_EMPHASIS.mild:
      return `The ${lp} has had some absences. Improved attendance consistency would help strengthen participation and continuity in learning.`
    case ATTENDANCE_EMPHASIS.limited:
      return `The ${lp}'s attendance and engagement records are limited. Improved attendance consistency would support stronger participation and continuity in learning.`
    case ATTENDANCE_EMPHASIS.significant:
      return `The ${lp}'s attendance records show a concerning pattern of absences. Consistent attendance is essential for meaningful participation and progress; addressing this should be a priority.`
    default:
      return ''
  }
}

function participationClause(level) {
  switch (level) {
    case PARTICIPATION_LEVEL.energetic:
      return 'participates energetically during lessons, contributes ideas willingly, and helps maintain a positive classroom atmosphere'
    case PARTICIPATION_LEVEL.active:
      return 'participates actively during lessons and engages constructively with class activities'
    case PARTICIPATION_LEVEL.attentive:
      return 'listens attentively, participates when invited, and generally follows lesson expectations'
    case PARTICIPATION_LEVEL.passive:
      return 'is often quiet during lessons and would benefit from more consistent voluntary participation'
    case PARTICIPATION_LEVEL.lazy:
      return 'shows limited engagement during lessons and would benefit from a more proactive approach to participation'
    default:
      return 'participates in lessons at a level that reflects their current engagement'
  }
}

function assignmentClause(quality) {
  switch (quality) {
    case ASSIGNMENT_QUALITY.excellent:
      return 'consistently produces excellent, thorough work and demonstrates a strong commitment to learning'
    case ASSIGNMENT_QUALITY.good:
      return 'completes tasks diligently and produces good-quality work'
    case ASSIGNMENT_QUALITY.inconsistent:
      return 'submits work with variable effort and quality; more consistent application would strengthen outcomes'
    case ASSIGNMENT_QUALITY.poor:
      return 'often submits incomplete or low-quality work and would benefit from greater care and follow-through on assignments'
    default:
      return 'completes assigned work in line with current expectations'
  }
}

function engagementParagraph(participation, assignmentQuality) {
  const part = participationClause(participation)
  const assign = assignmentClause(assignmentQuality)

  const energeticPositive =
    participation === PARTICIPATION_LEVEL.energetic ||
    participation === PARTICIPATION_LEVEL.active
  const qualityPositive =
    assignmentQuality === ASSIGNMENT_QUALITY.excellent ||
    assignmentQuality === ASSIGNMENT_QUALITY.good

  if (energeticPositive && qualityPositive) {
    return `The ${lp} listens attentively, ${part}, and ${assign}, contributing positively to the classroom environment.`
  }

  if (
    participation === PARTICIPATION_LEVEL.lazy ||
    assignmentQuality === ASSIGNMENT_QUALITY.poor
  ) {
    return `The ${lp} ${part}. They ${assign}. With greater consistency in effort and attendance, they could make stronger progress.`
  }

  return `The ${lp} ${part}. They ${assign}.`
}

/**
 * Build feedback prose from attendance stats, trait picks, and optional teacher notes.
 * @param {object} input
 * @param {{ total: number, consecutive: number }} input.counts
 * @param {string} input.attendanceEmphasis
 * @param {string} input.participation
 * @param {string} input.assignmentQuality
 * @param {string} [input.extraNotes]
 * @param {boolean} [input.includeAttendance=true]
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
  const paragraphs = []

  if (includeAttendance) {
    const att = attendanceParagraph(resolved)
    if (att) paragraphs.push(att)
  }

  paragraphs.push(engagementParagraph(participation, assignmentQuality))

  const notes = extraNotes.trim()
  if (notes) {
    paragraphs.push(notes.endsWith('.') ? notes : `${notes}.`)
  }

  return paragraphs.join('\n\n')
}
