export default defineEventHandler((event) => {
  const auth = useBetterAuth()
  return auth.handler(toWebRequest(event))
})
