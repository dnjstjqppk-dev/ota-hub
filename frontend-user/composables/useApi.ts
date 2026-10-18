export const useApiUrl = (path: string = ''): string => {
  const config = useRuntimeConfig()
  const base = config.public.apiBase || '/api/v1'
  if (!path) return base
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}
