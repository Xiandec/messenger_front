<template>
  <div class="login-page">
    <div class="login-container">
      <h1>Вход в мессенджер</h1>
      
      <form @submit.prevent="login" class="login-form">
        <div class="form-group">
          <label for="email" class="form-label">Email</label>
          <input 
            type="email" 
            id="email" 
            v-model="email" 
            class="form-input" 
            required 
            placeholder="Введите ваш email"
          />
        </div>
        
        <div class="form-group">
          <label for="password" class="form-label">Пароль</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            class="form-input" 
            required 
            placeholder="Введите ваш пароль"
          />
        </div>
        
        <div v-if="error" class="form-error mb-3">
          {{ error }}
        </div>
        
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Вход...' : 'Войти' }}
        </button>
        
        <div class="login-footer">
          <p>
            Нет аккаунта? 
            <router-link to="/register">Зарегистрироваться</router-link>
          </p>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function login() {
  if (!email.value || !password.value) {
    error.value = 'Пожалуйста, введите email и пароль';
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  try {
    await authStore.login(email.value, password.value);
    router.push('/chats');
  } catch (err) {
    error.value = err.message || 'Произошла ошибка при входе';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: var(--spacing-md);
}

.login-container {
  width: 100%;
  max-width: 400px;
  padding: var(--spacing-xl);
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.login-container h1 {
  margin-bottom: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-primary);
}

.login-form {
  display: flex;
  flex-direction: column;
}

.login-footer {
  margin-top: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-secondary);
}

.btn-primary {
  margin-top: var(--spacing-md);
}
</style> 