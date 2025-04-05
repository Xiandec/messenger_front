<template>
  <div class="user-profile">
    <div class="user-avatar" @click="toggleMenu">
      {{ userInitials }}
    </div>
    
    <div class="user-info" @click="toggleMenu">
      <div class="user-name">{{ userName }}</div>
      <div class="user-id">{{ userIdPreview }}</div>
    </div>
    
    <div class="user-menu-toggle" @click="toggleMenu">
      <span class="toggle-icon">▼</span>
    </div>
    
    <div v-if="showMenu" class="user-menu">
      <div class="user-menu-header">
        <div class="user-menu-avatar">{{ userInitials }}</div>
        <div class="user-menu-info">
          <div class="user-menu-name">{{ userName }}</div>
          <div class="user-menu-id">ID: {{ userId }}</div>
        </div>
      </div>
      
      <div class="user-menu-options">
        <div class="user-menu-item" @click="logout">
          <span class="user-menu-icon">⬅️</span>
          <span class="user-menu-text">Выйти</span>
        </div>
      </div>
    </div>
    
    <!-- Невидимый оверлей для закрытия меню по клику вне профиля -->
    <div v-if="showMenu" class="modal-overlay" @click="showMenu = false"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const showMenu = ref(false);

// Получаем данные пользователя из хранилища аутентификации
const userId = computed(() => authStore.getUserId || 'Unknown');
const userName = computed(() => authStore.getUserEmail || authStore.getUserName || 'Пользователь');

// Создаем сокращенный ID для предпросмотра
const userIdPreview = computed(() => {
  const id = userId.value;
  if (id && id.length > 8) {
    return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
  }
  return id;
});

// Получаем инициалы имени пользователя для аватара
const userInitials = computed(() => {
  const name = userName.value;
  if (!name) return '?';
  
  const words = name.split(' ');
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  
  return name[0].toUpperCase();
});

// Переключение видимости меню
function toggleMenu() {
  showMenu.value = !showMenu.value;
}

// Обработчик клика для закрытия меню при клике вне профиля
function handleClickOutside(event) {
  const profileElement = event.target.closest('.user-profile');
  if (showMenu.value && !profileElement) {
    showMenu.value = false;
  }
}

// Выход из аккаунта
function logout() {
  authStore.logout();
  router.push('/login');
}

// Добавляем глобальный обработчик клика при монтировании
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

// Удаляем обработчик при удалении компонента
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.user-profile {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  margin-bottom: 1rem;
  border-radius: var(--radius-md);
  background-color: var(--color-surface-variant);
  position: relative;
}

.user-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background-color: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  margin-right: 0.75rem;
  cursor: pointer;
}

.user-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.user-name {
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-id {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.user-menu-toggle {
  margin-left: 0.5rem;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: transform 0.2s ease;
}

.toggle-icon {
  font-size: 0.75rem;
}

.user-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: var(--color-surface);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  margin-top: 0.25rem;
  overflow: hidden;
}

.user-menu-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  background-color: var(--color-surface-variant);
}

.user-menu-avatar {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background-color: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  margin-right: 1rem;
}

.user-menu-info {
  flex: 1;
}

.user-menu-name {
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.user-menu-id {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.user-menu-options {
  padding: 0.5rem 0;
}

.user-menu-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.user-menu-item:hover {
  background-color: var(--color-surface-variant);
}

.user-menu-icon {
  margin-right: 0.75rem;
  font-size: 1rem;
}

.user-menu-text {
  color: var(--color-text-primary);
}

/* Затемняющий оверлей для закрытия меню */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: transparent;
  z-index: 99;
}
</style> 