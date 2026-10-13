import { describe, expect, test } from 'bun:test'
import { greetingKeyFor } from '../../app/utils/greeting'

describe('greetingKeyFor', () => {
  // English: 15:00 must read afternoon - the original bug was a shared
  // Indonesian bucket set (sore 15-18) labelled "Good evening" in English.
  test('english boundaries', () => {
    const cases: Array<[number, string]> = [
      [3, 'greeting_evening'],
      [5, 'greeting_morning'],
      [11, 'greeting_morning'],
      [12, 'greeting_afternoon'],
      [16, 'greeting_afternoon'],
      [17, 'greeting_evening'],
      [21, 'greeting_evening'],
      [23, 'greeting_evening'],
    ]
    for (const [hour, expected] of cases)
      expect(greetingKeyFor(hour, 'en')).toBe(expected)
  })

  // Indonesian: siang ends at 14, sore covers 15-18, so 15:18 must be
  // "Selamat sore".
  test('indonesian boundaries', () => {
    const cases: Array<[number, string]> = [
      [3, 'greeting_night'],
      [4, 'greeting_morning'],
      [10, 'greeting_morning'],
      [11, 'greeting_afternoon'],
      [14, 'greeting_afternoon'],
      [15, 'greeting_evening'],
      [18, 'greeting_evening'],
      [19, 'greeting_night'],
      [0, 'greeting_night'],
    ]
    for (const [hour, expected] of cases)
      expect(greetingKeyFor(hour, 'id')).toBe(expected)
  })

  test('the reported case: 15:18 in english is afternoon', () => {
    expect(greetingKeyFor(15, 'en')).toBe('greeting_afternoon')
    expect(greetingKeyFor(15, 'id')).toBe('greeting_evening')
  })
})
