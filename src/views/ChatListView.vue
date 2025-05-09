<template>
  <div class="chat-page">
    <div class="chat-sidebar">
      <!-- Профиль пользователя -->
      <UserProfile />
      
      <div class="chat-sidebar-header">
        <h2>Чаты</h2>
        <div class="chat-actions">
          <button class="btn btn-icon" @click="showNewChatModal = true" title="Создать новый чат">
            <span class="icon">+</span>
          </button>
        </div>
      </div>
      
      <div class="chat-list" v-if="sortedChats.length > 0">
        <div 
          v-for="chat in sortedChats" 
          :key="chat.id" 
          class="chat-item" 
          :class="{ 'active': currentChat && currentChat.id === chat.id }"
          @click="selectChat(chat)"
        >
          <div class="chat-avatar">
            {{ getChatInitials(chat) }}
          </div>
          <div class="chat-info">
            <div class="chat-name">{{ getChatName(chat) }}</div>
            <div class="chat-preview">{{ chat.lastMessage || 'Нет сообщений' }}</div>
          </div>
          <div class="chat-meta">
            <div class="chat-time" v-if="chat.lastMessageTime">
              {{ formatTime(chat.lastMessageTime) }}
            </div>
            <div class="unread-badge" v-if="chat.unreadCount && chat.unreadCount > 0">
              {{ chat.unreadCount > 99 ? '99+' : chat.unreadCount }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="no-chats">
        <p>У вас пока нет чатов</p>
        <button @click="showNewChatModal = true" class="btn btn-primary mt-3">Создать чат</button>
      </div>
    </div>
    
    <router-view></router-view>
    
    <!-- Модальное окно для создания нового чата -->
    <div class="modal" v-if="showNewChatModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Новый чат</h3>
          <button class="btn-close" @click="showNewChatModal = false">&times;</button>
        </div>
        
        <div class="modal-body">
          <div class="chat-type-selector">
            <button 
              class="btn" 
              :class="{ 'btn-primary': chatType === 'personal', 'btn-secondary': chatType !== 'personal' }"
              @click="chatType = 'personal'"
            >
              Личный чат
            </button>
            <button 
              class="btn ml-2" 
              :class="{ 'btn-primary': chatType === 'group', 'btn-secondary': chatType !== 'group' }"
              @click="chatType = 'group'"
            >
              Групповой чат
            </button>
          </div>
          
          <div class="form-group mt-3" v-if="chatType === 'group'">
            <label for="groupName" class="form-label">Название группы</label>
            <input 
              type="text" 
              id="groupName" 
              v-model="newChatName" 
              class="form-input" 
              placeholder="Введите название группы"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">{{ chatType === 'personal' ? 'ID пользователя' : 'ID участников (через запятую)' }}</label>
            <input 
              type="text" 
              v-model="memberIds" 
              class="form-input" 
              :placeholder="chatType === 'personal' ? 'Введите ID пользователя' : 'Введите ID участников через запятую'"
            />
          </div>
          
          <div v-if="chatError" class="form-error mt-2">
            {{ chatError }}
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click="showNewChatModal = false">Отмена</button>
          <button class="btn btn-primary ml-2" @click="createChat" :disabled="chatLoading">
            {{ chatLoading ? 'Создание...' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { webSocketService } from '../services/websocket';
import UserProfile from '../components/UserProfile.vue';

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const showNewChatModal = ref(false);
const chatType = ref('personal');
const newChatName = ref('');
const memberIds = ref('');
const chatError = ref('');
const chatLoading = ref(false);

// Получаем список чатов из хранилища
const chats = computed(() => chatStore.getChatList);
const currentChat = computed(() => chatStore.getCurrentChat);

// Используем уже отсортированный список чатов из хранилища
const sortedChats = computed(() => chats.value);

// Получаем имя чата для отображения
function getChatName(chat) {
  if (chat.name) {
    return chat.name;
  }
  
  // Для личных чатов отображаем имя собеседника
  if (chat.type === 'personal' && chat.members && chat.members.length > 0) {
    const currentUserId = authStore.getUserId;
    const otherMember = chat.members.find(member => member.id !== currentUserId);
    
    if (otherMember) {
      return otherMember.name;
    }
  }
  
  return 'Чат';
}

// Получаем инициалы чата для аватара
function getChatInitials(chat) {
  const name = getChatName(chat);
  
  if (name) {
    const words = name.split(' ');
    
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }
    
    return name[0].toUpperCase();
  }
  
  return '?';
}

// Форматирование времени
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

// Выбор чата
async function selectChat(chat) {
  chatStore.setCurrentChat(chat);
  
  // Переходим к чату
  router.push(`/chats/${chat.id}`);
  
  // Если в чате есть непрочитанные сообщения, отмечаем их как прочитанные
  if (chat.unreadCount && chat.unreadCount > 0) {
    try {
      // Сбрасываем счетчик непрочитанных сообщений в UI сразу
      chatStore.resetUnreadCount(chat.id);
      
      // Отправляем запрос на сервер для отметки всех сообщений как прочитанных
      await chatStore.markAllMessagesAsRead(chat.id);
    } catch (error) {
      console.error('Ошибка при отметке сообщений как прочитанных:', error);
    }
  }
}

// Создание нового чата
async function createChat() {
  if (chatType.value === 'group' && !newChatName.value) {
    chatError.value = 'Введите название группы';
    return;
  }
  
  if (!memberIds.value) {
    chatError.value = chatType.value === 'personal' 
      ? 'Введите ID пользователя' 
      : 'Введите ID участников';
    return;
  }
  
  chatLoading.value = true;
  chatError.value = '';
  
  try {
    let newChat;
    
    if (chatType.value === 'personal') {
      // Создаем личный чат
      newChat = await chatStore.createPersonalChat(memberIds.value.trim());
    } else {
      // Создаем групповой чат
      const members = memberIds.value.split(',').map(id => id.trim());
      newChat = await chatStore.createGroupChat(newChatName.value, members);
    }
    
    // Закрываем модальное окно
    showNewChatModal.value = false;
    
    // Сбрасываем форму
    newChatName.value = '';
    memberIds.value = '';
    
    // Переходим к новому чату
    if (newChat) {
      selectChat(newChat);
    }
  } catch (err) {
    chatError.value = err.message || 'Ошибка при создании чата';
  } finally {
    chatLoading.value = false;
  }
}

// Настройка глобального WebSocket для обновления списка чатов
function setupGlobalWebSocket() {
  // Функция-заглушка, теперь вся обработка происходит 
  // через единый глобальный WebSocket в хранилище
  console.log('ChatListView: Глобальный WebSocket уже настроен в хранилище');
}

// Загружаем список чатов при монтировании компонента
onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  
  try {
    // Загружаем список чатов
    const chats = await chatStore.fetchChats();
    console.log('Загружено чатов:', chats.length);
    
    // Проверяем и отображаем информацию о последних сообщениях
    chats.forEach(chat => {
      console.log(`Чат ${chat.id}:`, {
        name: getChatName(chat),
        lastMessage: chat.lastMessage,
        lastMessageTime: chat.lastMessageTime
      });
    });
    
    // Глобальный WebSocket теперь инициализируется в main.js
    // и обрабатывается в хранилище чатов
  } catch (error) {
    console.error('Ошибка при загрузке чатов:', error);
  }
});

