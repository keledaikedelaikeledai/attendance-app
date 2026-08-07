export default defineEventHandler((event) => {
  const auth = useBetterAuth()
  const log = useLogger()

  try {
    return auth.handler(toWebRequest(event))
  }
  catch (err) {
    log.error({ err, path: event.path }, 'Auth operation failed')
    throw err
  }
})
