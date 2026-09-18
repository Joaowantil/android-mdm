/**
 * Extracts a human-readable string from an API error response, regardless of the
 * shape FastAPI used for `detail`.
 *
 * FastAPI's `detail` is NOT always a string: a raised HTTPException gives a string,
 * but a Pydantic validation error (422) gives an ARRAY of objects like
 * {type, loc, msg, input}. Passing that array straight into JSX (`{message}`)
 * crashes the whole React tree with "Objects are not valid as a React child" -
 * with no error boundary configured, that takes the entire page down to a blank
 * white screen, not just the one form. This function is the one place that
 * normalizes both shapes into a plain string, so every call site can render
 * `{message}` safely no matter which shape the backend sent.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
    ?.detail

  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          const field = Array.isArray((item as { loc?: unknown[] }).loc)
            ? (item as { loc: unknown[] }).loc.slice(1).join('.')
            : undefined
          const msg = String((item as { msg: unknown }).msg)
          return field ? `${field}: ${msg}` : msg
        }
        return typeof item === 'string' ? item : null
      })
      .filter((m): m is string => Boolean(m))
    if (messages.length > 0) {
      return messages.join('; ')
    }
  }

  return fallback
}
