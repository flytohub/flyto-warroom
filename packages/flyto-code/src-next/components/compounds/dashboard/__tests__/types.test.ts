import { describe, it, expect } from 'vitest'
import { gradeFor, displayScore } from '../types'

describe('displayScore', () => {
  it('maps raw 0 → 250', () => {
    expect(displayScore(0)).toBe(250)
  })
  it('maps raw 100 → 900', () => {
    expect(displayScore(100)).toBe(900)
  })
  it('floors to nearest 10', () => {
    // raw 50 → floor((250+325)/10)*10 = floor(57.5)*10 = 570
    expect(displayScore(50)).toBe(570)
  })
})

describe('gradeFor', () => {
  it('returns A for high scores (raw >= ~76)', () => {
    expect(gradeFor(80)).toBe('A')
    expect(gradeFor(90)).toBe('A')
    expect(gradeFor(100)).toBe('A')
  })

  it('returns B for good scores (raw ~60-75)', () => {
    expect(gradeFor(60)).toBe('B')
    expect(gradeFor(70)).toBe('B')
    expect(gradeFor(75)).toBe('B')
  })

  it('returns C for intermediate scores (raw ~39-59)', () => {
    expect(gradeFor(40)).toBe('C')
    expect(gradeFor(50)).toBe('C')
    expect(gradeFor(55)).toBe('C')
  })

  it('returns D for basic scores (raw ~20-38)', () => {
    expect(gradeFor(20)).toBe('D')
    expect(gradeFor(30)).toBe('D')
  })

  it('returns F for critical scores (raw < ~20)', () => {
    expect(gradeFor(0)).toBe('F')
    expect(gradeFor(10)).toBe('F')
  })
})