// Отключаем WebSocket при размонтировании компонента
onUnmounted(() => {
  // Локальные обработчики больше не нужны, так как используется централизованный подход
});
</script>

<style scoped>
.chat-page {
  display: flex;
  height: 100vh;
  overflow: hidden;
  width: 100%;
  max-width: 100vw;
}

.chat-sidebar {
  width: 20rem;
  min-width: 16rem;
  height: 100%;
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-gray-800);
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
}

.chat-sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-gray-800);
  margin-bottom: var(--spacing-md);
}

.chat-sidebar-header h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 1.25rem;
}

.chat-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  padding: 0;
  background-color: var(--color-surface-variant);
  color: var(--color-text-primary);
  font-size: 1.125rem;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
}

.chat-item {
  display: flex;
  padding: 12px 15px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;
}

.chat-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.chat-item.active {
  background-color: rgba(103, 58, 183, 0.1);
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: #673AB7;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 12px;
  flex-shrink: 0;
}

.chat-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.chat-name {
  font-weight: 500;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-preview {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  margin-left: 8px;
  min-width: 60px;
}

.chat-time {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 5px;
}

.unread-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background-color: #673AB7;
  color: white;
  font-size: 0.75rem;
  font-weight: bold;
  padding: 0 6px;
}

.no-chats {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
  color: var(--color-text-secondary);
  text-align: center;
  flex: 1;
}

/* Модальное окно */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 31.25rem;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-gray-800);
}

.modal-body {
  padding: var(--spacing-lg);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-gray-800);
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.chat-type-selector {
  display: flex;
  margin-bottom: var(--spacing-md);
}

@media (max-width: 768px) {
  .chat-sidebar {
    width: 100%;
    min-width: auto;
  }
  
  .chat-page {
    flex-direction: column;
  }
}
</style> 