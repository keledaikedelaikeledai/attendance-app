// Time-of-day greeting bucket, by the hour on the business clock
// ( Asia/Jakarta ). Boundary conventions differ per language: Indonesian
// splits siang/sore around 15:00, while English afternoon runs until
// 16:00 - sharing one set of boundaries produced "Good evening" at
// 15:00, which reads wrong in English.
export function greetingKeyFor(hour: number, locale: string): string {
  if (locale === 'id') {
    // pagi 4-10, siang 11-14, sore 15-18, malam otherwise
    if (hour >= 4 && hour <= 10)
      return 'greeting_morning'
    if (hour >= 11 && hour <= 14)
      return 'greeting_afternoon'
    if (hour >= 15 && hour <= 18)
      return 'greeting_evening'
    return 'greeting_night'
  }

  // English: morning to 11, afternoon to 16, evening 17-21. Late night
  // reuses the evening label ("Good night" is a farewell, not a greeting).
  if (hour >= 5 && hour <= 11)
    return 'greeting_morning'
  if (hour >= 12 && hour <= 16)
    return 'greeting_afternoon'
  return 'greeting_evening'
}
