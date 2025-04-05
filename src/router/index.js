import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ChatListView from '../views/ChatListView.vue'
import ChatView from '../views/ChatView.vue'
import WelcomeView from '../views/WelcomeView.vue'
import { useAuthStore } from '../stores/auth'

// Функция проверки аутентификации
const requireAuth = (to, from, next) => {
  const authStore = useAuthStore();
  
  if (!authStore.isAuthenticated) {
    next('/login');
  } else {
    next();
  }
};

// Функция проверки неаутентифицированного состояния
const redirectIfAuthenticated = (to, from, next) => {
  const authStore = useAuthStore();
  
  if (authStore.isAuthenticated) {
    next('/chats');
  } else {
    next();
  }
};

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login'
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      beforeEnter: redirectIfAuthenticated
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      beforeEnter: redirectIfAuthenticated
    },
    {
      path: '/chats',
      name: 'chats',
      component: ChatListView,
      beforeEnter: requireAuth,
      children: [
        {
          path: '',
          name: 'welcome',
          component: WelcomeView
        },
        {
          path: ':id',
          name: 'chat',
          component: ChatView,
          props: true
        }
      ]
    }
  ]
})

export default router
