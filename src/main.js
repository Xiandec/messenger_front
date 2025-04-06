import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// Импорт и настройка Toast уведомлений
import Toast from 'vue-toastification';
import 'vue-toastification/dist/index.css';

// Импорт хранилищ для инициализации глобального WebSocket
import { useAuthStore } from './stores/auth'
import { useChatStore } from './stores/chat'

// Настройки для Toast уведомлений
const toastOptions = {
  position: 'bottom-right',
  timeout: 3000,
  closeOnClick: true,
  pauseOnFocusLoss: true,
  pauseOnHover: true,
  draggable: true,
  draggablePercent: 0.6,
  showCloseButtonOnHover: false,
  hideProgressBar: false,
  closeButton: 'button',
  icon: true,
  rtl: false
};

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(Toast, toastOptions)

// Делаем роутер доступным глобально для использования в уведомлениях
window.router = router

app.mount('#app')

// Инициализация глобального WebSocket после монтирования приложения
const authStore = useAuthStore()
const chatStore = useChatStore()

// Установим флаг для предотвращения повторной инициализации
let globalWsInitialized = false

// Подключаемся к глобальному WebSocket только один раз, если пользователь авторизован
if (authStore.isAuthenticated && !globalWsInitialized) {
  console.log('Инициализация глобального WebSocket при запуске приложения')
  chatStore.initGlobalWebSocket()
  globalWsInitialized = true
}

// Подключаемся заново при изменении токена авторизации
let previousToken = authStore.token
authStore.$subscribe((mutation, state) => {
  if (state.token && state.token !== previousToken) {
    console.log('Токен авторизации изменился, инициализируем глобальный WebSocket')
    chatStore.initGlobalWebSocket()
    previousToken = state.token
  }
})
