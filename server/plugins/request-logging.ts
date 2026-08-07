export default defineNitroPlugin((nitroApp) => {
  const log = useLogger()

  nitroApp.hooks.hook('request', (event) => {
    event.context._startTime = Date.now()
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    const duration = Date.now() - (event.context._startTime || Date.now())
    const method = event.method
    const path = event.path
    const status = getResponseStatus(event)

    log.info({
      method,
      path,
      status,
      duration: `${duration}ms`,
      userAgent: getRequestHeader(event, 'user-agent'),
    }, `${method} ${path} ${status} ${duration}ms`)
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    log.error({
      method: event?.method,
      path: event?.path,
      error: error.message,
      stack: error.stack,
    }, `Error in ${event?.method} ${event?.path}: ${error.message}`)
  })
})
