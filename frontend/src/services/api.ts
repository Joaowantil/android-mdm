import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mdm_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 em qualquer tela = sessão expirada/revogada: volta para o login. Exceção: o próprio
    // login, onde 401 significa "senha errada". Redirecionar ali recarregava a página e a
    // mensagem de erro sumia no mesmo instante.
    const isLoginRequest = String(error.config?.url || '').includes('/auth/login')
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('mdm_token')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

export default api
