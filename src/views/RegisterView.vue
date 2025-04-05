<template>
  <div class="register-page">
    <div class="register-container">
      <h1>Регистрация</h1>
      
      <form @submit.prevent="register" class="register-form">
        <div class="form-group">
          <label for="name" class="form-label">Имя</label>
          <input 
            type="text" 
            id="name" 
            v-model="name" 
            class="form-input" 
            required 
            placeholder="Введите ваше имя"
          />
        </div>
        
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
        
        <div class="form-group">
          <label for="confirmPassword" class="form-label">Подтверждение пароля</label>
          <input 
            type="password" 
            id="confirmPassword" 
            v-model="confirmPassword" 
            class="form-input" 
            required 
            placeholder="Повторите ваш пароль"
          />
        </div>
        
        <div v-if="error" class="form-error mb-3">
          {{ error }}
        </div>
        
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Регистрация...' : 'Зарегистрироваться' }}
        </button>
        
        <div class="register-footer">
          <p>
            Уже есть аккаунт? 
            <router-link to="/login">Войти</router-link>
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

const name = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

async function register() {
  if (!name.value || !email.value || !password.value || !confirmPassword.value) {
    error.value = 'Пожалуйста, заполните все поля';
    return;
  }
  
  if (password.value !== confirmPassword.value) {
    error.value = 'Пароли не совпадают';
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  try {
    // Регистрация пользователя
    await authStore.register(email.value, name.value, password.value);
    
    // После регистрации выполняем вход
    await authStore.login(email.value, password.value);
    
    // Перенаправляем на страницу с чатами
    router.push('/chats');
  } catch (err) {
    error.value = err.message || 'Произошла ошибка при регистрации';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.register-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: var(--spacing-md);
}

.register-container {
  width: 100%;
  max-width: 400px;
  padding: var(--spacing-xl);
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.register-container h1 {
  margin-bottom: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-primary);
}

.register-form {
  display: flex;
  flex-direction: column;
}

.register-footer {
  margin-top: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-secondary);
}

.btn-primary {
  margin-top: var(--spacing-md);
}
</style> 