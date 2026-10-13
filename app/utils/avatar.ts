import { personas } from '@dicebear/collection'
import { createAvatar } from '@dicebear/core'

// Deterministic per-user avatars: the same seed always draws the same persona,
// generated locally in the bundle - no uploads, no external API calls, and no
// employee data ever leaves the app.
const cache = new Map<string, string>()

// DiceBear's pastel circle palette; the seed picks one of these per persona.
const palette = ['b6e3f4', 'c0aede', 'ffd5dc', 'ffdfbf', 'd1d4f9', 'd1f4d9']

export function personaAvatarUri(seed: string | null | undefined): string | undefined {
  if (!seed)
    return undefined
  let uri = cache.get(seed)
  if (!uri) {
    uri = createAvatar(personas, { seed, backgroundColor: palette }).toDataUri()
    cache.set(seed, uri)
  }
  return uri
}
