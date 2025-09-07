export default defineEventHandler(() => {
  return {
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }
})
